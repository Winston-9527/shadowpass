import { decodeAbiParameters } from "viem";
import type { Address, Hex } from "@shadowpass/sdk";
import { reqHash } from "@shadowpass/sdk";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  gateRequest,
  PAY_METHOD,
  parseShadowpassPayload,
  requirementAddress,
  SHADOWPASS_SCHEME,
  ShadowpassPayloadError,
  type GateClient,
  type ShadowpassPayload,
} from "./types.js";

type LockState = "reserved" | "settled";

interface LockEntry {
  state: LockState;
  expiresAt: number;
}

export class NullifierLock {
  private readonly entries = new Map<string, LockEntry>();
  constructor(private readonly reservationTtlMs: number) {}

  reserve(nullifier: string, now = Date.now()): boolean {
    this.prune(now);
    if (this.entries.has(nullifier)) return false;
    this.entries.set(nullifier, { state: "reserved", expiresAt: now + this.reservationTtlMs });
    return true;
  }

  state(nullifier: string, now = Date.now()): LockState | undefined {
    this.prune(now);
    return this.entries.get(nullifier)?.state;
  }

  settle(nullifier: string): void {
    this.entries.set(nullifier, { state: "settled", expiresAt: Number.POSITIVE_INFINITY });
  }

  release(nullifier: string): void {
    const entry = this.entries.get(nullifier);
    if (entry?.state === "reserved") this.entries.delete(nullifier);
  }

  private prune(now: number): void {
    for (const [nullifier, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(nullifier);
    }
  }
}

export interface MerchantRateLimitOptions {
  limit: number;
  windowMs: number;
}

export class MerchantRateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly options: MerchantRateLimitOptions) {}

  allow(merchant: string, now = Date.now()): boolean {
    const cutoff = now - this.options.windowMs;
    const recent = (this.hits.get(merchant) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.options.limit) {
      this.hits.set(merchant, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(merchant, recent);
    return true;
  }
}

export interface ShadowpassFacilitatorOptions {
  gateClient: GateClient;
  signers: Address[];
  clockSkewSeconds?: number;
  reservationTtlMs?: number;
  rateLimit?: MerchantRateLimitOptions;
  now?: () => number;
}

interface Validation {
  payload: ShadowpassPayload;
  request: ReturnType<typeof gateRequest>;
  merchant: string;
}

export class ShadowpassFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = SHADOWPASS_SCHEME;
  readonly caipFamily = "eip155:*";
  private readonly gateClient: GateClient;
  private readonly signers: Address[];
  private readonly clockSkewSeconds: number;
  private readonly now: () => number;
  private readonly lock: NullifierLock;
  private readonly rateLimiter: MerchantRateLimiter;

  constructor(options: ShadowpassFacilitatorOptions) {
    this.gateClient = options.gateClient;
    this.signers = options.signers;
    this.clockSkewSeconds = options.clockSkewSeconds ?? 60;
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    this.lock = new NullifierLock(options.reservationTtlMs ?? 60_000);
    this.rateLimiter = new MerchantRateLimiter(options.rateLimit ?? { limit: 60, windowMs: 60_000 });
  }

  getExtra(_network: Network): Record<string, unknown> | undefined {
    return undefined;
  }

  getSigners(_network: string): string[] {
    return [...this.signers];
  }

  async verify(payment: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    let validation: Validation;
    try {
      validation = this.validate(payment, requirements);
    } catch (error) {
      return invalid("invalid_payload", error);
    }
    if (!this.rateLimiter.allow(validation.merchant)) {
      return { isValid: false, invalidReason: "merchant_rate_limited", invalidMessage: validation.merchant };
    }
    const nullifier = validation.payload.budget.budgetNf;
    if (!this.lock.reserve(nullifier)) {
      return {
        isValid: false,
        invalidReason: this.lock.state(nullifier) === "settled" ? "nullifier_spent" : "nullifier_pending",
      };
    }

    const started = performance.now();
    let simulationMs = 0;
    try {
      const simulationStarted = performance.now();
      await this.gateClient.simulateExecute(validation.request);
      simulationMs = performance.now() - simulationStarted;
    } catch (error) {
      this.lock.release(nullifier);
      return invalid("simulation_failed", error);
    }
    return {
      isValid: true,
      payer: "shadowpass-pool",
      extra: {
        shadowpass: {
          proofMs: validation.payload.timings?.proofMs,
          verifyMs: performance.now() - started,
          simulationMs,
        },
      },
    };
  }

  async settle(payment: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    let validation: Validation;
    try {
      validation = this.validate(payment, requirements);
    } catch (error) {
      return failed("invalid_payload", error, requirements.network);
    }
    const nullifier = validation.payload.budget.budgetNf;
    const state = this.lock.state(nullifier);
    if (state === "settled") return failed("nullifier_spent", "payment already settled", requirements.network);
    if (state !== "reserved" && !this.rateLimiter.allow(validation.merchant)) {
      return failed("merchant_rate_limited", validation.merchant, requirements.network);
    }
    if (state !== "reserved" && !this.lock.reserve(nullifier)) {
      return failed("nullifier_pending", "payment is already being settled", requirements.network);
    }

    const started = performance.now();
    let transaction: Hex | undefined;
    let simulationMs = 0;
    try {
      const simulationStarted = performance.now();
      await this.gateClient.simulateExecute(validation.request);
      simulationMs = performance.now() - simulationStarted;
      transaction = await this.gateClient.sendExecute(validation.request);
      this.lock.settle(nullifier);
      await this.gateClient.waitForConfirmation(transaction);
    } catch (error) {
      if (!transaction) this.lock.release(nullifier);
      return failed(transaction ? "confirmation_failed" : "settlement_failed", error, requirements.network, transaction);
    }
    return {
      success: true,
      transaction,
      network: requirements.network,
      payer: "shadowpass-pool",
      amount: requirements.amount,
      extra: {
        shadowpass: {
          proofMs: validation.payload.timings?.proofMs,
          simulationMs,
          settleMs: performance.now() - started,
        },
      },
    };
  }

  private validate(payment: PaymentPayload, requirements: PaymentRequirements): Validation {
    if (requirements.scheme !== this.scheme) throw new ShadowpassPayloadError("scheme mismatch");
    const payload = parseShadowpassPayload(payment);
    if (payload.ct.length !== payload.D + 6) throw new ShadowpassPayloadError("D and ct length mismatch");
    const now = this.now();
    const nowTs = Number(payload.nowTs);
    if (!Number.isSafeInteger(nowTs) || Math.abs(now - nowTs) > this.clockSkewSeconds) {
      throw new ShadowpassPayloadError("nowTs is stale");
    }
    const payout = requirementAddress(requirements, "payout");
    requirementAddress(requirements, "gate");
    if (payload.action.target.toLowerCase() !== payout.toLowerCase()) {
      throw new ShadowpassPayloadError("action target is not ShadowPayout");
    }
    if (BigInt(payload.action.amount) !== BigInt(requirements.amount)) {
      throw new ShadowpassPayloadError("action amount mismatch");
    }
    if (BigInt(payload.budget.qSpent) !== BigInt(requirements.amount)) {
      throw new ShadowpassPayloadError("budget qSpent mismatch");
    }
    if (payload.action.method.toLowerCase() !== PAY_METHOD.toLowerCase()) {
      throw new ShadowpassPayloadError("action method is not shadowpass.PAY");
    }
    const accepted = payment.accepted;
    if (
      !accepted
      || accepted.scheme !== requirements.scheme
      || accepted.network !== requirements.network
      || accepted.asset.toLowerCase() !== requirements.asset.toLowerCase()
      || accepted.payTo.toLowerCase() !== requirements.payTo.toLowerCase()
      || BigInt(accepted.amount) !== BigInt(requirements.amount)
    ) {
      throw new ShadowpassPayloadError("payload accepted requirements mismatch");
    }
    if (!payment.resource?.url) throw new ShadowpassPayloadError("payment resource URL is missing");
    const [payTo, requestHash] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      payload.action.params as Hex,
    );
    if (payTo.toLowerCase() !== requirements.payTo.toLowerCase()) {
      throw new ShadowpassPayloadError("action payTo mismatch");
    }
    const expectedHash = reqHash({
      network: requirements.network,
      asset: requirements.asset as Address,
      amount: BigInt(requirements.amount),
      payTo: requirements.payTo as Address,
      resource: payment.resource.url,
    });
    if (requestHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new ShadowpassPayloadError("action reqHash mismatch");
    }
    const merchant =
      typeof requirements.extra.merchantId === "string" ? requirements.extra.merchantId : requirements.payTo;
    return { payload, request: gateRequest(payload), merchant };
  }
}

function invalid(reason: string, error: unknown): VerifyResponse {
  const message = error instanceof Error ? error.message : String(error);
  return { isValid: false, invalidReason: reason, invalidMessage: message };
}

function failed(
  reason: string,
  error: unknown,
  network: Network,
  transaction = "",
): SettleResponse {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, errorReason: reason, errorMessage: message, transaction, network };
}
