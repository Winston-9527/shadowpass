// Instances for the v7 main circuit (#30): the v6 instance plus R6 accountability. All chain keys ent[0..D] are encrypted to the auditor
// key TPK with fresh randomness. mode "A": one ElGamal ciphertext per key (independent r_j); mode "C": ElGamal-encapsulated ephemeral point K
// + Poseidon keystream e[j][b] = coord_b(ent[j]) + Poseidon(Kx, Ky, 2j + b). decrypt*() is the auditor side (single key here; threshold in E6).
import { buildInstanceV6 } from "../../zkdac_v6/scripts/lib_v6.mjs";
import { init } from "../../zkdac_v6/scripts/lib_v6.mjs";
import crypto from "crypto";
export { init, R, SUBORDER, TAG, ctxHash, DEFAULT_CTX, IMT, trunc, RT, newRootTree, rootProof, KEY_TAG, keyHash, refreshKeys, refreshAll } from "../../zkdac_v6/scripts/lib_v6.mjs";
export const R_BITS = 251n;
const rand251 = (tag) => BigInt("0x" + crypto.createHash("sha256").update(tag).digest("hex")) >> 5n;   // < 2^251 (may exceed the subgroup order l ~ 2^250.6: harmless, r*Base8 is taken mod l)
// deterministic auditor committee key for tests (threshold sharing of tsk is E6)
export async function auditorKey(label = "auditor-0") {
  const { eddsa } = await init(); const bj = eddsa.babyJub, F = bj.F;
  const tsk = rand251(`tsk-${label}`); const P = bj.mulPointEscalar(bj.Base8, tsk);
  return { tsk, tpk: [F.toObject(P[0]), F.toObject(P[1])] };
}
export async function elgamal(pk, m, r) {
  const { eddsa } = await init(); const bj = eddsa.babyJub, F = bj.F;
  const c1 = bj.mulPointEscalar(bj.Base8, r);
  const c2 = bj.addPoint([F.e(m[0]), F.e(m[1])], bj.mulPointEscalar([F.e(pk[0]), F.e(pk[1])], r));
  return [[F.toObject(c1[0]), F.toObject(c1[1])], [F.toObject(c2[0]), F.toObject(c2[1])]];
}
export async function elgamalDec(tsk, c1, c2) {
  const { eddsa } = await init(); const bj = eddsa.babyJub, F = bj.F;
  const s = bj.mulPointEscalar([F.e(c1[0]), F.e(c1[1])], tsk);
  const m = bj.addPoint([F.e(c2[0]), F.e(c2[1])], [F.neg(s[0]), s[1]]);          // c2 - tsk*c1 (twisted Edwards: -(x, y) = (-x, y))
  return [F.toObject(m[0]), F.toObject(m[1])];
}
// encrypt the points ents (array of [x, y]) into input fields for the given mode; accSeed fixes the randomness
export async function encryptChain(input, ents, tpk, mode, accSeed) {
  const { eddsa, poseidon } = await init(); const P = (xs) => eddsa.F.toObject(poseidon(xs.map(BigInt))); const bj = eddsa.babyJub, F = bj.F;
  const N = ents.length; input.tpk = tpk.map(String);
  if (mode === "A") {
    Object.assign(input, { acc_r: [], acc_c1x: [], acc_c1y: [], acc_c2x: [], acc_c2y: [], acc_kx: "0", acc_ky: "0", acc_e: [["0", "0"]] });
    for (let j = 0; j < N; j++) {
      const r = rand251(`acc-${accSeed}-${j}`); const [c1, c2] = await elgamal(tpk, ents[j], r);
      input.acc_r.push(String(r)); input.acc_c1x.push(String(c1[0])); input.acc_c1y.push(String(c1[1])); input.acc_c2x.push(String(c2[0])); input.acc_c2y.push(String(c2[1]));
    }
  } else {
    const r = rand251(`acc-${accSeed}-r`), s = rand251(`acc-${accSeed}-k`); const Kp = bj.mulPointEscalar(bj.Base8, s); const K = [F.toObject(Kp[0]), F.toObject(Kp[1])];
    const [c1, c2] = await elgamal(tpk, K, r);
    Object.assign(input, { acc_r: [String(r)], acc_kx: String(K[0]), acc_ky: String(K[1]), acc_c1x: [String(c1[0])], acc_c1y: [String(c1[1])], acc_c2x: [String(c2[0])], acc_c2y: [String(c2[1])], acc_e: [] });
    const Rm = (x) => ((x % RP) + RP) % RP;
    for (let j = 0; j < N; j++) input.acc_e.push([0, 1].map((b) => String(Rm(BigInt(ents[j][b]) + P([K[0], K[1], BigInt(2 * j + b)])))));
  }
  return input;
}
const RP = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
// auditor: recover ent[0..D] from the public signals of one action
export async function decryptChain(input, tsk, mode) {
  const { eddsa, poseidon } = await init(); const P = (xs) => eddsa.F.toObject(poseidon(xs.map(BigInt)));
  if (mode === "A") {
    const out = []; for (let j = 0; j < input.acc_c1x.length; j++) out.push(await elgamalDec(tsk, [input.acc_c1x[j], input.acc_c1y[j]], [input.acc_c2x[j], input.acc_c2y[j]]));
    return out;
  }
  const K = await elgamalDec(tsk, [input.acc_c1x[0], input.acc_c1y[0]], [input.acc_c2x[0], input.acc_c2y[0]]);
  return input.acc_e.map((e, j) => [0, 1].map((b) => (((BigInt(e[b]) - P([K[0], K[1], BigInt(2 * j + b)])) % RP) + RP) % RP));
}
export async function buildInstanceV7({ mode = "C", accSeed, auditor = "auditor-0", ...opts } = {}) {
  const { input, meta } = await buildInstanceV6(opts);
  const { tsk, tpk } = await auditorKey(auditor);
  const ents = input.ent_Ax.map((x, i) => [BigInt(x), BigInt(input.ent_Ay[i])]);
  await encryptChain(input, ents, tpk, mode, accSeed ?? `${meta.D}-${meta.seed}-${mode}`);
  Object.assign(meta, { mode, tsk, tpk, accEnts: ents });   // not "ents": meta.ents holds the entity objects (prv, sk)
  return { input, meta };
}
