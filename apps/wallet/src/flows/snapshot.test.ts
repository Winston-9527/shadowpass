import { describe, expect, it } from "vitest";
import "../sdk";
import {
  ChainState,
  createNote,
  deriveKeys,
  encodeNoteMemo,
  issue,
  issueRoot,
  noteCm,
  type BoxKeyPair,
  type MailboxEntry,
} from "@shadowpass/sdk";
import { serializeCert } from "./cert";
import { emptyLedger, type CardRecord, type WalletLedger } from "./types";
import { publishOwnerRecords, recoverNotes, restoreOwnerRecords } from "./snapshot";
import { buildAuthorizationTree } from "../views/Tree";

class MemoryMailbox {
  readonly messages: unknown[] = [];
  readonly recipients: Uint8Array[] = [];

  async send(toPk: Uint8Array, message: unknown): Promise<number> {
    this.recipients.push(toPk);
    this.messages.push(structuredClone(message));
    return this.messages.length;
  }

  async pollAll<T>(_keyPair: BoxKeyPair): Promise<MailboxEntry<T>[]> {
    return this.messages.map((value, index) => ({ id: index + 1, ct: "memory", decoded: true, value: value as T }));
  }
}

async function fixture() {
  const owner = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 3));
  const agent = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 93));
  const now = 2_000_000_000n;
  const c0 = issueRoot(owner.sign, owner.steward, 3n, now + 31n * 86_400n, owner.view.vpk, owner.view.w);
  const c1 = issue(c0, agent.sign, 1n, now + 86_400n);
  const root = serializeCert(c0);
  const cert = serializeCert(c1);
  const note = createNote(agent.sign, 40_000_000n, [c0.hash, c1.hash]);
  const card: CardRecord = {
    id: c1.hash.toString(),
    name: "采购 Agent",
    agentPk: { x: agent.sign.Ax.toString(), y: agent.sign.Ay.toString() },
    boxPk: bytesHex(agent.box.publicKey),
    cap: "1",
    budget: note.q.toString(),
    expiry: c1.expiry.toString(),
    status: "delivered",
    cert,
    note: {
      own: note.own.map(String) as [string, string],
      q: note.q.toString(),
      lin: note.lin.map(String) as WalletLedger["notes"][number]["note"]["lin"],
      rho: note.rho.toString(),
    },
    issueTx: `0x${"1".repeat(64)}`,
    transferTx: `0x${"2".repeat(64)}`,
    mailboxId: 3,
    timings: { proofMs: 1, chainMs: 2, totalMs: 3 },
    createdAt: new Date().toISOString(),
  };
  const ledger: WalletLedger = {
    ...emptyLedger(31337, "anvil", owner.sign.Ax),
    root,
    registrationTx: `0x${"3".repeat(64)}`,
    cards: [card],
  };
  const state = new ChainState();
  state.rootTree.insert(c0.hash);
  state.issued.insert(c1.hash);
  state.notes.insert(noteCm(note));
  state.memos.set(noteCm(note).toString(), await encodeNoteMemo(note, owner.box.publicKey));
  return { owner, agent, root, cert, note, card, ledger, state, now };
}

describe("owner records and note recovery", () => {
  it("publishes one record per card as bytes and restores verified chain state", async () => {
    const { owner, root, cert, note, card, ledger, state, now } = await fixture();
    const mailbox = new MemoryMailbox();
    const published = await publishOwnerRecords(mailbox, owner, ledger);
    expect(mailbox.recipients.every((value) => value instanceof Uint8Array && value.length === 32)).toBe(true);
    expect(mailbox.messages.map((value) => (value as { type: string }).type)).toEqual(["owner_root", "owner_card"]);
    expect((mailbox.messages[1] as { card: Record<string, unknown> }).card).toMatchObject({ agentBox: card.boxPk });
    expect((mailbox.messages[1] as { card: Record<string, unknown> }).card).not.toHaveProperty("boxPk");
    expect(published.cards[0]?.ownerSeq).toBe(2);

    const restored = await restoreOwnerRecords(mailbox, owner, state, emptyLedger(31337, "anvil", owner.sign.Ax));
    expect(restored.root?.hash).toBe(root.hash);
    expect(restored.cards[0]?.id).toBe(card.id);
    expect(restored.cards[0]?.boxPk).toBe(card.boxPk);
    expect(restored.cards[0]?.cert.hash).toBe(cert.hash);
    const recovered = await recoverNotes(restored, owner, state);
    expect(recovered.notes).toHaveLength(1);
    expect(recovered.notes[0]).toMatchObject({ kind: "card", note: { q: note.q.toString() } });

    const model = buildAuthorizationTree(recovered, owner, state, [{
      budgetNf: 1n,
      amount: 10_000_000n,
      chain: [{ x: owner.sign.Ax, y: owner.sign.Ay }, { x: owner.steward.Ax, y: owner.steward.Ay }, { x: BigInt(card.agentPk.x), y: BigInt(card.agentPk.y) }],
    }], now);
    expect(model.cards[0]).toMatchObject({ status: "active", remaining: 30_000_000n });
  });

  it("merges by card id and never lets an older mailbox record replace local cards", async () => {
    const { owner, ledger, state } = await fixture();
    const mailbox = new MemoryMailbox();
    await publishOwnerRecords(mailbox, owner, ledger);
    const local = structuredClone(ledger);
    local.cards[0]!.ownerSeq = 99;
    local.cards[0]!.name = "Local buyer";
    local.nextOwnerSeq = 100;
    const restored = await restoreOwnerRecords(mailbox, owner, state, local);
    expect(restored.cards).toHaveLength(1);
    expect(restored.cards[0]?.name).toBe("Local buyer");
  });

  it("ignores forged cards that are not linked to the accepted root or Issued tree", async () => {
    const { owner, ledger, state } = await fixture();
    const mailbox = new MemoryMailbox();
    await publishOwnerRecords(mailbox, owner, ledger);
    const forged = structuredClone(mailbox.messages[1]) as { card: Record<string, unknown> };
    forged.card.name = "Forged";
    state.issued.clear();
    mailbox.messages.push({ type: "owner_card", seq: 100, cardId: forged.card.id, card: forged.card });
    const restored = await restoreOwnerRecords(mailbox, owner, state, ledger);
    expect(restored.cards[0]?.name).toBe("采购 Agent");
  });

  it("keeps each of eight card records below the mailbox message limit", async () => {
    const { owner, ledger } = await fixture();
    const mailbox = new MemoryMailbox();
    ledger.cards = Array.from({ length: 8 }, (_, index) => ({
      ...ledger.cards[0]!,
      id: String(1_000 + index),
      name: `Agent ${index + 1}`,
      ownerSeq: undefined,
      ownerVersion: undefined,
    }));
    await publishOwnerRecords(mailbox, owner, ledger);
    expect(mailbox.messages).toHaveLength(9);
    const encoded = mailbox.messages.map((message) => new TextEncoder().encode(JSON.stringify(message)).length);
    expect(Math.max(...encoded)).toBeLessThan(16 * 1024);
  });
});

function bytesHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
