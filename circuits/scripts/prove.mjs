// Real Groth16 proofs for the ShadowPass circuits: timing (fresh instance per run), verification with the exported vk, and public binding
// (every public signal + 1 must fail verification). Usage: node scripts/prove.mjs [runs=5] > results/prove.json
import * as snarkjs from "snarkjs"; import fs from "fs"; import os from "os";
import { ShadowWorld, P } from "./world.mjs";

const N = Number(process.argv[2] ?? 5), here = new URL("..", import.meta.url).pathname;
const stats = (xs) => { const s = [...xs].sort((a, b) => a - b), m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0;
  return { mean: +m.toFixed(1), sd: +sd.toFixed(1), median: +((s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2).toFixed(1) }; };

async function instance(D, seed) {
  const w = await ShadowWorld.create(`prove-${D}-${seed}`);
  const alice = w.newIdentity(), steward = w.newIdentity(), buyer = w.newIdentity(), vk = w.newViewKey();
  for (let k = 0; k < 8; k++) { w.register({ hash: w.rand250() }); w.notes.insert(w.rand250()); w.issued.insert(w.rand250()); w.revoked.insert(w.rand250()); w.addToGroup(w.newIdentity()); }
  w.addToGroup(alice);
  const c0 = w.issueRoot(alice, steward, 3, 10_000, vk); w.register(c0);
  const chain = D === 1 ? [c0] : [c0, w.issue(c0, buyer, 1, 9_000)];
  const note = w.mintNote(chain, 100), holder = D === 1 ? steward : buyer;
  const act = w.actionInput({ chain, holderSk: holder.sk, note, qSpent: 7, ctxHash: 99n + BigInt(seed), reqCap: 1, now: 1_000 }).input;
  return { act, reg: w.registerInput({ human: alice, cert0: c0, domain: 7n }) };
}

const out = { machine: `${os.cpus()[0].model} x${os.cpus().length}`, node: process.version, snarkjs: "0.7.6", runs: N, note: "ms; fresh instance per run", circuits: {} };
for (const c of ["main_d1", "main_d2", "main_reg"]) {
  const wasm = `${here}build/${c}/${c}_js/${c}.wasm`, zkey = `${here}build/zk/${c}.zkey`, vk = JSON.parse(fs.readFileSync(`${here}zk/vk_${c}.json`));
  const tp = [], tv = []; let ok = 0, last;
  for (let r = 0; r < N; r++) {
    const inst = await instance(c === "main_d2" ? 2 : 1, r), input = c === "main_reg" ? inst.reg : inst.act;
    let t = performance.now(); const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey); tp.push(performance.now() - t);
    t = performance.now(); if (await snarkjs.groth16.verify(vk, publicSignals, proof)) ok++; tv.push(performance.now() - t); last = { proof, publicSignals };
  }
  let bindingRejected = 0;
  for (let k = 0; k < last.publicSignals.length; k++) { const ps = [...last.publicSignals]; ps[k] = String((BigInt(ps[k]) + 1n) % P); if (!(await snarkjs.groth16.verify(vk, ps, last.proof))) bindingRejected++; }
  out.circuits[c] = { verified: `${ok}/${N}`, public_inputs: last.publicSignals.length, binding: `${bindingRejected}/${last.publicSignals.length} perturbed public inputs rejected`,
    fullprove_ms: stats(tp), verify_ms: stats(tv) };
  console.error(c, out.circuits[c].verified, out.circuits[c].binding, "fullProve median", out.circuits[c].fullprove_ms.median, "ms");
}
console.log(JSON.stringify(out, null, 2));
process.exit(0);
