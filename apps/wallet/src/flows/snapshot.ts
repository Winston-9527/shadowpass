import {
  encodeBundle,
  noteCm,
  scanNotes,
  truncateKey,
  verifyBundleCert,
  type BoxKeyPair,
  type CertificateBundle,
  type ChainState,
  type KeySet,
  type MailboxEntry,
} from "@shadowpass/sdk";
import type { CardRecord, OwnerCardRecord, OwnerRootRecord, WalletLedger } from "./types";

export interface OwnerMailboxClient {
  send(toPk: Uint8Array, message: unknown): Promise<number>;
  pollAll<T = unknown>(keyPair: BoxKeyPair, after?: number): Promise<MailboxEntry<T>[]>;
}

type VerifiedOwnerCardRecord = Omit<OwnerCardRecord, "card"> & { card: CardRecord };

const MAX_OWNER_SEQ_ADVANCE = 1_000;

function isHexScalar(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}

function validRootRecord(value: unknown, bundle: KeySet, state: ChainState): OwnerRootRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<OwnerRootRecord>;
  if (record.type !== "owner_root" || !Number.isSafeInteger(record.seq) || Number(record.seq) < 1 || !record.cert0) return null;
  const cert0 = record.cert0;
  if (cert0.hop !== 0 || !verifyBundleCert(cert0) || !isHexScalar(cert0.hash)) return null;
  if (cert0.issuer.x !== bundle.sign.Ax.toString() || cert0.issuer.y !== bundle.sign.Ay.toString()) return null;
  if (cert0.holder.x !== bundle.steward.Ax.toString() || cert0.holder.y !== bundle.steward.Ay.toString()) return null;
  if (cert0.vpk?.x !== bundle.view.vpk.x.toString() || cert0.vpk.y !== bundle.view.vpk.y.toString()) return null;
  if (state.rootTree.indexOf(BigInt(cert0.hash)) < 0) return null;
  return { type: "owner_root", seq: Number(record.seq), cert0 };
}

function validDelivery(card: CardRecord, value: unknown): CardRecord["delivery"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const delivery = value as { type?: unknown; pair?: unknown; bundle?: unknown };
  if (delivery.type !== "credential" || typeof delivery.pair !== "string" || !/^[0-9a-f]{32}$/.test(delivery.pair)) return undefined;
  try {
    const bundle = delivery.bundle as CertificateBundle;
    encodeBundle(bundle);
    if (bundle.chain.length !== 2 || bundle.chain[1]?.hash !== card.id) return undefined;
    if (JSON.stringify(bundle.note) !== JSON.stringify(card.note)) return undefined;
    return { type: "credential", pair: delivery.pair, bundle };
  } catch {
    return undefined;
  }
}

function validCardRecord(value: unknown, root: CertificateBundle["chain"][number], state: ChainState): VerifiedOwnerCardRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<OwnerCardRecord>;
  if (record.type !== "owner_card" || !Number.isSafeInteger(record.seq) || Number(record.seq) < 1) return null;
  if (typeof record.cardId !== "string" || !record.card || typeof record.card !== "object") return null;
  const serializedCard = record.card;
  const cert = serializedCard.cert;
  if (!cert || cert.hop !== 1 || !verifyBundleCert(cert) || cert.hash !== record.cardId) return null;
  if (cert.issuer.x !== root.holder.x || cert.issuer.y !== root.holder.y) return null;
  if (state.issued.indexOf(BigInt(record.cardId)) < 0) return null;
  if (!isHexScalar(serializedCard.budget) || BigInt(serializedCard.budget) <= 0n) return null;
  if (!isHexScalar(serializedCard.expiry) || (serializedCard.cap !== "1" && serializedCard.cap !== "2")) return null;
  if (typeof serializedCard.name !== "string" || !serializedCard.name.trim() || serializedCard.name.length > 64) return null;
  if (typeof serializedCard.agentBox !== "string" || !/^[0-9a-f]{64}$/.test(serializedCard.agentBox)) return null;
  if (!serializedCard.agentPk || typeof serializedCard.agentPk.x !== "string" || typeof serializedCard.agentPk.y !== "string") return null;
  if (serializedCard.cap !== cert.cap || serializedCard.expiry !== cert.expiry) return null;
  if (serializedCard.agentPk.x !== cert.holder.x || serializedCard.agentPk.y !== cert.holder.y) return null;
  if (serializedCard.status !== "issued" && serializedCard.status !== "pending_delivery" && serializedCard.status !== "delivered") return null;
  if (serializedCard.note) {
    const note: Parameters<typeof noteCm>[0] = {
      own: [BigInt(serializedCard.note.own[0]), BigInt(serializedCard.note.own[1])],
      q: BigInt(serializedCard.note.q),
      lin: serializedCard.note.lin.map(BigInt) as [bigint, bigint, bigint, bigint],
      rho: BigInt(serializedCard.note.rho),
    };
    if (note.q.toString() !== serializedCard.budget || note.lin[0].toString() !== root.hash || note.lin[1].toString() !== record.cardId) return null;
    if (state.notes.indexOf(noteCm(note)) < 0) return null;
  }
  const { agentBox, ...cardWithoutAgentBox } = serializedCard;
  const normalized: CardRecord = {
    ...cardWithoutAgentBox,
    boxPk: agentBox,
    delivery: validDelivery({ ...cardWithoutAgentBox, boxPk: agentBox }, serializedCard.delivery),
    ownerSeq: Number(record.seq),
    ownerVersion: undefined,
  };
  return { type: "owner_card", seq: Number(record.seq), cardId: record.cardId, card: normalized };
}

function cardVersion(card: CardRecord, rootHash: string): string {
  const cm = card.note
    ? noteCm({ own: [BigInt(card.note.own[0]), BigInt(card.note.own[1])], q: BigInt(card.note.q), lin: card.note.lin.map(BigInt) as [bigint, bigint, bigint, bigint], rho: BigInt(card.note.rho) }).toString()
    : "";
  return JSON.stringify({
    id: card.id,
    rootHash,
    name: card.name,
    agentPk: card.agentPk,
    boxPk: card.boxPk,
    cap: card.cap,
    budget: card.budget,
    expiry: card.expiry,
    status: card.status,
    certHash: card.cert.hash,
    noteCm: cm,
    mailboxId: card.mailboxId ?? null,
  });
}

export async function publishOwnerRecords(
  mailbox: OwnerMailboxClient,
  bundle: KeySet,
  input: WalletLedger,
  onCheckpoint?: (ledger: WalletLedger) => Promise<void>,
): Promise<WalletLedger> {
  if (!input.root) throw new Error("cannot publish owner records without a root certificate");
  let ledger = structuredClone(input);
  const currentRoot = ledger.root;
  if (!currentRoot) throw new Error("cannot publish owner records without a root certificate");
  let nextSeq = ledger.nextOwnerSeq ?? 1;
  const rootVersion = currentRoot.hash;
  if (ledger.ownerRootVersion !== rootVersion || !ledger.ownerRootSeq) {
    const seq = nextSeq++;
    await mailbox.send(bundle.box.publicKey, { type: "owner_root", seq, cert0: currentRoot } satisfies OwnerRootRecord);
    ledger = { ...ledger, ownerRootSeq: seq, ownerRootVersion: rootVersion, nextOwnerSeq: nextSeq, updatedAt: new Date().toISOString() };
    await onCheckpoint?.(ledger);
  }
  for (const card of ledger.cards) {
    const version = cardVersion(card, rootVersion);
    if (card.ownerVersion === version && card.ownerSeq) continue;
    const seq = nextSeq++;
    const { boxPk, ...storedCard } = card;
    const record: OwnerCardRecord = { type: "owner_card", seq, cardId: card.id, card: { ...storedCard, agentBox: boxPk } };
    await mailbox.send(bundle.box.publicKey, record);
    ledger = {
      ...ledger,
      cards: ledger.cards.map((candidate) => candidate.id === card.id
        ? { ...candidate, ownerSeq: seq, ownerVersion: version }
        : candidate),
      nextOwnerSeq: nextSeq,
      updatedAt: new Date().toISOString(),
    };
    await onCheckpoint?.(ledger);
  }
  return ledger;
}

export async function restoreOwnerRecords(
  mailbox: OwnerMailboxClient,
  bundle: KeySet,
  state: ChainState,
  input: WalletLedger,
): Promise<WalletLedger> {
  const entries = await mailbox.pollAll(bundle.box, 0);
  const localSeqs = [input.ownerRootSeq, ...input.cards.map((card) => card.ownerSeq)]
    .filter((seq): seq is number => Number.isSafeInteger(seq) && Number(seq) > 0);
  let maxSeq = localSeqs.length ? Math.max(...localSeqs) : 0;
  let rootRecord: OwnerRootRecord | null = null;
  for (const entry of entries) {
    if (!entry.decoded) continue;
    const raw = entry.value;
    if (!raw || typeof raw !== "object") continue;
    const rootCandidate = validRootRecord(raw, bundle, state);
    if (!rootCandidate || rootCandidate.seq > maxSeq + MAX_OWNER_SEQ_ADVANCE) continue;
    maxSeq = Math.max(maxSeq, rootCandidate.seq);
    if (!rootRecord || rootCandidate.seq > rootRecord.seq) rootRecord = rootCandidate;
  }
  const root = rootRecord?.cert0 ?? (input.root && state.rootTree.indexOf(BigInt(input.root.hash)) >= 0 ? input.root : null);
  let cards = [...input.cards];
  if (root) {
    const cardRecords = new Map<string, VerifiedOwnerCardRecord>();
    for (const entry of entries) {
      if (!entry.decoded) continue;
      const card = validCardRecord(entry.value, root, state);
      if (!card || card.seq > maxSeq + MAX_OWNER_SEQ_ADVANCE) continue;
      maxSeq = Math.max(maxSeq, card.seq);
      const previous = cardRecords.get(card.cardId);
      if (!previous || card.seq > previous.seq) cardRecords.set(card.cardId, card);
    }
    for (const record of cardRecords.values()) {
      const local = cards.find((card) => card.id === record.cardId);
      if (!local || record.seq > (local.ownerSeq ?? -1)) {
        cards = [...cards.filter((card) => card.id !== record.cardId), record.card];
      }
    }
  }
  return {
    ...input,
    root,
    rootRegistered: root ? state.rootTree.indexOf(BigInt(root.hash)) >= 0 : false,
    ownerRootSeq: rootRecord?.seq ?? input.ownerRootSeq,
    ownerRootVersion: rootRecord ? rootRecord.cert0.hash : input.ownerRootVersion,
    cards,
    nextOwnerSeq: maxSeq + 1,
    updatedAt: new Date().toISOString(),
  };
}

export async function recoverNotes(ledger: WalletLedger, bundle: KeySet, state: ChainState): Promise<WalletLedger> {
  if (!ledger.root) return ledger;
  const rootHash = BigInt(ledger.root.hash);
  const notes = await scanNotes(state, [], { boxSk: bundle.box.privateKey, holderSks: [bundle.steward.sk] });
  const recovered = [...ledger.notes];
  const known = new Set(recovered.map((entry) => entry.cm));
  for (const note of notes) {
    if (note.lin[0] !== rootHash) continue;
    const cm = noteCm(note).toString();
    if (known.has(cm)) continue;
    const card = note.lin[1] === 0n ? undefined : ledger.cards.find((candidate) => candidate.id === note.lin[1]!.toString());
    recovered.push({
      note: {
        own: [note.own[0].toString(), note.own[1].toString()],
        q: note.q.toString(),
        lin: note.lin.map(String) as WalletLedger["notes"][number]["note"]["lin"],
        rho: note.rho.toString(),
      },
      cm,
      tx: "",
      kind: card ? "card" : "change",
      createdAt: new Date().toISOString(),
    });
    known.add(cm);
  }
  return { ...ledger, notes: recovered, updatedAt: new Date().toISOString() };
}

export function cardCertificateMatchesRoot(card: CardRecord, root: CertificateBundle["chain"][number]): boolean {
  return card.cert.issuer.x === root.holder.x && card.cert.issuer.y === root.holder.y && verifyBundleCert(card.cert);
}

export function cardIsRevoked(card: CardRecord, state: ChainState): boolean {
  return state.revoked.has(truncateKey(BigInt(card.cert.hash)));
}
