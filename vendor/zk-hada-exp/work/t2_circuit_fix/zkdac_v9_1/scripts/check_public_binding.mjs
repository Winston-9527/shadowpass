// Proof-level check (#41): for D = 1..4, verify a real v9 proof, check the public-signal order (state_root, now, ctx_hash, act_req_cap, tpk, c1, c2,
// e[0..D], e_sign, note_root, budget_nf, cm_change, q_spent) and that replacing any single public input by +1 makes verification fail.
import { buildInstanceV9 } from "./lib_v9.mjs";
import * as snarkjs from "snarkjs"; import fs from "fs";
const here = new URL("..", import.meta.url).pathname;
const names = ["state_root", "now", "ctx_hash", "act_req_cap"]; const out = {};
for (const D of [1, 2, 3, 4]) {
  const { input } = await buildInstanceV9({ D });
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, `${here}build/c${D}/main_c_d${D}_js/main_c_d${D}.wasm`, `${here}build/zk/c${D}.zkey`);
  const vk = JSON.parse(fs.readFileSync(`${here}zk/vk_c${D}.json`));
  const ct = [input.acc_c1x, input.acc_c1y, input.acc_c2x, input.acc_c2y, ...input.acc_e, input.acc_esign];
  const expected = [...names.map((n) => String(input[n])), ...input.tpk.map(String), ...ct.map(String), input.note_root, input.budget_nf, input.cm_change, input.q_spent].map(String);
  const row = { public_inputs: publicSignals.length, original_verifies: await snarkjs.groth16.verify(vk, publicSignals, proof), order_ok: JSON.stringify(expected) === JSON.stringify(publicSignals), any_plus1_verifies: false };
  for (let k = 0; k < publicSignals.length; k++) { const p = [...publicSignals]; p[k] = (BigInt(p[k]) + 1n).toString(); if (await snarkjs.groth16.verify(vk, p, proof)) { row.any_plus1_verifies = true; row.malleable_index = k; } }
  out[`C_D${D}`] = row; console.error(D, JSON.stringify(row));
}
console.log(JSON.stringify(out, null, 1)); process.exit(0);
