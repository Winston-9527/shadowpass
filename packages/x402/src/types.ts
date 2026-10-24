import { keccak256, toHex } from "viem";
import { z } from "zod";
import type { Address, Deployment, Hex } from "@shadowpass/sdk";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";

export const SHADOWPASS_SCHEME = "shadowpass" as const;
export const SHADOWPASS_ASSET_DECIMALS = 6;
export const PAY_METHOD = keccak256(toHex("shadowpass.PAY")).slice(0, 10) as Hex;

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const uintSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const hexSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/);
export const bytes4Schema = z.string().regex(/^0x[0-9a-fA-F]{8}$/);
export const proofSchema = z.object({
  a: z.tuple([uintSchema, uintSchema]),
  b: z.tuple([
    z.tuple([uintSchema, uintSchema]),
    z.tuple([uintSchema, uintSchema]),
  ]),
  c: z.tuple([uintSchema, uintSchema]),
}).strict();

export const ShadowpassPayloadSchema = z.object({
  D: z.number().int().min(1).max(3),
  proof: proofSchema,
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
  ct: z.array(uintSchema).min(7).max(9),
  budget: z.object({
    noteRoot: uintSchema,
    budgetNf: uintSchema,
    cmChange: uintSchema,
    qSpent: uintSchema,
  }).strict(),
  memoChange: hexSchema,
  timings: z.object({ proofMs: z.number().nonnegative() }).strict().optional(),
}).strict();

export type ShadowpassPayload = z.infer<typeof ShadowpassPayloadSchema>;
export type CalldataProof = ShadowpassPayload["proof"];
export type Roots = ShadowpassPayload["roots"];

export interface ShadowpassPaymentBuilder {
  buildPayment(requirements: PaymentRequirements, resourceUrl: string): Promise<ShadowpassPayload>;
}

export interface PaymentChainView {
  deployment: Deployment;
  blockTimestamp(): Promise<number>;
  clockSkewSeconds?(): Promise<number>;
  rootsAccepted(roots: Roots): Promise<boolean>;
  isStateRegistered(roots: Roots): Promise<boolean>;
}

export interface TransactionResult {
  transaction: Hex;
  blockNumber: bigint;
  logs: readonly unknown[];
}

export interface GateClient {
  simulateExecute(payload: ShadowpassPayload): Promise<void>;
  sendExecute(payload: ShadowpassPayload): Promise<TransactionResult>;
  registerState(roots: Roots): Promise<TransactionResult>;
}

export interface ShadowpassFacilitatorCoreOptions {
  gateClient: GateClient;
  chainView: PaymentChainView;
  signers: Address[];
  clockSkewSeconds?: number;
  merchantRateLimit?: { limit: number; windowMs: number };
  settlementLockTtlMs?: number;
}

export type RelayAction =
  | "join"
  | "register"
  | "faucetDeposit"
  | "issue"
  | "transferBudget"
  | "revoke"
  | "registerState";

export const RELAY_ACTIONS = [
  "join",
  "register",
  "faucetDeposit",
  "issue",
  "transferBudget",
  "revoke",
  "registerState",
] as const satisfies readonly RelayAction[];

export interface RelayResult {
  transaction: Hex;
  blockNumber: string;
  logs: Array<Record<string, string | string[]>>;
}

export interface WalletRelayClient {
  relay(action: RelayAction, args: Record<string, unknown>): Promise<RelayResult>;
}

export type ShadowpassVerifyResult = VerifyResponse;
export type ShadowpassSettleResult = SettleResponse;

export function parseShadowpassPayload(payment: PaymentPayload): ShadowpassPayload {
  return ShadowpassPayloadSchema.parse(payment.payload);
}

export function requirementAddress(
  requirements: PaymentRequirements,
  key: string,
): Address {
  const value = requirements.extra?.[key];
  if (typeof value !== "string" || !addressSchema.safeParse(value).success) {
    throw new Error(`missing_${key}`);
  }
  return value as Address;
}

export function isNetwork(value: unknown): value is Network {
  return typeof value === "string" && /^[^:]+:[^:]+$/.test(value);
}
