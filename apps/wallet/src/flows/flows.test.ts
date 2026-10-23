import { describe, expect, it } from "vitest";
import "../sdk";
import {
  ChainState,
  createNote,
  deriveKeys,
  encodeBundle,
  expectedPublicSignals,
  issueRoot,
  noteCm,
  type CircuitName,
  type KeySet,
} from "@shadowpass/sdk";
import { serializeCert } from "./cert";
import { waitForChainState, type WalletGateway } from "./chain";
import { deposit } from "./deposit";
import { issueCard } from "./issue";
import { memoHex } from "./memo";
import { onboard } from "./onboard";
import type { ProofService } from "./prove";
import { emptyLedger, type CalldataProof, type RelayResult, type WalletLedger } from "./types";

const TX = `0x${"12".repeat(32)}` as const;
const TX_ISSUE = `0x${"34".repeat(32)}` as const;
const TX_TRANSFER = `0x${"56".repeat(32)}` as const;

class FakeProofs implements ProofService {
  async prove(circuit: CircuitName, input: Record<string, unknown>): Promise<CalldataProof> {
    return {
      a: ["1", "2"],
      b: [["3", "4"], ["5", "6"]],
      c: ["7", "8"],
      publicSignals: expectedPublicSignals(circuit, input),
    };
  }
}

class FakeGateway implements WalletGateway {
  readonly state = new ChainState();

  async sync(): Promise<ChainState> {
    return this.state;
  }

  async logs(): Promise<unknown[]> {
    return [];
  }

  async registryDomain(): Promise<bigint> {
    return 7n;
  }

  async externalDeposit(): Promise<{ transaction: `0x${string}`; blockNumber: bigint; logs: unknown[] }> {
    throw new Error("not used");
  }

  async relay(action: Parameters<WalletGateway["relay"]>[0], args: Record<string, unknown>): Promise<RelayResult> {
    const logs: unknown[] = [];
    if (action === "join") this.state.group.insert(BigInt(String(args.commitment)));
    if (action === "register") this.state.rootTree.insert(BigInt(String(args.leaf0)));
    if (action === "faucetDeposit") {
      const cm = BigInt(String(args.cm));
      this.state.notes.insert(cm);
      logs.push({ eventName: "NoteMemo", args: { cm, memo: String(args.memo) }, blockNumber: 1n, logIndex: 0 });
    }
    if (action === "issue") this.state.issued.insert(BigInt(String(args.certHash)));
    if (action === "transferBudget") {
      const cm1 = BigInt(String(args.cm1));
      const cm2 = BigInt(String(args.cm2));
      this.state.notes.insert(cm1);
      this.state.notes.insert(cm2);
      logs.push(
        { eventName: "NoteMemo", args: { cm: cm1, memo: String(args.memo1) }, blockNumber: 2n, logIndex: 0 },
        { eventName: "NoteMemo", args: { cm: cm2, memo: String(args.memo2) }, blockNumber: 2n, logIndex: 1 },
      );
    }
    const transaction = action === "issue" ? TX_ISSUE : action === "transferBudget" ? TX_TRANSFER : TX;
    return { transaction, blockNumber: "2", logs };
  }
}

async function ownerFixture(): Promise<{ bundle: KeySet; ledger: WalletLedger; root: WalletLedger["root"] }> {
  const bundle = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const cert0 = issueRoot(bundle.sign, bundle.steward, 3n, 2_000_200_000n, bundle.view.vpk, bundle.view.w);
  const root = serializeCert(cert0);
  const ledger = emptyLedger(31337, "anvil", bundle.sign.Ax);
  ledger.root = root;
  ledger.registrationTx = TX;
  return { bundle, ledger, root };
}

describe("wallet opening and card flows", () => {
  it("joins, registers cert0, funds 100 USDC and issues PAY 40 + TREASURY 50 cards", async () => {
    const bundle = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
    const gateway = new FakeGateway();
    const proofs = new FakeProofs();
    let ledger = emptyLedger(31337, "anvil", bundle.sign.Ax);
    const opened = await onboard({ ledger, bundle, gateway, proofs, nowSeconds: 2_000_000_000n });
    ledger = opened.ledger;
    expect(ledger.root).not.toBeNull();
    expect(ledger.registrationTx).toBe(TX);
    expect(gateway.state.rootTree.indexOf(BigInt(ledger.root!.hash))).toBe(0);

    const funded = await deposit({ ledger, bundle, amount: 100_000_000n, method: "faucet", gateway, proofs });
    ledger = funded.ledger;
    expect(ledger.notes).toHaveLength(1);
    expect(ledger.notes[0]!.note.q).toBe("100000000");

    const buyer = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 40));
    const investor = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 80));
    const sent: unknown[] = [];
    const mailer = { async send(_key: Uint8Array | string, message: unknown) { sent.push(message); return sent.length; } };
    const basePair = { v: 1 as const, pair: "ab".repeat(16) };
    const now = 2_000_001_000n;
    const pay = await issueCard({
      ledger,
      bundle,
      pairing: { ...basePair, name: "采购 Agent", agentPk: { x: buyer.sign.Ax, y: buyer.sign.Ay }, boxPk: bytesHex(buyer.box.publicKey) },
      capability: 1n,
      budget: 40_000_000n,
      expiry: now + 86_400n,
      gateway,
      proofs,
      mailer,
      nowSeconds: now,
    });
    ledger = pay.ledger;
    const treasury = await issueCard({
      ledger,
      bundle,
      pairing: { ...basePair, name: "理财 Agent", agentPk: { x: investor.sign.Ax, y: investor.sign.Ay }, boxPk: bytesHex(investor.box.publicKey), pair: "cd".repeat(16) },
      capability: 2n,
      budget: 50_000_000n,
      expiry: now + 86_400n,
      gateway,
      proofs,
      mailer,
      nowSeconds: now,
    });
    ledger = treasury.ledger;

    expect(ledger.cards).toHaveLength(2);
    expect(ledger.cards.map((card) => [card.name, card.cap, card.budget, card.status])).toEqual([
      ["采购 Agent", "1", "40000000", "delivered"],
      ["理财 Agent", "2", "50000000", "delivered"],
    ]);
    expect(ledger.cards[0]).toMatchObject({ issueTx: TX_ISSUE, transferTx: TX_TRANSFER });
    expect(ledger.notes.find((note) => note.kind === "change")?.note.q).toBe("10000000");
    expect(sent).toHaveLength(2);
    for (const message of sent) {
      const envelope = message as { bundle: Parameters<typeof encodeBundle>[0]; pair: string; type: string };
      expect(envelope.type).toBe("credential");
      expect(() => encodeBundle(envelope.bundle)).not.toThrow();
    }

    const cardNote = createNote(buyer.sign, 40_000_000n, [BigInt(ledger.root!.hash), BigInt(pay.cardId)]);
    expect(noteCm(cardNote)).toBeGreaterThan(0n);
  });

  it("keeps the encrypted change note when credential delivery fails, then allows a retry without re-spending", async () => {
    const { bundle, ledger, root } = await ownerFixture();
    const gateway = new FakeGateway();
    gateway.state.rootTree.insert(BigInt(root!.hash));
    const depositNote = createNote(bundle.steward, 100_000_000n, [BigInt(root!.hash)]);
    gateway.state.notes.insert(noteCm(depositNote));
    ledger.notes.push({
      note: {
        own: depositNote.own.map(String) as [string, string],
        q: depositNote.q.toString(),
        lin: depositNote.lin.map(String) as WalletLedger["notes"][number]["note"]["lin"],
        rho: depositNote.rho.toString(),
      },
      cm: noteCm(depositNote).toString(),
      tx: TX,
      kind: "deposit",
      createdAt: new Date().toISOString(),
    });
    const agent = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 70));
    let checkpoints = 0;
    await expect(issueCard({
      ledger,
      bundle,
      pairing: { v: 1, name: "采购 Agent", agentPk: { x: agent.sign.Ax, y: agent.sign.Ay }, boxPk: bytesHex(agent.box.publicKey), pair: "ef".repeat(16) },
      capability: 1n,
      budget: 40_000_000n,
      expiry: 2_000_100_000n,
      gateway,
      proofs: new FakeProofs(),
      mailer: { async send() { throw new Error("mailbox offline"); } },
      onCheckpoint: async () => { checkpoints += 1; },
      nowSeconds: 2_000_000_000n,
    })).rejects.toThrow(/mailbox offline/);
    expect(checkpoints).toBe(1);
    expect(gateway.state.notes.leaves).toHaveLength(3);
  });

  it("retries chain state reads until an emitted event is visible", async () => {
    let reads = 0;
    const state = await waitForChainState({
      async sync() {
        reads += 1;
        const next = new ChainState();
        if (reads >= 3) next.notes.insert(7n);
        return next;
      },
    }, (candidate) => candidate.notes.indexOf(7n) >= 0, { attempts: 4, delayMs: 1 });
    expect(reads).toBe(3);
    expect(state.notes.indexOf(7n)).toBe(0);
  });

  it("encodes relay memo bytes as a 0x-prefixed hex string", () => {
    expect(memoHex(Uint8Array.of(0xab, 0xcd))).toBe("0xabcd");
  });
});

function bytesHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
