// Proof-level check (#30): for each mode and depth, verify a real proof with each public input k replaced by k+1 — every one must fail.
// Also checks the public-signal order: the 7 v6 inputs, tpk, then the ciphertext words (circuit declaration order).
import { buildInstanceV7 } from "./lib_v7.mjs";
import * as snarkjs from "snarkjs"; import fs from "fs";
const here = new URL("..", import.meta.url).pathname;
const names = ["issued_root", "revoked_root", "root_root", "nullifier", "now", "ctx_hash", "act_req_cap"];
const out = {};
for (const mode of ["A", "C"]) for (const D of [1, 2, 3, 4]) {
  const t = mode.toLowerCase(); const { input } = await buildInstanceV7({ D, mode });
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, `${here}build/${t}${D}/main_${t}_d${D}_js/main_${t}_d${D}.wasm`, `${here}build/zk/${t}${D}.zkey`);
  const vk = JSON.parse(fs.readFileSync(`${here}zk/vk_${t}${D}.json`));
  const ct = mode === "A" ? [...input.acc_c1x, ...input.acc_c1y, ...input.acc_c2x, ...input.acc_c2y] : [input.acc_c1x[0], input.acc_c1y[0], input.acc_c2x[0], input.acc_c2y[0], ...input.acc_e.flat()];
  const expected = [...names.map((n) => String(input[n])), ...input.tpk.map(String), ...ct.map(String)];
  const row = { public_inputs: publicSignals.length, original_verifies: await snarkjs.groth16.verify(vk, publicSignals, proof), order_ok: JSON.stringify(expected) === JSON.stringify(publicSignals), any_plus1_verifies: false };
  for (let k = 0; k < publicSignals.length; k++) { const p = [...publicSignals]; p[k] = (BigInt(p[k]) + 1n).toString(); if (await snarkjs.groth16.verify(vk, p, proof)) { row.any_plus1_verifies = true; row.malleable_index = k; } }
  out[`${mode}_D${D}`] = row; console.error(mode, D, JSON.stringify(row));
}
console.log(JSON.stringify(out, null, 1)); process.exit(0);
