// Instance generator for zkdac_chain (T2). Deterministic given seed.
import { buildEddsa, buildPoseidon, newMemEmptyTrie } from "circomlibjs";
import { Scalar } from "ffjavascript";
import createBlakeHash from "blake-hash";
import crypto from "crypto";

export const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
let _e, _p;
export async function init() { if (!_e) { _e = await buildEddsa(); _p = await buildPoseidon(); } return { eddsa: _e, poseidon: _p }; }

function prng(seed) { let c = 0; return (n) => crypto.createHash("sha256").update(`${seed}:${c++}`).digest().subarray(0, n); }

export async function buildInstance({ D = 4, MD = 16, RD = 16, seed = 0, now = 1000, caps, expiries, nRevoked = 8, issuedExtra = 8, action, extraLeaves = [], extraLeafBase = 200000, extraRevoked = [], entPrv = [] } = {}) {
  const { eddsa, poseidon } = await init(); const F = eddsa.F; const P = (xs) => F.toObject(poseidon(xs.map(BigInt)));
  const rnd = prng(`zkdac-v2-${D}-${seed}`);
  const ents = [];
  for (let i = 0; i <= D; i++) {
    const r = rnd(32);                       // always draw, so the PRNG stream (and every default instance) is unchanged
    const prv = entPrv[i] ? Buffer.from(entPrv[i]) : r;   // entPrv: optional externally supplied private keys (e.g. a Semaphore identity, #17)
    const A = eddsa.prv2pub(prv);
    const sBuff = eddsa.pruneBuffer(createBlakeHash("blake512").update(Buffer.from(prv)).digest());
    const sk = BigInt(Scalar.shr(Scalar.fromRprLE(sBuff, 0, 32), 3)) % SUBORDER; // EdDSA scalar reduced mod subgroup order (same pubkey)
    ents.push({ prv, Ax: F.toObject(A[0]), Ay: F.toObject(A[1]), sk });
  }
  caps ??= [0xFF, 0x3F, 0x0F, 0x03].slice(0, D);
  expiries ??= [5000, 4000, 3000, 2000].slice(0, D);
  const cert = [], sigs = [];
  for (let i = 0; i < D; i++) {
    cert[i] = P([i, ents[i].Ax, ents[i].Ay, ents[i + 1].Ax, ents[i + 1].Ay, caps[i], expiries[i]]);
    const sg = eddsa.signPoseidon(ents[i].prv, F.e(cert[i]));
    sigs.push({ S: sg.S, R8x: F.toObject(sg.R8[0]), R8y: F.toObject(sg.R8[1]) });
  }
  // issued tree (depth MD): our certs at indices 0..D-1 plus random other leaves
  const leaves = new Map();
  for (let i = 0; i < D; i++) leaves.set(BigInt(i * 7919 + 3), cert[i]);
  // NOTE (2026-10-08, #28): the default extraLeafBase 200000 and the issuedExtra indices 100000+ are >= 2^MD for MD = 16, so those leaves are
  // NOT in issued_root (only our own certs at 3 + 7919 i are). Kept as default so existing instances stay byte-identical; pass
  // extraLeafBase < 2^MD (e.g. 40000) when the extra leaves must really be members.
  extraLeaves.forEach((v, k) => leaves.set(BigInt(extraLeafBase + k * 17), BigInt(v)));
  for (let k = 0; k < issuedExtra; k++) leaves.set(BigInt(100000 + k * 31), BigInt("0x" + Buffer.from(rnd(31)).toString("hex")));
  const zero = [0n]; for (let l = 0; l < MD; l++) zero.push(P([zero[l], zero[l]]));
  let level = new Map(leaves); const levels = [level];
  for (let l = 0; l < MD; l++) {
    const next = new Map();
    for (const idx of new Set([...level.keys()].map((k) => k >> 1n))) {
      const a = level.get(idx * 2n) ?? zero[l], b = level.get(idx * 2n + 1n) ?? zero[l]; next.set(idx, P([a, b]));
    }
    level = next; levels.push(level);
  }
  const issued_root = levels[MD].get(0n) ?? zero[MD];
  const m_sib = [], m_bit = [];
  for (let i = 0; i < D; i++) {
    let idx = BigInt(i * 7919 + 3); const sib = [], bit = [];
    for (let l = 0; l < MD; l++) { const sIdx = idx ^ 1n; sib.push(levels[l].get(sIdx) ?? zero[l]); bit.push(Number(idx & 1n)); idx >>= 1n; }
    m_sib.push(sib); m_bit.push(bit);
  }
  // revocation SMT (depth RD): unrelated revoked ids; ours are absent
  const smt = await newMemEmptyTrie();
  const revokedIds = [];
  for (let k = 0; k < nRevoked; k++) { const id = BigInt("0x" + Buffer.from(rnd(31)).toString("hex")); revokedIds.push(id); await smt.insert(id, 0n); }
  for (const k of extraRevoked) { revokedIds.push(BigInt(k)); await smt.insert(BigInt(k), 0n); }
  const r_sib = [], r_oldKey = [], r_oldValue = [], r_isOld0 = [];
  for (let i = 0; i < D; i++) {
    const res = await smt.find(cert[i]);
    if (res.found) throw new Error("cert unexpectedly revoked");
    const sib = res.siblings.map((x) => F.toObject(x)); while (sib.length < RD) sib.push(0n);
    r_sib.push(sib); r_oldKey.push(res.isOld0 ? 0n : F.toObject(res.notFoundKey)); r_oldValue.push(res.isOld0 ? 0n : F.toObject(res.notFoundValue)); r_isOld0.push(res.isOld0 ? 1 : 0);
  }
  const revoked_root = F.toObject(smt.root);
  const act = { chain_id: 1n, verifier: 0xA11CEn, method: 0x12345678n, params_hash: 777n, amount: 100n, req_cap: BigInt(caps[D - 1] & 0x1), nonce: BigInt(seed) + 1n, ...(action ?? {}) };
  const action_digest = P([act.chain_id, act.verifier, act.method, act.params_hash, act.amount, act.req_cap, act.nonce]);
  const holder_sk = ents[D].sk;
  const nullifier = P([1952805748n, holder_sk, action_digest]);
  const s = (x) => (Array.isArray(x) ? x.map(s) : x !== null && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, s(v)])) : x.toString());
  const input = s({
    issued_root, revoked_root, action_digest, nullifier, now,
    ent_Ax: ents.map((e) => e.Ax), ent_Ay: ents.map((e) => e.Ay),
    sig_S: sigs.map((x) => x.S), sig_R8x: sigs.map((x) => x.R8x), sig_R8y: sigs.map((x) => x.R8y),
    cap: caps, expiry: expiries, m_sib, m_bit, r_sib, r_oldKey, r_oldValue, r_isOld0, holder_sk,
    act_chain_id: act.chain_id, act_verifier: act.verifier, act_method: act.method, act_params_hash: act.params_hash,
    act_amount: act.amount, act_req_cap: act.req_cap, act_nonce: act.nonce,
  });
  return { input, meta: { leaves, levels, zero, merkleIdx: (v) => [...leaves.entries()].find(([, x]) => x === BigInt(v))?.[0], merklePath: (idx) => { let i = BigInt(idx); const sib = [], bit = []; for (let l = 0; l < MD; l++) { sib.push(levels[l].get(i ^ 1n) ?? zero[l]); bit.push(Number(i & 1n)); i >>= 1n; } return { sib, bit }; }, exclusion: async (key) => { const res = await smt.find(BigInt(key)); const sib = res.siblings.map((x) => F.toObject(x)); while (sib.length < RD) sib.push(0n); return { found: res.found, sib, oldKey: res.isOld0 ? 0n : F.toObject(res.notFoundKey), oldValue: res.isOld0 ? 0n : F.toObject(res.notFoundValue), isOld0: res.isOld0 ? 1 : 0 }; }, caps, expiries, now, act, D, MD, RD, seed, cert: s(cert), revokedIds: s(revokedIds), P: (xs) => P(xs), smt, ents, revoked_root, issued_root } };
}
