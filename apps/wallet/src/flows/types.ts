import type { CertificateBundle, Hex } from "@shadowpass/sdk";

export type Capability = "PAY" | "TREASURY";

export const CAP_PAY = 1n;
export const CAP_TREASURY = 2n;
export const TOKEN_DECIMALS = 6;

export interface PairingPayload {
  v: 1;
  name: string;
  agentPk: { x: bigint; y: bigint };
  boxPk: string;
  pair: string;
}

export interface StoredNote {
  note: CertificateBundle["note"];
  cm: string;
  tx: string;
  kind: "deposit" | "change" | "card";
  createdAt: string;
}

export interface CredentialDelivery {
  type: "credential";
  pair: string;
  bundle: CertificateBundle;
}

export interface CardRecord {
  id: string;
  name: string;
  agentPk: { x: string; y: string };
  boxPk: string;
  cap: string;
  budget: string;
  expiry: string;
  status: "issued" | "pending_delivery" | "delivered";
  cert: CertificateBundle["chain"][number];
  note: CertificateBundle["note"] | null;
  issueTx: string;
  transferTx?: string;
  mailboxId?: number;
  delivery?: CredentialDelivery;
  ownerSeq?: number;
  ownerVersion?: string;
  timings: { proofMs: number; chainMs: number; totalMs: number };
  createdAt: string;
}

export interface BudgetTransferCall {
  proof: Omit<CalldataProof, "publicSignals">;
  noteRoot: string;
  revokedRoot: string;
  nullifier: string;
  cm1: string;
  cm2: string;
  memo1: string;
  memo2: string;
}

export interface PendingBudgetCandidate {
  call: BudgetTransferCall;
  agentNote: CertificateBundle["note"];
  changeNote: CertificateBundle["note"] | null;
  transferTx?: string;
}

export interface PendingBudgetTransfer {
  parentCm: string;
  card: CardRecord;
  changeNote: CertificateBundle["note"] | null;
  call: BudgetTransferCall;
  hasChange: boolean;
  candidates?: PendingBudgetCandidate[];
  createdAt: string;
}

export interface WalletLedger {
  v: 1;
  chainId: number;
  deployment: string;
  ownerAx: string;
  root: CertificateBundle["chain"][number] | null;
  registrationTx?: string;
  onboardedAt?: string;
  rootRegistered?: boolean;
  ownerRootSeq?: number;
  ownerRootVersion?: string;
  nextOwnerSeq?: number;
  pendingTransfer?: PendingBudgetTransfer;
  notes: StoredNote[];
  cards: CardRecord[];
  updatedAt: string;
}

export interface OwnerRootRecord {
  type: "owner_root";
  seq: number;
  cert0: CertificateBundle["chain"][number];
  mac: string;
}

export interface OwnerCardRecord {
  type: "owner_card";
  seq: number;
  cardId: string;
  card: Omit<CardRecord, "boxPk"> & { agentBox: string };
  mac: string;
}

export interface RelayResult {
  transaction: Hex;
  blockNumber: string;
  logs: unknown[];
}

export interface CalldataProof {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  publicSignals: string[];
}

export type ProgressReporter = (message: string) => void;

export function emptyLedger(chainId: number, deployment: string, ownerAx: bigint): WalletLedger {
  return {
    v: 1,
    chainId,
    deployment,
    ownerAx: ownerAx.toString(),
    root: null,
    notes: [],
    cards: [],
    updatedAt: new Date().toISOString(),
  };
}

export function formatAmount(baseUnits: bigint): string {
  const whole = baseUnits / 1_000_000n;
  const fraction = (baseUnits % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseAmount(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) throw new Error("amount must have at most 6 decimal places");
  const [whole = "0", fraction = ""] = normalized.split(".");
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
  if (amount <= 0n) throw new Error("amount must be greater than zero");
  return amount;
}

export function capValue(capability: Capability): bigint {
  return capability === "PAY" ? CAP_PAY : CAP_TREASURY;
}
