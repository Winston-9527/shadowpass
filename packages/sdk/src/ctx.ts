import { encodeAbiParameters, keccak256 } from "viem";
import type { Action, Address, Hex } from "./types.js";

const ctxParameters = [
  { type: "uint256" },
  { type: "address" },
  { type: "bytes4" },
  { type: "address" },
  { type: "bytes" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "bytes32" },
] as const;

const reqParameters = [
  { type: "string" },
  { type: "address" },
  { type: "uint256" },
  { type: "address" },
  { type: "string" },
] as const;

export interface CtxHashInput {
  chainId: bigint | number;
  gate: Address;
  action: Action;
  memoChange?: Hex | Uint8Array;
}

export interface ReqHashInput {
  network: string;
  asset: Address;
  amount: bigint;
  payTo: Address;
  resource: string;
}

export function ctxHash({ chainId, gate, action, memoChange = "0x" }: CtxHashInput): bigint {
  const encoded = encodeAbiParameters(ctxParameters, [
    BigInt(chainId),
    gate,
    action.method,
    action.target,
    action.params,
    action.amount,
    action.nonce,
    keccak256(memoChange as Hex | Uint8Array),
  ]);
  return BigInt(keccak256(encoded)) >> 8n;
}

export function reqHash({ network, asset, amount, payTo, resource }: ReqHashInput): Hex {
  return keccak256(encodeAbiParameters(reqParameters, [network, asset, amount, payTo, resource]));
}
