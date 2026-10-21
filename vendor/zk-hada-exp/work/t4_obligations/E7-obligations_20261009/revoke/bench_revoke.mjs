// revoke_transition proving time: N fresh revocations (different instances / entries), witness + prove + verify. usage: node bench_revoke.mjs 10 > ../results/revoke_bench.json
import fs from "fs"; import os from "os"; import path from "path"; import * as R from "./revoke_lib.mjs";
const N = Number(process.argv[2] ?? 10), zkey = new URL("build/zk/rt.zkey", import.meta.url).pathname, vk = JSON.parse(fs.readFileSync(new URL("zk/vk_rt.json", import.meta.url)));
const tmp = path.join(os.tmpdir(), `rtb-${process.pid}.wtns`); const tw = [], tp = [], tv = []; let ok = 0;
for (let r = 0; r < N; r++) {
  const inst = await R.buildInstanceV7({ D: 4, seed: 2000 + r, mode: "C" }); const hop = 1 + (r % 3);
  const t = R.transition(inst.meta.imt, BigInt(inst.meta.cert[hop]), R.certAuthority(inst, hop, r % 2));
  let t0 = performance.now(); await R.snarkjs.wtns.calculate(t.input, R.WASM, tmp); tw.push(performance.now() - t0);
  t0 = performance.now(); const { proof, publicSignals } = await R.snarkjs.groth16.prove(zkey, tmp); tp.push(performance.now() - t0);
  t0 = performance.now(); if (await R.snarkjs.groth16.verify(vk, publicSignals, proof)) ok++; tv.push(performance.now() - t0);
}
const st = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)), s = [...xs].sort((a, b) => a - b); return { mean: +m.toFixed(1), sd: +sd.toFixed(1), median: +((s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2).toFixed(1) }; };
try { fs.unlinkSync(tmp); } catch {}
console.log(JSON.stringify({ machine: `${os.cpus()[0].model} x${os.cpus().length}`, node: process.version, constraints: 51815, runs: N, verified: `${ok}/${N}`, witness_ms: st(tw), prove_ms: st(tp), verify_ms: st(tv) }, null, 1)); process.exit(0);
