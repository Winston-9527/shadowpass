// T2 re-run on the v3 main circuit (layout C): exhaustive single-field mutation + targeted semantic attacks.
// usage: node scripts/mutate_v3.mjs D > results/mutations_dD.json
import { buildInstanceV3, ctxHash, init, R, SUBORDER, TAG, DEFAULT_CTX } from "./lib_v3.mjs";
import { satisfiable } from "./witness_v3.mjs";
import { newMemEmptyTrie } from "circomlibjs";
const D = Number(process.argv[2] ?? 4);
const { input: base } = await buildInstanceV3({ D });
const clone = (o) => JSON.parse(JSON.stringify(o));
const out = { circuit: "zkdac_v3", D, field_mutations: [], semantic: [] };
// 1) every scalar leaf: +1 mod p (path bits: flip)
function* leaves(o, p = []) { if (Array.isArray(o)) for (let i = 0; i < o.length; i++) yield* leaves(o[i], [...p, i]); else yield p; }
for (const key of Object.keys(base)) {
  if (!Array.isArray(base[key])) { const m = clone(base); m[key] = ((BigInt(m[key]) + 1n) % R).toString(); out.field_mutations.push({ field: key, accepted: await satisfiable(D, m) }); continue; }
  for (const p of leaves(base[key])) {
    const m = clone(base); let ref = m[key]; for (const i of p.slice(0, -1)) ref = ref[i]; const last = p[p.length - 1];
    ref[last] = key === "m_bit" ? (ref[last] === "0" ? "1" : "0") : ((BigInt(ref[last]) + 1n) % R).toString();
    out.field_mutations.push({ field: `${key}[${p.join("][")}]`, accepted: await satisfiable(D, m) });
  }
}
// 2) semantic cases. Names ending in EXPECT_ACCEPT are legitimate statements (documented, not attacks).
const sem = async (name, mut) => { const { input, meta } = await buildInstanceV3({ D }); const m = mut(clone(input), meta); out.semantic.push({ name, accepted: await satisfiable(D, m) }); };
const nf = (t, sk, h, req) => t.P([TAG, BigInt(sk), t.P([BigInt(h), BigInt(req)])]).toString();
await sem("holder_sk_alias_plus_order", (m) => (m.holder_sk = (BigInt(m.holder_sk) + SUBORDER).toString(), m));
await sem("nullifier_other_secret", (m, t) => (m.nullifier = nf(t, 5n, m.ctx_hash, m.act_req_cap), m));
await sem("nullifier_pubkey_derived_no_secret", (m, t) => (m.nullifier = nf(t, m.ent_Ax[D], m.ctx_hash, m.act_req_cap), m));
await sem("ctx_hash_changed_nullifier_stale", (m, t) => (m.ctx_hash = ctxHash({ ...t.ctx, method: "0x095ea7b3" }).toString(), m));
await sem("ctx_hash_other_chain_nullifier_stale", (m, t) => (m.ctx_hash = ctxHash({ ...t.ctx, chainId: 137n }).toString(), m));
await sem("req_cap_changed_nullifier_stale", (m) => (m.act_req_cap = "0", m));
await sem("holder_reproves_for_other_ctx_EXPECT_ACCEPT", (m, t) => { const h = ctxHash({ ...t.ctx, amount: 7n }); m.ctx_hash = h.toString(); m.nullifier = nf(t, m.holder_sk, h, m.act_req_cap); return m; });
await sem("req_cap_zero_consistent_EXPECT_ACCEPT_contract_must_fix_req_cap", (m, t) => { m.act_req_cap = "0"; m.nullifier = nf(t, m.holder_sk, m.ctx_hash, 0n); return m; });
const termExp = [5000, 4000, 3000, 2000].slice(0, D)[D - 1];
await sem("expired_now_after_expiry", (m) => (m.now = String(termExp + 1), m));
await sem("now_equals_terminal_expiry_boundary_EXPECT_ACCEPT", (m) => (m.now = String(termExp), m));
await sem("now_huge_field_wrap", (m) => (m.now = (R - 1n).toString(), m));
await sem("merkle_bit_not_boolean", (m) => (m.m_bit[0][0] = "2", m));
for (let i = 1; i < D; i++) { const caps = [0xFF, 0x3F, 0x0F, 0x03].slice(0, D); caps[i] = caps[i - 1] | 0x100; const { input } = await buildInstanceV3({ D, caps }); out.semantic.push({ name: `cap_overreach_hop${i}`, accepted: await satisfiable(D, input) }); }
{ const { input } = await buildInstanceV3({ D, reqCap: 0x1000n }); out.semantic.push({ name: "req_cap_not_covered_by_terminal", accepted: await satisfiable(D, input) }); }
if (D > 1) { const exps = [5000, 4000, 3000, 2000].slice(0, D); exps[1] = exps[0] + 1; const { input } = await buildInstanceV3({ D, expiries: exps }); out.semantic.push({ name: "child_expiry_exceeds_parent", accepted: await satisfiable(D, input) }); }
const { eddsa } = await init();
for (let i = 0; i < D; i++) {
  const { input, meta } = await buildInstanceV3({ D }); await meta.smt.insert(BigInt(meta.cert[i]), 0n);
  const m = clone(input); m.revoked_root = eddsa.F.toObject(meta.smt.root).toString();
  out.semantic.push({ name: `revoked_cert${i}_stale_nonmembership_proof`, accepted: await satisfiable(D, m) });
}
{ const { input, meta } = await buildInstanceV3({ D }); const t = await newMemEmptyTrie(); await t.insert(BigInt(meta.cert[0]), 0n);
  const m = clone(input); m.revoked_root = eddsa.F.toObject(t.root).toString(); m.r_sib[0] = m.r_sib[0].map(() => "0"); m.r_isOld0[0] = "1"; m.r_oldKey[0] = "0"; m.r_oldValue[0] = "0";
  out.semantic.push({ name: "revoked_cert0_forged_exclusion_isOld0", accepted: await satisfiable(D, m) }); }
const unexpected = out.semantic.filter((x) => x.accepted !== x.name.includes("EXPECT_ACCEPT"));
out.summary = { field_mutations: out.field_mutations.length, field_accepted: out.field_mutations.filter((x) => x.accepted).map((x) => x.field),
  semantic: out.semantic.length, semantic_unexpected: unexpected.map((x) => x.name) };
console.log(JSON.stringify(out, null, 1)); process.exit(0);
