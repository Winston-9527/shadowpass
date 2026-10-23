import {
  budgetNullifier,
  ctxHash,
  decodeNoteMemo,
  noteCm,
} from "@shadowpass/sdk";
import type { Hex } from "@shadowpass/sdk";
import { PAY_METHOD, ShadowpassPayloadSchema } from "@shadowpass/x402";
import { describe, expect, it, vi } from "vitest";
import {
  ShadowpassAgentPaymentBuilder,
  type PaymentProofResult,
  type PaymentProver,
} from "../src/payment-builder.js";
import { createFixture, deployment } from "./fixtures.js";

type PaymentRequirements = Parameters<ShadowpassAgentPaymentBuilder["buildPayment"]>[0];

const MERCHANT = "0x000000000000000000000000000000000000cafe" as const;
const RESOURCE = "https://merchant.test/report";

function requirements(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "shadowpass",
    network: `eip155:${deployment.chainId}`,
    asset: deployment.token,
    amount: "20",
    payTo: MERCHANT,
    maxTimeoutSeconds: 120,
    extra: {
      gate: deployment.gate,
      payout: deployment.payout,
      method: PAY_METHOD,
    },
    ...overrides,
  };
}

function fakeProof(): PaymentProofResult {
  return {
    proof: {
      pi_a: ["1", "2"],
      pi_b: [["3", "4"], ["5", "6"]],
      pi_c: ["7", "8"],
    },
    publicSignals: [],
    artifacts: {},
  };
}

function deterministicRandom(): (bound: bigint) => bigint {
  let next = 1n;
  return (bound) => {
    if (bound <= 1n) throw new Error("invalid bound");
    if (next >= bound) next = 1n;
    return next++;
  };
}

describe("ShadowpassAgentPaymentBuilder", () => {
  it("builds a locally verified D2 payment with a bound change memo", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    let witnessInput: Record<string, unknown> | undefined;
    const prover: PaymentProver = {
      async prove(circuit, input) {
        expect(circuit).toBe("main_d2");
        witnessInput = input;
        return fakeProof();
      },
      async verify(result) {
        expect(result.proof.pi_a).toEqual(["1", "2"]);
        return true;
      },
    };
    const builder = new ShadowpassAgentPaymentBuilder({
      store: fixture.store,
      deployment,
      state: fixture.state,
      blockTimestamp: async () => 1_234n,
      maxAmount: 20n,
      prover,
      randomScalar: deterministicRandom(),
    });
    const paymentRequirements = requirements();
    const payload = await builder.buildPayment(paymentRequirements, RESOURCE);

    expect(ShadowpassPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload).toMatchObject({
      D: 2,
      nowTs: "1234",
      budget: { qSpent: "20" },
    });
    expect(payload.ct).toHaveLength(8);
    expect(payload.proof).toEqual({ a: ["1", "2"], b: [["4", "3"], ["6", "5"]], c: ["7", "8"] });
    const change = await decodeNoteMemo(payload.memoChange, fixture.store.boxPrivateKey);
    expect(change).not.toBeNull();
    expect(change?.q).toBe(60n);
    expect(noteCm(change!).toString()).toBe(payload.budget.cmChange);
    expect(budgetNullifier(fixture.store.holder.sk, fixture.note).toString()).toBe(payload.budget.budgetNf);
    expect(payload.roots).toEqual({
      issued: fixture.state.issued.root.toString(),
      revoked: fixture.state.revoked.root.toString(),
      root: fixture.state.rootTree.root.toString(),
    });
    const expectedContext = ctxHash({
      chainId: deployment.chainId,
      gate: deployment.gate,
      action: {
        target: deployment.payout,
        method: PAY_METHOD,
        amount: 20n,
        nonce: BigInt(payload.action.nonce),
        params: payload.action.params as Hex,
      },
      memoChange: payload.memoChange as Hex,
    });
    expect(witnessInput).toMatchObject({
      ctx_hash: expectedContext.toString(),
      budget_nf: payload.budget.budgetNf,
      cm_change: payload.budget.cmChange,
      q_spent: "20",
    });
    expect(builder.lastBuiltPayment?.payload).toEqual(payload);
    expect(payload.timings?.proofMs).toBeGreaterThanOrEqual(0);
  });

  it("does not return a payment when local proof verification fails", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const builder = new ShadowpassAgentPaymentBuilder({
      store: fixture.store,
      deployment,
      state: fixture.state,
      blockTimestamp: async () => 1_234n,
      maxAmount: 20n,
      prover: {
        async prove() { return fakeProof(); },
        async verify() { return false; },
      },
      randomScalar: deterministicRandom(),
    });
    await expect(builder.buildPayment(requirements(), RESOURCE)).rejects.toMatchObject({
      code: "proof_verification_failed",
    });
    expect(builder.lastBuiltPayment).toBeUndefined();
  });

  it("keeps change rho in the SDK 250-bit range across hundreds of CSPRNG runs", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const builder = new ShadowpassAgentPaymentBuilder({
      store: fixture.store,
      deployment,
      state: fixture.state,
      blockTimestamp: async () => 1_234n,
      maxAmount: 20n,
      prover: {
        async prove() { return fakeProof(); },
        async verify() { return true; },
      },
    });
    for (let index = 0; index < 200; index += 1) {
      const payload = await builder.buildPayment(requirements(), RESOURCE);
      const change = await decodeNoteMemo(payload.memoChange, fixture.store.boxPrivateKey);
      expect(change).not.toBeNull();
      expect(change!.rho).toBeLessThan(1n << 250n);
      expect(noteCm(change!).toString()).toBe(payload.budget.cmChange);
      expect(builder.lastBuiltPayment?.change).toEqual(change);
    }
  }, 15_000);

  it("rejects wrong assets and insufficient notes before proof generation", async () => {
    const fixture = await createFixture({ noteQ: 10n });
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const prove = vi.fn();
    const builder = new ShadowpassAgentPaymentBuilder({
      store: fixture.store,
      deployment,
      state: fixture.state,
      blockTimestamp: async () => 1_234n,
      maxAmount: 20n,
      prover: { prove, async verify() { return true; } },
      randomScalar: deterministicRandom(),
    });
    await expect(builder.buildPayment(requirements({
      asset: "0x0000000000000000000000000000000000000bad",
    }), RESOURCE)).rejects.toMatchObject({ code: "payment_asset_mismatch" });
    await expect(builder.buildPayment(requirements(), RESOURCE)).rejects.toMatchObject({ code: "insufficient_budget" });
    expect(prove).not.toHaveBeenCalled();
  });
});
