// ShadowPass witness builder: identities, view keys, certificates, the four trees (issued, revoked IMT, registered roots, notes),
// owner ciphertexts and the inputs of shadow_chain.circom / register.circom. Written fresh for ShadowPass; tree formats, hashes and tags
// follow the ZK-DAC v9.2 research code (vendor/zk-hada-exp) so the unchanged parts of the circuit see exactly the same encodings.
import crypto from "crypto";
import { buildEddsa, buildBabyjub } from "circomlibjs";
import { Scalar } from "ffjavascript";
import createBlakeHash from "blake-hash";
import { poseidon2, poseidon3, poseidon7, poseidon8, poseidon9 } from "poseidon-lite";
import { LeanIMT } from "@zk-kit/lean-imt";
import { IMT } from "./imt.mjs";

export const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const L = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;   // BabyJub prime subgroup order
export const MD = 16, RD = 20, RT = 20, NT = 20;
export const KEY_TAG = 2053861995n, TAG_BNF = 2053857902n, TAG_REG = 2053858418n;
const mod = (x) => ((x % P) + P) % P;
const S = (x) => (Array.isArray(x) ? x.map(S) : typeof x === "bigint" || typeof x === "number" ? x.toString()
  : x !== null && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, S(v)])) : x);

const eddsa = await buildEddsa();
const bj = await buildBabyjub();
const F = bj.F;
const pt = (p) => [F.toObject(p[0]), F.toObject(p[1])];
const fe = (p) => [F.e(BigInt(p[0])), F.e(BigInt(p[1]))];
export const mul = (p, k) => pt(bj.mulPointEscalar(fe(p), BigInt(k)));
export const add = (a, b) => pt(bj.addPoint(fe(a), fe(b)));
export const BASE8 = pt(bj.Base8), GEN = pt(bj.Generator);

// Randomness: seeded (tests, reproducible) or CSPRNG.
export function rng(seed) {
  let c = 0;
  return seed === undefined ? (n) => crypto.randomBytes(n) : (n) => crypto.createHash("sha256").update(`${seed}:${c++}`).digest().subarray(0, n);
}
const scalarBelow = (rnd, bound) => { for (;;) { const x = BigInt("0x" + Buffer.from(rnd(32)).toString("hex")) % bound; if (x !== 0n) return x; } };

// EdDSA identity: prv (32 bytes) -> public key A and the scalar sk with sk * Base8 = A (same derivation as the research code).
export function identity(prv) {
  const A = eddsa.prv2pub(prv);
  const h = eddsa.pruneBuffer(createBlakeHash("blake512").update(Buffer.from(prv)).digest());
  const sk = BigInt(Scalar.shr(Scalar.fromRprLE(h, 0, 32), 3)) % L;
  return { prv: Buffer.from(prv), Ax: F.toObject(A[0]), Ay: F.toObject(A[1]), sk };
}
// Owner view key: vsk in [1, l); w = vsk * G; vpk = vsk * Base8 = 8 * w.
export function viewKey(vsk) { return { vsk, w: mul(GEN, vsk), vpk: mul(BASE8, vsk) }; }

export const certHash0 = (a, b, cap, expiry, vpk) => poseidon9([0n, a.Ax, a.Ay, b.Ax, b.Ay, BigInt(cap), BigInt(expiry), vpk[0], vpk[1]]);
export const certHash = (i, a, b, cap, expiry) => poseidon7([BigInt(i), a.Ax, a.Ay, b.Ax, b.Ay, BigInt(cap), BigInt(expiry)]);
export const keyEntry = (e) => poseidon3([KEY_TAG, e.Ax, e.Ay]);
export const noteCm = (n) => poseidon8([n.own[0], n.own[1], BigInt(n.q), ...n.lin.map(BigInt), BigInt(n.rho)]);
export const stateRoot = (i, r, t) => poseidon3([BigInt(i), BigInt(r), BigInt(t)]);
export function sign(ent, msg) { const s = eddsa.signPoseidon(ent.prv, F.e(BigInt(msg))); return { S: s.S, R8x: F.toObject(s.R8[0]), R8y: F.toObject(s.R8[1]) }; }

// Sparse Poseidon Merkle tree of fixed depth (issued certificates), leaves appended at 0, 1, 2, ...
class SparseTree {
  constructor(depth) { this.depth = depth; this.zero = [0n]; for (let l = 0; l < depth; l++) this.zero.push(poseidon2([this.zero[l], this.zero[l]])); this.levels = Array.from({ length: depth + 1 }, () => new Map()); this.n = 0; this.index = new Map(); }
  insert(leaf) {
    const i = this.n++; this.index.set(BigInt(leaf), i); let idx = BigInt(i); this.levels[0].set(idx, BigInt(leaf));
    for (let l = 0; l < this.depth; l++) { const a = this.levels[l].get(idx & ~1n) ?? this.zero[l], b = this.levels[l].get(idx | 1n) ?? this.zero[l]; idx >>= 1n; this.levels[l + 1].set(idx, poseidon2([a, b])); }
    return i;
  }
  get root() { return this.levels[this.depth].get(0n) ?? this.zero[this.depth]; }
  path(leaf) { const i = this.index.get(BigInt(leaf)); if (i === undefined) throw new Error("not issued"); let idx = BigInt(i); const sib = [], bit = [];
    for (let l = 0; l < this.depth; l++) { sib.push(this.levels[l].get(idx ^ 1n) ?? this.zero[l]); bit.push(Number(idx & 1n)); idx >>= 1n; } return { sib, bit }; }
}
const leanProof = (tree, leaf, depth) => { const idx = tree.indexOf(BigInt(leaf)); if (idx < 0) throw new Error("leaf not in tree"); const p = tree.generateProof(idx);
  const sib = p.siblings.map(BigInt); while (sib.length < depth) sib.push(0n); return { root: p.root, depth: p.siblings.length, index: p.index, sib }; };

// Owner ciphertext (AccHybridCompressed): K = k * Base8, c1 = r * Base8, c2 = K + r * vpk, e[j] = y_j + H(K, j), esign = sum parity(x_j) 2^j + H(K, N).
export function encryptChain(ents, vpk, rnd) {
  const r = scalarBelow(rnd, L), k = scalarBelow(rnd, L);
  const K = mul(BASE8, k), c1 = mul(BASE8, r), c2 = add(K, mul(vpk, r));
  const N = ents.length; let packed = 0n; const e = [];
  for (let j = 0; j < N; j++) { e.push(mod(ents[j].Ay + poseidon3([K[0], K[1], BigInt(j)]))); packed += (ents[j].Ax & 1n) << BigInt(j); }
  return { r, K, c1, c2, e, esign: mod(packed + poseidon3([K[0], K[1], BigInt(N)])) };
}
function xFromY(y, parity) {
  const yy = F.square(F.e(y)); const num = F.sub(F.one, yy), den = F.sub(F.e(168700n), F.mul(F.e(168696n), yy)); if (F.isZero(den)) return null;
  const v = F.toObject(F.div(num, den)); let r = 1n, b = v, ex = (P - 1n) / 2n; while (ex > 0n) { if (ex & 1n) r = (r * b) % P; b = (b * b) % P; ex >>= 1n; } if (v !== 0n && r !== 1n) return null;
  let x = F.toObject(F.sqrt(F.e(v))); if ((x & 1n) !== BigInt(parity)) x = mod(-x); return x;
}
// Owner side: decrypt with vsk. Returns [[Ax, Ay], ...] or null when the ciphertext is not for this key.
export function openChain(ct, vsk) {
  const Sx = mul(ct.c1, vsk); const K = add(ct.c2, [mod(-Sx[0]), Sx[1]]);
  const N = ct.e.length; const bits = mod(BigInt(ct.esign) - poseidon3([K[0], K[1], BigInt(N)]));
  if (bits >= 1n << BigInt(N)) return null;
  const out = ct.e.map((ej, j) => { const y = mod(BigInt(ej) - poseidon3([K[0], K[1], BigInt(j)])); const x = xFromY(y, (bits >> BigInt(j)) & 1n); return x === null ? null : [x, y]; });
  return out.some((p) => p === null) ? null : out;
}

export class ShadowWorld {
  constructor(seed) {
    this.rnd = rng(seed);
    this.issued = new SparseTree(MD); this.roots = new LeanIMT((a, b) => poseidon2([a, b])); this.notes = new LeanIMT((a, b) => poseidon2([a, b]));
    this.group = new LeanIMT((a, b) => poseidon2([a, b]));
  }
  static async create(seed) { const w = new ShadowWorld(seed); w.revoked = await IMT.create(RD); return w; }
  newIdentity() { return identity(this.rnd(32)); }
  newViewKey() { return viewKey(scalarBelow(this.rnd, L)); }
  rand250() { return BigInt("0x" + Buffer.from(this.rnd(32)).toString("hex")) % (1n << 250n); }

  // Hop 0: human -> steward, binding the owner's view key. Registered in the root tree (by the registration proof on chain).
  issueRoot(human, holder, cap, expiry, vk) {
    const hash = certHash0(human, holder, cap, expiry, vk.vpk);
    return { hop: 0, issuer: human, holder, cap: BigInt(cap), expiry: BigInt(expiry), vk, hash, sig: sign(human, hash) };
  }
  // Hop i >= 1: appended to the issued tree.
  issue(parent, holder, cap, expiry) {
    const i = parent.hop + 1, issuer = parent.holder; const hash = certHash(i, issuer, holder, cap, expiry);
    const c = { hop: i, issuer, holder, cap: BigInt(cap), expiry: BigInt(expiry), hash, sig: sign(issuer, hash) }; this.issued.insert(hash); return c;
  }
  register(cert0) { this.roots.insert(cert0.hash); }
  revokeCert(c) { this.revoked.insert(c.hash); }
  revokeKey(e) { this.revoked.insert(keyEntry(e)); }
  addToGroup(human) { this.group.insert(poseidon2([human.Ax, human.Ay])); }
  // Budget note owned by the terminal holder of `chain`, lineage = the chain's certificate hashes.
  mintNote(chain, q) { const holder = chain[chain.length - 1].holder; const lin = [0, 1, 2, 3].map((j) => (j < chain.length ? chain[j].hash : 0n));
    const n = { own: [holder.Ax, holder.Ay], q: BigInt(q), lin, rho: this.rand250() }; this.notes.insert(noteCm(n)); return n; }

  // Input of main_d{D}.circom for `chain` (certs hop 0..D-1), spending `qSpent` of `note`.
  actionInput({ chain, holderSk, note, qSpent, ctxHash, reqCap, now, ownW, encryptTo }) {
    const D = chain.length, ents = [chain[0].issuer, ...chain.map((c) => c.holder)];
    const vpk = encryptTo ?? chain[0].vk.vpk, ct = encryptChain(ents, vpk, this.rnd);
    const rootP = leanProof(this.roots, chain[0].hash, RT), noteP = leanProof(this.notes, noteCm(note), NT);
    const rw = chain.map((c) => this.revoked.nonMemberWitness(c.hash));
    const kw = D > 1 ? ents.slice(2).map((e) => this.revoked.nonMemberWitness(keyEntry(e))) : null;
    const zerosRD = Array(RD).fill(0n);
    const qChange = BigInt(note.q) - BigInt(qSpent), rhoChange = this.rand250();
    const change = { own: note.own, q: qChange, lin: note.lin, rho: rhoChange };
    const issuedRoot = this.issued.root, revokedRoot = this.revoked.root, rootRoot = rootP.root;
    const input = {
      state_root: stateRoot(issuedRoot, revokedRoot, rootRoot), now: BigInt(now), issued_root: issuedRoot, revoked_root: revokedRoot, root_root: rootRoot,
      ent_Ax: ents.map((e) => e.Ax), ent_Ay: ents.map((e) => e.Ay),
      sig_S: chain.map((c) => c.sig.S), sig_R8x: chain.map((c) => c.sig.R8x), sig_R8y: chain.map((c) => c.sig.R8y),
      cap: chain.map((c) => c.cap), expiry: chain.map((c) => c.expiry),
      m_sib: chain.map((c) => (c.hop === 0 ? Array(MD).fill(0n) : this.issued.path(c.hash).sib)),
      m_bit: chain.map((c) => (c.hop === 0 ? Array(MD).fill(0) : this.issued.path(c.hash).bit)),
      r_low_value: rw.map((w) => w.low_value), r_low_next_index: rw.map((w) => w.low_next_index), r_low_next_value: rw.map((w) => w.low_next_value),
      r_sib: rw.map((w) => w.sib), r_bit: rw.map((w) => w.bit),
      rt_depth: rootP.depth, rt_index: rootP.index, rt_sib: rootP.sib,
      k_low_value: kw ? kw.map((w) => w.low_value) : [0n], k_low_next_index: kw ? kw.map((w) => w.low_next_index) : [0n], k_low_next_value: kw ? kw.map((w) => w.low_next_value) : [0n],
      k_sib: kw ? kw.map((w) => w.sib) : [zerosRD], k_bit: kw ? kw.map((w) => w.bit) : [zerosRD],
      holder_sk: holderSk, ctx_hash: BigInt(ctxHash), act_req_cap: BigInt(reqCap),
      own_w: ownW ?? chain[0].vk.w, own_r: ct.r, own_kx: ct.K[0], own_ky: ct.K[1],
      own_c1x: ct.c1[0], own_c1y: ct.c1[1], own_c2x: ct.c2[0], own_c2y: ct.c2[1], own_e: ct.e, own_esign: ct.esign,
      note_root: noteP.root, budget_nf: poseidon3([TAG_BNF, BigInt(holderSk), noteCm(note)]), cm_change: noteCm(change), q_spent: BigInt(qSpent),
      q_in: BigInt(note.q), rho_in: BigInt(note.rho), q_change: qChange, rho_change: rhoChange,
      nt_depth: noteP.depth, nt_index: noteP.index, nt_sib: noteP.sib,
    };
    return { input: S(input), change, ct };
  }

  // Input of main_reg.circom: the human proves group membership and the root certificate hash (with view key).
  registerInput({ human, cert0, domain, ownW }) {
    const gp = leanProof(this.group, poseidon2([human.Ax, human.Ay]), 20);
    const input = { group_root: gp.root, domain: BigInt(domain), nf_domain: poseidon3([TAG_REG, human.sk, BigInt(domain)]), leaf0: cert0.hash,
      human_sk: human.sk, master_Ax: cert0.holder.Ax, master_Ay: cert0.holder.Ay, cap0: cert0.cap, expiry0: cert0.expiry,
      own_w: ownW ?? cert0.vk.w, depth: gp.depth, index: gp.index, siblings: gp.sib };
    return S(input);
  }
}
export const ownerCtOfInput = (i) => ({ c1: [i.own_c1x, i.own_c1y], c2: [i.own_c2x, i.own_c2y], e: i.own_e, esign: i.own_esign });
