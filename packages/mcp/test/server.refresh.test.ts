import type { BoxKeyPair, MailboxClient } from "@shadowpass/sdk";
import { describe, expect, it } from "vitest";
import { createRuntime, refreshRuntime } from "../src/server.js";
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
    const runtime = await createRuntime({
      name: "buyer",
      root: fixture.root,
      network: "anvil",
      deployment,
      state: fixture.state,
      mailbox,
      refreshState: async () => revokedState(fixture),
    });
    expect((await walletStatus(runtime.context)).status).toBe("active");
    await refreshRuntime(runtime);
    const status = await walletStatus(runtime.context);
    expect(status.status).toBe("revoked");
    expect(status.validationErrors).toContain("certificate_revoked");
  });
});
