import { describe, expect, it } from "vitest";
import { bytesToHex } from "../lib/bytes";
import { clearKeyBundle, deriveWalletKeys, publicKeyText } from "./keys";

describe("wallet key adapter", () => {
  it("derives SDK KeySet values and only exposes public key text", async () => {
    const seed = new Uint8Array(32).fill(4);
    const bundle = await deriveWalletKeys(seed);
    const privateHex = bytesToHex(bundle.sign.prv);

    expect(publicKeyText(bundle, "sign")).not.toContain(privateHex);
    expect(publicKeyText(bundle, "view")).toBe(
      `0x${bundle.view.vpk.x.toString(16).padStart(64, "0")}${bundle.view.vpk.y.toString(16).padStart(64, "0")}`,
    );
    expect(publicKeyText(bundle, "box")).toBe(bytesToHex(bundle.box.publicKey));
  });

  it("zeros every byte-backed secret when locking", async () => {
    const bundle = await deriveWalletKeys(new Uint8Array(32).fill(9));
    clearKeyBundle(bundle);

    expect(bundle.seed.every((value) => value === 0)).toBe(true);
    expect(bundle.sign.prv.every((value) => value === 0)).toBe(true);
    expect(bundle.steward.prv.every((value) => value === 0)).toBe(true);
    expect(bundle.box.privateKey.every((value) => value === 0)).toBe(true);
    expect(bundle.sign.sk).toBe(0n);
    expect(bundle.view.vsk).toBe(0n);
  });
});
