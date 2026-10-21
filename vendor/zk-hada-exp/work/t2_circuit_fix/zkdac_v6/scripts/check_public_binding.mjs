// Proof-level check: is every public input bound by the proof (no Groth16 malleability), in particular issued_root at D=1,
// where no constraint uses it (the only certificate is checked against root_root)? For each depth and each public input k,
// verify the real proof with public input k replaced by k+1: must fail.
import { buildInstanceV6 as buildInstanceV5 } from "./lib_v6.mjs";
import * as snarkjs from "snarkjs"; import fs from "fs";
const here = new URL("..", import.meta.url).pathname;
const names = ["issued_root", "revoked_root", "root_root", "nullifier", "now", "ctx_hash", "act_req_cap"];
const out = {};
for (const D of [1, 2, 3, 4]) {
  const { input } = await buildInstanceV5({ D });
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, `${here}build/d${D}/main_d${D}_js/main_d${D}.wasm`, `${here}build/zk/d${D}.zkey`);
  const vk = JSON.parse(fs.readFileSync(`${here}zk/vk_d${D}.json`));
  const row = { original_verifies: await snarkjs.groth16.verify(vk, publicSignals, proof), order_ok: names.every((n, i) => publicSignals[i] === String(input[n])) };
  for (let k = 0; k < publicSignals.length; k++) { const p = [...publicSignals]; p[k] = (BigInt(p[k]) + 1n).toString(); row[`${names[k]}+1_verifies`] = await snarkjs.groth16.verify(vk, p, proof); }
  out[`D${D}`] = row;
}
console.log(JSON.stringify(out, null, 1)); process.exit(0);
