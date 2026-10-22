import { describe, expect, it } from "vitest";
import { ShadowWorld } from "@shadowpass/circuits/world";
import { encryptChain, openChain, ownerCtOfInput } from "../src/owner.js";

describe("owner ciphertext", () => {
  it("round-trips with world.mjs and rejects another view key", async () => {
    const world = await ShadowWorld.create("sdk-owner");
    const alice = world.newIdentity();
    const steward = world.newIdentity();
    const buyer = world.newIdentity();
    const view = world.newViewKey();
    world.addToGroup(alice);
    const c0 = world.issueRoot(alice, steward, 3n, 10_000n, view);
    world.register(c0);
    const c1 = world.issue(c0, buyer, 1n, 9_000n);
    const note = world.mintNote([c0, c1], 100n);
    const expected = world.actionInput({
      chain: [c0, c1],
      holderSk: buyer.sk,
      note,
      qSpent: 7n,
      ctxHash: 1n,
      reqCap: 1n,
      now: 1_000n,
    });

    const opened = openChain(ownerCtOfInput(expected.input), view.vsk);
    expect(opened).not.toBeNull();
    expect(opened!.map((point) => point.x)).toEqual([
      alice.Ax,
      steward.Ax,
      buyer.Ax,
    ]);
    expect(opened!.map((point) => point.y)).toEqual([
      alice.Ay,
      steward.Ay,
      buyer.Ay,
    ]);
    expect(openChain(ownerCtOfInput(expected.input), world.newViewKey().vsk)).toBeNull();
  });

  it("produces ciphertext world.mjs can open", async () => {
    const world = await ShadowWorld.create("sdk-owner-2");
    const alice = world.newIdentity();
    const steward = world.newIdentity();
    const view = world.newViewKey();
    const entities = [alice, steward].map((identity) => ({ x: identity.Ax, y: identity.Ay }));
    const ciphertext = encryptChain(entities, { x: view.vpk[0], y: view.vpk[1] }, world.rnd);
    const opened = (await import("@shadowpass/circuits/world")).openChain({
      c1: [ciphertext.c1.x, ciphertext.c1.y],
      c2: [ciphertext.c2.x, ciphertext.c2.y],
      e: ciphertext.e,
      esign: ciphertext.esign,
    }, view.vsk);
    expect(opened).toEqual(entities.map(({ x, y }) => [x, y]));
  });
});
