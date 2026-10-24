import {
  decodeMessage,
  encodeMessage,
  scanBill,
  verifyBundleCert,
  type BillEntry,
  type ChainState,
  type DelegatedMessage,
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

export interface ChainDelegation extends DelegatedMessage {
  mailboxId: number;
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
  delegations: ChainDelegation[];
  mailboxCursor: number;
  latestBlockTimeMs: number;
}

function mailboxMessage(value: unknown): MailboxMessage | null {
  try {
    return decodeMessage(encodeMessage(value as MailboxMessage));
  } catch {
    return null;
  }
}

export function receiptsFromMailbox(entries: readonly MailboxEntry<unknown>[]): ChainReceipt[] {
  const receipts: ChainReceipt[] = [];
  for (const entry of entries) {
    if (!entry.decoded) continue;
    const value = mailboxMessage(entry.value);
    if (value?.type !== "receipt") continue;
    receipts.push({
      ...value,
      mailboxId: entry.id,
      ...(entry.ts === undefined ? {} : { receivedAtMs: entry.ts < 10_000_000_000 ? entry.ts * 1_000 : entry.ts }),
    });
  }
  return receipts;
}

export function delegationsFromMailbox(entries: readonly MailboxEntry<unknown>[]): ChainDelegation[] {
  const delegations: ChainDelegation[] = [];
  for (const entry of entries) {
    if (!entry.decoded) continue;
    const value = mailboxMessage(entry.value);
    if (value?.type !== "delegated" || value.cert.hop < 1 || !verifyBundleCert(value.cert)) continue;
    delegations.push({ ...value, mailboxId: entry.id });
  }
  return delegations;
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

function pointMatchesCard(point: { x: bigint; y: bigint } | undefined, card: CardRecord): boolean {
  return point !== undefined && point.x === BigInt(card.agentPk.x) && point.y === BigInt(card.agentPk.y);
}

function delegationCard(
  terminal: { x: bigint; y: bigint },
  cards: readonly CardRecord[],
  delegations: readonly ChainDelegation[],
): CardRecord | undefined {
  let current = delegations.find((delegation) =>
    BigInt(delegation.cert.holder.x) === terminal.x && BigInt(delegation.cert.holder.y) === terminal.y
  );
  const visited = new Set<string>();
  while (current && !visited.has(current.cert.hash)) {
    visited.add(current.cert.hash);
    const parentCard = cards.find((card) => card.id === current!.parent);
    const issuer = { x: BigInt(current.cert.issuer.x), y: BigInt(current.cert.issuer.y) };
    if (parentCard && pointMatchesCard(issuer, parentCard)) return parentCard;
    const parent = delegations.find((delegation) => delegation.cert.hash === current!.parent);
    const parentHolder = parent && { x: BigInt(parent.cert.holder.x), y: BigInt(parent.cert.holder.y) };
    if (!parent || !parentHolder || parentHolder.x !== issuer.x || parentHolder.y !== issuer.y) return undefined;
    current = parent;
  }
  return undefined;
}

function owningCard(
  chain: BillEntry["chain"],
  cards: readonly CardRecord[],
  delegations: readonly ChainDelegation[],
): CardRecord | undefined {
  const terminal = chain?.at(-1);
  if (!terminal) return undefined;
  const direct = cards.find((card) => pointMatchesCard(terminal, card));
  if (direct) return direct;
  const delegated = delegationCard(terminal, cards, delegations);
  if (delegated) return delegated;
  return cards.find((card) => chain?.some((point) => pointMatchesCard(point, card)));
}

export function mergeWalletBills(options: {
  entries: readonly BillEntry[];
  ledger: WalletLedger;
  receipts: readonly ChainReceipt[];
  delegations?: readonly ChainDelegation[];
  blockTimes?: ReadonlyMap<string, number>;
  fallbackTimeMs?: number;
}): WalletBill[] {
  const fallback = options.fallbackTimeMs ?? Date.now();
  return options.entries.flatMap((bill) => {
    if (bill.chain === null) return [];
    const card = owningCard(bill.chain, options.ledger.cards, options.delegations ?? []);
    const receipt = matchingReceipt(bill, options.receipts);
    const blockTime = bill.blockNumber === undefined ? undefined : options.blockTimes?.get(bill.blockNumber.toString());
    return [{
      ...bill,
      chainTimeMs: blockTime ?? fallback,
      ...(card ? { cardId: card.id, agentName: card.name } : {}),
      reported: receipt !== undefined,
      ...(receipt ? { receipt } : {}),
    }];
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
  receipts?: readonly ChainReceipt[];
  delegations?: readonly ChainDelegation[];
}): Promise<BillSnapshot> {
  const [sync, mailboxEntries] = await Promise.all([
    options.gateway.poll(),
    options.mailbox.pollAll<unknown>(options.bundle.box, options.mailboxCursor ?? 0),
  ]);
  const receipts = [...(options.receipts ?? []), ...receiptsFromMailbox(mailboxEntries)];
  const delegations = [...(options.delegations ?? []), ...delegationsFromMailbox(mailboxEntries)];
  const entries = scanBill(sync.state, sync.logs, options.bundle.view.vsk);
  const blockNumbers = [...new Set([
    sync.state.lastBlock,
    ...entries.flatMap((entry) => entry.blockNumber === undefined ? [] : [entry.blockNumber]),
  ].map(String))].map(BigInt);
  const blockTimes = await options.gateway.blockTimestamps(blockNumbers);
  return {
    state: sync.state,
    logs: sync.logs,
    receipts,
    delegations,
    mailboxCursor: mailboxEntries.reduce((cursor, entry) => Math.max(cursor, entry.id), options.mailboxCursor ?? 0),
    latestBlockTimeMs: blockTimes.get(sync.state.lastBlock.toString()) ?? 0,
    bills: mergeWalletBills({ entries, ledger: options.ledger, receipts, delegations, blockTimes }),
  };
}
