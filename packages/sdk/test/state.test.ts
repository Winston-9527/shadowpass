import { describe, expect, it } from "vitest";
import { ShadowWorld } from "@shadowpass/circuits/world";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { shadowEvents } from "../src/events.js";
import { ChainState } from "../src/state.js";
import { stateRoot } from "../src/trees.js";
import type { Deployment } from "../src/types.js";

const deployment: Deployment = {
  chainId: 84532,
  gate: "0x1111111111111111111111111111111111111111",
  registry: "0x2222222222222222222222222222222222222222",
  revocations: "0x3333333333333333333333333333333333333333",
  group: "0x4444444444444444444444444444444444444444",
  payout: "0x5555555555555555555555555555555555555555",
  treasury: "0x6666666666666666666666666666666666666666",
  vault: "0x7777777777777777777777777777777777777777",
  token: "0x8888888888888888888888888888888888888888",
  verifiers: {
    d1: "0x9999999999999999999999999999999999999999",
    d2: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    reg: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    revoke: "0xcccccccccccccccccccccccccccccccccccccccc",
    transfer: "0xdddddddddddddddddddddddddddddddddddddddd",
    mint: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  },
  startBlock: 0,
  facilitator: "http://localhost:3000",
  mailbox: "http://localhost:3001",
};

describe("ChainState", () => {
  it("replays exact event ABI against roots independently built by world.mjs", async () => {
    const world = await ShadowWorld.create("sdk-state");
    const issuedLeaf = 11n;
    const rootLeaf = 22n;
    const replacedLeaf = 23n;
    const noteLeaf = 33n;
    const groupLeaf = 44n;
    world.issued.insert(issuedLeaf);
    world.roots.insert(rootLeaf);
    world.notes.insert(noteLeaf);
    world.group.insert(groupLeaf);
    world.revoked.insert(55n);
    world.roots.update(0, replacedLeaf);

    const logs = [
      { eventName: "Issued", args: { certHash: issuedLeaf, index: 0, root: world.issued.root }, blockNumber: 1n, logIndex: 0 },
      { eventName: "Registered", args: { nf: 1n, leaf0: rootLeaf, index: 0, root: rootLeaf }, blockNumber: 1n, logIndex: 1 },
      { eventName: "Replaced", args: { nf: 1n, oldLeaf0: rootLeaf, newLeaf0: replacedLeaf, index: 0, root: world.roots.root }, blockNumber: 1n, logIndex: 2 },
      { eventName: "Joined", args: { commitment: groupLeaf, index: 0, root: world.group.root }, blockNumber: 2n, logIndex: 0 },
      { eventName: "NoteInserted", args: { cm: noteLeaf, index: 0, root: world.notes.root }, blockNumber: 2n, logIndex: 1 },
      { eventName: "NoteMemo", args: { cm: noteLeaf, memo: "0x0102" }, blockNumber: 2n, logIndex: 2 },
      { eventName: "Revoked", args: { entry: 55n, index: 1, oldRoot: 0n, newRoot: world.revoked.root }, blockNumber: 3n, logIndex: 0 },
      { eventName: "NullifierSpent", args: { nullifier: 99n }, blockNumber: 3n, logIndex: 1 },
    ];

    const state = ChainState.fromLogs(deployment, logs);
    expect(state.roots()).toEqual({
      issued: world.issued.root,
      revoked: world.revoked.root,
      root: world.roots.root,
      note: world.notes.root,
      group: world.group.root,
      state: stateRoot(world.issued.root, world.revoked.root, world.roots.root),
    });
    expect(state.memos.get(noteLeaf.toString())).toEqual(Uint8Array.of(1, 2));
    expect(state.spentNullifiers.has("99")).toBe(true);
  });

  it("fetches logs in bounded batches and replays the full range on update", async () => {
    const calls: Array<{ fromBlock: bigint; toBlock?: bigint }> = [];
    const client = {
      async getLogs(args: { fromBlock: bigint; toBlock?: bigint }) {
        calls.push(args);
        return args.fromBlock === 0n
          ? [{ eventName: "Joined", args: { commitment: 1n, index: 0, root: 1n }, blockNumber: 1n, logIndex: 0 }]
          : [];
      },
      async getBlockNumber() {
        return 5n;
      },
    };
    const state = await ChainState.sync(client, deployment, { startBlock: 0, maxBlockRange: 2 });
    expect(calls.map((call) => call.fromBlock)).toEqual([0n, 2n, 4n]);
    expect(state.roots().group).toBe(1n);
    await state.update();
    expect(calls.slice(-3).map((call) => call.fromBlock)).toEqual([0n, 2n, 4n]);
  });

  it("decodes raw viem topics/data and rejects unknown events", () => {
    const topics = encodeEventTopics({ abi: shadowEvents, eventName: "Joined", args: { commitment: 7n } });
    const data = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [0n, 7n]);
    const state = ChainState.fromLogs(deployment, [{ topics, data, blockNumber: 1n, logIndex: 0 }]);
    expect(state.roots().group).toBe(7n);
    expect(() => ChainState.fromLogs(deployment, [{ topics: ["0x00"], data: "0x", blockNumber: 1n }])).toThrow(/unknown event topic/);
  });
});
