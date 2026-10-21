// Instances for the v4 main circuit (v3 + indexed Merkle tree revocation, issue #24): the v3 instance with the revocation witness
// rebuilt on an indexed Merkle tree (depth IMT_DEPTH = 20) holding the same revoked ids. Copied from revocation_imt/scripts/lib_v3imt.mjs.
import { buildInstanceV3 } from "../../zkdac_v3/scripts/lib_v3.mjs";
import { IMT, trunc } from "./imt.mjs";
export { init, R, SUBORDER, TAG, ctxHash, DEFAULT_CTX } from "../../zkdac_v3/scripts/lib_v3.mjs";
export { IMT, trunc };
export const IMT_DEPTH = 20;
export async function buildInstanceV4(opts = {}) {
  const { input, meta } = await buildInstanceV3(opts);
  const imt = await IMT.create(IMT_DEPTH);
  for (const r of meta.revokedIds) imt.insert(BigInt(r));
  for (const k of ["r_sib", "r_oldKey", "r_oldValue", "r_isOld0"]) delete input[k];
  Object.assign(input, { r_low_value: [], r_low_next_index: [], r_low_next_value: [], r_sib: [], r_bit: [] });
  for (let i = 0; i < meta.D; i++) {
    const w = imt.nonMemberWitness(meta.cert[i]);
    input.r_low_value.push(w.low_value); input.r_low_next_index.push(w.low_next_index); input.r_low_next_value.push(w.low_next_value);
    input.r_sib.push(w.sib); input.r_bit.push(w.bit);
  }
  input.revoked_root = imt.root.toString();
  meta.imt = imt; meta.revoked_root = imt.root;
  return { input, meta };
}
export function refreshRevocation(input, meta) {   // recompute every hop's witness against meta.imt (after inserts)
  for (let i = 0; i < meta.D; i++) { const w = meta.imt.nonMemberWitness(meta.cert[i]);
    input.r_low_value[i] = w.low_value; input.r_low_next_index[i] = w.low_next_index; input.r_low_next_value[i] = w.low_next_value; input.r_sib[i] = w.sib; input.r_bit[i] = w.bit; }
  input.revoked_root = meta.imt.root.toString(); return input;
}
