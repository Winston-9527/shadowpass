import { assembleShadowpassPayload, PAY_METHOD } from "@shadowpass/x402";
import { describe, expect, it, vi } from "vitest";
import { ShadowpassPaymentService, type McpPaymentBuilder } from "../src/payment.js";
import { createFixture, deployment } from "./fixtures.js";

const MERCHANT = "0x000000000000000000000000000000000000cafe" as const;
const RESOURCE = "https://merchant.test/report";
const TX = `0x${"11".repeat(32)}` as const;

function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function paymentRequired(amount = "20") {
  return {
    x402Version: 2 as const,
    resource: { url: RESOURCE },
    accepts: [{
      scheme: "shadowpass",
      network: `eip155:${deployment.chainId}`,
      asset: deployment.token,
      amount,
      payTo: MERCHANT,
      maxTimeoutSeconds: 120,
      extra: {
        gate: deployment.gate,
        payout: deployment.payout,
        method: PAY_METHOD,
      },
    }],
  };
}

describe("ShadowpassPaymentService", () => {
  it("runs the official x402 402 -> payment -> 200 flow and returns settlement data", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    let requestCount = 0;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Response(null, {
          status: 402,
          headers: { "PAYMENT-REQUIRED": encodeHeader(paymentRequired()) },
        });
      }
      return new Response(JSON.stringify({ report: "paid" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "PAYMENT-RESPONSE": encodeHeader({
            success: true,
            transaction: TX,
            network: `eip155:${deployment.chainId}`,
            payer: "shadowpass-pool",
            amount: "20",
          }),
        },
      });
    }) as unknown as typeof fetch;

    const builderFactory = (): McpPaymentBuilder => {
      let lastBuiltPayment: McpPaymentBuilder["lastBuiltPayment"];
      return {
        get lastBuiltPayment() { return lastBuiltPayment; },
        async buildPayment(requirements, resourceUrl) {
          const payload = assembleShadowpassPayload({
            requirements,
            resourceUrl,
            proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
            roots: { issued: "11", revoked: "12", root: "13" },
            nowTs: 1_234,
            nonce: "42",
            ct: ["1", "2", "3", "4", "5", "6", "7", "8"],
            budget: { noteRoot: "21", budgetNf: "22", cmChange: "23", qSpent: requirements.amount },
            memoChange: "0x01",
          });
          lastBuiltPayment = { payload, note: fixture.note, budgetNf: 22n };
          return payload;
        },
      };
    };
    const service = new ShadowpassPaymentService({
      store: fixture.store,
      deployment,
      state: () => fixture.state,
      maxPayment: 100n,
      fetch: fetchImpl,
      builderFactory,
    });
    await expect(service.pay({ url: RESOURCE, maxAmount: 20n })).resolves.toEqual({
      budgetNf: "22",
      tx: TX,
      resource: RESOURCE,
      amount: "20",
    });
    expect(requestCount).toBe(2);
    expect(fixture.state.spentNullifiers.has("22")).toBe(true);
  });

  it("rejects an amount above the local cap before generating a proof or paying", async () => {
    const fixture = await createFixture();
    const buildPayment = vi.fn<McpPaymentBuilder["buildPayment"]>();
    const builderFactory = (): McpPaymentBuilder => ({ buildPayment });
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 402,
      headers: { "PAYMENT-REQUIRED": encodeHeader(paymentRequired("20")) },
    })) as unknown as typeof fetch;
    const service = new ShadowpassPaymentService({
      store: fixture.store,
      deployment,
      state: () => fixture.state,
      maxPayment: 100n,
      fetch: fetchImpl,
      builderFactory,
    });
    await expect(service.pay({ url: RESOURCE, maxAmount: 10n })).rejects.toMatchObject({ code: "spend_limit" });
    expect(buildPayment).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
