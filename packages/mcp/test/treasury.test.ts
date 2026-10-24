import {
  decodeNoteMemo,
  encodeNoteMemo,
  MerkleTree,
  noteCm,
  type Hex,
  type Note,
} from "@shadowpass/sdk";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  createShadowpassTreasuryService,
  TREASURY_SUPPLY_METHOD,
  type OnChainTreasuryPosition,
  type TreasuryChain,
  type TreasuryRelay,
} from "../src/treasury.js";
import type { McpToolContext } from "../src/tools.js";
import { treasurySupply, treasuryWithdraw } from "../src/tools.js";
import { createFixture, deployment } from "./fixtures.js";

const eventsAbi = parseAbi([
  "event PositionOpened(uint256 indexed positionId,address indexed vault,uint256 amount,uint256 shares,uint256 maturity,uint256 returnCm,uint256 expectedQ,bytes returnMemo)",
  "event NoteInserted(uint256 indexed cm,uint256 index,uint256 root)",
  "event NoteMemo(uint256 indexed cm,bytes memo)",
  "event NullifierSpent(uint256 indexed nullifier)",
]);

const fixtureProof = {
  proof: {
    pi_a: ["1", "2"],
    pi_b: [["3", "4"], ["5", "6"]],
    pi_c: ["7", "8"],
  },
  publicSignals: [],
  artifacts: {},
};

function rawEvent(
  eventName: "PositionOpened" | "NoteInserted" | "NoteMemo" | "NullifierSpent",
  indexed: Record<string, unknown>,
  types: readonly any[],
  values: readonly unknown[],
  logIndex: number,
  transactionHash: Hex,
) {
  return {
    address: eventName === "PositionOpened" ? deployment.treasury : deployment.gate,
    topics: encodeEventTopics({ abi: eventsAbi, eventName, args: indexed } as any),
    data: types.length ? encodeAbiParameters(types, values) : "0x",
    blockNumber: 2n,
    logIndex,
    transactionHash,
  };
}

function txHash(value: number): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

function context(fixture: Awaited<ReturnType<typeof createFixture>>, services: McpToolContext["services"]): McpToolContext {
  return {
    store: fixture.store,
    state: fixture.state,
    deploymentName: "anvil",
    chainId: deployment.chainId,
    services,
    malicious: true,
    maxPayment: 100n,
    nowSeconds: 1_000n,
    treasuryVaults: [deployment.vault],
  };
}

describe("treasury tools", () => {
  it("rejects PAY-only and TREASURY-only cross-capability calls before touching a backend", async () => {
    const payOnly = await createFixture({ cap: 1n });
    await payOnly.store.saveBundle(payOnly.bundle, { pair: payOnly.store.pairingSecret });
    const supply = vi.fn();
    await expect(treasurySupply(context(payOnly, {
      treasury: { supply, withdraw: async () => { throw new Error("unexpected"); }, status: async () => ({}) },
    }), {
      vault: deployment.vault,
      amount: 1n,
      termSeconds: 60n,
    })).rejects.toMatchObject({ code: "capability_mismatch" });
    expect(supply).not.toHaveBeenCalled();

    const treasuryOnly = await createFixture({ cap: 2n });
    await treasuryOnly.store.saveBundle(treasuryOnly.bundle, { pair: treasuryOnly.store.pairingSecret });
    const treasury = {
      supply: vi.fn(),
      withdraw: vi.fn(),
      status: vi.fn(),
    };
    const { pay } = await import("../src/tools.js");
    await expect(pay(context(treasuryOnly, { treasury }), {
      url: "https://merchant.test/report",
      maxAmount: 1n,
    })).rejects.toMatchObject({ code: "capability_mismatch" });
    expect(treasury.supply).not.toHaveBeenCalled();
  });

  it("rejects a non-whitelisted vault and an amount above the local balance without generating a request", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const supply = vi.fn();
    const treasury = {
      supply,
      withdraw: async () => { throw new Error("unexpected"); },
      status: async () => ({}),
    };
    await expect(treasurySupply(context(fixture, { treasury }), {
      vault: "0x9999999999999999999999999999999999999999",
      amount: 1n,
      termSeconds: 60n,
    })).rejects.toMatchObject({ code: "treasury_vault_not_allowed" });
    await expect(treasurySupply(context(fixture, { treasury }), {
      vault: deployment.vault,
      amount: 81n,
      termSeconds: 60n,
    })).rejects.toMatchObject({ code: "insufficient_budget" });
    expect(supply).not.toHaveBeenCalled();
  });

  it("recovers and persists a position from its on-chain event", async () => {
    const fixture = await createFixture();
    const returnNote: Note = {
      own: [fixture.store.holder.Ax, fixture.store.holder.Ay],
      q: 19n,
      lin: [fixture.c0.hash, fixture.c1.hash, 0n, 0n],
      rho: 42n,
    };
    const returnMemo = `0x${Buffer.from(await encodeNoteMemo(returnNote, fixture.store.boxPublicKey)).toString("hex")}` as Hex;
    const opened = rawEvent(
      "PositionOpened",
      { positionId: 7n, vault: deployment.vault },
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
      [20n, 20n, 1_060n, noteCm(returnNote), 19n, returnMemo],
      0,
      txHash(7),
    );
    const onchain: OnChainTreasuryPosition = {
      vault: deployment.vault,
      shares: 20n,
      maturity: 1_060n,
      returnCm: noteCm(returnNote),
      expectedQ: 19n,
      returnMemo,
      withdrawn: false,
    };
    const chain: TreasuryChain = {
      latestTimestamp: async () => 1_000n,
      quote: async () => 19n,
      position: async (positionId) => positionId === 7n ? onchain : undefined,
      positionLogs: async () => [opened],
      transactionLogs: async () => [],
    };
    const service = createShadowpassTreasuryService({
      store: fixture.store,
      deployment,
      state: () => fixture.state,
      maxPayment: 100n,
      chain,
    });

    await expect(service.status()).resolves.toEqual({
      positions: [{
        positionId: "7",
        vault: deployment.vault,
        amount: "20",
        expectedQ: "19",
        maturity: "1060",
        returnCm: noteCm(returnNote).toString(),
        withdrawn: false,
        openTx: undefined,
        withdrawTx: undefined,
      }],
    });
    expect(await fixture.store.treasuryPositions()).toEqual([
      expect.objectContaining({ positionId: "7", returnCm: noteCm(returnNote).toString(), withdrawn: false }),
    ]);
  });

  it("serializes concurrent supplies, persists unique positions and recovers the withdrawal note from chain logs", async () => {
    const fixture = await createFixture({ noteQ: 80n });
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    let timestamp = 1_000n;
    let positionId = 0;
    let txCounter = 0;
    let activeProofs = 0;
    let maxActiveProofs = 0;
    const witnessInputs: Array<Record<string, unknown>> = [];
    const positions = new Map<string, OnChainTreasuryPosition>();
    const openedLogs: unknown[] = [];
    const actionCalls: string[] = [];

    const chain: TreasuryChain = {
      latestTimestamp: async () => timestamp,
      quote: async () => 19n,
      position: async (id) => positions.get(id.toString()),
      positionLogs: async () => [...openedLogs],
      transactionLogs: async () => [],
    };

    const relay: TreasuryRelay = {
      async relay(action, args) {
        actionCalls.push(action);
        const tx = txHash(++txCounter);
        if (action === "execute") {
          const actionValue = args.action as Record<string, unknown>;
          const budget = args.budget as Record<string, unknown>;
          expect(actionValue.target).toBe(deployment.treasury);
          expect(actionValue.method).toBe(TREASURY_SUPPLY_METHOD);
          const [vault, term, returnCm, expectedQ, returnMemo] = decodeAbiParameters(
            [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
            String(actionValue.params) as Hex,
          );
          const returnNote = await decodeNoteMemo(returnMemo, fixture.store.boxPrivateKey);
          expect(returnNote).toMatchObject({
            own: [fixture.store.holder.Ax, fixture.store.holder.Ay],
            q: 19n,
            lin: [fixture.c0.hash, fixture.c1.hash, 0n, 0n],
          });
          expect(returnNote!.rho).toBeLessThan(1n << 250n);
          expect(noteCm(returnNote!)).toBe(returnCm);
          const change = await decodeNoteMemo(String(args.memoChange) as Hex, fixture.store.boxPrivateKey);
          expect(change).not.toBeNull();
          const noteTree = new MerkleTree([...fixture.state.notes.leaves, noteCm(change!)]);
          const id = BigInt(++positionId);
          const maturity = timestamp + term;
          const opened = rawEvent(
            "PositionOpened",
            { positionId: id, vault },
            [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
            [BigInt(actionValue.amount as string), BigInt(actionValue.amount as string), maturity, returnCm, expectedQ, returnMemo],
            0,
            tx,
          );
          openedLogs.push(opened);
          positions.set(id.toString(), {
            vault,
            shares: BigInt(actionValue.amount as string),
            maturity,
            returnCm,
            expectedQ,
            returnMemo,
            withdrawn: false,
          });
          return {
            transaction: tx,
            blockNumber: "2",
            logs: [
              opened,
              rawEvent("NullifierSpent", { nullifier: budget.budgetNf }, [], [], 1, tx),
              rawEvent("NoteInserted", { cm: noteCm(change!) }, [{ type: "uint256" }, { type: "uint256" }], [BigInt(fixture.state.notes.size), noteTree.root], 2, tx),
              rawEvent("NoteMemo", { cm: noteCm(change!) }, [{ type: "bytes" }], [`0x${Buffer.from(await encodeNoteMemo(change!, fixture.store.boxPublicKey)).toString("hex")}`], 3, tx),
            ],
          };
        }
        const withdrawalPositionId = String(args.positionId);
        const position = positions.get(withdrawalPositionId)!;
        position.withdrawn = true;
        const returnNote = await decodeNoteMemo(position.returnMemo, fixture.store.boxPrivateKey);
        expect(returnNote).not.toBeNull();
        const noteTree = new MerkleTree([...fixture.state.notes.leaves, noteCm(returnNote!)]);
        return {
          transaction: tx,
          blockNumber: "3",
          logs: [
            rawEvent("NoteInserted", { cm: noteCm(returnNote!) }, [{ type: "uint256" }, { type: "uint256" }], [BigInt(fixture.state.notes.size), noteTree.root], 0, tx),
            rawEvent("NoteMemo", { cm: noteCm(returnNote!) }, [{ type: "bytes" }], [position.returnMemo], 1, tx),
          ],
        };
      },
    };

    const service = createShadowpassTreasuryService({
      store: fixture.store,
      deployment,
      state: () => fixture.state,
      maxPayment: 100n,
      chain,
      relay,
      prover: {
        async prove(_circuit, input) {
          activeProofs += 1;
          maxActiveProofs = Math.max(maxActiveProofs, activeProofs);
          await new Promise((resolve) => setTimeout(resolve, 5));
          activeProofs -= 1;
          witnessInputs.push(input);
          return fixtureProof;
        },
        async verify() { return true; },
      },
    });
    const services = { treasury: service };
    const toolContext = context(fixture, services);
    const [first, second] = await Promise.all([
      treasurySupply(toolContext, { vault: deployment.vault, amount: 20n, termSeconds: 60n }),
      treasurySupply(toolContext, { vault: deployment.vault, amount: 20n, termSeconds: 60n }),
    ]);
    expect(maxActiveProofs).toBe(1);
    expect(actionCalls).toEqual(["execute", "execute"]);
    expect([first.positionId, second.positionId].sort()).toEqual(["1", "2"]);
    expect(first.budgetNf).not.toBe(second.budgetNf);
    expect(witnessInputs.map((input) => input.act_req_cap)).toEqual(["2", "2"]);
    expect(fixture.state.spentNullifiers.size).toBe(2);
    expect((await fixture.store.notes()).at(-1)?.q).toBe("40");
    expect((await fixture.store.treasuryPositions()).map((position) => position.positionId)).toEqual(["1", "2"]);

    timestamp = 1_060n;
    const withdrawal = await treasuryWithdraw(toolContext, 1n);
    expect(withdrawal).toMatchObject({ positionId: "1", recovered: true });
    const returned = await decodeNoteMemo(positions.get("1")!.returnMemo, fixture.store.boxPrivateKey);
    expect((await fixture.store.notes()).some((note) => noteCm({
      own: [BigInt(note.own[0]), BigInt(note.own[1])],
      q: BigInt(note.q),
      lin: note.lin.map(BigInt) as Note["lin"],
      rho: BigInt(note.rho),
    }) === noteCm(returned!))).toBe(true);
    const status = await service.status();
    expect(status.positions).toEqual(expect.arrayContaining([
      expect.objectContaining({ positionId: "1", withdrawn: true }),
      expect.objectContaining({ positionId: "2", withdrawn: false }),
    ]));
    expect(actionCalls).toEqual(["execute", "execute", "treasuryWithdraw"]);
  }, 30_000);

  it("rejects withdrawal before maturity without contacting the relay", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const returnNote: Note = fixture.note;
    await fixture.store.upsertTreasuryPosition({
      positionId: "1",
      vault: deployment.vault,
      amount: "20",
      expectedQ: "19",
      maturity: "2000",
      returnCm: noteCm(returnNote).toString(),
      returnMemo: `0x${Buffer.from(await encodeNoteMemo(returnNote, fixture.store.boxPublicKey)).toString("hex")}`,
      returnNote: fixture.bundle.note,
      openTx: txHash(1),
      openedAt: new Date().toISOString(),
      withdrawn: false,
    });
    const relay = vi.fn();
    const chain: TreasuryChain = {
      latestTimestamp: async () => 1_999n,
      quote: async () => 0n,
      position: async () => ({
        vault: deployment.vault,
        shares: 20n,
        maturity: 2_000n,
        returnCm: noteCm(returnNote),
        expectedQ: 19n,
        returnMemo: `0x${Buffer.from(await encodeNoteMemo(returnNote, fixture.store.boxPublicKey)).toString("hex")}`,
        withdrawn: false,
      }),
      positionLogs: async () => [],
      transactionLogs: async () => [],
    };
    const service = createShadowpassTreasuryService({
      store: fixture.store,
      deployment,
      state: () => fixture.state,
      maxPayment: 100n,
      chain,
      relay: { relay },
    });
    await expect(treasuryWithdraw(context(fixture, { treasury: service }), 1n)).rejects.toMatchObject({
      code: "treasury_not_matured",
    });
    expect(relay).not.toHaveBeenCalled();
  });

});
