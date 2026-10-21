// Instances for v9 (#41): the v8 instance converted — no action nullifier; state_root = Poseidon(issued_root, revoked_root, root_root);
// compressed mode-C accountability: e[j] = y_j + Poseidon(Kx, Ky, j), e_sign = sum parity(x_j) 2^j + Poseidon(Kx, Ky, N).
import { createRequire } from "module"; import crypto from "crypto";
const req = createRequire(new URL("../package.json", import.meta.url));
const { poseidon3 } = req("poseidon-lite"); const { buildBabyjub } = req("circomlibjs");
import { buildInstanceV8 } from "../../zkdac_v8/scripts/lib_v8.mjs";
export * from "../../zkdac_v8/scripts/lib_v8.mjs";
const bj = await buildBabyjub(); const F = bj.F;
export const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const mod = (x) => ((x % P) + P) % P;
const rand251 = (tag) => BigInt("0x" + crypto.createHash("sha256").update(tag).digest("hex")) >> 5n;
const pt = (P_) => [F.toObject(P_[0]), F.toObject(P_[1])];
export const stateRoot = (i, r, t) => poseidon3([BigInt(i), BigInt(r), BigInt(t)]);
// replaces the v7/v8 accountability fields and the action nullifier; sets state_root. accSeed fixes the randomness (tests); use a CSPRNG seed in practice.
export function toV9(input, accSeed) {
  const N = input.ent_Ax.length; const tpk = input.tpk.map(BigInt);
  const r = rand251(`v9acc-${accSeed}-r`), s = rand251(`v9acc-${accSeed}-k`);
  const K = pt(bj.mulPointEscalar(bj.Base8, s)); const c1 = pt(bj.mulPointEscalar(bj.Base8, r));
  const c2 = pt(bj.addPoint([F.e(K[0]), F.e(K[1])], bj.mulPointEscalar([F.e(tpk[0]), F.e(tpk[1])], r)));
  const e = [], bitsArr = []; let packed = 0n;
  for (let j = 0; j < N; j++) { const x = BigInt(input.ent_Ax[j]), y = BigInt(input.ent_Ay[j]); e.push(String(mod(y + poseidon3([K[0], K[1], BigInt(j)])))); packed += (x & 1n) << BigInt(j); }
  const esign = mod(packed + poseidon3([K[0], K[1], BigInt(N)]));
  for (const k of ["acc_r", "acc_kx", "acc_ky", "acc_c1x", "acc_c1y", "acc_c2x", "acc_c2y", "acc_e", "nullifier"]) delete input[k];
  Object.assign(input, { acc_r: String(r), acc_kx: String(K[0]), acc_ky: String(K[1]), acc_c1x: String(c1[0]), acc_c1y: String(c1[1]), acc_c2x: String(c2[0]), acc_c2y: String(c2[1]),
    acc_e: e, acc_esign: String(esign), state_root: String(stateRoot(input.issued_root, input.revoked_root, input.root_root)) });
  return input;
}
// x from y on BabyJub (a x^2 + y^2 = 1 + d x^2 y^2) with the given parity
export function xFromY(y, parity) { const yy = F.square(F.e(y)); const num = F.sub(F.one, yy), den = F.sub(F.e(168700n), F.mul(F.e(168696n), yy));
  if (F.isZero(den)) return null; const x2 = F.div(num, den);
  // Legendre check first: circomlibjs' wasm F.sqrt does not return on non-residues (found by T3 v9 run 1; malformed ciphertexts only)
  { const v = F.toObject(x2); let r = 1n, bb = v, e = (P - 1n) / 2n; while (e > 0n) { if (e & 1n) r = (r * bb) % P; bb = (bb * bb) % P; e >>= 1n; } if (v !== 0n && r !== 1n) return null; }
  const r = F.sqrt(x2); if (r === null) return null; let x = F.toObject(r); if ((x & 1n) !== BigInt(parity)) x = mod(-x); return x; }
// auditor side: from S = tsk * c1 (single key: S = tsk * c1; threshold: Lagrange-combined partial decryptions) recover ent[0..N-1]
export function openWithS(pub, S) {
  const K = pt(bj.addPoint([F.e(BigInt(pub.c2[0])), F.e(BigInt(pub.c2[1]))], [F.neg(F.e(BigInt(S[0]))), F.e(BigInt(S[1]))]));
  const N = pub.e.length; const bits = mod(BigInt(pub.esign) - poseidon3([K[0], K[1], BigInt(N)]));
  if (bits >= (1n << BigInt(N))) return null;                                        // wrong K: packed parity word out of range
  return pub.e.map((ej, j) => { const y = mod(BigInt(ej) - poseidon3([K[0], K[1], BigInt(j)])); const x = xFromY(y, (bits >> BigInt(j)) & 1n); return x === null ? null : [x, y]; });
}
export function openSingleKey(pub, tsk) { const S = pt(bj.mulPointEscalar([F.e(BigInt(pub.c1[0])), F.e(BigInt(pub.c1[1]))], BigInt(tsk))); return openWithS(pub, S); }
export const pubOfInput = (i) => ({ c1: [i.acc_c1x, i.acc_c1y], c2: [i.acc_c2x, i.acc_c2y], e: i.acc_e, esign: i.acc_esign });
export async function buildInstanceV9(opts = {}) { const { input, meta } = await buildInstanceV8(opts); toV9(input, opts.accSeed ?? `${meta.D}-${meta.seed}`); return { input, meta }; }
