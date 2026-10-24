import type { BoxKeyPair, MailboxClient } from "@shadowpass/sdk";
import { describe, expect, it, vi } from "vitest";
import { createChainLogClient, createRuntime, refreshRuntime } from "../src/server.js";
import { walletStatus } from "../src/tools.js";
import { createFixture, deployment, revokedState } from "./fixtures.js";

describe("runtime refresh", () => {
  it("reloads chain state before a tool runs and observes a later revocation", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const mailbox = {
      async poll(_keyPair: BoxKeyPair, _after: number) {
        return [];
      },
    } as unknown as MailboxClient;
    let refreshes = 0;
    const runtime = await createRuntime({
      name: "buyer",
      root: fixture.root,
      network: "anvil",
      deployment,
      state: fixture.state,
      mailbox,
      refreshState: async () => {
        refreshes += 1;
        return revokedState(fixture);
      },
    });
    expect(runtime.services.payment).toBeDefined();
    expect((await walletStatus(runtime.context)).status).toBe("active");
    await refreshRuntime(runtime);
    const status = await walletStatus(runtime.context);
    expect(status.status).toBe("revoked");
    expect(status.validationErrors).toContain("certificate_revoked");
    await refreshRuntime(runtime);
    expect(refreshes).toBe(1);
  });

  it("honors SHADOWPASS_MAILBOX over an empty deployment mailbox", async () => {
    const fixture = await createFixture();
    vi.stubEnv("SHADOWPASS_MAILBOX", "http://127.0.0.1:8787");
    try {
      const runtime = await createRuntime({
        name: "buyer",
        root: fixture.root,
        network: "anvil",
        deployment: { ...deployment, mailbox: "" },
      });
      expect(runtime.mailbox?.baseUrl).toBe("http://127.0.0.1:8787");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("passes topics through the raw eth_getLogs request", async () => {
    let captured: unknown;
    const client = {
      async request(args: unknown) {
        captured = args;
        return [];
      },
      async getBlockNumber() { return 2n; },
    } as any;
    const logs = createChainLogClient(client);
    const topics = [`0x${"11".repeat(32)}`] as const;
    await logs.getLogs({ address: [deployment.gate], fromBlock: 1n, toBlock: 2n, topics });
    expect(captured).toEqual({
      method: "eth_getLogs",
      params: [{
        address: [deployment.gate],
        fromBlock: "0x1",
        toBlock: "0x2",
        topics,
      }],
    });
  });
});
