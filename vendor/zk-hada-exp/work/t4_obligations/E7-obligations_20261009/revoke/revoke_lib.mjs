// Witness builder for revoke_transition.circom (#18). IMT = the generators' indexed Merkle tree (zkdac_v4/scripts/imt.mjs).
import { createRequire } from "module"; import fs from "fs"; import os from "os"; import path from "path";
const v7 = new URL("../../../t2_circuit_fix/zkdac_v7/", import.meta.url).pathname;
export const snarkjs = createRequire(v7 + "package.json")("snarkjs");
const L7 = await import(v7 + "scripts/lib_v7.mjs");
export const { buildInstanceV7, IMT, trunc, keyHash } = L7;
export const WASM = new URL("build/revoke_transition_js/revoke_transition.wasm", import.meta.url).pathname;
export const DEPTH = 20;
// copy of an IMT (leaves + node levels)
export function cloneImt(t) { const c = Object.create(Object.getPrototypeOf(t)); Object.assign(c, t); c.leaves = t.leaves.map((l) => ({ ...l })); c.levels = t.levels.map((m) => new Map(m)); return c; }
// authority: { kind: 1|0, who: 0|1, hop, ia:[x,y], ha:[x,y], cap, expiry, sk }  (key entries: kind 0, ia = key, ha = [0,0], hop/cap/expiry = 0)
// returns { input, newRoot, nextIndex, after } where `after` is the tree after the insertion (the input tree is not modified)
export function transition(imt, entry, a) {
  const k = trunc(entry); const lo = imt.lowIndex(k); const low = imt.leaves[lo]; const lp = imt.path(lo); const ni = imt.leaves.length;
  const t = cloneImt(imt);
  t._set(lo, { value: low.value, nextIndex: BigInt(ni), nextValue: k });
  const np = t.path(ni);
  t._set(ni, { value: k, nextIndex: low.nextIndex, nextValue: low.nextValue });
  const input = { old_root: String(imt.root), new_root: String(t.root), entry: String(entry), next_index: String(ni),
    kind: String(a.kind), who: String(a.who), hop: String(a.hop ?? 0), ia: a.ia.map(String), ha: (a.ha ?? [0n, 0n]).map(String), cap: String(a.cap ?? 0), expiry: String(a.expiry ?? 0), sk: String(a.sk),
    low_value: String(low.value), low_next_index: String(low.nextIndex), low_next_value: String(low.nextValue), low_sib: lp.sib.map(String), low_bit: lp.bit.map(String), new_sib: np.sib.map(String) };
  return { input, newRoot: t.root, nextIndex: ni, after: t };
}
const tmp = path.join(os.tmpdir(), `revoke-${process.pid}.wtns`);
export async function satisfiable(input) { try { await snarkjs.wtns.calculate(input, WASM, tmp); return true; } catch { return false; } finally { try { fs.unlinkSync(tmp); } catch {} } }
// authority descriptors for a v7 instance
export function certAuthority(inst, hop, who) { const { input, meta } = inst; const e = meta.ents;
  return { kind: 1, who, hop, ia: [input.ent_Ax[hop], input.ent_Ay[hop]].map(BigInt), ha: [input.ent_Ax[hop + 1], input.ent_Ay[hop + 1]].map(BigInt), cap: BigInt(input.cap[hop]), expiry: BigInt(input.expiry[hop]), sk: e[who ? hop + 1 : hop].sk }; }
export function keyAuthority(inst, j) { const { input, meta } = inst; return { kind: 0, who: 0, ia: [input.ent_Ax[j], input.ent_Ay[j]].map(BigInt), sk: meta.ents[j].sk }; }
export const keyEntry = (inst, j) => keyHash(inst.meta, { Ax: inst.input.ent_Ax[j], Ay: inst.input.ent_Ay[j] });
