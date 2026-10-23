import { createShadowpassClient, type ShadowpassPaymentBuilder } from "@shadowpass/x402";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import type { ChainState, Deployment } from "@shadowpass/sdk";
import {
  PaymentBuilderError,
  ShadowpassAgentPaymentBuilder,
  type BuiltShadowpassPayment,
  type PaymentProver,
} from "./payment-builder.js";
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

function mapPaymentError(error: unknown): McpToolError {
  const message = error instanceof Error ? error.message : String(error);
  const code = builderErrorCodes.find((candidate) => message.includes(candidate));
  if (code) return new McpToolError(code, code);
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
  if (settlement.amount === undefined) return true;
  if (!/^(0|[1-9][0-9]*)$/.test(settlement.amount)) return false;
  return BigInt(settlement.amount) === BigInt(expectedAmount);
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
      throw new McpToolError("payment_failed", "payment_failed");
    }

    this.options.state()?.spentNullifiers.add(payment.budgetNf.toString());
    return {
      budgetNf: payment.budgetNf.toString(),
      tx: settlement.transaction,
      resource: request.url,
      amount: payment.payload.action.amount,
      ...(response.ok ? {} : { warning: "resource_request_failed" }),
    };
  }
}

export function createShadowpassPaymentService(
  options: ShadowpassPaymentServiceOptions,
): NonNullable<McpServices["payment"]> {
  return new ShadowpassPaymentService(options);
}
