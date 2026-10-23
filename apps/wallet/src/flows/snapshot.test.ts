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
import { publishOwnerSnapshot, recoverNotes, restoreOwnerSnapshot } from "./snapshot";
import { buildAuthorizationTree } from "../views/Tree";

class MemoryMailbox {
  readonly messages: unknown[] = [];

  async send(_toPk: Uint8Array | string, message: unknown): Promise<number> {
    this.messages.push(message);
    return this.messages.length;
  }

  async pollAll<T>(_keyPair: BoxKeyPair): Promise<MailboxEntry<T>[]> {
    return this.messages.map((value, index) => ({ id: index + 1, ct: "memory", decoded: true, value: value as T }));
  }
}

describe("owner snapshot and note recovery", () => {
  it("restores the root, cards and ticket balances in a browser with no local ledger", async () => {
    const owner = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 3));
    const agent = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 93));
    const now = 2_000_000_000n;
    const c0 = issueRoot(owner.sign, owner.steward, 3n, now + 7n * 86_400n, owner.view.vpk, owner.view.w);
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
    const original: WalletLedger = {
      ...emptyLedger(31337, "anvil", owner.sign.Ax),
      root,
      registrationTx: `0x${"3".repeat(64)}`,
      cards: [card],
    };
    const mailbox = new MemoryMailbox();
    await publishOwnerSnapshot(mailbox, owner, original);
    const restored = await restoreOwnerSnapshot(mailbox, owner, emptyLedger(31337, "anvil", owner.sign.Ax));
    expect(restored.root?.hash).toBe(root.hash);
    expect(restored.cards[0]?.id).toBe(c1.hash.toString());

    const memo = await encodeNoteMemo(note, owner.box.publicKey);
    const state = new ChainState();
    state.notes.insert(noteCm(note));
    state.memos.set(noteCm(note).toString(), memo);
    const recovered = await recoverNotes(restored, owner, state);
    expect(recovered.notes).toHaveLength(1);
    expect(recovered.notes[0]).toMatchObject({ kind: "card", note: { q: "40000000" } });

    const model = buildAuthorizationTree(recovered, owner, state, [{
      budgetNf: 1n,
      amount: 10_000_000n,
      chain: [{ x: owner.sign.Ax, y: owner.sign.Ay }, { x: owner.steward.Ax, y: owner.steward.Ay }, { x: agent.sign.Ax, y: agent.sign.Ay }],
    }], now);
    expect(model.cards[0]).toMatchObject({ status: "active", remaining: 30_000_000n });
  });
});

function bytesHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
