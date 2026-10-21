// #39 budget transfer / mint witness cases (PREREGISTRATION.md "Budget transfer / mint") incl. end-to-end: budget delegated down the chain is
// spendable by the child in a v8 ACTION proof. usage: node scripts/cases_budget.mjs > results/cases_budget.json
import { BudgetWorld, satTransfer, satMint, satAction, noteCm } from "./budget_world.mjs";
const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const rows = []; const row = (id, c, exp, ok, extra = {}) => { const pass = exp === ok; rows.push({ id, case: c, expected: exp ? "accept" : "reject", observed: ok ? "accept" : "reject", pass, ...extra }); if (!pass) console.error("UNEXPECTED", id, c); };
const b = await BudgetWorld.create();
const H = (c) => b.add(c);
const M = await H(["H", "M"]), S1 = await H(["H", "M", "S1"]), S2 = await H(["H", "M", "S2"]), S11 = await H(["H", "M", "S1", "S11"]), S111 = await H(["H", "M", "S1", "S11", "S111"]);
// mint 100 to M (lineage [cert0])
const n0 = b.note(M, 100, "mint");
row("MINT", "mint opens to the public q", true, await satMint(b.mintWitness(n0)));
{ const x = b.mintWitness(n0); x.q = "101"; row("MINT", "public q differs from the committed q", false, await satMint(x)); }
b.insert(n0);
// chain of delegations M -> S1 -> S11 -> S111, each followed by a v8 action by the receiver (end-to-end)
async function deleg(id, from, n, to, q1, q2, label) { const t = b.transferWitness(from, n, { to, q1, q2, label }); row(id, label, true, await satTransfer(t.input)); b.insert(t.out1); b.insert(t.out2); return t; }
const t1 = await deleg("TR", M, n0, S1, 40, 60, "M delegates 40 to S1 (depth 1 -> 2)");
{ const a = b.actionWitness(S1, t1.out1, 10, "e2e1"); row("E2E", "S1 spends 10 of the delegated note in a v8 action proof (D = 2)", true, await satAction(2, a.input)); }
const t2 = await deleg("TR", S1, t1.out1, S11, 30, 10, "S1 delegates 30 to S11 (depth 2 -> 3)");
const t3 = await deleg("TR", S11, t2.out1, S111, 30, 0, "S11 delegates all 30 to S111 (depth 3 -> 4)");
{ const a = b.actionWitness(S111, t3.out1, 30, "e2e4"); row("E2E", "S111 spends 30 in a v8 action proof (D = 4)", true, await satAction(4, a.input)); }
{ const t = b.transferWitness(M, t1.out2, { q1: 25, q2: 35, label: "split" }); row("TR", "M splits its remaining 60 into 25 / 35", true, await satTransfer(t.input)); }
// a delegated note cannot be spent by a sibling or under another chain
{ const a = b.actionWitness(S2, t1.out1, 10, "sib"); row("E2E", "sibling S2 tries to spend S1's real note (S2's own key and chain in the proof)", false, await satAction(2, a.input)); }
// invalid transfers on M's remaining note (60)
const nM = t1.out2; const base = () => b.transferWitness(M, nM, { to: S2, q1: 20, q2: 40, label: "neg" });
{ const t = base(); row("TR", "control: M delegates 20 to S2", true, await satTransfer(t.input)); }
{ const t = base(); t.input.q2 = "41"; t.input.cm_out2 = String(noteCm({ ...t.out2, q: 41n })); row("TR-neg", "conservation broken (+1)", false, await satTransfer(t.input)); }
{ const t = base(); const q1 = P - 1n, q2 = (60n - q1 + P) % P; t.input.q1 = String(q1); t.input.q2 = String(q2); t.input.cm_out1 = String(noteCm({ ...t.out1, q: q1 })); t.input.cm_out2 = String(noteCm({ ...t.out2, q: q2 })); row("TR-neg", "field wrap q1 = p - 1", false, await satTransfer(t.input)); }
{ const t = base(); const lin = [...t.out2.lin]; lin[0] = 0n; t.input.cm_out2 = String(noteCm({ ...t.out2, lin })); row("TR-neg", "change drops the lineage entry", false, await satTransfer(t.input)); }
{ const t = base(); t.input.cm_out1 = String(noteCm({ ...t.out1, lin: [...nM.lin] })); row("TR-neg", "delegation without the child certificate entry", false, await satTransfer(t.input)); }
{ const t = base(); const lin = [...t.out1.lin]; lin[1] = BigInt(S1.meta.cert[1]); t.input.cm_out1 = String(noteCm({ ...t.out1, lin })); row("TR-neg", "delegation to S2 with S1's certificate as the new entry", false, await satTransfer(t.input)); }
{ const t = base(); t.input.cap = String(BigInt(t.input.cap) ^ 1n); row("TR-neg", "child certificate cap differs from the real certificate (entry mismatch)", false, await satTransfer(t.input)); }
{ const t = base(); t.input.sk = String(S1.meta.ents[2].sk); row("TR-neg", "wrong sk", false, await satTransfer(t.input)); }
{ const t = b.transferWitness(S111, t3.out1, { q1: 10, q2: 20, label: "full" }); t.input.delegate = "1"; t.input.o1 = b.owner(S2).map(String); row("TR-neg", "depth-4 note delegates (no free slot)", false, await satTransfer(t.input)); }
// revocation: S1's certificate (M -> S1, hop 1) revoked by its issuer: S1's and S11's notes frozen for transfer and action; M and S2 unaffected
const before = { s1: b.actionWitness(S1, t1.out1, 10, "pre") };
b.w.imt.insert(BigInt(S1.meta.cert[1]));
for (const [label, h, n, D] of [["S1 (revoked certificate)", S1, t1.out1, 2], ["S11 (below the revoked certificate)", S11, t2.out1, 3]]) {
  let tr = false, ac = false; try { tr = await satTransfer(b.transferWitness(h, n, { q1: 1, q2: n.q - 1n, label: "rv-" + label }).input); } catch {}
  try { const a = b.actionWitness(h, n, 1, "rv" + label); ac = a ? await satAction(D, a.input) : false; } catch {}
  row("REV", `${label}: transfer`, false, tr); row("REV", `${label}: action`, false, ac); }
{ const s = before.s1.input; const x = { ...s, revoked_root: String(b.w.imt.root) }; row("REV", "S1 action with its pre-revocation witness and the new revoked root", false, await satAction(2, x)); }
{ row("REV", "S1 action with the pre-revocation witness and the OLD revoked root (POLICY: gate window)", true, await satAction(2, before.s1.input), { policy: true }); }
{ const t = b.transferWitness(M, nM, { q1: 30, q2: 30, label: "post" }); row("REV", "M (above the revoked edge) still splits", true, await satTransfer(t.input)); }
{ const t = b.transferWitness(M, nM, { to: S2, q1: 10, q2: 50, label: "post2" }); row("REV", "M still delegates to the sibling S2", true, await satTransfer(t.input)); b.insert(t.out1); b.insert(t.out2);
  const a = b.actionWitness(S2, t.out1, 10, "post3"); row("REV", "S2 (sibling) spends after the revocation", true, await satAction(2, a.input)); }
console.log(JSON.stringify({ date: new Date().toISOString(), rows, unexpected: rows.filter((r) => !r.pass).length }, null, 1));
console.error(`${rows.length} rows, ${rows.filter((r) => !r.pass).length} unexpected`); process.exit(0);
