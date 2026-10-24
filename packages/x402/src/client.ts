import { encodeAbiParameters, type Address, type Hex } from "viem";
import { x402Client, type SpendControls } from "@x402/core/client";
import type {
  Network,
  PaymentPayloadResult,
  PaymentPayloadContext,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";
import { reqHash } from "@shadowpass/sdk";
import {
  PAY_METHOD,
  SHADOWPASS_SCHEME,
  type CalldataProof,
  type ShadowpassPayload,
  type ShadowpassPaymentBuilder,
} from "./types.js";

const resourceUrls = new WeakMap<PaymentRequirements, string>();

export interface AssembleShadowpassPayloadInput {
  requirements: PaymentRequirements;
  resourceUrl: string;
  proof: CalldataProof;
  roots: ShadowpassPayload["roots"];
  nowTs: bigint | string | number;
  nonce: bigint | string | number;
  ct: string[];
  budget: ShadowpassPayload["budget"];
  memoChange: Hex;
}

export function assembleShadowpassPayload(input: AssembleShadowpassPayloadInput): ShadowpassPayload {
  const payout = input.requirements.extra?.payout;
  const method = input.requirements.extra?.method;
  if (typeof payout !== "string") throw new Error("missing_payout");
  if (typeof method !== "string") throw new Error("missing_method");
  const requestHash = reqHash({
    network: input.requirements.network,
    asset: input.requirements.asset as Address,
    amount: BigInt(input.requirements.amount),
    payTo: input.requirements.payTo as Address,
    resource: input.resourceUrl,
  });
  return {
    D: input.ct.length - 6,
    proof: input.proof,
    roots: input.roots,
    nowTs: String(input.nowTs),
    action: {
      target: payout as Address,
      method: method as Hex,
      amount: input.requirements.amount,
      nonce: String(input.nonce),
      params: encodeAbiParameters(
        [{ type: "address" }, { type: "bytes32" }],
        [input.requirements.payTo as Address, requestHash],
      ),
    },
    ct: input.ct,
    budget: input.budget,
    memoChange: input.memoChange,
  };
}

export class ShadowpassClientScheme implements SchemeNetworkClient {
  readonly scheme = SHADOWPASS_SCHEME;

  constructor(private readonly builder: ShadowpassPaymentBuilder) {}

  async createPaymentPayload(
    x402Version: number,
    requirements: PaymentRequirements,
    _context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    const resourceUrl = resourceUrls.get(requirements);
    if (!resourceUrl) throw new Error("resource_url_missing");
    const payload = await this.builder.buildPayment(requirements, resourceUrl);
    return { x402Version, payload: payload as unknown as Record<string, unknown> };
  }
}

export interface CreateShadowpassClientOptions {
  builder: ShadowpassPaymentBuilder;
  spendControls: SpendControls | false;
  network: Network;
}

export function createShadowpassClient(options: CreateShadowpassClientOptions): x402Client {
  const scheme = new ShadowpassClientScheme(options.builder);
  const network = options.network;
  return x402Client
    .fromConfig({
      schemes: [{ network, client: scheme }],
      spendControls: options.spendControls,
    })
    .onBeforePaymentCreation(async ({ paymentRequired }) => {
      for (const requirements of paymentRequired.accepts) {
        resourceUrls.set(requirements, paymentRequired.resource.url);
      }
    });
}

// Kept for callers that assemble payment data without using the official client hook.
export function registerResourceUrl(requirements: PaymentRequirements, resourceUrl: string): void {
  resourceUrls.set(requirements, resourceUrl);
}
