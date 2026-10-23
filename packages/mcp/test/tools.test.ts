import { ChainState, createNote, MailboxClient, MerkleTree, noteCm } from "@shadowpass/sdk";
import { describe, expect, it, vi } from "vitest";
import { delegate, listReceipts, pay, treasurySupply, walletStatus } from "../src/tools.js";
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
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const status = await walletStatus(context(fixture));
    expect(status.status).toBe("active");
    expect(status.capabilities).toEqual(["PAY", "TREASURY"]);
    expect(status.remainingBudget).toBe("80");
    expect(status.stateRegistered).toBe(true);
  });

  it("rejects a treasury call locally for a PAY-only agent without touching the backend", async () => {
    const fixture = await createFixture({ cap: 1n });
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
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
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
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
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
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
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    await expect(pay(context(fixture), { url: "https://merchant.test/report", maxAmount: 1n })).rejects.toMatchObject({
      code: "payment_backend_unavailable",
    });
  });

  it("counts only notes from the currently pinned credential lineage", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const foreign = createNote(fixture.store.holder, 900n, [123n, 456n]);
    await fixture.store.addNote({
      own: [foreign.own[0].toString(), foreign.own[1].toString()],
      q: foreign.q.toString(),
      lin: foreign.lin.map(String) as typeof fixture.bundle.note.lin,
      rho: foreign.rho.toString(),
    });
    const noteTree = new MerkleTree([noteCm(fixture.note), noteCm(foreign)]);
    const state = ChainState.fromLogs(deployment, [
      ...fixture.logs,
      { eventName: "NoteInserted", args: { cm: noteCm(foreign), index: 1, root: noteTree.root }, blockNumber: 2n, logIndex: 0 },
    ]);
    const status = await walletStatus(context(fixture, { state }));
    expect(status.remainingBudget).toBe("80");
  });

  it("rejects delegation capabilities and amounts beyond the parent before calling the backend", async () => {
    const fixture = await createFixture({ rootCap: 1n, agentCap: 3n, noteQ: 10n });
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const delegateBackend = vi.fn();
    const services = { delegate: { delegate: delegateBackend } };
    await expect(delegate(context(fixture, { services }), {
      name: "child",
      cap: 2n,
      expiry: 2_000n,
      amount: 1n,
    })).rejects.toMatchObject({ code: "capability_mismatch" });
    await expect(delegate(context(fixture, { services }), {
      name: "child",
      cap: 1n,
      expiry: 2_000n,
      amount: 11n,
    })).rejects.toMatchObject({ code: "insufficient_budget" });
    expect(delegateBackend).not.toHaveBeenCalled();
  });

  it("passes a delegation request to the backend only after local checks", async () => {
    const fixture = await createFixture({ noteQ: 10n });
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const result = { parent: fixture.c1.hash.toString(), cert: fixture.bundle.chain[1]!, pairingCode: "code" };
    const delegateBackend = vi.fn(async () => result);
    await expect(delegate(context(fixture, { services: { delegate: { delegate: delegateBackend } } }), {
      name: "child",
      cap: 1n,
      expiry: 2_000n,
      amount: 5n,
    })).resolves.toEqual(result);
    expect(delegateBackend).toHaveBeenCalledOnce();
  });
});
