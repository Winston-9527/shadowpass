import { describe, expect, it } from "vitest";
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
import { mergeWalletBills, receiptsFromMailbox } from "./bill";
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
  return { owner, agent, other, ledger, logs, card };
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
    expect(bills).toHaveLength(1);
    expect(bills[0]?.chain).toBeNull();
    expect(bills[0]?.cardId).toBeUndefined();
  });
});
