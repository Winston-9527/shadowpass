import { createShadowpassClient, type ShadowpassPaymentBuilder } from "@shadowpass/x402";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import type { ChainState, Deployment } from "@shadowpass/sdk";
import {
  PaymentBuilderError,
  ShadowpassAgentPaymentBuilder,
  type BuiltShadowpassPayment,
  type PaymentProver,
} from "./payment-builder.js";
import { noteToStored } from "./notes.js";
import type { AgentStore } from "./store.js";
import { McpToolError, type McpServices, type PaymentRequest, type PaymentResult } from "./types.js";

export type McpPaymentBuilder = ShadowpassPaymentBuilder & {
  readonly lastBuiltPayment?: BuiltShadowpassPayment;
};

export interface ShadowpassPaymentServiceOptions {
  store: AgentStore;
  deployment: Deployment;
  state: () => ChainState | undefined;
  maxPayment: bigint;
  blockTimestamp?: () => Promise<bigint | number | string>;
  prover?: PaymentProver;
  fetch?: typeof globalThis.fetch;
  builderFactory?: (maxAmount: bigint) => McpPaymentBuilder;
}

const builderErrorCodes = [
  "not_paired",
  "unsupported_chain_depth",
  "insufficient_budget",
  "payment_scheme_mismatch",
  "payment_network_mismatch",
  "payment_asset_mismatch",
  "payment_requirements_mismatch",
  "invalid_payment_amount",
  "invalid_resource_url",
  "spend_limit",
  "proof_failed",
  "proof_verification_failed",
  "chain_state_unavailable",
  "rpc_unavailable",
] as const;

const RESOURCE_CONTENT_LIMIT_BYTES = 32 * 1024;

const rejectionCodes: Readonly<Record<string, string>> = {
  invalid_scheme: "payment_requirements_invalid",
  invalid_payload: "payment_payload_invalid",
  wrong_target: "payment_requirements_mismatch",
  amount_mismatch: "payment_amount_mismatch",
  binding_mismatch: "payment_binding_mismatch",
  stale: "payment_stale",
  unknown_state: "payment_state_unavailable",
  nullifier_pending: "payment_pending",
  merchant_rate_limited: "merchant_rate_limited",
  transaction_reverted: "transaction_reverted",
  facilitator_error: "facilitator_error",
  facilitator_unavailable: "facilitator_unavailable",
  rate_limited: "facilitator_rate_limited",
};

const revertCodes: Readonly<Record<string, string>> = {
  BadClock: "payment_clock_skew",
  NullifierSpent: "nullifier_spent",
  InsufficientBalance: "insufficient_budget",
  InsufficientBudget: "insufficient_budget",
  Revoked: "revoked",
  Expired: "credential_expired",
  CapabilityMismatch: "capability_mismatch",
};

function fieldString(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function mapRejection(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  const direct = rejectionCodes[reason];
  if (direct) return direct;
  if (reason.startsWith("simulation_failed:")) {
    return revertCodes[reason.slice("simulation_failed:".length)] ?? "simulation_failed";
  }
  if (reason.startsWith("settlement_failed:")) return "settlement_failed";
  return undefined;
}

function mapPaymentError(error: unknown): McpToolError {
  const message = error instanceof Error ? error.message : String(error);
  const code = builderErrorCodes.find((candidate) => message.includes(candidate));
  if (code) return new McpToolError(code, code);
  const rejection = mapRejection(fieldString(error, "invalidReason") ?? fieldString(error, "errorReason"));
  if (rejection) return new McpToolError(rejection, rejection);
  for (const [reason, mapped] of Object.entries(rejectionCodes)) {
    if (message.includes(reason)) return new McpToolError(mapped, mapped);
  }
  if (message.includes("spendControls") || message.includes("maxAmountPerPayment")) {
    return new McpToolError("spend_limit", "spend_limit");
  }
  if (message.includes("Invalid payment required response")) {
    return new McpToolError("payment_requirements_invalid", "payment_requirements_invalid");
  }
  return new McpToolError("payment_failed", "payment_failed");
}

function minimum(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function validSettlement(
  settlement: ReturnType<typeof decodePaymentResponseHeader>,
  deployment: Deployment,
  expectedAmount: string,
): boolean {
  if (!settlement.success || !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)) return false;
  if (settlement.network !== `eip155:${deployment.chainId}`) return false;
  if (settlement.amount === undefined) return false;
  if (!/^(0|[1-9][0-9]*)$/.test(settlement.amount)) return false;
  return BigInt(settlement.amount) === BigInt(expectedAmount);
}

async function readResourceContent(response: Response): Promise<{ text: string; truncated: boolean; trust: "untrusted" }> {
  if (!response.body) return { text: "", truncated: false, trust: "untrusted" };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = RESOURCE_CONTENT_LIMIT_BYTES - total;
    if (value.length > remaining) {
      if (remaining > 0) chunks.push(value.slice(0, remaining));
      total += Math.max(remaining, 0);
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.length;
    if (total === RESOURCE_CONTENT_LIMIT_BYTES) {
      const next = await reader.read();
      if (!next.done) {
        truncated = true;
        await reader.cancel();
      }
      break;
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { text: new TextDecoder().decode(bytes), truncated, trust: "untrusted" };
}

export class ShadowpassPaymentService implements NonNullable<McpServices["payment"]> {
  private queue: Promise<void> = Promise.resolve();
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly builderFactory: (maxAmount: bigint) => McpPaymentBuilder;

  constructor(private readonly options: ShadowpassPaymentServiceOptions) {
    if (options.maxPayment <= 0n) throw new Error("maxPayment must be positive");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.builderFactory = options.builderFactory ?? ((maxAmount) => {
      const state = options.state();
      if (!state) throw new PaymentBuilderError("chain_state_unavailable");
      return new ShadowpassAgentPaymentBuilder({
        store: options.store,
        deployment: options.deployment,
        state,
        blockTimestamp: options.blockTimestamp ?? (async () => {
          throw new PaymentBuilderError("rpc_unavailable");
        }),
        maxAmount,
        prover: options.prover,
      });
    });
  }

  pay(request: PaymentRequest): Promise<PaymentResult> {
    if (request.maxAmount <= 0n) return Promise.reject(new McpToolError("invalid_amount", "invalid_amount"));
    if (request.maxAmount > this.options.maxPayment) {
      return Promise.reject(new McpToolError("spend_limit", "spend_limit"));
    }
    const run = this.queue.then(
      () => this.payOnce(request),
      () => this.payOnce(request),
    );
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async payOnce(request: PaymentRequest): Promise<PaymentResult> {
    const cap = minimum(this.options.maxPayment, request.maxAmount);
    let builder: McpPaymentBuilder;
    try {
      builder = this.builderFactory(cap);
    } catch (error) {
      throw mapPaymentError(error);
    }
    const network = `eip155:${this.options.deployment.chainId}` as `${string}:${string}`;
    const client = createShadowpassClient({
      builder,
      network,
      spendControls: {
        allowedAssets: [{
          network,
          asset: this.options.deployment.token,
          maxAmountPerPayment: cap.toString(),
        }],
      },
    });
    const paidFetch = wrapFetchWithPayment(this.fetchImpl, client);
    let response: Response;
    try {
      response = await paidFetch(request.url);
    } catch (error) {
      throw mapPaymentError(error);
    }

    const payment = builder.lastBuiltPayment;
    if (!payment) {
      throw new McpToolError(
        response.status === 402 ? "payment_requirements_rejected" : "payment_not_required",
        response.status === 402 ? "payment_requirements_rejected" : "payment_not_required",
      );
    }
    const header = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
    if (!header) throw new McpToolError("payment_response_missing", "payment_response_missing");
    let settlement;
    try {
      settlement = decodePaymentResponseHeader(header);
    } catch {
      throw new McpToolError("payment_response_invalid", "payment_response_invalid");
    }
    if (!validSettlement(settlement, this.options.deployment, payment.payload.action.amount)) {
      const rejection = mapRejection(settlement.errorReason) ?? "payment_failed";
      throw new McpToolError(rejection, rejection);
    }

    this.options.state()?.spentNullifiers.add(payment.budgetNf.toString());
    const warnings: string[] = [];
    try {
      await this.options.store.addNote(noteToStored(payment.change));
    } catch {
      warnings.push("local_change_save_failed");
    }
    let resourceContent = { text: "", truncated: false, trust: "untrusted" as const };
    try {
      resourceContent = await readResourceContent(response);
    } catch {
      warnings.push("resource_content_read_failed");
    }
    if (!response.ok) warnings.push("resource_request_failed");
    return {
      budgetNf: payment.budgetNf.toString(),
      tx: settlement.transaction,
      resource: request.url,
      amount: payment.payload.action.amount,
      resourceContent,
      ...(warnings.length ? { warnings } : {}),
    };
  }
}

export function createShadowpassPaymentService(
  options: ShadowpassPaymentServiceOptions,
): NonNullable<McpServices["payment"]> {
  return new ShadowpassPaymentService(options);
}
