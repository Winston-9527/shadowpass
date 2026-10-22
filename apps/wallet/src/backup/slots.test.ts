import { describe, expect, it } from "vitest";
import { generateSeed } from "../sdk";
import {
  MemoryBackupSlotClient,
  generateRecoveryCode,
  normalizeRecoveryCode,
  restoreSeedFromPasskeySlot,
  restoreSeedFromRecoverySlot,
  writePasskeyBackup,
  writeRecoveryBackup,
} from "./slots";

describe("backup slots", () => {
  it("normalizes Crockford Base32 aliases", () => {
    expect(normalizeRecoveryCode("abcd-efgh-jkmn-pqrs-tvwx")).toBe("ABCDEFGHJKMNPQRSTVWX");
    expect(generateRecoveryCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  });

  it("restores seed from passkey and recovery slots", async () => {
    const client = new MemoryBackupSlotClient();
    const seed = generateSeed();
    const prf = new Uint8Array(32).fill(9);
    const recoveryCode = generateRecoveryCode();

    await writePasskeyBackup(client, "credential-id", prf, seed);
    await writeRecoveryBackup(client, recoveryCode, seed);

    expect(await restoreSeedFromPasskeySlot(client, "credential-id", prf)).toEqual(seed);
    expect(await restoreSeedFromRecoverySlot(client, recoveryCode.toLowerCase())).toEqual(seed);
    expect(await restoreSeedFromRecoverySlot(client, generateRecoveryCode())).toBeNull();
  });
});
