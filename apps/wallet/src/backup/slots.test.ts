import { describe, expect, it, vi } from "vitest";
import { generateSeed, recoveryWrap } from "../sdk";
import { bytesToBase64 } from "../lib/bytes";
import {
  HttpBackupSlotClient,
  MemoryBackupSlotClient,
  defaultBackupSlotClient,
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

  it("uses /slot pagination and skips garbage before a valid recovery envelope", async () => {
    const seed = generateSeed();
    const code = generateRecoveryCode();
    const valid = bytesToBase64(await recoveryWrap(normalizeRecoveryCode(code), seed));
    const garbage = bytesToBase64(Uint8Array.of(1, 2, 3));
    const pages = [
      Array.from({ length: 200 }, (_, index) => ({ id: index + 1, ct: garbage, ts: index })),
      [{ id: 201, ct: valid, ts: 201 }],
    ];
    const urls: string[] = [];
    const client = new HttpBackupSlotClient("http://mailbox.test", async (input) => {
      urls.push(String(input));
      const page = pages.shift();
      if (!page) throw new Error("unexpected page");
      return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
    });

    expect(await restoreSeedFromRecoverySlot(client, code)).toEqual(seed);
    expect(urls[0]).toContain("/slot/");
    expect(urls[0]).toContain("after=0");
    expect(urls[1]).toContain("after=200");
  });

  it("refuses to create a client without a configured mailbox", () => {
    vi.stubEnv("VITE_MAILBOX_URL", "");
    expect(() => defaultBackupSlotClient()).toThrow("VITE_MAILBOX_URL");
    vi.unstubAllEnvs();
  });
});
