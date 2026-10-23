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
import { submitExternalDeposit, waitForChainState, type WalletGateway } from "./chain";
import { deposit } from "./deposit";
import { deliverCardCredential, issueCard } from "./issue";
import { memoHex } from "./memo";
import { onboard } from "./onboard";
import type { ProofService } from "./prove";
import { emptyLedger, type CalldataProof, type RelayResult, type WalletLedger } from "./types";

const TX = `0x${"12".repeat(32)}` as const;
const TX_ISSUE = `0x${"34".repeat(32)}` as const;
const TX_TRANSFER = `0x${"56".repeat(32)}` as const;

class FakeProofs implements ProofService {
  calls = 0;
  async prove(circuit: CircuitName, input: Record<string, unknown>): Promise<CalldataProof> {
    this.calls += 1;
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
  readonly registryLeaves = new Map<string, bigint>();
  readonly emittedLogs: unknown[] = [];
  registrations = 0;
  transfers = 0;
  failTransferBeforeCommit = false;
  loseTransferResponseAfterCommit = false;
  readonly failTransferReasons: string[] = [];

  async sync(): Promise<ChainState> {
    return this.state;
  }

  async logs(): Promise<unknown[]> {
    return this.emittedLogs;
  }

  async registryDomain(): Promise<bigint> {
    return 7n;
  }

  async registryLeaf(nf: bigint): Promise<bigint> {
    return this.registryLeaves.get(nf.toString()) ?? 0n;
  }

  async externalDeposit(): Promise<{ transaction: `0x${string}`; blockNumber: bigint; logs: unknown[] }> {
    throw new Error("not used");
  }

  async relay(action: Parameters<WalletGateway["relay"]>[0], args: Record<string, unknown>): Promise<RelayResult> {
    const logs: unknown[] = [];
    if (action === "join") this.state.group.insert(BigInt(String(args.commitment)));
    if (action === "register") {
      this.registrations += 1;
      const leaf = BigInt(String(args.leaf0));
      const oldLeaf = this.registryLeaves.get(String(args.nf)) ?? 0n;
      if (oldLeaf === 0n) {
        this.state.rootTree.insert(leaf);
      } else {
        throw new Error("wallet is already registered");
      }
      this.registryLeaves.set(String(args.nf), leaf);
    }
    if (action === "faucetDeposit") {
      const cm = BigInt(String(args.cm));
      this.state.notes.insert(cm);
      logs.push({ eventName: "NoteMemo", args: { cm, memo: String(args.memo) }, blockNumber: 1n, logIndex: 0 });
    }
    if (action === "issue") this.state.issued.insert(BigInt(String(args.certHash)));
    if (action === "transferBudget") {
      if (this.failTransferBeforeCommit) throw new Error("transfer response lost");
      const simulatedFailure = this.failTransferReasons.shift();
      if (simulatedFailure) throw new Error(simulatedFailure);
      this.transfers += 1;
      const cm1 = BigInt(String(args.cm1));
      const cm2 = BigInt(String(args.cm2));
      this.state.notes.insert(cm1);
      this.state.notes.insert(cm2);
      logs.push(
        { eventName: "NoteMemo", args: { cm: cm1, memo: String(args.memo1) }, blockNumber: 2n, logIndex: 0 },
        { eventName: "NoteMemo", args: { cm: cm2, memo: String(args.memo2) }, blockNumber: 2n, logIndex: 1 },
      );
      this.emittedLogs.push(...logs);
      if (this.loseTransferResponseAfterCommit) throw new Error("transfer response lost after commit");
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

async function pendingTransferFixture(seedOffset = 76) {
  const { bundle, ledger, root } = await ownerFixture();
  const gateway = new FakeGateway();
  gateway.state.rootTree.insert(BigInt(root!.hash));
  gateway.failTransferBeforeCommit = true;
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
  const agent = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + seedOffset));
  const proofs = new FakeProofs();
  const options = {
    bundle,
    pairing: { v: 1 as const, name: "采购 Agent", agentPk: { x: agent.sign.Ax, y: agent.sign.Ay }, boxPk: bytesHex(agent.box.publicKey), pair: "cc".repeat(16) },
    capability: 1n,
    budget: 40_000_000n,
    expiry: 2_000_100_000n,
    gateway,
    proofs,
    mailer: { async send() { return 1; } },
    nowSeconds: 2_000_000_500n,
  };
  let checkpoint: WalletLedger | undefined;
  await expect(issueCard({
    ...options,
    ledger,
    onCheckpoint: async (next) => { checkpoint = structuredClone(next); },
  })).rejects.toThrow(/response lost/);
  return { ...options, checkpoint: checkpoint!, gateway, proofs };
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
    const sentKeys: Uint8Array[] = [];
    const mailer = { async send(key: Uint8Array, message: unknown) { sentKeys.push(key); sent.push(message); return sent.length; } };
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
    expect(sentKeys.every((key) => key instanceof Uint8Array && key.length === 32)).toBe(true);
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
    const failed = await issueCard({
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
    });
    expect(checkpoints).toBe(3);
    expect(failed.deliveryError).toMatch(/mailbox offline/);
    expect(failed.ledger.cards[0]).toMatchObject({ status: "pending_delivery", transferTx: TX_TRANSFER });
    expect(gateway.state.notes.leaves).toHaveLength(3);
    const transfers = gateway.transfers;
    const delivered = await deliverCardCredential({
      ledger: failed.ledger,
      cardId: failed.cardId,
      mailer: { async send(key: Uint8Array) { expect(key).toHaveLength(32); return 9; } },
      onCheckpoint: async (next) => { expect(next.cards[0]?.status).toBe("delivered"); },
    });
    expect(delivered.mailboxId).toBe(9);
    expect(gateway.transfers).toBe(transfers);
  });

  it("persists a budget transfer intent before relay and resumes the same proof after a lost response", async () => {
    const { bundle, ledger, root } = await ownerFixture();
    const gateway = new FakeGateway();
    gateway.state.rootTree.insert(BigInt(root!.hash));
    gateway.failTransferBeforeCommit = true;
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
    const agent = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 73));
    const options = {
      bundle,
      pairing: { v: 1 as const, name: "采购 Agent", agentPk: { x: agent.sign.Ax, y: agent.sign.Ay }, boxPk: bytesHex(agent.box.publicKey), pair: "aa".repeat(16) },
      capability: 1n,
      budget: 40_000_000n,
      expiry: 2_000_100_000n,
      gateway,
      proofs: new FakeProofs(),
      mailer: { async send() { return 1; } },
      nowSeconds: 2_000_000_500n,
    };
    let checkpoint: WalletLedger | undefined;
    await expect(issueCard({
      ...options,
      ledger,
      onCheckpoint: async (next) => { checkpoint = structuredClone(next); },
    })).rejects.toThrow(/response lost/);
    expect(checkpoint?.pendingTransfer).toBeDefined();
    expect(checkpoint?.pendingTransfer?.call.cm1).toBeTruthy();
    expect(checkpoint?.pendingTransfer?.call.proof).not.toHaveProperty("publicSignals");
    expect(gateway.transfers).toBe(0);

    gateway.failTransferBeforeCommit = false;
    const retried = await issueCard({ ...options, ledger: checkpoint! });
    expect(gateway.transfers).toBe(1);
    expect(retried.ledger.pendingTransfer).toBeUndefined();
    expect(retried.ledger.cards).toHaveLength(1);
    expect(retried.ledger.cards[0]).toMatchObject({ status: "delivered", transferTx: TX_TRANSFER });
    expect(retried.ledger.notes.some((entry) => entry.kind === "change" && entry.note.q === "60000000")).toBe(true);
  });

  it("reconciles a committed budget transfer after its relay response is lost without spending twice", async () => {
    const { bundle, ledger, root } = await ownerFixture();
    const gateway = new FakeGateway();
    gateway.state.rootTree.insert(BigInt(root!.hash));
    gateway.loseTransferResponseAfterCommit = true;
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
    const agent = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 74));
    const checkpoints: WalletLedger[] = [];
    const result = await issueCard({
      ledger,
      bundle,
      pairing: { v: 1, name: "采购 Agent", agentPk: { x: agent.sign.Ax, y: agent.sign.Ay }, boxPk: bytesHex(agent.box.publicKey), pair: "bb".repeat(16) },
      capability: 1n,
      budget: 40_000_000n,
      expiry: 2_000_100_000n,
      gateway,
      proofs: new FakeProofs(),
      mailer: { async send() { return 2; } },
      onCheckpoint: async (next) => { checkpoints.push(structuredClone(next)); },
      nowSeconds: 2_000_000_500n,
    });
    expect(gateway.transfers).toBe(1);
    expect(checkpoints.some((next) => next.pendingTransfer)).toBe(true);
    expect(result.ledger.pendingTransfer).toBeUndefined();
    expect(result.ledger.cards[0]).toMatchObject({ status: "delivered" });
    expect(result.ledger.notes.some((entry) => entry.kind === "change" && entry.note.q === "60000000")).toBe(true);
  });

  it.each(["StaleRevokedRoot", "StaleNoteRoot"])("regenerates a pending proof after %s and keeps old outputs as candidates", async (relayError) => {
    const fixture = await pendingTransferFixture(77);
    const { checkpoint, ...options } = fixture;
    const { gateway, proofs } = fixture;
    const oldCm = checkpoint.pendingTransfer!.call.cm1;
    const checkpoints: WalletLedger[] = [];
    gateway.failTransferBeforeCommit = false;
    gateway.failTransferReasons.push(`simulation_failed:${relayError}`);
    const retried = await issueCard({
      ...options,
      ledger: checkpoint,
      onCheckpoint: async (next) => { checkpoints.push(structuredClone(next)); },
    });
    expect(gateway.transfers).toBe(1);
    expect(proofs.calls).toBe(2);
    expect(checkpoints.some((next) => next.pendingTransfer?.candidates?.length === 2
      && next.pendingTransfer.candidates.some((candidate) => candidate.call.cm1 === oldCm)
      && next.pendingTransfer.call.cm1 !== oldCm)).toBe(true);
    expect(retried.ledger.pendingTransfer).toBeUndefined();
    expect(retried.ledger.cards[0]).toMatchObject({ status: "delivered", budget: "40000000" });
  });

  it("clears a pending transfer when its parent note was spent elsewhere", async () => {
    const fixture = await pendingTransferFixture(78);
    const { checkpoint, ...options } = fixture;
    const { gateway } = fixture;
    const parentCm = checkpoint.pendingTransfer!.parentCm;
    const checkpoints: WalletLedger[] = [];
    gateway.failTransferBeforeCommit = false;
    gateway.failTransferReasons.push("simulation_failed:BudgetSpent");
    await expect(issueCard({
      ...options,
      ledger: checkpoint,
      onCheckpoint: async (next) => { checkpoints.push(structuredClone(next)); },
    })).rejects.toThrow(/spent elsewhere/);
    const cleared = checkpoints.at(-1)!;
    expect(cleared.pendingTransfer).toBeUndefined();
    expect(cleared.notes.some((entry) => entry.cm === parentCm)).toBe(false);
    expect(gateway.transfers).toBe(0);
  });

  it("refuses to resume a pending card for a different pairing request", async () => {
    const fixture = await pendingTransferFixture(79);
    const { checkpoint, ...options } = fixture;
    const { gateway } = fixture;
    const other = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 120));
    gateway.failTransferBeforeCommit = false;
    await expect(issueCard({
      ...options,
      ledger: checkpoint,
      pairing: { v: 1, name: "第二个 Agent", agentPk: { x: other.sign.Ax, y: other.sign.Ay }, boxPk: bytesHex(other.box.publicKey), pair: "dd".repeat(16) },
      budget: 7_000_000n,
    })).rejects.toThrow(/pending card for 采购 Agent/);
    expect(gateway.transfers).toBe(0);
  });

  it("recovers the registered cert0 on a later UTC day instead of replacing root lineage", async () => {
    const bundle = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 21));
    const gateway = new FakeGateway();
    const opened = await onboard({ ledger: emptyLedger(31337, "anvil", bundle.sign.Ax), bundle, gateway, proofs: new FakeProofs(), nowSeconds: 2_000_000_000n });
    const recovered = await onboard({
      ledger: emptyLedger(31337, "anvil", bundle.sign.Ax),
      bundle,
      gateway,
      proofs: new FakeProofs(),
      nowSeconds: 2_000_000_000n + 86_400n,
    });
    expect(gateway.registrations).toBe(1);
    expect(recovered.ledger.root?.hash).toBe(opened.ledger.root?.hash);
    expect(recovered.ledger.rootRegistered).toBe(true);
    expect(gateway.state.rootTree.leaves).toHaveLength(1);
  });

  it("reports the fixed 31-day wallet lifetime when the recovered root has expired", async () => {
    const bundle = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 22));
    const gateway = new FakeGateway();
    const opened = await onboard({ ledger: emptyLedger(31337, "anvil", bundle.sign.Ax), bundle, gateway, proofs: new FakeProofs(), nowSeconds: 2_000_000_000n });
    await expect(onboard({
      ledger: emptyLedger(31337, "anvil", bundle.sign.Ax),
      bundle,
      gateway,
      proofs: new FakeProofs(),
      nowSeconds: BigInt(opened.ledger.root!.expiry) + 1n,
    })).rejects.toThrow(/root certificate has expired.*31 days/);
    expect(gateway.registrations).toBe(1);
  });

  it("persists cert0 before registration so a timed-out transaction can be reconciled", async () => {
    const bundle = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 41));
    const gateway = new FakeGateway();
    const checkpoints: WalletLedger[] = [];
    await expect(onboard({
      ledger: emptyLedger(31337, "anvil", bundle.sign.Ax),
      bundle,
      gateway,
      proofs: new FakeProofs(),
      nowSeconds: 2_000_000_000n,
      onCheckpoint: async (ledger) => {
        checkpoints.push(structuredClone(ledger));
        if (checkpoints.length === 2) throw new Error("tab closed while waiting");
      },
    })).rejects.toThrow(/tab closed/);
    const pending = checkpoints[0]!;
    expect(pending.root).not.toBeNull();
    expect(pending.rootRegistered).toBe(false);
    const resumed = await onboard({ ledger: pending, bundle, gateway, proofs: new FakeProofs(), nowSeconds: 2_000_000_100n });
    expect(resumed.ledger.root?.hash).toBe(pending.root?.hash);
    expect(gateway.registrations).toBe(1);
  });

  it("sends the external deposit to the Gate after the token approval", async () => {
    const writes: Array<{ address: string; functionName: string }> = [];
    const deployment = {
      chainId: 31337,
      gate: `0x${"11".repeat(20)}` as const,
      registry: `0x${"22".repeat(20)}` as const,
      revocations: `0x${"33".repeat(20)}` as const,
      group: `0x${"44".repeat(20)}` as const,
      payout: `0x${"55".repeat(20)}` as const,
      treasury: `0x${"66".repeat(20)}` as const,
      vault: `0x${"77".repeat(20)}` as const,
      token: `0x${"88".repeat(20)}` as const,
      verifiers: { d1: `0x${"91".repeat(20)}` as const, d2: `0x${"92".repeat(20)}` as const, reg: `0x${"93".repeat(20)}` as const, revoke: `0x${"94".repeat(20)}` as const, transfer: `0x${"95".repeat(20)}` as const, mint: `0x${"96".repeat(20)}` as const },
      startBlock: 0,
      facilitator: "http://localhost",
      mailbox: "http://localhost",
    };
    const bundle = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 61));
    const note = createNote(bundle.steward, 10_000_000n, [1n]);
    let call = 0;
    await submitExternalDeposit({
      account: `0x${"aa".repeat(20)}`,
      deployment,
      input: { proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"], publicSignals: [noteCm(note).toString(), note.q.toString()] }, cm: noteCm(note), q: note.q, note, memo: new Uint8Array([1, 2, 3]) },
      writeContract: async (parameters) => {
        writes.push({ address: parameters.address, functionName: parameters.functionName });
        call += 1;
        return `0x${call.toString(16).padStart(64, "0")}` as const;
      },
      waitForReceipt: async () => ({ status: "success", blockNumber: 1n, logs: [{ eventName: "NoteMemo", args: { cm: noteCm(note), memo: memoHex(new Uint8Array([1, 2, 3])) } }] }),
    });
    expect(writes).toEqual([
      { address: deployment.token, functionName: "approve" },
      { address: deployment.gate, functionName: "deposit" },
    ]);
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
