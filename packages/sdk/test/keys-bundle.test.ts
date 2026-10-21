import { describe, expect, it } from "vitest";
import { identity as referenceIdentity } from "@shadowpass/circuits/world";
import { decodeBundle, encodeBundle } from "../src/bundle.js";
import { deriveKeys, identityFromPrv, recoveryUnwrap, recoveryWrap, unwrapSeed, wrapSeed } from "../src/keys.js";
import type { CertificateBundle } from "../src/types.js";

describe("keys and bundles", () => {
  it("derives the same EdDSA identity as the reference world", async () => {
    const prv = Uint8Array.from({ length: 32 }, (_, index) => index);
    const expected = referenceIdentity(prv);
    const actual = identityFromPrv(prv);
    expect(actual.Ax).toBe(expected.Ax);
    expect(actual.Ay).toBe(expected.Ay);
    expect(actual.sk).toBe(expected.sk);
  });

  it("derives all keys deterministically and wraps the seed", async () => {
    const seed = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const first = await deriveKeys(seed);
    const second = await deriveKeys(seed);
    expect(first.sign.Ax).toBe(second.sign.Ax);
    expect(first.view.vsk).toBe(second.view.vsk);
    expect(first.box.publicKey).toEqual(second.box.publicKey);

    const prf = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
    const wrapped = await wrapSeed(prf, seed);
    expect(await unwrapSeed(prf, wrapped)).toEqual(seed);
    const recovery = await recoveryWrap("correct horse battery staple", seed);
    expect(await recoveryUnwrap("correct horse battery staple", recovery)).toEqual(seed);
  });

  it("round-trips a certificate bundle", () => {
    const bundle: CertificateBundle = {
      v: 1,
      chainId: 84532,
      deployment: "base-sepolia",
      chain: [
        {
          hop: 0,
          issuer: { x: "1", y: "2" },
          holder: { x: "3", y: "4" },
          cap: "3",
          expiry: "100",
          sig: { S: "5", R8x: "6", R8y: "7" },
          vpk: { x: "8", y: "9" },
          ownW: { x: "10", y: "11" },
          hash: "12",
        },
      ],
      note: { own: ["3", "4"], q: "50", lin: ["12", "0", "0", "0"], rho: "13" },
      owner: { box: "ab".repeat(32) },
    };
    expect(decodeBundle(encodeBundle(bundle))).toEqual(bundle);
  });
});
