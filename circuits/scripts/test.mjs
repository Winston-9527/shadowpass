// Witness-level tests for the ShadowPass circuits: honest instances, owner decryption, and the negative cases from docs/DEV_PLAN.md (A1).
// Usage: node scripts/test.mjs   (needs build/ from scripts/build.sh)
import * as snarkjs from "snarkjs"; import fs from "fs"; import os from "os"; import path from "path";
import { ShadowWorld, openChain, ownerCtOfInput, P, L, viewKey, mul, GEN } from "./world.mjs";

const here = new URL("..", import.meta.url).pathname, tmp = path.join(os.tmpdir(), `sp-wtns-${process.pid}.wtns`);
async function sat(circuit, input) {
  try { await snarkjs.wtns.calculate(input, `${here}build/${circuit}/${circuit}_js/${circuit}.wasm`, tmp); return { ok: true }; }
  catch (e) { const m = String(e.message ?? e).match(/template (\S+) line: (\d+)/); return { ok: false, at: m ? `${m[1].replace(/_\d+$/, "")} L${m[2]}` : String(e).slice(0, 80) }; }
  finally { try { fs.unlinkSync(tmp); } catch {} }
}
const rows = []; let fail = 0;
function check(name, got, want) { const pass = got.ok === want; if (!pass) fail++; rows.push(`${pass ? "PASS" : "FAIL"}  ${name.padEnd(64)} expect ${want ? "ACCEPT" : "REJECT"}, got ${got.ok ? "ACCEPT" : "REJECT"}${got.at ? " @ " + got.at : ""}`); }
const bump = (x) => String((BigInt(x) + 1n) % P);
const clone = (o) => JSON.parse(JSON.stringify(o));

// Demo tree: Alice -> steward {PAY|TREASURY} -> procurement {PAY} / treasury {TREASURY}
const PAY = 1n, TREASURY = 2n;
const w = await ShadowWorld.create("shadowpass-test-1");
const alice = w.newIdentity(), steward = w.newIdentity(), buyer = w.newIdentity(), vault = w.newIdentity();
const vk = w.newViewKey();
for (let k = 0; k < 5; k++) { w.addToGroup(w.newIdentity()); w.register({ hash: w.rand250() }); w.notes.insert(w.rand250()); w.issued.insert(w.rand250()); w.revoked.insert(w.rand250()); }
w.addToGroup(alice);
const c0 = w.issueRoot(alice, steward, PAY | TREASURY, 10_000, vk); w.register(c0);
const c1 = w.issue(c0, buyer, PAY, 9_000), c1t = w.issue(c0, vault, TREASURY, 9_000);
const nSteward = w.mintNote([c0], 100), nBuyer = w.mintNote([c0, c1], 40);
const ctx = 123456789n, now = 1_000;

// ---- honest ----
const a1 = w.actionInput({ chain: [c0], holderSk: steward.sk, note: nSteward, qSpent: 10, ctxHash: ctx, reqCap: PAY, now });
check("D1 steward pays (honest)", await sat("main_d1", a1.input), true);
const a2 = w.actionInput({ chain: [c0, c1], holderSk: buyer.sk, note: nBuyer, qSpent: 8, ctxHash: ctx, reqCap: PAY, now });
check("D2 procurement pays (honest)", await sat("main_d2", a2.input), true);
const downstream = w.newIdentity(), c2 = w.issue(c1, downstream, PAY, 8_000), nDownstream = w.mintNote([c0, c1, c2], 20);
check("D3 downstream agent pays (honest)", await sat("main_d3", w.actionInput({ chain: [c0, c1, c2], holderSk: downstream.sk, note: nDownstream, qSpent: 5, ctxHash: ctx, reqCap: PAY, now }).input), true);
const opened = openChain(ownerCtOfInput(a2.input), vk.vsk);
const okOpen = !!opened && opened.every((p, j) => String(p[0]) === a2.input.ent_Ax[j] && String(p[1]) === a2.input.ent_Ay[j]);
check("owner opens D2 ciphertext with vsk -> Alice, steward, procurement", { ok: okOpen }, true);
check("another key cannot open the ciphertext", { ok: !!openChain(ownerCtOfInput(a2.input), w.newViewKey().vsk) }, false);
const reg = w.registerInput({ human: alice, cert0: c0, domain: 7n });
check("registration (honest)", await sat("main_reg", reg), true);

// ---- LeanIMT issued-tree boundaries ----
{ const i = clone(a2.input); i.m_depth[1] = "21"; check("issued-tree depth > 20", await sat("main_d2", i), false); }
{ const i = clone(a2.input); i.m_sib[1] = Array(20).fill("0"); i.m_index[1] = "0"; check("hop1 certificate absent from issued tree", await sat("main_d2", i), false); }
{ const i = clone(a1.input); i.m_depth[0] = "1"; check("hop0 issued-tree depth must be zero", await sat("main_d1", i), false); }

// ---- capability split enforced by the circuit ----
check("procurement {PAY} asks for TREASURY", await sat("main_d2", w.actionInput({ chain: [c0, c1], holderSk: buyer.sk, note: nBuyer, qSpent: 8, ctxHash: ctx, reqCap: TREASURY, now }).input), false);

{ const nVault = w.mintNote([c0, c1t], 50);
  check("treasury {TREASURY} supplies to vault", await sat("main_d2", w.actionInput({ chain: [c0, c1t], holderSk: vault.sk, note: nVault, qSpent: 30, ctxHash: ctx, reqCap: TREASURY, now }).input), true);
  check("treasury {TREASURY} tries to pay a merchant (PAY)", await sat("main_d2", w.actionInput({ chain: [c0, c1t], holderSk: vault.sk, note: nVault, qSpent: 30, ctxHash: ctx, reqCap: PAY, now }).input), false); }

// ---- revocation authority and Poseidon9 root binding ----
check("Alice (issuer) revokes cert0", await sat("main_revoke", w.revokeCertInput(c0, alice).input), true);
check("steward (issuer) revokes cert1", await sat("main_revoke", w.revokeCertInput(c1, steward).input), true);
check("buyer (holder) revokes incoming cert1", await sat("main_revoke", w.revokeCertInput(c1, buyer, 1).input), true);
check("buyer revokes its own key entry", await sat("main_revoke", w.revokeKeyInput(buyer).input), true);
check("non-issuer, non-holder revokes cert1", await sat("main_revoke", w.revokeCertInput(c1, vault).input), false);
{ const { poseidon7 } = await import("poseidon-lite");
  const legacy = poseidon7([0n, alice.Ax, alice.Ay, steward.Ax, steward.Ay, PAY | TREASURY, 10_000n]);
  const i = w.revokeInput({ entry: legacy, kind: 1, who: 0, hop: 0, ia: [alice.Ax, alice.Ay], ha: [steward.Ax, steward.Ay], cap: PAY | TREASURY, expiry: 10_000n, sk: alice.sk, ownW: vk.w }).input;
  check("revoke legacy Poseidon7 root certificate", await sat("main_revoke", i), false); }
{ const t = w.revokeCertInput(c1, steward); t.input.new_root = bump(t.input.new_root); check("revoke wrong new_root + 1", await sat("main_revoke", t.input), false); }
{ const t = w.revokeCertInput(c1, steward); t.input.next_index = "1"; check("revoke occupied insertion position", await sat("main_revoke", t.input), false); }

// ---- budget mint / transfer ----
check("budget mint opens to q", await sat("budget_mint", w.mintInput(nSteward)), true);
{ const i = clone(w.mintInput(nSteward)); i.q = bump(i.q); check("budget mint wrong public q", await sat("budget_mint", i), false); }
const transfer = w.transferInput({ holder: steward, holderSk: steward.sk, note: nSteward, child: c1, q1: 40, q2: 60 });
check("budget transfer delegates to cert1", await sat("budget_transfer", transfer.input), true);
{ const i = clone(transfer.input); i.q2 = bump(i.q2); check("budget transfer breaks conservation", await sat("budget_transfer", i), false); }
{ const i = clone(transfer.input); i.cm_out1 = bump(i.cm_out1); check("budget transfer wrong delegated note", await sat("budget_transfer", i), false); }

// ---- owner ciphertext tampering ----
for (const f of ["own_c1x", "own_c2x", "own_esign"]) { const i = clone(a2.input); i[f] = bump(i[f]); check(`tamper ${f} + 1`, await sat("main_d2", i), false); }
for (let j = 0; j < 3; j++) { const i = clone(a2.input); i.own_e[j] = bump(i.own_e[j]); check(`tamper own_e[${j}] + 1`, await sat("main_d2", i), false); }
{ const other = w.newViewKey(); const i = w.actionInput({ chain: [c0, c1], holderSk: buyer.sk, note: nBuyer, qSpent: 8, ctxHash: ctx, reqCap: PAY, now, encryptTo: other.vpk }).input;
  check("agent encrypts the chain to another key (own_w = owner's)", await sat("main_d2", i), false);
  const j = w.actionInput({ chain: [c0, c1], holderSk: buyer.sk, note: nBuyer, qSpent: 8, ctxHash: ctx, reqCap: PAY, now, encryptTo: other.vpk, ownW: other.w }).input;
  check("agent encrypts to another key and swaps own_w to match", await sat("main_d2", j), false); }

// ---- view key validity ----
{ const i = clone(a2.input); i.own_w = [i.own_w[0], bump(i.own_w[1])]; check("own_w off the curve", await sat("main_d2", i), false); }
for (const [name, wpt] of [["identity (0, 1)", [0n, 1n]], ["order-2 point (0, -1)", [0n, P - 1n]]]) {
  // A root certificate that really binds this degenerate key (issuer signs it), so only the view-key check can reject it.
  const bad = { vsk: 0n, w: wpt, vpk: [0n, 1n] }; const cb = w.issueRoot(alice, steward, PAY, 10_000, bad); w.register(cb); const nb = w.mintNote([cb], 50);
  const i = w.actionInput({ chain: [cb], holderSk: steward.sk, note: nb, qSpent: 1, ctxHash: ctx, reqCap: PAY, now, ownW: wpt.map(String), encryptTo: [0n, 1n] }).input;
  check(`view key w = ${name} -> vpk = identity`, await sat("main_d1", i), false);
}
{ // -w = (-x, y) is on the curve and clears to -vpk != vpk: the root certificate no longer matches
  const g = viewKey(vk.vsk).w; const i = clone(a2.input); i.own_w = [String((P - BigInt(g[0])) % P), String(g[1])];
  check("own_w = -w (on curve, different vpk)", await sat("main_d2", i), false); }

// ---- binding to the root certificate ----
{ const i = clone(a2.input); const other = w.newViewKey(); i.own_w = other.w.map(String); check("own_w of another valid key (cert0 hash mismatch)", await sat("main_d2", i), false); }
{ // a v9.2-style root certificate (Poseidon(7), no view key) cannot be used
  const { poseidon7 } = await import("poseidon-lite"); const h = poseidon7([0n, alice.Ax, alice.Ay, steward.Ax, steward.Ay, PAY | TREASURY, 10_000n]);
  const legacy = { ...c0, hash: h, sig: (await import("./world.mjs")).sign(alice, h) }; w.register(legacy); const nl = w.mintNote([legacy], 30);
  const i = w.actionInput({ chain: [legacy], holderSk: steward.sk, note: nl, qSpent: 1, ctxHash: ctx, reqCap: PAY, now }).input;
  check("legacy Poseidon(7) root certificate", await sat("main_d1", i), false); }

// ---- registration binding ----
{ const r = clone(reg); r.own_w = w.newViewKey().w.map(String); check("registration: own_w of another key (leaf0 mismatch)", await sat("main_reg", r), false); }
{ const r = clone(reg); r.leaf0 = bump(r.leaf0); check("registration: leaf0 + 1", await sat("main_reg", r), false); }

// ---- revocation still works: after revoking the procurement certificate, the old witness does not fit the new root ----
{ const i = clone(a2.input); w.revokeCert(c1); const { stateRoot } = await import("./world.mjs");
  i.revoked_root = String(w.revoked.root); i.state_root = String(stateRoot(i.issued_root, i.revoked_root, i.root_root));
  check("procurement certificate revoked (stale witness, new root)", await sat("main_d2", i), false);
  let threw = false; try { w.actionInput({ chain: [c0, c1], holderSk: buyer.sk, note: nBuyer, qSpent: 8, ctxHash: ctx, reqCap: PAY, now }); } catch { threw = true; }
  check("no fresh non-membership witness exists for a revoked certificate", { ok: !threw }, false); }
{ let threw = false; try { w.transferInput({ holder: buyer, holderSk: buyer.sk, note: nBuyer, q1: 1, q2: 39 }); } catch { threw = true; }
  check("revoked lineage cannot move existing budget", { ok: !threw }, false); }

console.log(rows.join("\n")); console.log(`\n${rows.length - fail} / ${rows.length} as expected`); void L; void mul; void GEN;
process.exit(fail ? 1 : 0);
