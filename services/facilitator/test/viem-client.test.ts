import { describe, expect, it } from "vitest";
import {
  RelayInFlightError,
  createViemWalletRelayClient,
  relayLockKey,
} from "../src/viem-client.js";

const TX = `0x${"22".repeat(32)}` as const;
const ACCOUNT = {
  address: "0x00000000000000000000000000000000000000aa" as const,
  type: "local" as const,
  signTransaction: async () => TX,
};
const DEPLOYMENT = {
  chainId: 31337,
  gate: "0x0000000000000000000000000000000000000a01" as const,
  registry: "0x0000000000000000000000000000000000000a02" as const,
  revocations: "0x0000000000000000000000000000000000000a03" as const,
  group: "0x0000000000000000000000000000000000000a04" as const,
  payout: "0x0000000000000000000000000000000000000a05" as const,
  treasury: "0x0000000000000000000000000000000000000a06" as const,
  vault: "0x0000000000000000000000000000000000000a07" as const,
  token: "0x0000000000000000000000000000000000000a08" as const,
  verifiers: {
    d1: "0x0000000000000000000000000000000000000b01" as const,
    d2: "0x0000000000000000000000000000000000000b02" as const,
    d3: "0x0000000000000000000000000000000000000b03" as const,
    reg: "0x0000000000000000000000000000000000000b04" as const,
    revoke: "0x0000000000000000000000000000000000000b05" as const,
    transfer: "0x0000000000000000000000000000000000000b06" as const,
    mint: "0x0000000000000000000000000000000000000b07" as const,
  },
  startBlock: 0,
  facilitator: "",
  mailbox: "",
};

describe("viem wallet relay", () => {
  it("simulates inside the serialized queue and writes with the local account object", async () => {
    const calls: string[] = [];
    let sentAccount: unknown;
    const publicClient = {
      async simulateContract() {
        calls.push("simulate");
        return { request: {} };
      },
      async waitForTransactionReceipt() {
        calls.push("wait");
        return { status: "success", blockNumber: 1n, logs: [] };
      },
    } as any;
    const walletClient = {
      account: ACCOUNT,
      async writeContract(args: { account: unknown }) {
        calls.push("write");
        sentAccount = args.account;
        return TX;
      },
    } as any;
    const relay = createViemWalletRelayClient({ publicClient, walletClient, deployment: DEPLOYMENT });

    await expect(relay.relay("join", { commitment: "1" })).resolves.toMatchObject({ transaction: TX });
    expect(sentAccount).toBe(ACCOUNT);
    expect(calls).toEqual(["simulate", "write", "wait"]);
  });

  it("locks in-flight relay operations by their deterministic key", async () => {
    const publicClient = {
      async simulateContract() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { request: {} };
      },
      async waitForTransactionReceipt() {
        return { status: "success", blockNumber: 1n, logs: [] };
      },
    } as any;
    const walletClient = {
      account: ACCOUNT,
      async writeContract() { return TX; },
    } as any;
    const relay = createViemWalletRelayClient({ publicClient, walletClient, deployment: DEPLOYMENT });

    const first = relay.relay("join", { commitment: "7" });
    await expect(relay.relay("join", { commitment: "7" })).rejects.toBeInstanceOf(RelayInFlightError);
    await first;
    expect(relayLockKey("execute" as any, { budget: { budgetNf: "42" } })).toBe("budget:42");
    expect(relayLockKey("treasuryWithdraw" as any, { positionId: "9" })).toBe("position:9");
  });

  it("preserves a revert name raised after simulation when broadcasting", async () => {
    const publicClient = {
      async simulateContract() { return { request: {} }; },
      async waitForTransactionReceipt() { return { status: "success", blockNumber: 1n, logs: [] }; },
    } as any;
    const walletClient = {
      account: ACCOUNT,
      async writeContract() {
        throw Object.assign(new Error("reverted"), { data: { errorName: "BeforeMaturity" } });
      },
    } as any;
    const relay = createViemWalletRelayClient({ publicClient, walletClient, deployment: DEPLOYMENT });
    await expect(relay.relay("join", { commitment: "1" })).rejects.toMatchObject({
      name: "RelayRevertError",
      revertName: "BeforeMaturity",
    });
  });
});
