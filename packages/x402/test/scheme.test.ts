import { describe, expect, it } from "vitest";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  assembleShadowpassPayload,
  MerchantRateLimiter,
  ShadowpassFacilitator,
  ShadowpassServer,
  type GateClient,
} from "../src/index.js";

const NETWORK = "eip155:84532" as const;
const ASSET = "0x0000000000000000000000000000000000000a55" as const;
const GATE = "0x0000000000000000000000000000000000000aa1" as const;
const PAYOUT = "0x000000000000000000000000000000000000beef" as const;
const TX = `0x${"11".repeat(32)}` as const;

function requirements(): PaymentRequirements {
  return {
    scheme: "shadowpass",
    network: NETWORK,
    asset: ASSET,
    amount: "2000000",
    payTo: PAYOUT,
    maxTimeoutSeconds: 60,
    extra: { gate: GATE, payout: PAYOUT },
  };
}

function payment(memoChange: `0x${string}` = "0x01", budgetNf = "22"): PaymentPayload {
  const req = requirements();
  const payload = assembleShadowpassPayload({
    requirements: req,
    resourceUrl: "https://merchant.example/report",
    proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
    roots: { issued: "11", revoked: "12", root: "13" },
    nowTs: 1_000,
    nonce: "9",
    ct: ["1", "2", "3", "4", "5", "6", "7", "8"],
    budget: { noteRoot: "21", budgetNf, cmChange: "23", qSpent: "2000000" },
    memoChange,
  });
  return {
    x402Version: 2,
    resource: { url: "https://merchant.example/report" },
    accepted: req,
    payload: payload as unknown as Record<string, unknown>,
  };
}

function gateClient(): GateClient & { simulated: string[] } {
  const simulated: string[] = [];
  return {
    simulated,
    async simulateExecute(request) {
      if (request.memoChange !== "0x01") throw new Error("memo binding mismatch");
      simulated.push(request.memoChange);
    },
    async sendExecute() {
      return TX;
    },
    async waitForConfirmation() {},
  };
}

describe("shadowpass scheme", () => {
  it("parses fixed-decimal USDC prices", async () => {
    const server = new ShadowpassServer({ asset: ASSET, gate: GATE, payout: PAYOUT });
    await expect(server.parsePrice("$2.00", NETWORK)).resolves.toEqual({
      amount: "2000000",
      asset: ASSET,
    });
    await expect(server.parsePrice("0.5", NETWORK)).resolves.toEqual({
      amount: "500000",
      asset: ASSET,
    });
    expect(server.paymentFlows.default).toEqual({ supported: ["upfront"], default: "upfront" });
  });

  it("passes memoChange to Gate simulation and rejects tampering", async () => {
    const gate = gateClient();
    const facilitator = new ShadowpassFacilitator({
      gateClient: gate,
      signers: [PAYOUT],
      now: () => 1_000,
    });
    await expect(facilitator.verify(payment(), requirements())).resolves.toMatchObject({ isValid: true });
    expect(gate.simulated).toEqual(["0x01"]);
    const tampered = payment("0x02", "23");
    await expect(facilitator.verify(tampered, requirements())).resolves.toMatchObject({
      isValid: false,
      invalidReason: "simulation_failed",
    });
  });

  it("serializes a nullifier and rejects replay", async () => {
    const gate = gateClient();
    const facilitator = new ShadowpassFacilitator({
      gateClient: gate,
      signers: [PAYOUT],
      now: () => 1_000,
    });
    const payload = payment();
    const [first, second] = await Promise.all([
      facilitator.verify(payload, requirements()),
      facilitator.verify(payload, requirements()),
    ]);
    expect([first.isValid, second.isValid].filter(Boolean)).toHaveLength(1);
    const settled = await facilitator.settle(payload, requirements());
    expect(settled).toMatchObject({ success: true, transaction: TX });
    await expect(facilitator.verify(payload, requirements())).resolves.toMatchObject({
      isValid: false,
      invalidReason: "nullifier_spent",
    });
  });

  it("rejects mismatched D/ct and stale timestamps", async () => {
    const facilitator = new ShadowpassFacilitator({
      gateClient: gateClient(),
      signers: [PAYOUT],
      now: () => 1_000,
    });
    const wrongLength = payment();
    (wrongLength.payload as any).ct = ["1"];
    await expect(facilitator.verify(wrongLength, requirements())).resolves.toMatchObject({
      isValid: false,
      invalidReason: "invalid_payload",
    });
    const stale = payment();
    (stale.payload as any).nowTs = "1";
    await expect(facilitator.verify(stale, requirements())).resolves.toMatchObject({
      isValid: false,
      invalidReason: "invalid_payload",
    });
  });

  it("rate limits per merchant", () => {
    const limiter = new MerchantRateLimiter({ limit: 2, windowMs: 1_000 });
    expect(limiter.allow("merchant-a", 0)).toBe(true);
    expect(limiter.allow("merchant-a", 1)).toBe(true);
    expect(limiter.allow("merchant-a", 2)).toBe(false);
    expect(limiter.allow("merchant-b", 2)).toBe(true);
    expect(limiter.allow("merchant-a", 1_001)).toBe(true);
  });
});
