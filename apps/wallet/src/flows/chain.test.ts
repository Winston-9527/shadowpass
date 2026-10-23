import { describe, expect, it } from "vitest";
import type { Deployment } from "@shadowpass/sdk";
import { IncrementalShadowLogSync } from "./chain";

const address = (byte: string) => `0x${byte.repeat(20)}` as const;
const deployment: Deployment = {
  chainId: 31337,
  gate: address("01"),
  registry: address("02"),
  revocations: address("03"),
  group: address("04"),
  payout: address("05"),
  treasury: address("06"),
  vault: address("07"),
  token: address("08"),
  verifiers: {
    d1: address("11"),
    d2: address("12"),
    reg: address("13"),
    revoke: address("14"),
    transfer: address("15"),
    mint: address("16"),
  },
  startBlock: 0,
  facilitator: "http://localhost:4022",
  mailbox: "http://localhost:8787",
};

describe("incremental wallet chain sync", () => {
  it("reads the full range once and only requests new blocks afterwards", async () => {
    let latest = 5n;
    const ranges: Array<{ fromBlock: bigint; toBlock?: bigint }> = [];
    const client = {
      async getBlockNumber() { return latest; },
      async getLogs(args: { fromBlock: bigint; toBlock?: bigint }) {
        ranges.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
        return [];
      },
    };
    const sync = new IncrementalShadowLogSync(client, deployment);
    const first = await sync.poll();
    latest = 7n;
    const second = await sync.poll();

    expect(ranges).toEqual([
      { fromBlock: 0n, toBlock: 5n },
      { fromBlock: 6n, toBlock: 7n },
    ]);
    expect(second.state).toBe(first.state);
    expect(first.logs).toBe(second.logs);
  });

  it("drops the cache and rebuilds from the deployment start on reorg rollback", async () => {
    let latest = 5n;
    const ranges: bigint[] = [];
    const client = {
      async getBlockNumber() { return latest; },
      async getLogs(args: { fromBlock: bigint }) {
        ranges.push(args.fromBlock);
        return [];
      },
    };
    const sync = new IncrementalShadowLogSync(client, deployment);
    const first = await sync.poll();
    latest = 3n;
    const rebuilt = await sync.poll();
    expect(ranges).toEqual([0n, 0n]);
    expect(rebuilt.state).not.toBe(first.state);
  });
});
