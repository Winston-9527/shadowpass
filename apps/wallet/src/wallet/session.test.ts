import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PRF = new Uint8Array(32).fill(5);

vi.mock("../passkey/webauthn", () => ({
  registerPasskey: vi.fn(async (label: string, userId?: string) => ({
    credentialId: label === "first" ? "credential-first" : "credential-second",
    userId: userId ?? "user-1",
    label,
    createdAt: "2026-10-21T00:00:00.000Z",
    prf: PRF,
  })),
  authenticatePasskey: vi.fn(async () => ({
    credential: {} as PublicKeyCredential,
    prf: PRF,
  })),
  PrfUnsupportedError: class PrfUnsupportedError extends Error {},
}));

import { getViewSecret, listPasskeys, resetWalletDbForTests } from "../keystore/db";
import { addPasskey, createWallet, lockSession, recoverWallet, unlockWallet } from "./session";

describe("wallet session", () => {
  beforeEach(async () => {
    await resetWalletDbForTests();
  });

  it("restores the same public keys through a second passkey and recovery code", async () => {
    const created = await createWallet("first");
    const expected = {
      sign: created.session.bundle.sign.publicKey,
      steward: created.session.bundle.steward.publicKey,
      view: created.session.bundle.view.publicKey,
      box: created.session.bundle.box.publicKey,
    };
    expect(await getViewSecret()).toEqual(created.session.bundle.view.secret);

    const [firstPasskey] = await listPasskeys();
    expect(firstPasskey).toBeDefined();
    const unlocked = await unlockWallet(firstPasskey!);
    expect(unlocked.bundle.sign.publicKey).toBe(expected.sign);

    const second = await addPasskey(created.session, "second");
    expect(await listPasskeys()).toHaveLength(2);
    const unlockedSecond = await unlockWallet(second);
    expect(unlockedSecond.bundle.view.publicKey).toBe(expected.view);

    await resetWalletDbForTests();
    const recovered = await recoverWallet(created.recoveryCode);
    expect(recovered.bundle.steward.publicKey).toBe(expected.steward);
    expect(recovered.bundle.box.publicKey).toBe(expected.box);

    lockSession(created.session);
    expect(created.session.seed.every((value) => value === 0)).toBe(true);
  });
});
