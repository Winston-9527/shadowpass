import { describe, expect, it } from "vitest";
import { ShadowWorld } from "@shadowpass/circuits/world";
import { certHash, issueRoot } from "../src/certs.js";
import { ChainState } from "../src/state.js";
import type { Cert } from "../src/types.js";
import {
  actionInput,
  mintInput,
  registerInput,
  revokeCertInput,
  transferInput,
} from "../src/witness.js";

async function fixture(seed: string) {
  const world = await ShadowWorld.create(seed);
  const alice = world.newIdentity();
  const steward = world.newIdentity();
  const buyer = world.newIdentity();
  const vault = world.newIdentity();
  const downstream = world.newIdentity();
  const view = world.newViewKey();
  for (let index = 0; index < 5; index += 1) {
    world.addToGroup(world.newIdentity());
    world.register({ hash: world.rand250() });
    world.notes.insert(world.rand250());
    world.issued.insert(world.rand250());
    world.revoked.insert(world.rand250());
  }
  world.addToGroup(alice);
  const c0 = world.issueRoot(alice, steward, 3n, 10_000n, view);
  world.register(c0);
  const c1 = world.issue(c0, buyer, 1n, 9_000n);
  const c1t = world.issue(c0, vault, 2n, 9_000n);
  const c2 = world.issue(c1, downstream, 1n, 8_000n);
  const stewardNote = world.mintNote([c0], 100n);
  const buyerNote = world.mintNote([c0, c1], 40n);
  const downstreamNote = world.mintNote([c0, c1, c2], 20n);
  return { world, alice, steward, buyer, vault, downstream, view, c0, c1, c1t, c2, stewardNote, buyerNote, downstreamNote };
}

function stateFromWorld(world: any): ChainState {
  const state = new ChainState();
  for (const leaf of world.issued.leaves) state.issued.insert(leaf);
  for (const leaf of world.roots.leaves) state.rootTree.insert(leaf);
  for (const leaf of world.notes.leaves) state.notes.insert(leaf);
  for (const leaf of world.group.leaves) state.group.insert(leaf);
  for (const leaf of world.revoked.leaves.slice(1)) state.revoked.insert(leaf.value);
  return state;
}

function sdkCert(cert: any): Cert {
  return {
    ...cert,
    vpk: cert.vk?.vpk ? { x: cert.vk.vpk[0], y: cert.vk.vpk[1] } : undefined,
    ownW: cert.vk?.w ? { x: cert.vk.w[0], y: cert.vk.w[1] } : undefined,
  };
}

describe("witness parity with circuits/scripts/world.mjs", () => {
  it("matches action D1/D2/D3 and register witnesses field by field", async () => {
    const expected = await fixture("sdk-witness");
    const actual = await fixture("sdk-witness");
    const expectedState = stateFromWorld(expected.world);
    const actualState = stateFromWorld(actual.world);

    const expectedD2 = expected.world.actionInput({
      chain: [expected.c0, expected.c1],
      holderSk: expected.buyer.sk,
      note: expected.buyerNote,
      qSpent: 8n,
      ctxHash: 123456789n,
      reqCap: 1n,
      now: 1_000n,
    });
    const actualD2 = actionInput({
      chain: [sdkCert(actual.c0), sdkCert(actual.c1)],
      holderSk: actual.buyer.sk,
      note: actual.buyerNote,
      qSpent: 8n,
      ctxHash: 123456789n,
      reqCap: 1n,
      now: 1_000n,
      state: actualState,
      random: actual.world.rnd,
    });
    expect(actualD2.input).toEqual(expectedD2.input);

    const expectedD1 = expected.world.actionInput({
      chain: [expected.c0],
      holderSk: expected.steward.sk,
      note: expected.stewardNote,
      qSpent: 10n,
      ctxHash: 987654321n,
      reqCap: 1n,
      now: 1_000n,
    });
    const actualD1 = actionInput({
      chain: [sdkCert(actual.c0)],
      holderSk: actual.steward.sk,
      note: actual.stewardNote,
      qSpent: 10n,
      ctxHash: 987654321n,
      reqCap: 1n,
      now: 1_000n,
      state: actualState,
      random: actual.world.rnd,
    });
    expect(actualD1.input).toEqual(expectedD1.input);

    const expectedD3 = expected.world.actionInput({
      chain: [expected.c0, expected.c1, expected.c2],
      holderSk: expected.downstream.sk,
      note: expected.downstreamNote,
      qSpent: 5n,
      ctxHash: 555n,
      reqCap: 1n,
      now: 1_000n,
    });
    const actualD3 = actionInput({
      chain: [sdkCert(actual.c0), sdkCert(actual.c1), sdkCert(actual.c2)],
      holderSk: actual.downstream.sk,
      note: actual.downstreamNote,
      qSpent: 5n,
      ctxHash: 555n,
      reqCap: 1n,
      now: 1_000n,
      state: actualState,
      random: actual.world.rnd,
    });
    expect(actualD3.input).toEqual(expectedD3.input);

    const expectedRegister = expected.world.registerInput({ human: expected.alice, cert0: expected.c0, domain: 7n });
    const actualRegister = registerInput({
      human: actual.alice,
      cert0: sdkCert(actual.c0),
      domain: 7n,
      state: actualState,
    });
    expect(actualRegister).toEqual(expectedRegister);
    void expectedState;
  });

  it("matches revocation, transfer, and mint witnesses", async () => {
    const expected = await fixture("sdk-witness-2");
    const actual = await fixture("sdk-witness-2");
    const expectedState = stateFromWorld(expected.world);
    const actualState = stateFromWorld(actual.world);

    const expectedRevoke = expected.world.revokeCertInput(expected.c1, expected.steward).input;
    const actualRevoke = revokeCertInput(sdkCert(actual.c1), actual.steward, 0, actualState).input;
    expect(actualRevoke).toEqual(expectedRevoke);

    const expectedTransfer = expected.world.transferInput({
      holder: expected.steward,
      holderSk: expected.steward.sk,
      note: expected.stewardNote,
      child: expected.c1,
      q1: 40n,
      q2: 60n,
    });
    const actualTransfer = transferInput({
      holder: actual.steward,
      note: actual.stewardNote,
      child: sdkCert(actual.c1),
      q1: 40n,
      q2: 60n,
      state: actualState,
      random: actual.world.rnd,
    });
    expect(actualTransfer.input).toEqual(expectedTransfer.input);
    expect(actualTransfer.out1).toEqual(expectedTransfer.out1);
    expect(actualTransfer.out2).toEqual(expectedTransfer.out2);

    expect(mintInput(actual.stewardNote)).toEqual(expected.world.mintInput(expected.stewardNote));
    void expectedState;
  });

  it("rejects a child certificate outside the first free lineage slot", async () => {
    const fixtureValue = await fixture("sdk-witness-3");
    const state = stateFromWorld(fixtureValue.world);
    expect(() => transferInput({
      holder: fixtureValue.steward,
      note: fixtureValue.buyerNote,
      child: sdkCert(fixtureValue.c1),
      q1: 1n,
      q2: 1n,
      state,
    })).toThrow(/first free lineage slot/);
  });

  it("keeps SDK cert hashing aligned with the reference implementation", async () => {
    const world = await ShadowWorld.create("sdk-cert");
    const issuer = world.newIdentity();
    const holder = world.newIdentity();
    const vpk = world.newViewKey();
    const expected = world.issueRoot(issuer, holder, 3n, 4n, vpk);
    const actual = issueRoot(
      issuer,
      holder,
      3n,
      4n,
      { x: vpk.vpk[0], y: vpk.vpk[1] },
      { x: vpk.w[0], y: vpk.w[1] },
    );
    expect(actual.hash).toBe(expected.hash);
    expect(certHash(1, issuer, holder, 3n, 4n)).toBe(world.issue({ ...expected, holder: issuer }, holder, 3n, 4n).hash);
  });
});
