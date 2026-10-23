import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getViewSecret, getWalletState, getWrapper, listPasskeys, resetWalletDbForTests, savePasskey, saveViewSecret, saveWalletState, saveWrapper } from "./db";

describe("wallet IndexedDB", () => {
  beforeEach(async () => {
    await resetWalletDbForTests();
  });

  it("stores passkey metadata, wrappers and the view key", async () => {
    await savePasskey({ credentialId: "credential-1", userId: "user-1", label: "Mac Touch ID", createdAt: "2026-10-21T00:00:00.000Z" });
    await saveWrapper({
      id: "passkey:credential-1",
      kind: "passkey",
      credentialId: "credential-1",
      createdAt: "2026-10-21T00:00:00.000Z",
      wrapped: Uint8Array.from([1, 2, 3]),
    });
    await saveViewSecret(Uint8Array.from([1, 2, 3]));
    await saveWalletState("ledger:test", { amount: "100" });

    expect(await listPasskeys()).toHaveLength(1);
    expect(await getWrapper("passkey:credential-1")).toMatchObject({ kind: "passkey" });
    expect(await getViewSecret()).toEqual(Uint8Array.from([1, 2, 3]));
    expect(await getWalletState("ledger:test")).toEqual({ amount: "100" });
  });
});
