import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryBackupSlotClient } from "../backup/slots";

const PRF = new Uint8Array(32).fill(5);
const { registerPasskey } = vi.hoisted(() => ({
  registerPasskey: vi.fn(async (label: string) => ({
    credentialId: label === "first" ? "credential-first" : "credential-second",
    userId: label === "first" ? "user-first" : "user-second",
    label,
    createdAt: "2026-10-21T00:00:00.000Z",
    prf: new Uint8Array(32).fill(5),
  })),
}));

vi.mock("../passkey/webauthn", () => ({
  registerPasskey,
  authenticatePasskey: vi.fn(async () => ({
    credential: {} as PublicKeyCredential,
    prf: PRF,
  })),
  PrfUnsupportedError: class PrfUnsupportedError extends Error {},
}));

import { getViewSecret, inspectWalletDbForTests, listPasskeys, resetWalletDbForTests } from "../keystore/db";
import { addPasskey, createWallet, lockSession, recoverWallet, unlockWallet } from "./session";

function containsBytes(value: unknown, expected: Uint8Array, seen = new Set<unknown>()): boolean {
  if (value instanceof Uint8Array) {
    return value.length === expected.length && value.every((byte, index) => byte === expected[index]);
  }
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if ("prf" in value) return true;
  return Object.values(value).some((entry) => containsBytes(entry, expected, seen));
}

describe("wallet session", () => {
  beforeEach(async () => {
    await resetWalletDbForTests();
    registerPasskey.mockClear();
  });

  it("never persists PRF output and restores through a second passkey and recovery slot", async () => {
    const client = new MemoryBackupSlotClient();
    const created = await createWallet("first", client);
    const expected = {
      sign: created.session.bundle.sign.Ax,
      steward: created.session.bundle.steward.Ax,
      view: created.session.bundle.view.vpk.x,
      box: created.session.bundle.box.publicKey,
    };

    const rows = await inspectWalletDbForTests();
    expect(rows.some((row) => containsBytes(row, PRF))).toBe(false);

    const [firstPasskey] = await listPasskeys();
    const unlocked = await unlockWallet(firstPasskey!, client);
    expect(unlocked.bundle.sign.Ax).toBe(expected.sign);

    const second = await addPasskey(created.session, "second", client);
    expect(registerPasskey).toHaveBeenCalledWith("second", ["credential-first"]);
    const unlockedSecond = await unlockWallet(second, client);
    expect(unlockedSecond.bundle.view.vpk.x).toBe(expected.view);

    await resetWalletDbForTests();
    const recovered = await recoverWallet(created.recoveryCode, client);
    expect(recovered.bundle.steward.Ax).toBe(expected.steward);
    expect(recovered.bundle.box.publicKey).toEqual(expected.box);

    lockSession(created.session);
    expect(created.session.seed.every((value) => value === 0)).toBe(true);
  });

  it("does not mark the wallet created when backup slot write fails", async () => {
    const failing = new MemoryBackupSlotClient();
    failing.write = async () => { throw new Error("slot unavailable"); };

    await expect(createWallet("first", failing)).rejects.toThrow("backup slot write failed");
    expect(await listPasskeys()).toHaveLength(0);
    expect(await getViewSecret()).toBeUndefined();
  });
});
