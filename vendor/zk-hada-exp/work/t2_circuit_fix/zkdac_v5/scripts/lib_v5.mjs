// Instances for the v5 main circuit (#17 option b): the v4 instance plus hop-0 membership in the registered-root LeanIMT
// (zk-kit LeanIMT with Poseidon(2), the structure Semaphore and the on-chain registry use). The hop-0 issued-tree path is zeroed.
import { buildInstanceV4 } from "../../zkdac_v4/scripts/lib_v4.mjs";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";
import crypto from "crypto";
export { init, R, SUBORDER, TAG, ctxHash, DEFAULT_CTX, IMT, trunc } from "../../zkdac_v4/scripts/lib_v4.mjs";
export const RT = 20;
export const newRootTree = () => new LeanIMT((a, b) => poseidon2([a, b]));
export function rootProof(tree, leaf) {
  const idx = tree.indexOf(BigInt(leaf)); if (idx < 0) throw new Error("certificate not registered");
  const p = tree.generateProof(idx); const sib = p.siblings.map(String); while (sib.length < RT) sib.push("0");
  return { root_root: p.root.toString(), rt_depth: String(p.siblings.length), rt_index: String(p.index), rt_sib: sib };
}
// rootOthers: number of other registered root certificates (random leaves) inserted before cert0; registerCert0=false leaves cert0 out
export async function buildInstanceV5({ rootOthers = 30, registerCert0 = true, ...opts } = {}) {
  const { input, meta } = await buildInstanceV4(opts);
  input.m_sib[0] = input.m_sib[0].map(() => "0"); input.m_bit[0] = input.m_bit[0].map(() => "0");
  const tree = newRootTree();
  for (let k = 0; k < rootOthers; k++) tree.insert(BigInt("0x" + crypto.createHash("sha256").update(`root-${meta.D}-${meta.seed}-${k}`).digest("hex")) % (1n << 250n));
  if (registerCert0) { tree.insert(BigInt(meta.cert[0])); Object.assign(input, rootProof(tree, meta.cert[0])); }
  else Object.assign(input, { root_root: tree.root.toString(), rt_depth: String(tree.depth), rt_index: "0", rt_sib: Array(RT).fill("0") });
  meta.rootTree = tree;
  return { input, meta };
}
