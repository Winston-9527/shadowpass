import { decodeAbiParameters } from "viem";
import type { Address, Deployment, Hex } from "@shadowpass/sdk";
import { reqHash } from "@shadowpass/sdk";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { PublicClient, WalletClient } from "viem";
import {
  SHADOWPASS_SCHEME,
  ShadowpassPayloadSchema,
  type GateClient,
  type PaymentChainView,
  type Roots,
  type ShadowpassFacilitatorCoreOptions,
  type ShadowpassPayload,
} from "./types.js";
import {
  TransactionRevertedError,
  TransactionPendingError,
  TransactionQueueFullError,
  ViemGateClient,
  revertName,
} from "./viem-gate.js";

type NullifierState =
  | { phase: "verified"; expiresAt: number }
  | { phase: "settling"; expiresAt: number; token: symbol }
  | { phase: "pending"; token: symbol; transaction: Hex }
  | { phase: "settled" };

export class NullifierLock {
  private readonly entries = new Map<string, NullifierState>();

  constructor(private readonly reservationTtlMs = 300_000) {}

  markVerified(nullifier: string, now = Date.now()): void {
    const current = this.state(nullifier, now);
    if (!current) {
      this.entries.set(nullifier, { phase: "verified", expiresAt: now + this.reservationTtlMs });
    }
  }

  beginSettle(nullifier: string, now = Date.now()): symbol | undefined {
    const current = this.state(nullifier, now);
    if (current?.phase === "settling" || current?.phase === "pending" || current?.phase === "settled") {
      return undefined;
    }
    const token = Symbol(nullifier);
    this.entries.set(nullifier, { phase: "settling", token, expiresAt: now + this.reservationTtlMs });
    return token;
  }

  settle(nullifier: string, token: symbol): boolean {
    const current = this.entries.get(nullifier);
    if (current?.phase !== "settling" || current.token !== token) return false;
    this.entries.set(nullifier, { phase: "settled" });
    return true;
  }

  markPending(nullifier: string, token: symbol, transaction: Hex): boolean {
    const current = this.entries.get(nullifier);
    if (current?.phase !== "settling" || current.token !== token) return false;
    this.entries.set(nullifier, { phase: "pending", token, transaction });
    return true;
  }

  release(nullifier: string, token: symbol): void {
    const current = this.entries.get(nullifier);
    if (current?.phase === "settling" && current.token === token) this.entries.delete(nullifier);
  }

  state(nullifier: string, now = Date.now()): NullifierState | undefined {
    const current = this.entries.get(nullifier);
    if (!current) return undefined;
    if ((current.phase === "verified" || current.phase === "settling") && current.expiresAt <= now) {
      this.entries.delete(nullifier);
      return undefined;
    }
    return current;
  }
}

export class MerchantRateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly options: { limit: number; windowMs: number }) {}

  allow(merchant: string, now = Date.now()): boolean {
    const cutoff = now - this.options.windowMs;
    const recent = (this.hits.get(merchant) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.options.limit) return false;
    recent.push(now);
    this.hits.set(merchant, recent);
    return true;
  }
}

function invalid(reason: string): VerifyResponse {
  return { isValid: false, invalidReason: reason };
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function requirementsMatch(
  accepted: PaymentRequirements | undefined,
  requirements: PaymentRequirements,
): boolean {
  return !!accepted
    && accepted.scheme === requirements.scheme
    && accepted.network === requirements.network
    && sameAddress(accepted.asset, requirements.asset)
    && sameAddress(accepted.payTo, requirements.payTo)
    && accepted.amount === requirements.amount;
}

export interface CheckPaymentOptions {
  clockSkewSeconds?: number;
}

export async function checkPayment(
  payment: PaymentPayload,
  requirements: PaymentRequirements,
  resourceUrl: string,
  chainView: PaymentChainView,
  options: CheckPaymentOptions = {},
): Promise<VerifyResponse> {
  const deployment = chainView.deployment;
  const gate = requirements.extra?.gate;
  const payout = requirements.extra?.payout;
  const method = requirements.extra?.method;
  if (
    requirements.scheme !== SHADOWPASS_SCHEME
    || requirements.network !== `eip155:${deployment.chainId}`
    || !sameAddress(requirements.asset, deployment.token)
    || typeof gate !== "string"
    || !sameAddress(gate, deployment.gate)
    || !requirementsMatch(payment.accepted, requirements)
  ) {
    return invalid("invalid_scheme");
  }

  const parsed = ShadowpassPayloadSchema.safeParse(payment.payload);
  if (!parsed.success || parsed.data.ct.length !== parsed.data.D + 6) return invalid("invalid_payload");
  const payload = parsed.data;
  if (
    typeof payout !== "string"
    || !sameAddress(payout, deployment.payout)
    || typeof method !== "string"
    || !sameAddress(payload.action.target, payout)
    || !sameAddress(payload.action.method, method)
  ) {
    return invalid("wrong_target");
  }
  if (
    BigInt(payload.action.amount) !== BigInt(requirements.amount)
    || BigInt(payload.budget.qSpent) !== BigInt(requirements.amount)
  ) {
    return invalid("amount_mismatch");
  }
  if (payment.resource?.url !== resourceUrl) return invalid("binding_mismatch");
  let decoded: readonly [Address, Hex];
  try {
    decoded = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      payload.action.params as Hex,
    );
  } catch {
    return invalid("binding_mismatch");
  }
  const [payTo, requestHash] = decoded;
  const expectedHash = reqHash({
    network: requirements.network,
    asset: requirements.asset as Address,
    amount: BigInt(requirements.amount),
    payTo: requirements.payTo as Address,
    resource: resourceUrl,
  });
  if (
    !sameAddress(payTo, requirements.payTo)
    || requestHash.toLowerCase() !== expectedHash.toLowerCase()
  ) {
    return invalid("binding_mismatch");
  }

  const nowTs = BigInt(payload.nowTs);
  const chainNow = BigInt(await chainView.blockTimestamp());
  const skew = BigInt(options.clockSkewSeconds ?? 60);
  if (nowTs > chainNow || chainNow - nowTs > skew) {
    return invalid("stale");
  }
  if (!(await chainView.rootsAccepted(payload.roots))) return invalid("invalid_payload");
  if (!(await chainView.isStateRegistered(payload.roots))) return invalid("unknown_state");
  return { isValid: true, payer: "shadowpass-pool" };
}

export class ShadowpassFacilitatorCore {
  readonly scheme = SHADOWPASS_SCHEME;
  readonly caipFamily = "eip155:*";
  private readonly gateClient: GateClient;
  private readonly chainView: PaymentChainView;
  private readonly signers: Address[];
  private readonly clockSkewSeconds: number;
  private readonly lock: NullifierLock;
  private readonly rateLimiter: MerchantRateLimiter;
  private readonly stateRegistrations = new Map<string, Promise<void>>();

  constructor(options: ShadowpassFacilitatorCoreOptions) {
    this.gateClient = options.gateClient;
    this.chainView = options.chainView;
    this.signers = options.signers;
    this.clockSkewSeconds = options.clockSkewSeconds ?? 60;
    this.rateLimiter = new MerchantRateLimiter(
      options.merchantRateLimit ?? { limit: 60, windowMs: 60_000 },
    );
    this.lock = new NullifierLock(options.settlementLockTtlMs ?? 300_000);
  }

  getExtra(_network: Network): undefined {
    return undefined;
  }

  getSigners(_network: string): string[] {
    return [...this.signers];
  }

  async verify(payment: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    const resourceUrl = payment.resource?.url;
    if (!resourceUrl) return invalid("binding_mismatch");
    const checked = await checkPayment(
      payment,
      requirements,
      resourceUrl,
      this.chainView,
      { clockSkewSeconds: await this.effectiveClockSkew() },
    );
    if (!checked.isValid) return checked;
    const parsed = ShadowpassPayloadSchema.parse(payment.payload);
    const started = performance.now();
    try {
      await this.gateClient.simulateExecute(parsed);
    } catch (error) {
      return invalid(`simulation_failed:${revertName(error) ?? "unknown"}`);
    }
    this.lock.markVerified(parsed.budget.budgetNf);
    return {
      isValid: true,
      payer: "shadowpass-pool",
      extra: {
        shadowpass: {
          proofMs: parsed.timings?.proofMs,
          verifyMs: performance.now() - started,
        },
      },
    };
  }

  async settle(payment: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    const resourceUrl = payment.resource?.url;
    if (!resourceUrl) return this.failed("binding_mismatch", requirements.network);
    let checked = await checkPayment(
      payment,
      requirements,
      resourceUrl,
      this.chainView,
      { clockSkewSeconds: await this.effectiveClockSkew() },
    );
    if (checked.invalidReason === "unknown_state") {
      const parsedForState = ShadowpassPayloadSchema.parse(payment.payload);
      await this.ensureStateRegistered(parsedForState.roots);
      checked = await checkPayment(
        payment,
        requirements,
        resourceUrl,
        this.chainView,
        { clockSkewSeconds: await this.effectiveClockSkew() },
      );
    }
    if (!checked.isValid) return this.failed(checked.invalidReason ?? "invalid_payload", requirements.network);

    const parsed = ShadowpassPayloadSchema.parse(payment.payload);
    const token = this.lock.beginSettle(parsed.budget.budgetNf);
    if (!token) return this.failed("nullifier_pending", requirements.network);
    const started = performance.now();
    try {
      await this.gateClient.simulateExecute(parsed);
      if (!this.rateLimiter.allow(requirements.payTo)) {
        this.lock.release(parsed.budget.budgetNf, token);
        return this.failed("merchant_rate_limited", requirements.network);
      }
      const receipt = await this.gateClient.sendExecute(parsed);
      this.lock.settle(parsed.budget.budgetNf, token);
      return {
        success: true,
        transaction: receipt.transaction,
        network: requirements.network,
        payer: "shadowpass-pool",
        amount: requirements.amount,
        extra: {
          shadowpass: {
            proofMs: parsed.timings?.proofMs,
            settleMs: performance.now() - started,
          },
        },
      };
    } catch (error) {
      if (error instanceof TransactionPendingError && this.lock.markPending(
        parsed.budget.budgetNf,
        token,
        error.transaction,
      )) {
        return this.failed("transaction_pending", requirements.network, error.transaction);
      }
      this.lock.release(parsed.budget.budgetNf, token);
      const reason = error instanceof TransactionRevertedError
        ? "transaction_reverted"
        : error instanceof TransactionQueueFullError
          ? "transaction_queue_full"
          : `settlement_failed:${revertName(error) ?? "unknown"}`;
      return this.failed(reason, requirements.network);
    }
  }

  private async ensureStateRegistered(roots: Roots): Promise<void> {
    const key = `${roots.issued}:${roots.revoked}:${roots.root}`;
    const existing = this.stateRegistrations.get(key);
    if (existing) return existing;
    const registration = this.gateClient.registerState(roots).then(() => undefined);
    this.stateRegistrations.set(key, registration);
    try {
      await registration;
    } finally {
      this.stateRegistrations.delete(key);
    }
  }

  private async effectiveClockSkew(): Promise<number> {
    return await this.chainView.clockSkewSeconds?.() ?? this.clockSkewSeconds;
  }

  private failed(errorReason: string, network: Network, transaction = ""): SettleResponse {
    return { success: false, errorReason, transaction, network };
  }
}

export interface ShadowpassFacilitatorConfig {
  publicClient: PublicClient;
  walletClient: WalletClient;
  deployment: Deployment;
  clockSkewSeconds?: number;
  merchantRateLimit?: { limit: number; windowMs: number };
  settlementLockTtlMs?: number;
}

export class ShadowpassFacilitatorScheme
  implements SchemeNetworkFacilitator
{
  readonly scheme = SHADOWPASS_SCHEME;
  readonly caipFamily = "eip155:*";
  private readonly core: ShadowpassFacilitatorCore;

  constructor(config: ShadowpassFacilitatorConfig) {
    const gate = new ViemGateClient(config);
    const address = config.walletClient.account?.address;
    if (!address) throw new Error("wallet_account_missing");
    this.core = new ShadowpassFacilitatorCore({
      gateClient: gate,
      chainView: gate,
      signers: [address],
      clockSkewSeconds: config.clockSkewSeconds,
      merchantRateLimit: config.merchantRateLimit,
      settlementLockTtlMs: config.settlementLockTtlMs,
    });
  }

  getExtra(network: Network): Record<string, unknown> | undefined {
    return this.core.getExtra(network);
  }

  getSigners(network: string): string[] {
    return this.core.getSigners(network);
  }

  verify(payment: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.core.verify(payment, requirements);
  }

  settle(payment: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    return this.core.settle(payment, requirements);
  }
}
