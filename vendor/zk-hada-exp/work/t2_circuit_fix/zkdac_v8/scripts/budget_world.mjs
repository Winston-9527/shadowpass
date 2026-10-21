// Shared-state world for v8 (#39): the E3 world (shared issued tree, revocation IMT, registered-root tree; ../../../t4_revocation/E3-revocation_20261009/world.mjs)
// plus a LeanIMT note tree. Budget notes belong to a holder (owner = ent[D] of its chain, lineage = its chain's certificates).
// - actionWitness(h, note, q_spent): v8 action input for holder h spending from `note`
// - transferWitness(from, note, { to, q1, q2 }): budget_transfer input (split if `to` is undefined, else delegate to the child holder `to`)
// - mintWitness(note): budget_mint input
import { createRequire } from "module"; import fs from "fs"; import os from "os"; import path from "path";
import { noteCm, newNoteTree, setBudget, rnd250, linOf, notePath, TAG_BNF } from "./lib_v8.mjs";
import { satisfiable as satAction } from "./witness_v8.mjs";
const W = await import(new URL("../../../t4_revocation/E3-revocation_20261009/world.mjs", import.meta.url).pathname);
const req = createRequire(new URL("../package.json", import.meta.url)); const snarkjs = req("snarkjs"); const { poseidon3 } = req("poseidon-lite");
export { W, noteCm, rnd250, satAction };
const BUILD = new URL("../build", import.meta.url).pathname;
const tmp = path.join(os.tmpdir(), `v8bw-${process.pid}.wtns`);
async function sat(circ, input) { try { await snarkjs.wtns.calculate(input, `${BUILD}/${circ}/${circ}_js/${circ}.wasm`, tmp); return true; } catch { return false; } finally { try { fs.unlinkSync(tmp); } catch {} } }
export const satTransfer = (i) => sat("budget_transfer", i), satMint = (i) => sat("budget_mint", i);
export class BudgetWorld {
  static async create(nDecoys = 20) { const b = new BudgetWorld(); b.w = await W.World.create(nDecoys); b.notes = newNoteTree(); for (let k = 0; k < 8; k++) b.notes.insert(rnd250("bw-other-" + k)); return b; }
  async add(chain, seed) { return this.w.add(chain, seed); }
  owner(h) { return [BigInt(h.input.ent_Ax[h.D]), BigInt(h.input.ent_Ay[h.D])]; }
  note(h, q, label) { return { own: this.owner(h), q: BigInt(q), lin: linOf(h.meta), rho: rnd250(`note-${h.chain.join(">")}-${label}`) }; }
  insert(n) { this.notes.insert(noteCm(n)); return n; }
  actionWitness(h, n, q_spent, label = "a") { const input = this.w.witness(h); if (!input) return null; return setBudget(input, n, this.notes, BigInt(q_spent), rnd250(`chg-${label}-${h.chain.join(">")}`)); }
  transferWitness(from, n, { to, q1, q2, label = "t" }) {
    const delegate = to ? 1n : 0n; const firstFree = n.lin.findIndex((x) => x === 0n);
    const child = to ? this.owner(to) : n.own;
    let cap = 0n, expiry = 0n, lin1 = [...n.lin];
    if (to) { if (to.D !== firstFree + 1 || to.chain.slice(0, -1).join() !== from.chain.join()) throw new Error("child chain must extend the parent chain"); cap = BigInt(to.input.cap[firstFree]); expiry = BigInt(to.input.expiry[firstFree]); lin1[firstFree] = BigInt(to.meta.cert[firstFree]); }
    const out1 = { own: child, q: BigInt(q1), lin: lin1, rho: rnd250(`o1-${label}`) }, out2 = { own: n.own, q: BigInt(q2), lin: [...n.lin], rho: rnd250(`o2-${label}`) };
    const zero = { low_value: "0", low_next_index: "0", low_next_value: "0", sib: Array(20).fill("0"), bit: Array(20).fill("0") };
    const nm = n.lin.map((e) => (e === 0n ? zero : this.w.imt.nonMemberWitness(e)));
    const km = this.w.imt.nonMemberWitness(W.keyHash(from.meta, { Ax: from.input.ent_Ax[from.D], Ay: from.input.ent_Ay[from.D] }));
    const sk = from.meta.ents[from.D].sk;
    const input = { note_root: String(this.notes.root), revoked_root: String(this.w.imt.root), nullifier: String(poseidon3([TAG_BNF, sk, noteCm(n)])), cm_out1: String(noteCm(out1)), cm_out2: String(noteCm(out2)),
      own: n.own.map(String), q_in: String(n.q), lin: n.lin.map(String), rho_in: String(n.rho), sk: String(sk), ...notePath(this.notes, noteCm(n)),
      r_low_value: nm.map((x) => x.low_value), r_low_next_index: nm.map((x) => x.low_next_index), r_low_next_value: nm.map((x) => x.low_next_value), r_sib: nm.map((x) => x.sib), r_bit: nm.map((x) => x.bit),
      k_low_value: km.low_value, k_low_next_index: km.low_next_index, k_low_next_value: km.low_next_value, k_sib: km.sib, k_bit: km.bit,
      o1: child.map(String), q1: String(q1), rho1: String(out1.rho), delegate: String(delegate), q2: String(q2), rho2: String(out2.rho), cap: String(cap), expiry: String(expiry) };
    return { input, out1, out2 };
  }
  mintWitness(n) { return { cm: String(noteCm(n)), q: String(n.q), own: n.own.map(String), lin: n.lin.map(String), rho: String(n.rho) }; }
}
