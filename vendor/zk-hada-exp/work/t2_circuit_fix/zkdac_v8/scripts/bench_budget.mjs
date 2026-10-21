// budget_transfer / budget_mint proving time (#39): N fresh transfers (delegate + change) and mints. usage: node scripts/bench_budget.mjs 10 > results/bench_budget.json
import { BudgetWorld } from "./budget_world.mjs"; import * as snarkjs from "snarkjs"; import fs from "fs"; import os from "os"; import path from "path";
const N = Number(process.argv[2] ?? 10), here = new URL("..", import.meta.url).pathname, tmp = path.join(os.tmpdir(), "v8bb-" + process.pid + ".wtns");
const st = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)), s = [...xs].sort((a, b) => a - b); return { mean: +m.toFixed(1), sd: +sd.toFixed(1), median: +((s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2).toFixed(1) }; };
const res = { machine: `${os.cpus()[0].model} x${os.cpus().length}`, node: process.version, runs: N };
for (const circ of ["budget_transfer", "budget_mint"]) {
  const vk = JSON.parse(fs.readFileSync(`${here}zk/vk_${circ}.json`)); const tw = [], tp = []; let ok = 0;
  for (let r = 0; r < N; r++) { const b = await BudgetWorld.create(); const M = await b.add(["H", "M"], 300 + r), S = await b.add(["H", "M", "S" + r], 400 + r);
    const n = b.insert(b.note(M, 100 + r, "bench" + r)); const input = circ === "budget_mint" ? b.mintWitness(n) : b.transferWitness(M, n, { to: S, q1: 40, q2: 60 + r, label: "bb" + r }).input;
    let t = performance.now(); await snarkjs.wtns.calculate(input, `${here}build/${circ}/${circ}_js/${circ}.wasm`, tmp); tw.push(performance.now() - t);
    t = performance.now(); const { proof, publicSignals } = await snarkjs.groth16.prove(`${here}build/zk/${circ}.zkey`, tmp); tp.push(performance.now() - t);
    if (await snarkjs.groth16.verify(vk, publicSignals, proof)) ok++; }
  res[circ] = { verified: `${ok}/${N}`, witness_ms: st(tw), prove_ms: st(tp) };
}
try { fs.unlinkSync(tmp); } catch {} console.log(JSON.stringify(res, null, 1)); process.exit(0);
