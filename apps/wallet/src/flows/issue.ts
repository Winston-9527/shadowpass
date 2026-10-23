import {
  budgetNullifier,
  createNote,
  encodeNoteMemo,
  issue,
  noteCm,
  transferInput,
  verifyBundleCert,
  type CertificateBundle,
  type Cert,
  type Identity,
  type KeySet,
  type Note,
} from "@shadowpass/sdk";
import { serializeCert } from "./cert";
import { waitForChainState, type WalletGateway } from "./chain";
import { assertMemoInLogs, memoHex } from "./memo";
import type { ProofService } from "./prove";
import type { PairingPayload, ProgressReporter, WalletLedger } from "./types";
import { bytesToHex } from "../lib/bytes";

export interface CredentialMailer {
  send(toPk: Uint8Array | string, message: unknown): Promise<number>;
}

export interface IssueCardOptions {
  ledger: WalletLedger;
  bundle: KeySet;
  pairing: PairingPayload;
  capability: bigint;
  budget: bigint;
  expiry: bigint;
  gateway: WalletGateway;
  proofs: ProofService;
  mailer: CredentialMailer;
  onCheckpoint?(ledger: WalletLedger): Promise<void>;
  progress?: ProgressReporter;
  nowSeconds?: bigint;
}

export interface IssueCardResult {
  ledger: WalletLedger;
  cardId: string;
  mailboxId: number;
  timings: { proofMs: number; chainMs: number; totalMs: number };
}

function storedNote(note: Note): WalletLedger["notes"][number]["note"] {
  return {
    own: [note.own[0].toString(), note.own[1].toString()],
    q: note.q.toString(),
    lin: note.lin.map(String) as WalletLedger["notes"][number]["note"]["lin"],
    rho: note.rho.toString(),
  };
}

function noteFromStored(note: WalletLedger["notes"][number]["note"]): Note {
  return {
    own: [BigInt(note.own[0]), BigInt(note.own[1])],
    q: BigInt(note.q),
    lin: note.lin.map(BigInt) as Note["lin"],
    rho: BigInt(note.rho),
  };
}

function stripProof(proof: Awaited<ReturnType<ProofService["prove"]>>): { a: string[]; b: string[][]; c: string[] } {
  return { a: [...proof.a], b: proof.b.map((row) => [...row]), c: [...proof.c] };
}

export async function issueCard(options: IssueCardOptions): Promise<IssueCardResult> {
  const started = performance.now();
  const now = options.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
  if (!options.ledger.root) throw new Error("onboard the wallet before issuing a card");
  if (options.capability !== 1n && options.capability !== 2n) throw new Error("capability must be PAY or TREASURY");
  if (options.budget <= 0n) throw new Error("budget must be greater than zero");
  if (options.expiry <= now) throw new Error("card expiry must be in the future");
  if (options.expiry > BigInt(options.ledger.root.expiry)) throw new Error("card expiry exceeds the root certificate");

  const state = await options.gateway.sync();
  const root = options.ledger.root;
  const rootHash = BigInt(root.hash);
  if (state.rootTree.indexOf(rootHash) < 0) throw new Error("root certificate is not registered on-chain");
  const spendable = options.ledger.notes
    .filter((entry) => entry.kind === "deposit" || entry.kind === "change")
    .map((entry) => ({ entry, note: noteFromStored(entry.note) }))
    .filter(({ note }) => note.own[0] === options.bundle.steward.Ax && note.own[1] === options.bundle.steward.Ay)
    .filter(({ note }) => note.lin[0] === rootHash)
    .filter(({ note }) => state.notes.indexOf(noteCm(note)) >= 0)
    .filter(({ note }) => !state.spentNullifiers.has(budgetNullifier(options.bundle.steward.sk, note).toString()))
    .sort((left, right) => Number(right.note.q - left.note.q));
  const parent = spendable.find(({ note }) => note.q >= options.budget);
  if (!parent) throw new Error("insufficient steward budget");

  const holder: Identity = {
    prv: new Uint8Array(32),
    Ax: options.pairing.agentPk.x,
    Ay: options.pairing.agentPk.y,
    sk: 0n,
  };
  const cert0 = rootToCert(root, options.bundle);
  const cert1 = issue(cert0, holder, options.capability, options.expiry);
  const serializedCert1 = serializeCert(cert1);
  if (!verifyBundleCert(serializedCert1)) throw new Error("Agent public key or issued certificate is invalid");

  let chainMs = 0;
  let issueTransaction: string | undefined;
  const chainStarted = performance.now();
  if (state.issued.indexOf(cert1.hash) < 0) {
    options.progress?.("Issuing Agent certificate");
    issueTransaction = (await options.gateway.relay("issue", { certHash: cert1.hash.toString() })).transaction;
  }

  const q1 = options.budget;
  const q2 = parent.note.q - q1;
  const transfer = transferInput({
    holder: options.bundle.steward,
    note: parent.note,
    child: cert1,
    q1,
    q2,
    state,
  });
  const agentMemo = await encodeNoteMemo(transfer.out1, options.pairing.boxPk);
  const changeMemo = await encodeNoteMemo(transfer.out2, options.bundle.box.publicKey);
  options.progress?.("Generating budget transfer proof");
  const proofStarted = performance.now();
  const proof = await options.proofs.prove("budget_transfer", transfer.input);
  const proofMs = performance.now() - proofStarted;
  options.progress?.("Transferring Agent budget");
  const receipt = await options.gateway.relay("transferBudget", {
    proof: stripProof(proof),
    noteRoot: proof.publicSignals[0]!,
    revokedRoot: proof.publicSignals[1]!,
    nullifier: proof.publicSignals[2]!,
    cm1: proof.publicSignals[3]!,
    cm2: proof.publicSignals[4]!,
    memo1: memoHex(agentMemo),
    memo2: memoHex(changeMemo),
  });
  assertMemoInLogs(receipt.logs, transfer.out1, agentMemo);
  assertMemoInLogs(receipt.logs, transfer.out2, changeMemo);
  await waitForChainState(
    options.gateway,
    (candidate) => candidate.issued.indexOf(cert1.hash) >= 0
      && candidate.notes.indexOf(noteCm(transfer.out1)) >= 0
      && (q2 === 0n || candidate.notes.indexOf(noteCm(transfer.out2)) >= 0),
  );
  chainMs = performance.now() - chainStarted;

  const cardId = cert1.hash.toString();
  const chain: CertificateBundle["chain"] = [root, serializedCert1];
  const certificateBundle: CertificateBundle = {
    v: 1,
    chainId: options.ledger.chainId,
    deployment: options.ledger.deployment,
    chain,
    note: storedNote(transfer.out1),
    owner: { box: bytesToHex(options.bundle.box.publicKey) },
  };
  const createdAt = new Date().toISOString();
  let ledger: WalletLedger = {
    ...options.ledger,
    notes: [
      ...options.ledger.notes.filter((entry) => entry.cm !== parent.entry.cm),
      { note: storedNote(transfer.out1), cm: noteCm(transfer.out1).toString(), tx: receipt.transaction, kind: "card", createdAt },
      ...(q2 > 0n ? [{ note: storedNote(transfer.out2), cm: noteCm(transfer.out2).toString(), tx: receipt.transaction, kind: "change" as const, createdAt }] : []),
    ],
    cards: [
      ...options.ledger.cards.filter((card) => card.id !== cardId),
      {
        id: cardId,
        name: options.pairing.name,
        agentPk: { x: options.pairing.agentPk.x.toString(), y: options.pairing.agentPk.y.toString() },
        boxPk: options.pairing.boxPk,
        cap: options.capability.toString(),
        budget: q1.toString(),
        expiry: options.expiry.toString(),
        status: "pending_delivery",
        cert: serializedCert1,
        note: storedNote(transfer.out1),
        issueTx: issueTransaction ?? options.ledger.cards.find((card) => card.id === cardId)?.issueTx ?? "",
        transferTx: receipt.transaction,
        timings: { proofMs, chainMs, totalMs: performance.now() - started },
        createdAt,
      },
    ],
    updatedAt: createdAt,
  };
  await options.onCheckpoint?.(ledger);
  options.progress?.("Delivering encrypted credential");
  const mailboxId = await options.mailer.send(options.pairing.boxPk, {
    type: "credential",
    pair: options.pairing.pair,
    bundle: certificateBundle,
  });
  ledger = {
    ...ledger,
    cards: ledger.cards.map((card) => card.id === cardId ? { ...card, status: "delivered", mailboxId } : card),
    updatedAt: new Date().toISOString(),
  };
  await options.onCheckpoint?.(ledger);
  return { ledger, cardId, mailboxId, timings: { proofMs, chainMs, totalMs: performance.now() - started } };
}

function rootToCert(root: CertificateBundle["chain"][number], bundle: KeySet): Cert {
  return {
    hop: root.hop,
    issuer: bundle.sign,
    holder: bundle.steward,
    cap: BigInt(root.cap),
    expiry: BigInt(root.expiry),
    sig: { S: BigInt(root.sig.S), R8x: BigInt(root.sig.R8x), R8y: BigInt(root.sig.R8y) },
    vpk: root.vpk ? { x: BigInt(root.vpk.x), y: BigInt(root.vpk.y) } : undefined,
    ownW: root.ownW ? { x: BigInt(root.ownW.x), y: BigInt(root.ownW.y) } : undefined,
    hash: BigInt(root.hash),
  };
}

export function availableStewardBudget(ledger: WalletLedger, state: { notes: { indexOf(value: bigint): number }; spentNullifiers: Set<string> }, stewardSk: bigint): bigint {
  const rootHash = ledger.root ? BigInt(ledger.root.hash) : 0n;
  return ledger.notes
    .filter((entry) => entry.kind === "deposit" || entry.kind === "change")
    .map((entry) => noteFromStored(entry.note))
    .filter((note) => note.lin[0] === rootHash)
    .filter((note) => state.notes.indexOf(noteCm(note)) >= 0)
    .filter((note) => !state.spentNullifiers.has(budgetNullifier(stewardSk, note).toString()))
    .reduce((sum, note) => sum + note.q, 0n);
}

export function createChangeNote(owner: Pick<Identity, "Ax" | "Ay">, q: bigint, lineage: bigint[]): Note {
  return createNote(owner, q, lineage);
}
