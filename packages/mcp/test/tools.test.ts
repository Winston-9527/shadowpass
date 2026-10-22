import { MailboxClient } from "@shadowpass/sdk";
import { describe, expect, it, vi } from "vitest";
import { listReceipts, pay, treasurySupply, walletStatus } from "../src/tools.js";
import type { McpToolContext } from "../src/tools.js";
import { createFixture, deployment } from "./fixtures.js";

function context(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Partial<McpToolContext> = {},
): McpToolContext {
  return {
    store: fixture.store,
    state: fixture.state,
    deploymentName: "anvil",
    chainId: deployment.chainId,
    services: {},
    malicious: false,
    maxPayment: 1_000n,
    nowSeconds: 1_000n,
    ...overrides,
  };
}

describe("MCP tools", () => {
  it("reports capabilities and remaining budget", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle);
    const status = await walletStatus(context(fixture));
    expect(status.status).toBe("active");
    expect(status.capabilities).toEqual(["PAY", "TREASURY"]);
    expect(status.remainingBudget).toBe("80");
    expect(status.stateRegistered).toBe(true);
  });

  it("rejects a treasury call locally for a PAY-only agent without touching the backend", async () => {
    const fixture = await createFixture({ cap: 1n });
    await fixture.store.saveBundle(fixture.bundle);
    const supply = vi.fn();
    await expect(treasurySupply(context(fixture, { services: { treasury: { supply, status: async () => ({}) } } }), {
      vault: deployment.vault,
      amount: 1n,
      termSeconds: 60n,
    })).rejects.toMatchObject({ code: "capability_mismatch" });
    expect(supply).not.toHaveBeenCalled();
  });

  it("records a successful payment and reports the receipt to the owner", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle);
    const bodies: unknown[] = [];
    const mailbox = new MailboxClient("http://mailbox.test", {
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: 1 }), { status: 201, headers: { "content-type": "application/json" } });
      },
    });
    const result = await pay(context(fixture, {
      mailbox,
      services: {
        payment: {
          pay: async () => ({ budgetNf: "7", tx: "0xabc", resource: "https://merchant.test/report", amount: "20" }),
        },
      },
    }), { url: "https://merchant.test/report", maxAmount: 20n });
    expect(result).toMatchObject({ budgetNf: "7", receiptReported: true });
    expect(bodies).toHaveLength(1);
    expect(await listReceipts(context(fixture))).toEqual([
      expect.objectContaining({ budgetNf: "7", tx: "0xabc", reported: true }),
    ]);
  });

  it("keeps a local receipt but does not report it in malicious mode", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle);
    const mailbox = new MailboxClient("http://mailbox.test", {
      fetch: async () => {
        throw new Error("mailbox must not be called");
      },
    });
    const result = await pay(context(fixture, {
      mailbox,
      malicious: true,
      services: {
        payment: {
          pay: async () => ({ budgetNf: "8", tx: "0xdef", resource: "https://merchant.test/report", amount: "10" }),
        },
      },
    }), { url: "https://merchant.test/report", maxAmount: 10n });
    expect(result).toMatchObject({ receiptReported: false });
    expect(await listReceipts(context(fixture))).toEqual([
      expect.objectContaining({ budgetNf: "8", reported: false }),
    ]);
  });

  it("fails closed when the payment backend is not configured", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle);
    await expect(pay(context(fixture), { url: "https://merchant.test/report", maxAmount: 1n })).rejects.toMatchObject({
      code: "payment_backend_unavailable",
    });
  });
});
