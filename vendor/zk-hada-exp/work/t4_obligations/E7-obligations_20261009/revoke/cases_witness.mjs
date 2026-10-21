// #18 Part 2 witness-level cases V1–V6 (PREREGISTRATION.md). usage: node cases_witness.mjs > ../results/revoke_witness.json
import crypto from "crypto";
import * as R from "./revoke_lib.mjs";
const inst = await R.buildInstanceV7({ D: 4, seed: 1, mode: "C" }); const imt = inst.meta.imt; const cert = inst.meta.cert.map(BigInt);
const rows = []; const row = (id, c, exp, ok) => { const pass = exp === ok; rows.push({ id, case: c, expected: exp ? "accept" : "reject", observed: ok ? "accept" : "reject", pass }); if (!pass) console.error("UNEXPECTED", id, c); };
const sat = R.satisfiable; const rndSk = () => BigInt("0x" + crypto.randomBytes(32).toString("hex")) % 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
const ref = (entry) => { const c = R.cloneImt(imt); c.insert(entry); return c.root; };
for (const hop of [1, 2, 3]) {
  const t = R.transition(imt, cert[hop], R.certAuthority(inst, hop, 0)); row("V1", `issuer ent[${hop}] revokes cert hop ${hop}`, true, await sat(t.input) && t.newRoot === ref(cert[hop]));
  const u = R.transition(imt, cert[hop], R.certAuthority(inst, hop, 1)); row("V2", `holder ent[${hop + 1}] revokes its incoming cert hop ${hop}`, true, await sat(u.input));
}
for (const j of [2, 3, 4]) { const t = R.transition(imt, R.keyEntry(inst, j), R.keyAuthority(inst, j)); row("V3", `key ent[${j}] revokes its own key entry`, true, await sat(t.input) && t.newRoot === ref(R.keyEntry(inst, j))); }
{ const a = R.certAuthority(inst, 2, 0); a.sk = inst.meta.ents[1].sk; row("V4", "ancestor ent[1] (not the issuer) uses its own sk for cert hop 2", false, await sat(R.transition(imt, cert[2], a).input)); }
{ const a = R.certAuthority(inst, 1, 0); row("V4", "ancestor ent[1] presents its own cert hop 1 as authority for entry = cert hop 2", false, await sat(R.transition(imt, cert[2], a).input)); }
{ const a = R.certAuthority(inst, 2, 0); a.sk = rndSk(); row("V5", "knows entry + both public keys, random sk", false, await sat(R.transition(imt, cert[2], a).input)); }
{ const a = { ...R.keyAuthority(inst, 3), who: 1, ha: [inst.input.ent_Ax[4], inst.input.ent_Ay[4]].map(BigInt), sk: inst.meta.ents[4].sk }; row("V5", "key entry of ent[3] with who = 1 and ent[4]'s sk", false, await sat(R.transition(imt, R.keyEntry(inst, 3), a).input)); }
{ const a = { ...R.keyAuthority(inst, 3), sk: inst.meta.ents[2].sk }; row("V5", "key entry of ent[3] signed with ent[2]'s sk (its issuer)", false, await sat(R.transition(imt, R.keyEntry(inst, 3), a).input)); }
const A2 = R.certAuthority(inst, 2, 0);
{ const t = R.transition(imt, cert[2], A2); t.input.new_root = String(BigInt(t.input.new_root) + 1n); row("V6", "wrong new_root (+1)", false, await sat(t.input)); }
{ const t1 = R.transition(imt, cert[2], A2); const t2 = R.transition(t1.after, cert[2], A2); row("V6", "entry already revoked (second insertion of the same entry)", false, await sat(t2.input)); }
{ const t = R.transition(imt, cert[2], A2); const k = R.trunc(cert[2]); const cand = imt.leaves.map((l, i) => [l, i]).filter(([l]) => l.value !== BigInt(t.input.low_value));   // every leaf except the true predecessor
  let acc = 0; for (const [l, i] of cand) { const p = imt.path(i); const x = { ...t.input, low_value: String(l.value), low_next_index: String(l.nextIndex), low_next_value: String(l.nextValue), low_sib: p.sib.map(String), low_bit: p.bit.map(String) }; if (await sat(x)) acc++; }
  rows.push({ id: "V6", case: `low leaf not the predecessor (every other leaf: ${cand.length})`, expected: "all reject", observed: `${acc}/${cand.length} accepted`, pass: acc === 0 && cand.length > 0 }); }
{ const t = R.transition(imt, cert[2], A2); const p = imt.path(1); const x = { ...t.input, next_index: "1", new_sib: p.sib.map(String) }; row("V6", "next_index = 1 (occupied slot)", false, await sat(x)); }
{ // empty slot other than count: the circuit allows it; the contract passes count as next_index (tested in forge)
  const c = R.cloneImt(imt); const k = R.trunc(cert[2]); const lo = c.lowIndex(k); const low = c.leaves[lo]; const lp = c.path(lo); const ni = c.leaves.length + 5;
  c._set(lo, { value: low.value, nextIndex: BigInt(ni), nextValue: k }); const np = c.path(ni); c._set(ni, { value: k, nextIndex: low.nextIndex, nextValue: low.nextValue });
  const t = R.transition(imt, cert[2], A2); const x = { ...t.input, next_index: String(ni), new_root: String(c.root), low_sib: lp.sib.map(String), low_bit: lp.bit.map(String), new_sib: np.sib.map(String) };
  const ok = await sat(x); rows.push({ id: "V6", case: "next_index = count + 5 (empty, not count)", expected: "circuit accepts; contract binds next_index = count", observed: ok ? "accept" : "reject", pass: ok, policy: true }); }
console.log(JSON.stringify({ date: new Date().toISOString(), instance: "buildInstanceV7({D:4, seed:1, mode:'C'})", imt_leaves: imt.leaves.length, rows, unexpected: rows.filter((r) => !r.pass).length }, null, 1));
console.error(`${rows.length} rows, ${rows.filter((r) => !r.pass).length} unexpected`); process.exit(0);
