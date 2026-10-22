import type { BoxKeyPair, MailboxClient } from "@shadowpass/sdk";
import { describe, expect, it } from "vitest";
import { CredentialInbox } from "../src/inbox.js";
import { createFixture, deployment } from "./fixtures.js";

describe("CredentialInbox", () => {
  it("accepts a valid bundle, skips malformed entries and advances the cursor", async () => {
    const fixture = await createFixture();
    const mailbox = {
      async poll(_keyPair: BoxKeyPair, after: number) {
        if (after >= 2) return [];
        return [
          { id: 1, ct: "valid", decoded: true, value: fixture.encodedBundle },
          { id: 2, ct: "bad", decoded: false, error: "cannot decrypt" },
        ];
      },
    } as unknown as MailboxClient;
    const result = await new CredentialInbox({
      mailbox,
      store: fixture.store,
      state: fixture.state,
      deploymentName: "anvil",
      chainId: deployment.chainId,
    }).sync();
    expect(result).toMatchObject({ accepted: 1, rejected: 1, cursor: 2 });
    expect(await fixture.store.loadBundle()).toEqual(fixture.bundle);
    expect(fixture.store.mailboxCursor).toBe(2);
  });
});
