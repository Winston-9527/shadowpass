// Exhaustive single-field mutation + targeted semantic attacks against zkdac_chain v2.
// usage: node scripts/mutate.mjs D  > results
import { buildInstance, R, SUBORDER } from "./lib.mjs"; import { satisfiable } from "./witness.mjs";
import fs from "fs";
const D = Number(process.argv[2] ?? 4);
const { input: base, meta } = await buildInstance({ D });
const clone = (o) => JSON.parse(JSON.stringify(o));
const out = { D, field_mutations: [], semantic: [] };
// 1) every scalar leaf: +1 mod R (bits: flip)
function* leaves(o, p = []) { if (Array.isArray(o)) for (let i = 0; i < o.length; i++) yield* leaves(o[i], [...p, i]); else yield p; }
for (const key of Object.keys(base)) {
  if (!Array.isArray(base[key])) { const m = clone(base); m[key] = ((BigInt(m[key]) + 1n) % R).toString(); out.field_mutations.push({ field: key, accepted: await satisfiable(D, m) }); continue; }
  for (const p of leaves(base[key])) {
    const m = clone(base); let ref = m[key]; for (const i of p.slice(0, -1)) ref = ref[i]; const last = p[p.length - 1];
    ref[last] = key === "m_bit" ? (ref[last] === "0" ? "1" : "0") : ((BigInt(ref[last]) + 1n) % R).toString();
    out.field_mutations.push({ field: `${key}[${p.join("][")}]`, accepted: await satisfiable(D, m) });
  }
}
// 2) semantic attacks (each should be REJECTED)
const sem = async (name, mut, D2 = D) => { const { input, meta: mt } = await buildInstance({ D: D2 }); const m = mut(clone(input), mt); out.semantic.push({ name, accepted: m === null ? null : await satisfiable(D2, m) }); };
await sem("holder_sk_alias_plus_order", (m) => (m.holder_sk = (BigInt(m.holder_sk) + SUBORDER).toString(), m));
await sem("nullifier_other_secret", (m, t) => (m.nullifier = t.P([1952805748n, 5n, BigInt(m.action_digest)]).toString(), m));
await sem("nullifier_pubkey_derived_no_secret", (m, t) => (m.nullifier = t.P([1952805748n, BigInt(m.ent_Ax[D]), BigInt(m.action_digest)]).toString(), m));
await sem("action_method_changed_digest_stale", (m) => (m.act_method = "99", m));
await sem("action_amount_changed_digest_stale", (m) => (m.act_amount = "10000", m));
await sem("action_digest_other_chain_id", (m) => (m.act_chain_id = "137", m));
const termExp = [5000, 4000, 3000, 2000].slice(0, D)[D - 1];
await sem("expired_now_after_expiry", (m) => (m.now = String(termExp + 1), m));
await sem("now_equals_terminal_expiry_boundary_EXPECT_ACCEPT", (m) => (m.now = String(termExp), m));
await sem("now_huge_field_wrap", (m) => (m.now = (R - 1n).toString(), m));
await sem("merkle_bit_not_boolean", (m) => (m.m_bit[0][0] = "2", m));
// capability overreach: rebuild chain with child cap not subset
for (let i = 1; i < D; i++) {
  const caps = [0xFF, 0x3F, 0x0F, 0x03].slice(0, D); caps[i] = caps[i - 1] | 0x100;
  try { const { input } = await buildInstance({ D, caps }); out.semantic.push({ name: `cap_overreach_hop${i}`, accepted: await satisfiable(D, input) }); } catch (e) { out.semantic.push({ name: `cap_overreach_hop${i}`, accepted: null, err: String(e).slice(0, 80) }); }
}
{ const { input } = await buildInstance({ D, action: { req_cap: 0x1000n } }); out.semantic.push({ name: "action_req_cap_not_covered_by_terminal", accepted: await satisfiable(D, input) }); }
if (D > 1) { const exps = [5000, 4000, 3000, 2000].slice(0, D); exps[1] = exps[0] + 1; const { input } = await buildInstance({ D, expiries: exps }); out.semantic.push({ name: "child_expiry_exceeds_parent", accepted: await satisfiable(D, input) }); }
// revocation: revoke cert i *after* building the proof; old non-membership witness vs new root, and re-proved honest (must reject because found)
for (let i = 0; i < D; i++) {
  const { input, meta: mt } = await buildInstance({ D });
  await mt.smt.insert(BigInt(mt.cert[i]), 0n);
  const m = clone(input); m.revoked_root = mt.ents && (await import("circomlibjs")).default ? m.revoked_root : m.revoked_root;
  const F = (await import("./lib.mjs")).init; const { eddsa } = await F();
  m.revoked_root = eddsa.F.toObject(mt.smt.root).toString();
  out.semantic.push({ name: `revoked_cert${i}_stale_nonmembership_proof`, accepted: await satisfiable(D, m) });
}
// forged SMT exclusion: claim non-membership with isOld0=1 and zero siblings against a root that contains the cert
{
  const { input, meta: mt } = await buildInstance({ D });
  const { eddsa } = await (await import("./lib.mjs")).init();
  const { newMemEmptyTrie } = await import("circomlibjs"); const t = await newMemEmptyTrie(); await t.insert(BigInt(mt.cert[0]), 0n);
  const m = clone(input); m.revoked_root = eddsa.F.toObject(t.root).toString();
  m.r_sib[0] = m.r_sib[0].map(() => "0"); m.r_isOld0[0] = "1"; m.r_oldKey[0] = "0"; m.r_oldValue[0] = "0";
  out.semantic.push({ name: "revoked_cert0_forged_exclusion_isOld0", accepted: await satisfiable(D, m) });
}
const accepted = [...out.field_mutations, ...out.semantic].filter((x) => x.accepted === true);
out.summary = { field_mutations: out.field_mutations.length, field_accepted: out.field_mutations.filter((x) => x.accepted).length, semantic: out.semantic.length, semantic_accepted: out.semantic.filter((x) => x.accepted).length };
console.log(JSON.stringify(out, null, 1)); process.exit(0);
