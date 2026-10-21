// Instance generator for zkdac v3 (layout C). Reuses the v2 generator (keys, certificates, issued tree, revocation SMT)
// and replaces the action part: ctx_hash = keccak256(abi.encode(chainid, verifier, method, target, params, amount, nonce)) >> 8,
// digest = Poseidon(ctx_hash, req_cap), nullifier = Poseidon(tag, holder_sk, digest). Deterministic given seed.
import { buildInstance as buildV2, init, R, SUBORDER } from "../../zkdac_v2/scripts/lib.mjs";
import { ethers } from "ethers";
export { init, R, SUBORDER };
export const TAG = 1952805748n;
export const DEFAULT_CTX = { chainId: 31337n, verifier: "0x000000000000000000000000000000000000dac1", method: "0xa9059cbb",
  target: "0x000000000000000000000000000000000000ba5e", params: "0x1234abcd", amount: 100n };
export function ctxHash(c) {
  const enc = ethers.utils.defaultAbiCoder.encode(["uint256", "address", "bytes4", "address", "bytes", "uint256", "uint256"],
    [c.chainId, c.verifier.toLowerCase(), c.method, c.target.toLowerCase(), c.params, c.amount, c.nonce]);
  return BigInt(ethers.utils.keccak256(enc)) >> 8n;
}
export async function buildInstanceV3({ ctx = {}, reqCap, ...opts } = {}) {
  const action = { ...(opts.action ?? {}) }; if (reqCap !== undefined) action.req_cap = BigInt(reqCap);
  const { input, meta } = await buildV2({ ...opts, action });
  const c = { ...DEFAULT_CTX, nonce: meta.act.nonce, ...ctx };
  const h = ctxHash(c), req = BigInt(meta.act.req_cap), d = meta.P([h, req]);
  for (const k of ["action_digest", "act_chain_id", "act_verifier", "act_method", "act_params_hash", "act_amount", "act_nonce"]) delete input[k];
  input.ctx_hash = h.toString(); input.act_req_cap = req.toString();
  input.nullifier = meta.P([TAG, BigInt(input.holder_sk), d]).toString();
  Object.assign(meta, { ctx: c, ctx_hash: h, digest: d });
  return { input, meta };
}
