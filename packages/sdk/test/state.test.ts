import { describe, expect, it } from "vitest";
import { ShadowWorld } from "@shadowpass/circuits/world";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { shadowEvents, topicFor } from "../src/events.js";
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
    const revokedBefore = world.revoked.root;
    world.revoked.insert(55n);
    world.roots.update(0, replacedLeaf);

    const logs = [
      { eventName: "Issued", args: { certHash: issuedLeaf, index: 0, root: world.issued.root }, blockNumber: 1n, logIndex: 0 },
      { eventName: "Registered", args: { nf: 1n, leaf0: rootLeaf, index: 0, root: rootLeaf }, blockNumber: 1n, logIndex: 1 },
      { eventName: "Replaced", args: { nf: 1n, oldLeaf0: rootLeaf, newLeaf0: replacedLeaf, index: 0, root: world.roots.root }, blockNumber: 1n, logIndex: 2 },
      { eventName: "Joined", args: { commitment: groupLeaf, index: 0, root: world.group.root }, blockNumber: 2n, logIndex: 0 },
      { eventName: "NoteInserted", args: { cm: noteLeaf, index: 0, root: world.notes.root }, blockNumber: 2n, logIndex: 1 },
      { eventName: "NoteMemo", args: { cm: noteLeaf, memo: "0x0102" }, blockNumber: 2n, logIndex: 2 },
      { eventName: "Revoked", args: { entry: 55n, index: 1, oldRoot: revokedBefore, newRoot: world.revoked.root }, blockNumber: 3n, logIndex: 0 },
      {
        eventName: "StateRegistered",
        args: {
          issued: world.issued.root,
          revoked: world.revoked.root,
          root: world.roots.root,
          stateRoot: stateRoot(world.issued.root, world.revoked.root, world.roots.root),
        },
        blockNumber: 3n,
        logIndex: 1,
      },
      { eventName: "NullifierSpent", args: { nullifier: 99n }, blockNumber: 3n, logIndex: 2 },
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

  function branchLogs(leaf: bigint) {
    const emptyRevokedRoot = new ChainState().revoked.root;
    return [
      { eventName: "Issued", args: { certHash: leaf, index: 0, root: leaf }, blockNumber: 1n, logIndex: 0 },
      { eventName: "Registered", args: { nf: leaf, leaf0: leaf, index: 0, root: leaf }, blockNumber: 1n, logIndex: 1 },
      { eventName: "Joined", args: { commitment: leaf, index: 0, root: leaf }, blockNumber: 1n, logIndex: 2 },
      { eventName: "NoteInserted", args: { cm: leaf, index: 0, root: leaf }, blockNumber: 1n, logIndex: 3 },
      { eventName: "NoteMemo", args: { cm: leaf, memo: "0x0102" }, blockNumber: 1n, logIndex: 4 },
      { eventName: "NullifierSpent", args: { nullifier: leaf }, blockNumber: 1n, logIndex: 5 },
      {
        eventName: "StateRegistered",
        args: { issued: leaf, revoked: emptyRevokedRoot, root: leaf, stateRoot: stateRoot(leaf, emptyRevokedRoot, leaf) },
        blockNumber: 1n,
        logIndex: 6,
      },
    ];
  }

  function companionSnapshot(state: ChainState) {
    return {
      memos: [...state.memos].map(([key, value]) => [key, [...value]]),
      spentNullifiers: [...state.spentNullifiers],
      registeredStateRoots: [...state.registeredStateRoots],
    };
  }

  it("rolls back companion collections with trees when a same-height branch is replaced", async () => {
    let logs = branchLogs(11n);
    const client = {
      async getLogs() { return logs; },
      async getBlockNumber() { return 1n; },
    };
    const state = await ChainState.sync(client, deployment);
    const old = companionSnapshot(state);
    expect(old.memos).toEqual([["11", [1, 2]]]);
    expect(old.spentNullifiers).toEqual(["11"]);
    expect(old.registeredStateRoots).toHaveLength(1);

    logs = branchLogs(22n);
    await state.update();

    const expected = ChainState.fromLogs(deployment, logs);
    expect(state.roots()).toEqual(expected.roots());
    expect(companionSnapshot(state)).toEqual(companionSnapshot(expected));
    expect(state.memos.has("11")).toBe(false);
    expect(state.spentNullifiers.has("11")).toBe(false);
    for (const root of old.registeredStateRoots) expect(state.registeredStateRoots.has(root)).toBe(false);
    expect(state.lastBlock).toBe(1n);
  });

  it("keeps companion collections, trees and cursor unchanged when a later page fails", async () => {
    let latest = 1n;
    let fail = false;
    const ranges: bigint[] = [];
    const client = {
      async getLogs(args: { fromBlock: bigint }) {
        ranges.push(args.fromBlock);
        if (fail && args.fromBlock === 2n) throw new Error("later page failed");
        return branchLogs(fail ? 22n : 11n);
      },
      async getBlockNumber() { return latest; },
    };
    const state = await ChainState.sync(client, deployment, { maxBlockRange: 2 });
    const before = { roots: state.roots(), companions: companionSnapshot(state), lastBlock: state.lastBlock };
    ranges.length = 0;
    latest = 3n;
    fail = true;

    await expect(state.update()).rejects.toThrow("later page failed");

    expect(ranges).toEqual([0n, 2n]);
    expect(state.roots()).toEqual(before.roots);
    expect(companionSnapshot(state)).toEqual(before.companions);
    expect(state.lastBlock).toBe(before.lastBlock);
  });

  it("decodes raw viem topics/data and rejects unknown events", () => {
    const topics = encodeEventTopics({ abi: shadowEvents, eventName: "Joined", args: { commitment: 7n } });
    const data = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [0n, 7n]);
    const state = ChainState.fromLogs(deployment, [{ topics, data, blockNumber: 1n, logIndex: 0 }]);
    expect(state.roots().group).toBe(7n);
    expect(() => ChainState.fromLogs(deployment, [{ topics: ["0x00"], data: "0x", blockNumber: 1n }])).not.toThrow();
    expect(() => ChainState.fromLogs(deployment, [{
      topics: [topicFor("Joined")],
      data: "0x",
      blockNumber: 1n,
    }])).toThrow(/failed to decode Joined/);
  });

  it("passes topic0 filters and skips unknown logs returned by a client", async () => {
    let observedTopics: unknown;
    const client = {
      async getLogs(args: { fromBlock: bigint; topics?: unknown }) {
        observedTopics = args.topics;
        return [
          { eventName: "Joined", args: { commitment: 1n, index: 0, root: 1n }, blockNumber: 1n, logIndex: 0 },
          { topics: ["0xdeadbeef"], data: "0x", blockNumber: 1n, logIndex: 1 },
        ];
      },
      async getBlockNumber() { return 1n; },
    };
    const state = await ChainState.sync(client, deployment, { startBlock: 0 });
    expect(state.roots().group).toBe(1n);
    expect((observedTopics as any)[0]).toContain(topicFor("Joined"));
  });

  it("keeps the old state atomic when a later log batch fails", async () => {
    let latest = 1n;
    let fail = false;
    let calls = 0;
    const client = {
      async getLogs(args: { fromBlock: bigint; toBlock?: bigint; topics?: unknown }) {
        calls += 1;
        if (fail && args.fromBlock === 2n) throw new Error("rpc range failure");
        return args.fromBlock === 0n
          ? [{ eventName: "Joined", args: { commitment: 1n, index: 0, root: 1n }, blockNumber: 1n, logIndex: 0 }]
          : [];
      },
      async getBlockNumber() { return latest; },
    };
    const state = await ChainState.sync(client, deployment, { startBlock: 0, maxBlockRange: 2 });
    const oldRoots = state.roots();
    const oldBlock = state.lastBlock;
    latest = 5n;
    fail = true;
    await expect(state.update()).rejects.toThrow(/rpc range failure/);
    expect(state.roots()).toEqual(oldRoots);
    expect(state.lastBlock).toBe(oldBlock);
    expect(calls).toBeGreaterThan(1);
  });

  it("shares one in-flight update promise", async () => {
    let release!: () => void;
    const pause = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    let blocking = false;
    const client = {
      async getLogs(args: { fromBlock: bigint }) {
        calls += 1;
        if (blocking) await pause;
        return args.fromBlock === 0n
          ? [{ eventName: "Joined", args: { commitment: 1n, index: 0, root: 1n }, blockNumber: 1n, logIndex: 0 }]
          : [];
      },
      async getBlockNumber() { return 1n; },
    };
    const state = await ChainState.sync(client, deployment, { startBlock: 0, maxBlockRange: 2 });
    calls = 0;
    blocking = true;
    const first = state.update();
    const second = state.update();
    expect(second).toBe(first);
    release();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
  });
});
