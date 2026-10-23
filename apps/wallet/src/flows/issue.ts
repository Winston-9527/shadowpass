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
import type {
  BudgetTransferCall,
  CredentialDelivery,
  PairingPayload,
  PendingBudgetCandidate,
  PendingBudgetTransfer,
  ProgressReporter,
  WalletLedger,
} from "./types";
import { bytesToHex, hexToBytes } from "../lib/bytes";

export interface CredentialMailer {
  send(toPk: Uint8Array, message: unknown): Promise<number>;
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
  mailboxId?: number;
  deliveryError?: string;
  timings: { proofMs: number; chainMs: number; totalMs: number };
}

export interface DeliverCardOptions {
  ledger: WalletLedger;
  cardId: string;
  mailer: CredentialMailer;
  onCheckpoint?(ledger: WalletLedger): Promise<void>;
  progress?: ProgressReporter;
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

function stripProof(proof: Awaited<ReturnType<ProofService["prove"]>>): BudgetTransferCall["proof"] {
  return {
    a: [proof.a[0], proof.a[1]],
    b: [[proof.b[0][0], proof.b[0][1]], [proof.b[1][0], proof.b[1][1]]],
    c: [proof.c[0], proof.c[1]],
  };
}

type WalletChainState = Awaited<ReturnType<WalletGateway["sync"]>>;
type GatewayReceipt = Awaited<ReturnType<WalletGateway["relay"]>>;

function pendingCandidates(pending: PendingBudgetTransfer): PendingBudgetCandidate[] {
  if (pending.candidates?.length) return pending.candidates;
  if (!pending.card.note) return [];
  return [{
    call: pending.call,
    agentNote: pending.card.note,
    changeNote: pending.changeNote,
    ...(pending.card.transferTx ? { transferTx: pending.card.transferTx } : {}),
  }];
}

function candidateIsVisible(state: WalletChainState, cardId: string, candidate: PendingBudgetCandidate): boolean {
  return state.issued.indexOf(BigInt(cardId)) >= 0
    && state.notes.indexOf(BigInt(candidate.call.cm1)) >= 0
    && (candidate.changeNote === null || state.notes.indexOf(BigInt(candidate.call.cm2)) >= 0);
}

function visibleCandidate(state: WalletChainState, pending: PendingBudgetTransfer): PendingBudgetCandidate | null {
  return pendingCandidates(pending).find((candidate) => candidateIsVisible(state, pending.card.id, candidate)) ?? null;
}

function assertPendingMemos(logs: unknown[], candidate: PendingBudgetCandidate): void {
  assertMemoInLogs(logs, noteFromStored(candidate.agentNote), hexToBytes(candidate.call.memo1.slice(2)));
  if (candidate.changeNote) {
    assertMemoInLogs(logs, noteFromStored(candidate.changeNote), hexToBytes(candidate.call.memo2.slice(2)));
  }
}

function relayErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/(?:simulation_failed:)?([A-Za-z][A-Za-z0-9_]*)/);
  return match?.[1] ?? null;
}

function pendingMatchesRequest(pending: PendingBudgetTransfer, options: IssueCardOptions): boolean {
  const card = pending.card;
  return card.name === options.pairing.name
    && card.agentPk.x === options.pairing.agentPk.x.toString()
    && card.agentPk.y === options.pairing.agentPk.y.toString()
    && card.boxPk === options.pairing.boxPk
    && card.cap === options.capability.toString()
    && card.budget === options.budget.toString()
    && card.delivery?.pair === options.pairing.pair;
}

function commitPendingTransfer(
  input: WalletLedger,
  pending: PendingBudgetTransfer,
  candidate: PendingBudgetCandidate,
  transferTx: string | undefined,
  timings: { proofMs: number; chainMs: number; totalMs: number },
): WalletLedger {
  const delivery = pending.card.delivery
    ? { ...pending.card.delivery, bundle: { ...pending.card.delivery.bundle, note: candidate.agentNote } }
    : undefined;
  const card: WalletLedger["cards"][number] = {
    ...pending.card,
    status: "pending_delivery",
    note: candidate.agentNote,
    ...(delivery ? { delivery } : {}),
    timings,
    ...(transferTx ? { transferTx } : {}),
  };
  const createdAt = pending.createdAt;
  const notes: WalletLedger["notes"] = [
    ...input.notes.filter((entry) => ![pending.parentCm, candidate.call.cm1, candidate.call.cm2].includes(entry.cm)),
    { note: candidate.agentNote, cm: candidate.call.cm1, tx: transferTx ?? "", kind: "card", createdAt },
    ...(candidate.changeNote ? [{ note: candidate.changeNote, cm: candidate.call.cm2, tx: transferTx ?? "", kind: "change" as const, createdAt }] : []),
  ];
  const ledger: WalletLedger = {
    ...input,
    notes,
    cards: [...input.cards.filter((candidate) => candidate.id !== pending.card.id), card],
    updatedAt: new Date().toISOString(),
  };
  delete ledger.pendingTransfer;
  return ledger;
}

function certFromStored(cert: CertificateBundle["chain"][number]): Cert {
  return {
    hop: cert.hop,
    issuer: { Ax: BigInt(cert.issuer.x), Ay: BigInt(cert.issuer.y), prv: new Uint8Array(32), sk: 0n },
    holder: { Ax: BigInt(cert.holder.x), Ay: BigInt(cert.holder.y), prv: new Uint8Array(32), sk: 0n },
    cap: BigInt(cert.cap),
    expiry: BigInt(cert.expiry),
    sig: { S: BigInt(cert.sig.S), R8x: BigInt(cert.sig.R8x), R8y: BigInt(cert.sig.R8y) },
    vpk: cert.vpk ? { x: BigInt(cert.vpk.x), y: BigInt(cert.vpk.y) } : undefined,
    ownW: cert.ownW ? { x: BigInt(cert.ownW.x), y: BigInt(cert.ownW.y) } : undefined,
    hash: BigInt(cert.hash),
  };
}

async function regenerateCandidate(
  options: IssueCardOptions,
  pending: PendingBudgetTransfer,
  state: WalletChainState,
): Promise<{ pending: PendingBudgetTransfer; candidate: PendingBudgetCandidate; proofMs: number }> {
  const parentEntry = options.ledger.notes.find((entry) => entry.cm === pending.parentCm);
  if (!parentEntry) throw new Error("pending transfer parent note is missing; clear the pending card and retry");
  const parentNote = noteFromStored(parentEntry.note);
  if (state.notes.indexOf(noteCm(parentNote)) < 0 || state.spentNullifiers.has(budgetNullifier(options.bundle.steward.sk, parentNote).toString())) {
    throw new Error("pending transfer parent note is no longer spendable");
  }
  const q1 = BigInt(pending.card.budget);
  const q2 = parentNote.q - q1;
  const transfer = transferInput({
    holder: options.bundle.steward,
    note: parentNote,
    child: certFromStored(pending.card.cert),
    q1,
    q2,
    state,
  });
  const agentMemo = await encodeNoteMemo(transfer.out1, pending.card.boxPk);
  const changeMemo = await encodeNoteMemo(transfer.out2, options.bundle.box.publicKey);
  options.progress?.("Regenerating Agent budget proof");
  const proofStarted = performance.now();
  const proof = await options.proofs.prove("budget_transfer", transfer.input);
  const proofMs = performance.now() - proofStarted;
  const call: BudgetTransferCall = {
    proof: stripProof(proof),
    noteRoot: proof.publicSignals[0]!,
    revokedRoot: proof.publicSignals[1]!,
    nullifier: proof.publicSignals[2]!,
    cm1: proof.publicSignals[3]!,
    cm2: proof.publicSignals[4]!,
    memo1: memoHex(agentMemo),
    memo2: memoHex(changeMemo),
  };
  const agentNote = storedNote(transfer.out1);
  const changeNote = q2 > 0n ? storedNote(transfer.out2) : null;
  const candidate: PendingBudgetCandidate = { call, agentNote, changeNote };
  const delivery = pending.card.delivery
    ? { ...pending.card.delivery, bundle: { ...pending.card.delivery.bundle, note: agentNote } }
    : undefined;
  return {
    pending: {
      ...pending,
      candidates: [...pendingCandidates(pending), candidate],
      call,
      changeNote,
      hasChange: q2 > 0n,
      card: { ...pending.card, note: agentNote, ...(delivery ? { delivery } : {}) },
    },
    candidate,
    proofMs,
  };
}

async function clearSpentPending(
  options: IssueCardOptions,
  pending: PendingBudgetTransfer,
  cause: unknown,
): Promise<never> {
  const ledger: WalletLedger = {
    ...options.ledger,
    notes: options.ledger.notes.filter((entry) => entry.cm !== pending.parentCm),
    updatedAt: new Date().toISOString(),
  };
  delete ledger.pendingTransfer;
  await options.onCheckpoint?.(ledger);
  throw new Error("pending budget transfer was spent elsewhere; the pending intent was cleared, review the available budget and retry", { cause });
}

async function resumePendingTransfer(
  options: IssueCardOptions,
  initial: WalletChainState,
  started: number,
): Promise<IssueCardResult> {
  let pending = options.ledger.pendingTransfer;
  if (!pending) throw new Error("pending transfer is missing");
  let proofMs = pending.card.timings.proofMs;
  const chainStarted = performance.now();
  let state = initial;
  let selected = visibleCandidate(state, pending);
  let transferTx = selected?.transferTx ?? pending.card.transferTx;
  let receipt: GatewayReceipt | undefined;
  let receiptCandidate: PendingBudgetCandidate | undefined;

  for (let attempt = 0; !selected && attempt < 2; attempt += 1) {
    const candidate = pendingCandidates(pending).at(-1);
    if (!candidate) throw new Error("pending transfer has no proof candidate");
    options.progress?.("Retrying pending Agent budget transfer");
    try {
      receipt = await options.gateway.relay("transferBudget", {
        proof: candidate.call.proof,
        noteRoot: candidate.call.noteRoot,
        revokedRoot: candidate.call.revokedRoot,
        nullifier: candidate.call.nullifier,
        cm1: candidate.call.cm1,
        cm2: candidate.call.cm2,
        memo1: candidate.call.memo1,
        memo2: candidate.call.memo2,
      });
      receiptCandidate = candidate;
      transferTx = receipt.transaction;
    } catch (cause) {
      state = await options.gateway.sync();
      selected = visibleCandidate(state, pending);
      if (selected) break;
      const code = relayErrorCode(cause);
      if (code === "BudgetSpent") await clearSpentPending(options, pending, cause);
      if ((code === "StaleRevokedRoot" || code === "StaleNoteRoot") && attempt === 0) {
        const regenerated = await regenerateCandidate(options, pending, state);
        pending = regenerated.pending;
        proofMs = regenerated.proofMs;
        state = await options.gateway.sync();
        await options.onCheckpoint?.({
          ...options.ledger,
          pendingTransfer: pending,
          updatedAt: new Date().toISOString(),
        });
        continue;
      }
      throw cause;
    }
    const submittedPending = pending;
    state = await waitForChainState(options.gateway, (candidate) => visibleCandidate(candidate, submittedPending) !== null);
    selected = visibleCandidate(state, pending);
    if (!selected) throw new Error("pending Agent budget transfer was submitted but is not visible on-chain; keep the pending intent and retry");
  }
  if (!selected) throw new Error("pending Agent budget transfer is not visible on-chain; keep the pending intent and retry");
  transferTx = selected.transferTx ?? transferTx;
  const logs = receipt && receiptCandidate?.call.cm1 === selected.call.cm1 ? receipt.logs : await options.gateway.logs();
  assertPendingMemos(logs, selected);

  let ledger = commitPendingTransfer(options.ledger, pending, selected, transferTx, {
    proofMs,
    chainMs: performance.now() - chainStarted,
    totalMs: performance.now() - started,
  });
  await options.onCheckpoint?.(ledger);

  ledger = {
    ...ledger,
    cards: ledger.cards.map((card) => card.id === pending.card.id
      ? { ...card, timings: { proofMs, chainMs: performance.now() - chainStarted, totalMs: performance.now() - started } }
      : card),
    updatedAt: new Date().toISOString(),
  };
  await options.onCheckpoint?.(ledger);
  const timings = ledger.cards.find((card) => card.id === pending.card.id)?.timings
    ?? { proofMs, chainMs: 0, totalMs: performance.now() - started };
  try {
    const delivered = await deliverCardCredential({
      ledger,
      cardId: pending.card.id,
      mailer: options.mailer,
      onCheckpoint: options.onCheckpoint,
      progress: options.progress,
    });
    return { ledger: delivered.ledger, cardId: pending.card.id, mailboxId: delivered.mailboxId, timings };
  } catch (cause) {
    return {
      ledger,
      cardId: pending.card.id,
      deliveryError: cause instanceof Error ? cause.message : "credential delivery failed",
      timings,
    };
  }
}

export async function issueCard(options: IssueCardOptions): Promise<IssueCardResult> {
  const started = performance.now();
  const now = options.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
  if (!options.ledger.root) throw new Error("onboard the wallet before issuing a card");
  let state = await options.gateway.sync();
  const root = options.ledger.root;
  const rootHash = BigInt(root.hash);
  if (state.rootTree.indexOf(rootHash) < 0) throw new Error("root certificate is not registered on-chain");
  if (options.ledger.pendingTransfer) {
    if (!pendingMatchesRequest(options.ledger.pendingTransfer, options)) {
      const card = options.ledger.pendingTransfer.card;
      throw new Error(`a pending card for ${card.name} (${card.budget} base units) must be completed before issuing a different card`);
    }
    return resumePendingTransfer(options, state, started);
  }
  if (options.capability !== 1n && options.capability !== 2n) throw new Error("capability must be PAY or TREASURY");
  if (options.budget <= 0n) throw new Error("budget must be greater than zero");
  if (options.expiry <= now) throw new Error("card expiry must be in the future");
  if (options.expiry > BigInt(options.ledger.root.expiry)) throw new Error("card expiry exceeds the root certificate");

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
  state = await options.gateway.sync();
  if (state.issued.indexOf(cert1.hash) < 0) {
    state = await waitForChainState(options.gateway, (candidate) => candidate.issued.indexOf(cert1.hash) >= 0);
  }
  if (state.issued.indexOf(cert1.hash) < 0) throw new Error("Agent certificate is not visible on-chain");

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
  const call: BudgetTransferCall = {
    proof: stripProof(proof),
    noteRoot: proof.publicSignals[0]!,
    revokedRoot: proof.publicSignals[1]!,
    nullifier: proof.publicSignals[2]!,
    cm1: proof.publicSignals[3]!,
    cm2: proof.publicSignals[4]!,
    memo1: memoHex(agentMemo),
    memo2: memoHex(changeMemo),
  };
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
  const delivery: CredentialDelivery = {
    type: "credential",
    pair: options.pairing.pair,
    bundle: certificateBundle,
  };
  const createdAt = new Date().toISOString();
  const card: WalletLedger["cards"][number] = {
    id: cardId,
    name: options.pairing.name,
    agentPk: { x: options.pairing.agentPk.x.toString(), y: options.pairing.agentPk.y.toString() },
    boxPk: options.pairing.boxPk,
    cap: options.capability.toString(),
    budget: q1.toString(),
    expiry: options.expiry.toString(),
    status: "issued",
    cert: serializedCert1,
    note: storedNote(transfer.out1),
    issueTx: issueTransaction ?? options.ledger.cards.find((candidate) => candidate.id === cardId)?.issueTx ?? "",
    delivery,
    timings: { proofMs, chainMs: 0, totalMs: performance.now() - started },
    createdAt,
  };
  const candidate: PendingBudgetCandidate = {
    call,
    agentNote: storedNote(transfer.out1),
    changeNote: q2 > 0n ? storedNote(transfer.out2) : null,
  };
  const pending: PendingBudgetTransfer = {
    parentCm: parent.entry.cm,
    card,
    changeNote: candidate.changeNote,
    call,
    hasChange: q2 > 0n,
    candidates: [candidate],
    createdAt,
  };
  let ledger: WalletLedger = {
    ...options.ledger,
    pendingTransfer: pending,
    updatedAt: createdAt,
  };
  await options.onCheckpoint?.(ledger);
  options.progress?.("Transferring Agent budget");
  let receipt: Awaited<ReturnType<WalletGateway["relay"]>> | undefined;
  try {
    receipt = await options.gateway.relay("transferBudget", {
      proof: call.proof,
      noteRoot: call.noteRoot,
      revokedRoot: call.revokedRoot,
      nullifier: call.nullifier,
      cm1: call.cm1,
      cm2: call.cm2,
      memo1: call.memo1,
      memo2: call.memo2,
    });
  } catch (cause) {
    state = await options.gateway.sync();
    if (!candidateIsVisible(state, pending.card.id, candidate)) throw cause;
  }
  assertPendingMemos(receipt?.logs ?? await options.gateway.logs(), candidate);
  state = await waitForChainState(
    options.gateway,
    (next) => candidateIsVisible(next, pending.card.id, candidate),
  );
  if (!candidateIsVisible(state, pending.card.id, candidate)) {
    throw new Error("Agent budget transfer is not visible on-chain; retry the pending transfer after the chain catches up");
  }
  ledger = commitPendingTransfer(options.ledger, pending, candidate, receipt?.transaction, {
    proofMs,
    chainMs: performance.now() - chainStarted,
    totalMs: performance.now() - started,
  });
  await options.onCheckpoint?.(ledger);
  chainMs = performance.now() - chainStarted;
  ledger = {
    ...ledger,
    cards: ledger.cards.map((card) => card.id === cardId
      ? { ...card, timings: { proofMs, chainMs, totalMs: performance.now() - started } }
      : card),
    updatedAt: new Date().toISOString(),
  };
  await options.onCheckpoint?.(ledger);
  try {
    const delivered = await deliverCardCredential({
      ledger,
      cardId,
      mailer: options.mailer,
      onCheckpoint: options.onCheckpoint,
      progress: options.progress,
    });
    return { ledger: delivered.ledger, cardId, mailboxId: delivered.mailboxId, timings: { proofMs, chainMs, totalMs: performance.now() - started } };
  } catch (cause) {
    return {
      ledger,
      cardId,
      deliveryError: cause instanceof Error ? cause.message : "credential delivery failed",
      timings: { proofMs, chainMs, totalMs: performance.now() - started },
    };
  }
}

export async function deliverCardCredential(options: DeliverCardOptions): Promise<{ ledger: WalletLedger; mailboxId: number }> {
  const card = options.ledger.cards.find((candidate) => candidate.id === options.cardId);
  if (!card) throw new Error("card record is missing");
  if (card.status === "delivered" && card.mailboxId !== undefined) {
    return { ledger: options.ledger, mailboxId: card.mailboxId };
  }
  if (!card.delivery) throw new Error("card has no saved credential delivery package; issue it again only after checking the chain");
  options.progress?.("Delivering encrypted credential");
  const mailboxId = await options.mailer.send(hexToBytes(card.boxPk), card.delivery);
  const ledger: WalletLedger = {
    ...options.ledger,
    cards: options.ledger.cards.map((candidate) => candidate.id === options.cardId
      ? { ...candidate, status: "delivered", mailboxId }
      : candidate),
    updatedAt: new Date().toISOString(),
  };
  await options.onCheckpoint?.(ledger);
  return { ledger, mailboxId };
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

export function availableStewardBudget(
  ledger: WalletLedger,
  state: { notes: { indexOf(value: bigint): number }; spentNullifiers: Set<string> },
  steward: Pick<Identity, "Ax" | "Ay" | "sk">,
): bigint {
  const rootHash = ledger.root ? BigInt(ledger.root.hash) : 0n;
  return ledger.notes
    .filter((entry) => entry.kind === "deposit" || entry.kind === "change")
    .map((entry) => noteFromStored(entry.note))
    .filter((note) => note.own[0] === steward.Ax && note.own[1] === steward.Ay)
    .filter((note) => note.lin[0] === rootHash)
    .filter((note) => state.notes.indexOf(noteCm(note)) >= 0)
    .filter((note) => !state.spentNullifiers.has(budgetNullifier(steward.sk, note).toString()))
    .reduce((sum, note) => sum + note.q, 0n);
}

export function createChangeNote(owner: Pick<Identity, "Ax" | "Ay">, q: bigint, lineage: bigint[]): Note {
  return createNote(owner, q, lineage);
}
