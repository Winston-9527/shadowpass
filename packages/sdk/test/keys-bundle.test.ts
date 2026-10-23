import { describe, expect, it } from "vitest";
import { identity as referenceIdentity, ShadowWorld } from "@shadowpass/circuits/world";
import { decodeBundle, encodeBundle } from "../src/bundle.js";
import { hexToBytes } from "../src/crypto.js";
import { deriveKeys, identityFromPrv, recoveryUnwrap, recoveryWrap, unwrapSeed, wrapSeed } from "../src/keys.js";
import type { CertificateBundle } from "../src/types.js";
import {
  SPW1_PASSKEY_ENVELOPE,
  SPW1_RECOVERY_ENVELOPE,
  SPW1_TEST_PRF,
  SPW1_TEST_SEED,
} from "./fixtures/envelopes.js";

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
    expect(first.sign.Ax).toBe(15481769895732163471499990415665834758241564134275323111481453546342149920928n);
    expect(first.sign.Ay).toBe(4628556503967326388754148339773113579638035193436717383846280531014086426780n);
    expect(first.sign.sk).toBe(1597024081252082644901250109754995552044687903305215133262973013346187351279n);
    expect(first.steward.Ax).toBe(8274137804375355946148794479302625423654716364054081194827302177902712529557n);
    expect(first.view.vsk).toBe(2302675071152415112275404676307203633708021831976577629278996125305940728902n);
    expect(Buffer.from(first.box.publicKey).toString("hex")).toBe("166a4670ad411168855229b2315aa24da0429bc7f79a73c0ca3def6c863b9c3c");

    const prf = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
    const wrapped = await wrapSeed(prf, seed);
    expect(wrapped).toHaveLength(81);
    expect(await unwrapSeed(prf, wrapped)).toEqual(seed);
    const recovery = await recoveryWrap("correct horse battery staple", seed);
    expect(await recoveryUnwrap("correct horse battery staple", recovery)).toEqual(seed);
  });

  it("opens the frozen SPW1 passkey and recovery envelopes", async () => {
    const seed = hexToBytes(SPW1_TEST_SEED);
    const prf = hexToBytes(SPW1_TEST_PRF);
    const passkey = hexToBytes(SPW1_PASSKEY_ENVELOPE);
    const recovery = hexToBytes(SPW1_RECOVERY_ENVELOPE);
    expect(await unwrapSeed(prf, passkey)).toEqual(seed);
    expect(await recoveryUnwrap("correct horse battery staple", recovery)).toEqual(seed);
  });

  it("round-trips a signed certificate bundle and rejects tampering", async () => {
    const world = await ShadowWorld.create("sdk-bundle");
    const alice = world.newIdentity();
    const steward = world.newIdentity();
    const buyer = world.newIdentity();
    const view = world.newViewKey();
    const c0 = world.issueRoot(alice, steward, 3n, 100n, view);
    const c1 = world.issue(c0, buyer, 1n, 90n);
    const bundle: CertificateBundle = {
      v: 1,
      chainId: 84532,
      deployment: "base-sepolia",
      chain: [
        {
          hop: 0,
          issuer: { x: alice.Ax.toString(), y: alice.Ay.toString() },
          holder: { x: steward.Ax.toString(), y: steward.Ay.toString() },
          cap: "3",
          expiry: "100",
          sig: { S: c0.sig.S.toString(), R8x: c0.sig.R8x.toString(), R8y: c0.sig.R8y.toString() },
          vpk: { x: view.vpk[0].toString(), y: view.vpk[1].toString() },
          ownW: { x: view.w[0].toString(), y: view.w[1].toString() },
          hash: c0.hash.toString(),
        },
        {
          hop: 1,
          issuer: { x: steward.Ax.toString(), y: steward.Ay.toString() },
          holder: { x: buyer.Ax.toString(), y: buyer.Ay.toString() },
          cap: "1",
          expiry: "90",
          sig: { S: c1.sig.S.toString(), R8x: c1.sig.R8x.toString(), R8y: c1.sig.R8y.toString() },
          hash: c1.hash.toString(),
        },
      ],
      note: {
        own: [buyer.Ax.toString(), buyer.Ay.toString()],
        q: "50",
        lin: [c0.hash.toString(), c1.hash.toString(), "0", "0"],
        rho: "13",
      },
      owner: { box: "ab".repeat(32) },
    };
    expect(decodeBundle(encodeBundle(bundle))).toEqual(bundle);
    const tampered = structuredClone(bundle);
    tampered.chain[1]!.sig.S = "1";
    expect(() => decodeBundle(encodeBundle(tampered))).toThrow(/invalid certificate signature/);
  });
});
