// T2 re-run on the v5 main circuit (v4 + registered-root tree, #17): exhaustive single-field mutation + targeted semantic attacks.
// Ported from ../zkdac_v4/scripts/mutate_v4.mjs; adds the registered-root cases. usage: node scripts/mutate_v5.mjs D > results/mutations_dD.json
import { buildInstanceV5 as buildInstanceV3, ctxHash, init, R, SUBORDER, TAG, DEFAULT_CTX, trunc, rootProof, RT } from "./lib_v5.mjs";
import { satisfiable } from "./witness_v5.mjs";
const D = Number(process.argv[2] ?? 4);
const { input: base } = await buildInstanceV3({ D });
const clone = (o) => JSON.parse(JSON.stringify(o));
const out = { circuit: "zkdac_v5", D, field_mutations: [], semantic: [] };
// 1) every scalar leaf: +1 mod p (path bits: flip)
function* leaves(o, p = []) { if (Array.isArray(o)) for (let i = 0; i < o.length; i++) yield* leaves(o[i], [...p, i]); else yield p; }
for (const key of Object.keys(base)) {
  if (!Array.isArray(base[key])) { const m = clone(base); m[key] = ((BigInt(m[key]) + 1n) % R).toString(); out.field_mutations.push({ field: key, accepted: await satisfiable(D, m) }); continue; }
  for (const p of leaves(base[key])) {
    const m = clone(base); let ref = m[key]; for (const i of p.slice(0, -1)) ref = ref[i]; const last = p[p.length - 1];
    ref[last] = (key === "m_bit" || key === "r_bit") ? (ref[last] === "0" ? "1" : "0") : ((BigInt(ref[last]) + 1n) % R).toString();
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
// revocation (IMT): revoke cert i after the witness was built, then try every way around it
const setLow = (m, i, t, idx) => { const L = t.imt.leaves[idx], p = t.imt.path(idx); m.r_low_value[i] = L.value.toString(); m.r_low_next_index[i] = L.nextIndex.toString(); m.r_low_next_value[i] = L.nextValue.toString(); m.r_sib[i] = p.sib.map(String); m.r_bit[i] = p.bit.map(String); return m; };
for (let i = 0; i < D; i++) {
  const { input, meta } = await buildInstanceV3({ D }); meta.imt.insert(BigInt(meta.cert[i]));
  const stale = clone(input); stale.revoked_root = meta.imt.root.toString();
  out.semantic.push({ name: `revoked_cert${i}_stale_witness_new_root`, accepted: await satisfiable(D, stale) });
  const k = trunc(meta.cert[i]);
  out.semantic.push({ name: `revoked_cert${i}_predecessor_leaf`, accepted: await satisfiable(D, setLow(clone(stale), i, meta, meta.imt.lowIndex(k))) });
  out.semantic.push({ name: `revoked_cert${i}_own_leaf`, accepted: await satisfiable(D, setLow(clone(stale), i, meta, meta.imt.leaves.findIndex((l) => l.value === k))) });
  const f = setLow(clone(stale), i, meta, meta.imt.lowIndex(k)); f.r_low_next_value[i] = meta.imt.leaves.find((l) => l.value === k).nextValue.toString();
  out.semantic.push({ name: `revoked_cert${i}_forged_skip_leaf`, accepted: await satisfiable(D, f) });
  const last = meta.imt.leaves.findIndex((l) => l.nextValue === 0n);
  if (meta.imt.leaves[last].value !== k) out.semantic.push({ name: `revoked_cert${i}_end_leaf`, accepted: await satisfiable(D, setLow(clone(stale), i, meta, last)) });
}
// registered-root tree (#17 option b)
{ const { input } = await buildInstanceV3({ D, registerCert0: false }); out.semantic.push({ name: "cert0_not_registered", accepted: await satisfiable(D, input) }); }
{ const { input, meta } = await buildInstanceV3({ D }); const m = clone(input); Object.assign(m, rootProof(meta.rootTree, meta.rootTree.leaves[3]));
  out.semantic.push({ name: "cert0_with_another_registered_leaf_path", accepted: await satisfiable(D, m) }); }
{ const { input, meta } = await buildInstanceV3({ D }); const idx = meta.rootTree.indexOf(BigInt(meta.cert[0]));
  meta.rootTree.update(idx, 987654321n);                                      // registry replaces this master's leaf0 (re-registration)
  const m = clone(input); m.root_root = meta.rootTree.root.toString();
  out.semantic.push({ name: "replaced_master_old_path_vs_new_root", accepted: await satisfiable(D, m) }); }
{ const { input } = await buildInstanceV3({ D }); const m = clone(input); m.rt_depth = String(RT + 1); m.root_root = "0";
  out.semantic.push({ name: "rt_depth_above_max_with_root_zero", accepted: await satisfiable(D, m) }); }
{ // cert0 placed in the delegation tree instead of the registered-root tree (v4-style hop-0 path) with a garbage root path
  const { input: i4 } = await import("../../zkdac_v4/scripts/lib_v4.mjs").then((x) => x.buildInstanceV4({ D }));
  const { input } = await buildInstanceV3({ D, registerCert0: false }); const m = clone(input); m.m_sib[0] = i4.m_sib[0]; m.m_bit[0] = i4.m_bit[0];
  out.semantic.push({ name: "cert0_only_in_delegation_tree", accepted: await satisfiable(D, m) }); }
const unexpected = out.semantic.filter((x) => x.accepted !== x.name.includes("EXPECT_ACCEPT"));
out.summary = { field_mutations: out.field_mutations.length, field_accepted: out.field_mutations.filter((x) => x.accepted).map((x) => x.field),
  semantic: out.semantic.length, semantic_unexpected: unexpected.map((x) => x.name) };
console.log(JSON.stringify(out, null, 1)); process.exit(0);
