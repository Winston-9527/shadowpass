import { describe, expect, it } from "vitest";
import { ShadowWorld } from "@shadowpass/circuits/world";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { shadowEvents } from "../src/events.js";
import { ChainState } from "../src/state.js";
import { MerkleTree, stateRoot } from "../src/trees.js";
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
  it("replays all five tree event families and detects spent nullifiers", async () => {
    const world = await ShadowWorld.create("sdk-state");
    const issued = new MerkleTree();
    const roots = new MerkleTree();
    const notes = new MerkleTree();
    const group = new MerkleTree();
    const issuedLeaf = 11n;
    const rootLeaf = 22n;
    const noteLeaf = 33n;
    const groupLeaf = 44n;
    issued.insert(issuedLeaf);
    roots.insert(rootLeaf);
    notes.insert(noteLeaf);
    group.insert(groupLeaf);
    world.revoked.insert(55n);

    const logs = [
      { eventName: "Issued", args: { certHash: issuedLeaf, index: 0, newRoot: issued.root }, blockNumber: 1n, logIndex: 0 },
      { eventName: "Registered", args: { nf: 1n, leaf0: rootLeaf, root: roots.root }, blockNumber: 1n, logIndex: 1 },
      { eventName: "Joined", args: { commitment: groupLeaf, index: 0, root: group.root }, blockNumber: 2n, logIndex: 0 },
      { eventName: "NoteInserted", args: { cm: noteLeaf, index: 0, newRoot: notes.root }, blockNumber: 2n, logIndex: 1 },
      { eventName: "NoteMemo", args: { cm: noteLeaf, memo: "0x0102" }, blockNumber: 2n, logIndex: 2 },
      { eventName: "Revoked", args: { entry: 55n, index: 1, oldRoot: 0n, newRoot: world.revoked.root }, blockNumber: 3n, logIndex: 0 },
      { eventName: "Executed", args: { budgetNf: 99n, target: deployment.payout, method: "0x00000000", amount: 1n }, blockNumber: 3n, logIndex: 1 },
    ];

    const state = ChainState.fromLogs(deployment, logs);
    expect(state.roots()).toEqual({
      issued: issued.root,
      revoked: world.revoked.root,
      root: roots.root,
      note: notes.root,
      group: group.root,
      state: stateRoot(issued.root, world.revoked.root, roots.root),
    });
    expect(state.memos.get(noteLeaf.toString())).toEqual(Uint8Array.of(1, 2));
    expect(state.spentNullifiers.has("99")).toBe(true);
  });

  it("supports incremental client replay", async () => {
    const calls: Array<{ fromBlock: bigint; toBlock?: bigint }> = [];
    const client = {
      async getLogs(args: { fromBlock: bigint; toBlock?: bigint }) {
        calls.push(args);
        return args.fromBlock === 0n
          ? [{ eventName: "Joined", args: { commitment: 1n, index: 0, root: 1n }, blockNumber: 4n, logIndex: 0 }]
          : [];
      },
      async getBlockNumber() {
        return 5n;
      },
    };
    const state = await ChainState.sync(client, deployment, { startBlock: 0 });
    expect(calls[0]?.fromBlock).toBe(0n);
    expect(state.roots().group).toBe(1n);
    await state.update();
    expect(calls[1]?.fromBlock).toBe(6n);
  });

  it("decodes raw viem event topics and data", () => {
    const topics = encodeEventTopics({ abi: shadowEvents, eventName: "Joined", args: [] });
    const data = encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [7n, 0n, 7n],
    );
    const state = ChainState.fromLogs(deployment, [{
      topics,
      data,
      blockNumber: 1n,
      logIndex: 0,
    }]);
    expect(state.roots().group).toBe(7n);
  });
});
