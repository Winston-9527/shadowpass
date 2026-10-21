// v6 proving benchmark (issue #28; Hermez 2^18 ptau). Ported from ../zkdac_v5/scripts/prove_bench.mjs (header follows)
// v5 proving benchmark (issue #17, T5 preview): per depth D, N runs, each with a FRESH instance (new seed => new keys, certificates, trees, witness).
// Times witness generation, Groth16 prove and verify separately. usage: node scripts/prove_bench.mjs [N] > results/prove_bench.json
import { buildInstanceV6 as buildInstanceV4 } from "./lib_v6.mjs";
import * as snarkjs from "snarkjs"; import fs from "fs"; import os from "os"; import path from "path";
const N = Number(process.argv[2] ?? 10), here = new URL("..", import.meta.url).pathname;
const tmp = path.join(os.tmpdir(), "v6bench-" + process.pid + ".wtns");
const stats = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); const s = [...xs].sort((a, b) => a - b); return { mean: +m.toFixed(1), sd: +sd.toFixed(1), median: +((s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2).toFixed(1), min: +s[0].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
const out = { machine: `${os.cpus()[0].model} x${os.cpus().length}`, node: process.version, snarkjs: "0.7.6", runs: N, note: "times in ms; fresh instance per run (seed = 1000 + run)", depths: {} };
for (const D of (process.env.DS ?? "1 2 3 4").split(" ").map(Number)) {
  const wasm = `${here}build/d${D}/main_d${D}_js/main_d${D}.wasm`, zkey = `${here}build/zk/d${D}.zkey`, vk = JSON.parse(fs.readFileSync(`${here}zk/vk_d${D}.json`));
  const tw = [], tp = [], tv = []; let ok = 0, calldataBytes = 0, sample = null;
  for (let r = 0; r < N; r++) {
    const { input } = await buildInstanceV4({ D, seed: 1000 + r });
    let t = performance.now(); await snarkjs.wtns.calculate(input, wasm, tmp); tw.push(performance.now() - t);
    t = performance.now(); const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, tmp); tp.push(performance.now() - t);
    t = performance.now(); const v = await snarkjs.groth16.verify(vk, publicSignals, proof); tv.push(performance.now() - t);
    if (v) ok++;
    calldataBytes = 8 * 32;   // Groth16 proof on-chain: a (2) + b (4) + c (2) field elements
    if (r === 0) sample = { proof, publicSignals };
  }
  out.depths[D] = { verified: `${ok}/${N}`, witness_ms: stats(tw), prove_ms: stats(tp), verify_ms: stats(tv), proof_calldata_bytes: calldataBytes, public_inputs: sample.publicSignals.length };
  fs.writeFileSync(`${here}results/sample_proof_d${D}.json`, JSON.stringify(sample, null, 1));
  console.error(`D=${D} verified ${ok}/${N}  prove ${out.depths[D].prove_ms.mean}±${out.depths[D].prove_ms.sd} ms`);
}
try { fs.unlinkSync(tmp); } catch {}
console.log(JSON.stringify(out, null, 1)); process.exit(0);
