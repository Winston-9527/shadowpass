import { useState } from "react";
import { Ban, LoaderCircle, ShieldAlert } from "lucide-react";
import {
  budgetNullifier,
  keyEntry,
  noteCm,
  truncateKey,
  type BillEntry,
  type ChainState,
  type KeySet,
  type Note,
} from "@shadowpass/sdk";
import { formatAmount, type CardRecord, type WalletLedger } from "../flows/types";
import { cardIsRevoked } from "../flows/snapshot";

export interface AuthorizationCard extends Omit<CardRecord, "status"> {
  status: "active" | "expired" | "revoked" | "pending";
  remaining: bigint;
}

export interface AuthorizationTreeModel {
  owner: string;
  steward: string;
  rootCap: string;
  rootExpiry: string;
  rootRevoked: boolean;
  stewardBudget: bigint;
  cards: AuthorizationCard[];
}

function noteFromCard(card: CardRecord): Note | null {
  if (!card.note) return null;
  return {
    own: [BigInt(card.note.own[0]), BigInt(card.note.own[1])],
    q: BigInt(card.note.q),
    lin: card.note.lin.map(BigInt) as Note["lin"],
    rho: BigInt(card.note.rho),
  };
}

function spentForCard(card: CardRecord, bills: BillEntry[]): bigint {
  return bills.reduce((sum, bill) => {
    if (!bill.chain || bill.amount === undefined) return sum;
    const belongsToBranch = bill.chain.some((holder) => holder.x === BigInt(card.agentPk.x) && holder.y === BigInt(card.agentPk.y));
    return belongsToBranch ? sum + bill.amount : sum;
  }, 0n);
}

export function buildAuthorizationTree(
  ledger: WalletLedger,
  bundle: KeySet,
  state: ChainState,
  bills: BillEntry[],
  nowSeconds = BigInt(Math.floor(Date.now() / 1000)),
): AuthorizationTreeModel {
  const rootHash = ledger.root ? BigInt(ledger.root.hash) : 0n;
  const rootRevoked = state.revoked.has(truncateKey(rootHash));
  const stewardKey = truncateKey(keyEntry(bundle.steward));
  const ownerKey = truncateKey(keyEntry(bundle.sign));
  const stewardBudget = ledger.notes
    .filter((entry) => entry.kind === "deposit" || entry.kind === "change")
    .map((entry) => ({
      own: [BigInt(entry.note.own[0]), BigInt(entry.note.own[1])] as [bigint, bigint],
      q: BigInt(entry.note.q),
      lin: entry.note.lin.map(BigInt) as Note["lin"],
      rho: BigInt(entry.note.rho),
    }))
    .filter((note) => note.own[0] === bundle.steward.Ax && note.own[1] === bundle.steward.Ay)
    .filter((note) => note.lin[0] === rootHash)
    .filter((note) => state.notes.indexOf(noteCm(note)) >= 0)
    .filter((note) => !state.spentNullifiers.has(budgetNullifier(bundle.steward.sk, note).toString()))
    .reduce((sum, note) => sum + note.q, 0n);
  const cards = ledger.cards.map((card): AuthorizationCard => {
    const note = noteFromCard(card);
    const revoked = rootRevoked || cardIsRevoked(card, state) || state.revoked.has(stewardKey) || state.revoked.has(ownerKey);
    const expired = nowSeconds > BigInt(card.expiry);
    const pending = card.status !== "delivered" || !note || state.notes.indexOf(noteCm(note)) < 0;
    const spent = spentForCard(card, bills);
    const remaining = BigInt(card.budget) > spent ? BigInt(card.budget) - spent : 0n;
    return {
      ...card,
      status: revoked ? "revoked" : expired ? "expired" : pending ? "pending" : "active",
      remaining,
    };
  });
  return {
    owner: bundle.sign.Ax.toString(),
    steward: bundle.steward.Ax.toString(),
    rootCap: ledger.root?.cap ?? "0",
    rootExpiry: ledger.root?.expiry ?? "0",
    rootRevoked,
    stewardBudget,
    cards,
  };
}

function capLabel(cap: string): string {
  const value = BigInt(cap);
  if (value === 3n) return "PAY + TREASURY";
  if (value === 1n) return "PAY";
  if (value === 2n) return "TREASURY";
  return `CAP ${value.toString()}`;
}

function dateLabel(seconds: string): string {
  return new Date(Number(seconds) * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
}

export interface TreeProps {
  model: AuthorizationTreeModel;
  revocationWindowSeconds?: bigint | null;
  revocationNotice?: string | null;
  revoking?: "tree" | string | null;
  onRevokeCard?(card: AuthorizationCard): void;
  onRevokeTree?(): void;
}

export function Tree({ model, revocationWindowSeconds, revocationNotice, revoking, onRevokeCard, onRevokeTree }: TreeProps) {
  const [confirming, setConfirming] = useState<"tree" | string | null>(null);
  const confirm = (target: "tree" | string, action?: () => void) => {
    if (confirming !== target) {
      setConfirming(target);
      return;
    }
    setConfirming(null);
    action?.();
  };

  return (
    <section className="tree-panel" aria-label="Authorization tree">
      {revocationNotice && <div className="revocation-notice" role="status"><ShieldAlert size={17} /><span>{revocationNotice}</span></div>}
      <div className="tree-owner">
        <div>
          <span className="eyebrow">Owner</span>
          <strong>Alice</strong>
          <code>{model.owner.slice(0, 18)}...</code>
        </div>
        <div className="tree-owner-actions">
          <div className="tree-budget">{formatAmount(model.stewardBudget)} <span>USDC available</span></div>
          {onRevokeTree && !model.rootRevoked && (
            <button
              className={confirming === "tree" ? "button danger compact" : "button secondary compact"}
              onClick={() => confirm("tree", onRevokeTree)}
              disabled={revoking !== null && revoking !== undefined}
            >
              {revoking === "tree" ? <LoaderCircle className="spin" size={16} /> : <Ban size={16} />}
              {confirming === "tree" ? "Confirm whole tree" : "Revoke tree"}
            </button>
          )}
        </div>
      </div>
      <div className="tree-trunk" aria-hidden="true" />
      <div className="tree-steward">
        <span className="node-dot" />
        <div>
          <span className="eyebrow">Wallet steward</span>
          <strong>{capLabel(model.rootCap)}</strong>
        </div>
        <span className={model.rootRevoked ? "status-text revoked" : "muted"}>{model.rootRevoked ? "revoked" : `expires ${dateLabel(model.rootExpiry)}`}</span>
      </div>
      {revocationWindowSeconds !== null && revocationWindowSeconds !== undefined && (
        <div className="grace-window"><ShieldAlert size={15} /><span>On-chain grace window: {revocationWindowSeconds.toString()}s. Proofs from before revocation can still settle until it ends.</span></div>
      )}
      <div className="tree-cards">
        {model.cards.length === 0 ? (
          <div className="tree-empty">No Agent cards issued</div>
        ) : model.cards.map((card) => (
          <article className="tree-card" key={card.id}>
            <div className="tree-card-head">
              <span className={`status-dot ${card.status}`} />
              <strong>{card.name}</strong>
              <span className={`status-text ${card.status}`}>{card.status}</span>
            </div>
            <div className="tree-card-grid">
              <span>{capLabel(card.cap)}</span>
              <span>{formatAmount(card.remaining)} / {formatAmount(BigInt(card.budget))}</span>
              <span>expires {dateLabel(card.expiry)}</span>
              <code>{card.agentPk.x.slice(0, 16)}...</code>
            </div>
            <div className="budget-track"><span style={{ width: `${budgetPercent(card)}%` }} /></div>
            {onRevokeCard && card.status !== "revoked" && (
              <div className="tree-card-actions">
                <button
                  className={confirming === card.id ? "button danger compact" : "button secondary compact"}
                  onClick={() => confirm(card.id, () => onRevokeCard(card))}
                  disabled={revoking !== null && revoking !== undefined}
                  data-testid={`revoke-${card.name}`}
                >
                  {revoking === card.id ? <LoaderCircle className="spin" size={15} /> : <Ban size={15} />}
                  {confirming === card.id ? "Confirm revoke" : "Revoke Agent"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function budgetPercent(card: AuthorizationCard): number {
  const total = BigInt(card.budget);
  if (total === 0n) return 0;
  return Number((card.remaining * 100n) / total);
}
