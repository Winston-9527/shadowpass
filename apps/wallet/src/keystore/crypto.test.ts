import { describe, expect, it } from "vitest";
import {
  createRecoveryBackup,
  generateSeed,
  recoverSeedFromBackup,
  unwrapSeed,
  wrapSeed,
} from "./crypto";

describe("seed wrapping", () => {
  it("unwraps the same seed with the same PRF output", async () => {
    const seed = generateSeed();
    const prf = new Uint8Array(32).fill(7);
    const wrapped = await wrapSeed(seed, prf);

    expect(await unwrapSeed(wrapped, prf)).toEqual(seed);
  });

  it("rejects a different PRF output", async () => {
    const wrapped = await wrapSeed(generateSeed(), new Uint8Array(32).fill(7));

    await expect(unwrapSeed(wrapped, new Uint8Array(32).fill(8))).rejects.toThrow();
  });

  it("rejects a tampered ciphertext", async () => {
    const prf = new Uint8Array(32).fill(3);
    const wrapped = await wrapSeed(generateSeed(), prf);
    const bytes = Uint8Array.from(atob(wrapped.ciphertext), (char) => char.charCodeAt(0));
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    wrapped.ciphertext = btoa(String.fromCharCode(...bytes));

    await expect(unwrapSeed(wrapped, prf)).rejects.toThrow();
  });

  it("round-trips through a self-contained recovery code", async () => {
    const seed = generateSeed();
    const code = await createRecoveryBackup(seed);

    expect(code.startsWith("SP1-")).toBe(true);
    expect(await recoverSeedFromBackup(code)).toEqual(seed);
    const midpoint = Math.floor(code.length / 2);
    const replacement = code[midpoint] === "A" ? "B" : "A";
    await expect(recoverSeedFromBackup(`${code.slice(0, midpoint)}${replacement}${code.slice(midpoint + 1)}`)).rejects.toThrow();
  });
});
