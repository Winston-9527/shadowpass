// Instances for the v8 main circuit (#39): the v7 mode C instance plus a budget note owned by ent[D] with lineage = cert[0..D-1], in a LeanIMT note tree.
// budget = { q_in, q_spent, rho_in, rho_change, otherNotes }; q_spent defaults to the action amount in the ctx (the gate requires q_spent == amount).
import { createRequire } from "module"; import crypto from "crypto";
const req = createRequire(new URL("../package.json", import.meta.url));
const { poseidon2, poseidon3, poseidon8 } = req("poseidon-lite"); const { LeanIMT } = req("@zk-kit/lean-imt");
import { buildInstanceV7 } from "../../zkdac_v7/scripts/lib_v7.mjs";
export * from "../../zkdac_v7/scripts/lib_v7.mjs";
export const NT = 20, TAG_BNF = 2053857902n;
export const noteCm = (n) => poseidon8([BigInt(n.own[0]), BigInt(n.own[1]), BigInt(n.q), ...n.lin.map(BigInt), BigInt(n.rho)]);
export const newNoteTree = () => new LeanIMT((a, b) => poseidon2([a, b]));
export const rnd250 = (tag) => BigInt("0x" + crypto.createHash("sha256").update(tag).digest("hex")) % (1n << 250n);
export const linOf = (meta) => [0, 1, 2, 3].map((j) => (j < meta.D ? BigInt(meta.cert[j]) : 0n));
export function notePath(tree, cm) { const idx = tree.indexOf(cm); if (idx < 0) throw new Error("note not in tree"); const p = tree.generateProof(idx); const sib = p.siblings.map(String); while (sib.length < NT) sib.push("0"); return { nt_depth: String(p.siblings.length), nt_index: String(p.index), nt_sib: sib }; }
// fill the budget fields of a v7 input for note n (owner must be ent[D], lin must be the chain's certs) spending q_spent
export function setBudget(input, n, tree, q_spent, rho_change) {
  const q_change = BigInt(n.q) - BigInt(q_spent); const change = { own: n.own, q: q_change, lin: n.lin, rho: rho_change };
  Object.assign(input, { note_root: String(tree.root), budget_nf: String(poseidon3([TAG_BNF, BigInt(input.holder_sk), noteCm(n)])), cm_change: String(noteCm(change)), q_spent: String(q_spent),
    q_in: String(n.q), rho_in: String(n.rho), q_change: String(q_change), rho_change: String(rho_change), ...notePath(tree, noteCm(n)) });
  return { input, change };
}
export async function buildInstanceV8({ budget = {}, ...opts } = {}) {
  const { input, meta } = await buildInstanceV7({ mode: "C", ...opts });
  const tag = `${meta.D}-${meta.seed}`; const tree = budget.tree ?? newNoteTree();
  for (let k = 0; k < (budget.otherNotes ?? 20); k++) tree.insert(rnd250(`othernote-${tag}-${k}`));
  const note = { own: [BigInt(input.ent_Ax[meta.D]), BigInt(input.ent_Ay[meta.D])], q: BigInt(budget.q_in ?? 1000), lin: linOf(meta), rho: budget.rho_in ?? rnd250(`rho-in-${tag}`) };
  tree.insert(noteCm(note));
  const { change } = setBudget(input, note, tree, BigInt(budget.q_spent ?? meta.ctx.amount), budget.rho_change ?? rnd250(`rho-ch-${tag}`));
  Object.assign(meta, { noteTree: tree, note, change });
  return { input, meta };
}
