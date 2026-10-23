import {
  decodeMessage,
  encodeMessage,
  scanBill,
  type BillEntry,
  type ChainState,
  type MailboxEntry,
  type MailboxMessage,
  type ReceiptMessage,
} from "@shadowpass/sdk";
import type { WalletGateway } from "./chain";
import type { CardRecord, WalletLedger } from "./types";

export interface ChainReceipt extends ReceiptMessage {
  mailboxId: number;
  receivedAtMs?: number;
}

export interface WalletBill extends BillEntry {
  chainTimeMs: number;
  cardId?: string;
  agentName?: string;
  reported: boolean;
  receipt?: ChainReceipt;
}

export interface MailboxReader {
  pollAll<T>(keyPair: unknown, after?: number): Promise<MailboxEntry<T>[]>;
}

export interface BillSnapshot {
  state: ChainState;
  logs: unknown[];
  bills: WalletBill[];
  receipts: ChainReceipt[];
}

function receiptValue(value: unknown): ReceiptMessage | null {
  try {
    const message = decodeMessage(encodeMessage(value as MailboxMessage));
    return message.type === "receipt" ? message : null;
  } catch {
    return null;
  }
}

export function receiptsFromMailbox(entries: readonly MailboxEntry<unknown>[]): ChainReceipt[] {
  const receipts: ChainReceipt[] = [];
  for (const entry of entries) {
    if (!entry.decoded) continue;
    const value = receiptValue(entry.value);
    if (!value) continue;
    receipts.push({
      ...value,
      mailboxId: entry.id,
      ...(entry.ts === undefined ? {} : { receivedAtMs: entry.ts < 10_000_000_000 ? entry.ts * 1_000 : entry.ts }),
    });
  }
  return receipts;
}

function matchingReceipt(bill: BillEntry, receipts: readonly ChainReceipt[]): ChainReceipt | undefined {
  if (!bill.txHash || bill.amount === undefined) return undefined;
  const tx = bill.txHash.toLowerCase();
  return receipts.find((receipt) =>
    receipt.budgetNf === bill.budgetNf.toString()
    && receipt.tx.toLowerCase() === tx
    && receipt.amount === bill.amount!.toString()
  );
}

function owningCard(chain: BillEntry["chain"], cards: readonly CardRecord[]): CardRecord | undefined {
  const terminal = chain?.at(-1);
  if (!terminal) return undefined;
  return cards.find((card) =>
    BigInt(card.agentPk.x) === terminal.x && BigInt(card.agentPk.y) === terminal.y
  );
}

export function mergeWalletBills(options: {
  entries: readonly BillEntry[];
  ledger: WalletLedger;
  receipts: readonly ChainReceipt[];
  blockTimes?: ReadonlyMap<string, number>;
  fallbackTimeMs?: number;
}): WalletBill[] {
  const fallback = options.fallbackTimeMs ?? Date.now();
  return options.entries.map((bill) => {
    const card = owningCard(bill.chain, options.ledger.cards);
    const receipt = matchingReceipt(bill, options.receipts);
    const blockTime = bill.blockNumber === undefined ? undefined : options.blockTimes?.get(bill.blockNumber.toString());
    return {
      ...bill,
      chainTimeMs: blockTime ?? fallback,
      ...(card ? { cardId: card.id, agentName: card.name } : {}),
      reported: receipt !== undefined,
      ...(receipt ? { receipt } : {}),
    };
  }).sort((left, right) => {
    const leftBlock = left.blockNumber ?? -1n;
    const rightBlock = right.blockNumber ?? -1n;
    return leftBlock === rightBlock ? right.chainTimeMs - left.chainTimeMs : leftBlock < rightBlock ? 1 : -1;
  });
}

export async function loadBillSnapshot(options: {
  ledger: WalletLedger;
  gateway: WalletGateway;
  mailbox: MailboxReader;
  bundle: { view: { vsk: bigint }; box: unknown };
  mailboxCursor?: number;
}): Promise<BillSnapshot> {
  const [state, logs, mailboxEntries] = await Promise.all([
    options.gateway.sync(),
    options.gateway.logs(),
    options.mailbox.pollAll<unknown>(options.bundle.box, options.mailboxCursor ?? 0),
  ]);
  const receipts = receiptsFromMailbox(mailboxEntries);
  const entries = scanBill(state, logs, options.bundle.view.vsk);
  const blockNumbers = entries.flatMap((entry) => entry.blockNumber === undefined ? [] : [entry.blockNumber]);
  const blockTimes = blockNumbers.length === 0 ? new Map<string, number>() : await options.gateway.blockTimestamps(blockNumbers);
  return {
    state,
    logs,
    receipts,
    bills: mergeWalletBills({ entries, ledger: options.ledger, receipts, blockTimes }),
  };
}
