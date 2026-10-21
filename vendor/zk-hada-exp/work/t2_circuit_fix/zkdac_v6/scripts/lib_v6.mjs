// Instances for the v6 main circuit (#28): the v5 instance plus holder-key revocation. The revocation IMT additionally holds key entries
// H(KEY_TAG, Ax, Ay) (nRevokedKeys deterministic decoy keys + any revokedKeys), and every delegate key ent[2..D] gets a non-membership witness.
import { buildInstanceV5 } from "../../zkdac_v5/scripts/lib_v5.mjs";
import { refreshRevocation } from "../../zkdac_v4/scripts/lib_v4.mjs";
import crypto from "crypto";
export { init, R, SUBORDER, TAG, ctxHash, DEFAULT_CTX, IMT, trunc, RT, newRootTree, rootProof } from "../../zkdac_v5/scripts/lib_v5.mjs";
import { init } from "../../zkdac_v5/scripts/lib_v5.mjs";
export const KEY_TAG = 2053861995n;              // ASCII "zkrk"
export const RD = 20;
export const keyHash = (meta, ent) => meta.P([KEY_TAG, BigInt(ent.Ax), BigInt(ent.Ay)]);
// slot t (0-based) checks ent[t + 2]; D = 1 has one all-zero slot
export function refreshKeys(input, meta) {
  const z = { value: "0", sib: Array(RD).fill("0") };
  Object.assign(input, { k_low_value: [], k_low_next_index: [], k_low_next_value: [], k_sib: [], k_bit: [] });
  if (meta.D === 1) { input.k_low_value.push("0"); input.k_low_next_index.push("0"); input.k_low_next_value.push("0"); input.k_sib.push(z.sib); input.k_bit.push(z.sib); }
  for (let j = 2; j <= meta.D; j++) {
    const w = meta.imt.nonMemberWitness(keyHash(meta, { Ax: input.ent_Ax[j], Ay: input.ent_Ay[j] }));
    input.k_low_value.push(w.low_value); input.k_low_next_index.push(w.low_next_index); input.k_low_next_value.push(w.low_next_value);
    input.k_sib.push(w.sib); input.k_bit.push(w.bit);
  }
  input.revoked_root = meta.imt.root.toString(); return input;
}
// recompute every revocation witness (certificates and keys) against meta.imt, e.g. after inserting entries
export const refreshAll = (input, meta) => refreshKeys(refreshRevocation(input, meta), meta);
// revokedKeys: [{Ax, Ay}] inserted as key entries before witnesses are built (a revoked delegate key makes buildInstanceV6 throw)
export async function buildInstanceV6({ nRevokedKeys = 4, revokedKeys = [], ...opts } = {}) {
  const { input, meta } = await buildInstanceV5(opts);
  const { eddsa } = await init(); const F = eddsa.F;
  meta.revokedKeyHashes = [];
  for (let k = 0; k < nRevokedKeys; k++) {
    const prv = crypto.createHash("sha256").update(`revoked-key-${meta.D}-${meta.seed}-${k}`).digest(); const A = eddsa.prv2pub(prv);
    revokedKeys = [...revokedKeys, { Ax: F.toObject(A[0]), Ay: F.toObject(A[1]) }];
  }
  for (const e of revokedKeys) { const h = keyHash(meta, e); meta.revokedKeyHashes.push(h); meta.imt.insert(h); }
  refreshAll(input, meta); meta.revoked_root = meta.imt.root;
  return { input, meta };
}
