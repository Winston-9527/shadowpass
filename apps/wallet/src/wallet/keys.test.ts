import { describe, expect, it } from "vitest";
import { clearKeyBundle, deriveWalletKeys } from "./keys";

describe("wallet key adapter", () => {
  it("derives deterministic provisional keys when SDK #6 is unavailable", async () => {
    const seed = new Uint8Array(32).fill(4);
    const first = await deriveWalletKeys(seed);
    const second = await deriveWalletKeys(seed);

    expect(first.source).toBe("provisional");
    expect(first.bundle.sign.publicKey).toBe(second.bundle.sign.publicKey);
    expect(first.bundle.view.publicKey).toBe(second.bundle.view.publicKey);
    expect(first.bundle.box.publicKey).not.toBe(first.bundle.sign.publicKey);
  });

  it("zeros in-memory secrets when locking", async () => {
    const { bundle } = await deriveWalletKeys(new Uint8Array(32).fill(9));
    clearKeyBundle(bundle);

    expect(bundle.sign.secret.every((value) => value === 0)).toBe(true);
    expect(bundle.steward.secret.every((value) => value === 0)).toBe(true);
  });
});
