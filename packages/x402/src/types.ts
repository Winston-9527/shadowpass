import { keccak256, toHex } from "viem";
import { z } from "zod";
import type { Address, Hex } from "@shadowpass/sdk";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

export const SHADOWPASS_SCHEME = "shadowpass" as const;
export const SHADOWPASS_NETWORK = "eip155:84532" as const;
export const SHADOWPASS_ASSET_DECIMALS = 6;
export const PAY_METHOD = keccak256(toHex("shadowpass.PAY")).slice(0, 10) as Hex;

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const uintSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const hexSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/);
const bytes4Schema = z.string().regex(/^0x[0-9a-fA-F]{8}$/);
export const calldataProofSchema = z.object({
  a: z.tuple([uintSchema, uintSchema]),
  b: z.tuple([
    z.tuple([uintSchema, uintSchema]),
    z.tuple([uintSchema, uintSchema]),
  ]),
  c: z.tuple([uintSchema, uintSchema]),
}).strict();

export const shadowpassPayloadSchema = z.object({
  D: z.number().int().min(1).max(3),
  proof: calldataProofSchema,
  roots: z.object({
    issued: uintSchema,
    revoked: uintSchema,
    root: uintSchema,
  }).strict(),
  nowTs: uintSchema,
  action: z.object({
    target: addressSchema,
    method: bytes4Schema,
    amount: uintSchema,
    nonce: uintSchema,
    params: hexSchema,
  }).strict(),
  ct: z.array(uintSchema).min(7),
  budget: z.object({
    noteRoot: uintSchema,
    budgetNf: uintSchema,
    cmChange: uintSchema,
    qSpent: uintSchema,
  }).strict(),
  memoChange: hexSchema,
  timings: z.object({
    proofMs: z.number().nonnegative(),
  }).strict().optional(),
}).strict();

export type ShadowpassPayload = z.infer<typeof shadowpassPayloadSchema>;
export type CalldataProof = ShadowpassPayload["proof"];

export interface GateExecuteRequest {
  proof: CalldataProof;
  roots: ShadowpassPayload["roots"];
  nowTs: string;
  action: ShadowpassPayload["action"];
  ct: string[];
  budget: ShadowpassPayload["budget"];
  memoChange: Hex;
}

export interface GateClient {
  simulateExecute(request: GateExecuteRequest): Promise<void>;
  sendExecute(request: GateExecuteRequest): Promise<Hex>;
  waitForConfirmation(transaction: Hex): Promise<void>;
}

export interface RegisterRelayRequest {
  proof: CalldataProof;
  groupRoot: string;
  nf: string;
  leaf0: string;
  siblingNodes: string[];
}

export interface DepositRelayRequest {
  proof: CalldataProof;
  cm: string;
  q: string;
  memo: Hex;
}

export interface TransferBudgetRelayRequest {
  proof: CalldataProof;
  noteRoot: string;
  revokedRoot: string;
  nullifier: string;
  cm1: string;
  cm2: string;
  memo1: Hex;
  memo2: Hex;
}

export interface WalletRelayClient {
  join(commitment: string): Promise<Hex>;
  issue(certHash: string): Promise<Hex>;
  register(request: RegisterRelayRequest): Promise<Hex>;
  deposit(request: DepositRelayRequest): Promise<Hex>;
  transferBudget(request: TransferBudgetRelayRequest): Promise<Hex>;
}

export interface ShadowpassPaymentBuilderInput {
  requirements: PaymentRequirements;
  resourceUrl: string;
  memoChange: Hex;
}

export interface ShadowpassPaymentBuilder {
  build(input: ShadowpassPaymentBuilderInput): Promise<ShadowpassPayload>;
}

export class ShadowpassPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShadowpassPayloadError";
  }
}

export function parseShadowpassPayload(payment: PaymentPayload): ShadowpassPayload {
  const result = shadowpassPayloadSchema.safeParse(payment.payload);
  if (!result.success) {
    throw new ShadowpassPayloadError(result.error.issues.map((issue) => issue.message).join("; "));
  }
  return result.data;
}

export function gateRequest(payload: ShadowpassPayload): GateExecuteRequest {
  return {
    proof: payload.proof,
    roots: payload.roots,
    nowTs: payload.nowTs,
    action: payload.action,
    ct: payload.ct,
    budget: payload.budget,
    memoChange: payload.memoChange as Hex,
  };
}

export function requirementAddress(
  requirements: PaymentRequirements,
  key: string,
): Address {
  const value = requirements.extra?.[key];
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new ShadowpassPayloadError(`payment requirement extra.${key} is not an address`);
  }
  return value as Address;
}
