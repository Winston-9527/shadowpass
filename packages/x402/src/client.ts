import {
  encodeAbiParameters,
  type Address,
  type Hex,
} from "viem";
import {
  x402Client,
  type SpendControls,
} from "@x402/core/client";
import type {
  Network,
  PaymentPayloadResult,
  PaymentRequirements,
  PaymentPayloadContext,
  SchemeNetworkClient,
} from "@x402/core/types";
import { reqHash } from "@shadowpass/sdk";
import {
  PAY_METHOD,
  SHADOWPASS_NETWORK,
  SHADOWPASS_SCHEME,
  type CalldataProof,
  type ShadowpassPayload,
  type ShadowpassPaymentBuilder,
} from "./types.js";

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
  proofMs?: number;
}

export function assembleShadowpassPayload(input: AssembleShadowpassPayloadInput): ShadowpassPayload {
  const payout = input.requirements.extra?.payout;
  if (typeof payout !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(payout)) {
    throw new Error("payment requirement extra.payout is not an address");
  }
  const requestHash = reqHash({
    network: input.requirements.network,
    asset: input.requirements.asset as Address,
    amount: BigInt(input.requirements.amount),
    payTo: input.requirements.payTo as Address,
    resource: input.resourceUrl,
  });
  const params = encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }],
    [input.requirements.payTo as Address, requestHash],
  );
  return {
    D: input.ct.length - 6,
    proof: input.proof,
    roots: input.roots,
    nowTs: String(input.nowTs),
    action: {
      target: payout as Address,
      method: PAY_METHOD,
      amount: input.requirements.amount,
      nonce: String(input.nonce),
      params,
    },
    ct: input.ct,
    budget: input.budget,
    memoChange: input.memoChange,
    ...(input.proofMs === undefined ? {} : { timings: { proofMs: input.proofMs } }),
  };
}

export interface ShadowpassClientOptions {
  builder: ShadowpassPaymentBuilder;
  memoChange: Hex;
}

export class ShadowpassClient implements SchemeNetworkClient {
  readonly scheme = SHADOWPASS_SCHEME;
  private readonly builder: ShadowpassPaymentBuilder;
  private readonly memoChange: Hex;
  private resourceUrl?: string;

  constructor(options: ShadowpassClientOptions) {
    this.builder = options.builder;
    this.memoChange = options.memoChange;
  }

  setResourceUrl(resourceUrl: string): void {
    this.resourceUrl = resourceUrl;
  }

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    _context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    if (!this.resourceUrl) {
      throw new Error("shadowpass client resource URL was not set by beforePaymentCreation");
    }
    const payload = await this.builder.build({
      requirements: paymentRequirements,
      resourceUrl: this.resourceUrl,
      memoChange: this.memoChange,
    });
    return { x402Version, payload: payload as unknown as Record<string, unknown> };
  }
}

export interface CreateShadowpassClientOptions extends ShadowpassClientOptions {
  network?: Network;
  spendControls: SpendControls | false;
}

export function createShadowpassClient(options: CreateShadowpassClientOptions): x402Client {
  const scheme = new ShadowpassClient(options);
  const network = options.network ?? SHADOWPASS_NETWORK;
  const client = x402Client.fromConfig({
    schemes: [{ network, client: scheme }],
    spendControls: options.spendControls,
  })
    .onBeforePaymentCreation(async ({ paymentRequired }) => {
      scheme.setResourceUrl(paymentRequired.resource.url);
    });
  return client;
}
