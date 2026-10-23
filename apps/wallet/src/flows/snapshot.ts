import {
  noteCm,
  scanNotes,
  verifyBundleCert,
  type BoxKeyPair,
  type CertificateBundle,
  type ChainState,
  type KeySet,
  type MailboxEntry,
} from "@shadowpass/sdk";
import type { CardRecord, OwnerSnapshot, WalletLedger } from "./types";

export interface OwnerMailboxClient {
  send(toPk: Uint8Array | string, message: unknown): Promise<number>;
  pollAll<T = unknown>(keyPair: BoxKeyPair, after?: number): Promise<MailboxEntry<T>[]>;
}

function isHexScalar(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}

function validSnapshot(value: unknown, ledger: WalletLedger, bundle: KeySet): OwnerSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<OwnerSnapshot>;
  if (payload.type !== "owner_snapshot" || payload.v !== 1 || !payload.root || !Array.isArray(payload.cards)) return null;
  const root = payload.root;
  if (root.hop !== 0 || !verifyBundleCert(root)) return null;
  if (root.issuer.x !== bundle.sign.Ax.toString() || root.issuer.y !== bundle.sign.Ay.toString()) return null;
  if (root.holder.x !== bundle.steward.Ax.toString() || root.holder.y !== bundle.steward.Ay.toString()) return null;
  const cards: CardRecord[] = [];
  for (const candidate of payload.cards) {
    if (!candidate || typeof candidate !== "object" || !candidate.cert) return null;
    const cert = candidate.cert;
    if (cert.hop !== 1 || !verifyBundleCert(cert)) return null;
    if (cert.issuer.x !== root.holder.x || cert.issuer.y !== root.holder.y) return null;
    if (cert.hash !== candidate.id || !isHexScalar(candidate.budget) || !isHexScalar(candidate.expiry)) return null;
    if (BigInt(candidate.budget) <= 0n || (BigInt(candidate.cap) !== 1n && BigInt(candidate.cap) !== 2n)) return null;
    if (typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 64) return null;
    if (typeof candidate.boxPk !== "string" || !/^(0x)?[0-9a-fA-F]{64}$/.test(candidate.boxPk)) return null;
    cards.push(candidate);
  }
  return {
    type: "owner_snapshot",
    v: 1,
    exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : new Date().toISOString(),
    root,
    cards,
  };
}

export async function publishOwnerSnapshot(mailbox: OwnerMailboxClient, bundle: KeySet, ledger: WalletLedger): Promise<number> {
  if (!ledger.root) throw new Error("cannot publish a snapshot without a root certificate");
  return mailbox.send(bundle.box.publicKey, {
    type: "owner_snapshot",
    v: 1,
    exportedAt: new Date().toISOString(),
    root: ledger.root,
    cards: ledger.cards,
  } satisfies OwnerSnapshot);
}

export async function restoreOwnerSnapshot(mailbox: OwnerMailboxClient, bundle: KeySet, ledger: WalletLedger): Promise<WalletLedger> {
  const entries = await mailbox.pollAll(bundle.box, 0);
  let latest: OwnerSnapshot | null = null;
  for (const entry of entries) {
    if (!entry.decoded) continue;
    const snapshot = validSnapshot(entry.value, ledger, bundle);
    if (snapshot) latest = snapshot;
  }
  return latest ? { ...ledger, root: latest.root, cards: latest.cards, updatedAt: new Date().toISOString() } : ledger;
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
