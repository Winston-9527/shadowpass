import { describe, expect, it, vi } from "vitest";
import "../sdk";
import {
  ChainState,
  deriveKeys,
  encryptChain,
  issue,
  issueRoot,
  scanBill,
  type MailboxEntry,
  type ReceiptMessage,
} from "@shadowpass/sdk";
import { serializeCert } from "./cert";
import { loadBillSnapshot, mergeWalletBills, receiptsFromMailbox, type MailboxReader } from "./bill";
import type { WalletGateway } from "./chain";
import { emptyLedger, type CardRecord } from "./types";

const TX = `0x${"12".repeat(32)}` as const;

function flatten(ct: ReturnType<typeof encryptChain>): string[] {
  return [ct.c1.x, ct.c1.y, ct.c2.x, ct.c2.y, ...ct.e, ct.esign].map(String);
}

async function fixture() {
  const owner = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const agent = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 91));
  const other = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 131));
  const c0 = issueRoot(owner.sign, owner.steward, 3n, 2_000_200_000n, owner.view.vpk, owner.view.w);
  const c1 = issue(c0, agent.sign, 1n, 2_000_100_000n);
  const card: CardRecord = {
    id: c1.hash.toString(),
    name: "buyer",
    agentPk: { x: agent.sign.Ax.toString(), y: agent.sign.Ay.toString() },
    boxPk: "00".repeat(32),
    cap: "1",
    budget: "40000000",
    expiry: c1.expiry.toString(),
    status: "delivered",
    cert: serializeCert(c1),
    note: null,
    issueTx: TX,
    timings: { proofMs: 1, chainMs: 2, totalMs: 3 },
    createdAt: new Date().toISOString(),
  };
  const ledger = { ...emptyLedger(31337, "anvil", owner.sign.Ax), root: serializeCert(c0), cards: [card] };
  const encryption = encryptChain(
    [owner.sign, owner.steward, agent.sign].map((identity) => ({ x: identity.Ax, y: identity.Ay })),
    owner.view.vpk,
  );
  const logs = [
    { eventName: "Executed", args: { budgetNf: 77n, target: `0x${"34".repeat(20)}`, method: "0x12345678", amount: 21_000_000n }, blockNumber: 4n, transactionHash: TX, logIndex: 0 },
    { eventName: "OwnerCiphertext", args: { budgetNf: 77n, ct: flatten(encryption) }, blockNumber: 4n, transactionHash: TX, logIndex: 1 },
  ];
  return { owner, agent, other, c0, c1, ledger, logs, card };
}

describe("wallet bill reconciliation", () => {
  it("attributes the terminal chain key and only accepts a chain-matching receipt", async () => {
    const { owner, ledger, logs, card } = await fixture();
    const entries = scanBill(new ChainState(), logs, owner.view.vsk);
    const receipt: ReceiptMessage = { type: "receipt", budgetNf: "77", tx: TX, resource: "report", amount: "21000000" };
    const mailbox: MailboxEntry<unknown>[] = [
      { id: 1, ct: "x", decoded: true, value: receipt, ts: 1_700_000_000 },
      { id: 2, ct: "x", decoded: true, value: { ...receipt, amount: "1" } },
      { id: 3, ct: "x", decoded: false, error: "sealed" },
      { id: 4, ct: "x", decoded: true, value: { type: "receipt", budgetNf: "77" } },
    ];
    const receipts = receiptsFromMailbox(mailbox);
    expect(receipts).toHaveLength(2);
    const [bill] = mergeWalletBills({ entries, ledger, receipts, blockTimes: new Map([["4", 1_700_000_000_000]]) });
    expect(bill).toMatchObject({ cardId: card.id, agentName: "buyer", reported: true, amount: 21_000_000n });
    expect(bill?.chain?.at(-1)?.x).toBe(BigInt(card.agentPk.x));

    const [unreported] = mergeWalletBills({ entries, ledger, receipts: receipts.slice(1), blockTimes: new Map([["4", 1_700_000_000_000]]) });
    expect(unreported?.reported).toBe(false);
  });

  it("cannot decrypt or attribute any bill with another view key", async () => {
    const { other, ledger, logs } = await fixture();
    const entries = scanBill(new ChainState(), logs, other.view.vsk);
    const bills = mergeWalletBills({ entries, ledger, receipts: [] });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.chain).toBeNull();
    expect(bills).toHaveLength(0);
  });

  it("attributes a delegated payment through validated delegated messages", async () => {
    const { owner, ledger, c1, card } = await fixture();
    const child = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 171));
    const c2 = issue(c1, child.sign, 1n, 2_000_050_000n);
    const encryption = encryptChain(
      [owner.sign, owner.steward, { Ax: BigInt(card.agentPk.x), Ay: BigInt(card.agentPk.y) }, child.sign]
        .map((identity) => ({ x: identity.Ax, y: identity.Ay })),
      owner.view.vpk,
    );
    const logs = [
      { eventName: "Executed", args: { budgetNf: 88n, target: `0x${"34".repeat(20)}`, method: "0x12345678", amount: 2_000_000n }, blockNumber: 5n, transactionHash: `0x${"56".repeat(32)}`, logIndex: 0 },
      { eventName: "OwnerCiphertext", args: { budgetNf: 88n, ct: flatten(encryption) }, blockNumber: 5n, transactionHash: `0x${"56".repeat(32)}`, logIndex: 1 },
    ];
    const entries = scanBill(new ChainState(), logs, owner.view.vsk);
    const delegations = [{
      type: "delegated" as const,
      parent: c1.hash.toString(),
      cert: serializeCert(c2),
      mailboxId: 9,
    }];
    const [payment] = mergeWalletBills({ entries, ledger, receipts: [], delegations });
    expect(payment).toMatchObject({ cardId: card.id, agentName: "buyer", amount: 2_000_000n });
  });

  it("advances the mailbox cursor and reuses receipts across polls", async () => {
    const { owner, ledger } = await fixture();
    const firstReceipt = { type: "receipt", budgetNf: "1", tx: TX, resource: "one", amount: "1" };
    const secondReceipt = { type: "receipt", budgetNf: "2", tx: TX, resource: "two", amount: "2" };
    const pollAll = vi.fn(async <T,>(_key: unknown, after = 0): Promise<MailboxEntry<T>[]> => (after === 0
      ? [{ id: 3, ct: "x", decoded: true, value: firstReceipt }]
      : [{ id: 7, ct: "x", decoded: true, value: secondReceipt }]) as MailboxEntry<T>[]);
    const gateway = {
      poll: async () => ({ state: new ChainState(), logs: [] }),
      blockTimestamps: async (blocks: readonly bigint[]) => new Map(blocks.map((block) => [block.toString(), 1_700_000_000_000])),
    } as unknown as WalletGateway;
    const options = { ledger, gateway, mailbox: { pollAll } as unknown as MailboxReader, bundle: { view: { vsk: owner.view.vsk }, box: {} } };

    const first = await loadBillSnapshot(options);
    const second = await loadBillSnapshot({ ...options, mailboxCursor: first.mailboxCursor, receipts: first.receipts });
    expect(pollAll.mock.calls.map((call) => call[1])).toEqual([0, 3]);
    expect(first.mailboxCursor).toBe(3);
    expect(first.latestBlockTimeMs).toBe(1_700_000_000_000);
    expect(second.mailboxCursor).toBe(7);
    expect(second.receipts.map((receipt) => receipt.budgetNf)).toEqual(["1", "2"]);
  });
});
