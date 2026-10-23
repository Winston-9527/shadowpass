import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentStore,
  CredentialInbox,
  buildPairing,
  walletStatus,
  type McpToolContext,
} from "@shadowpass/mcp";
import {
  ChainState,
  deriveKeys,
  loadArtifacts,
  loadDeployment,
  MailboxClient,
  prove as proveCircuit,
  toCalldata,
  type ArtifactSet,
  type CircuitName,
} from "@shadowpass/sdk";
import { BrowserWalletGateway } from "../src/flows/chain.js";
import { deposit } from "../src/flows/deposit.js";
import { availableStewardBudget, issueCard } from "../src/flows/issue.js";
import { onboard } from "../src/flows/onboard.js";
import type { ProofService } from "../src/flows/prove.js";
import { publishOwnerSnapshot, recoverNotes, restoreOwnerSnapshot } from "../src/flows/snapshot.js";
import { emptyLedger, type CalldataProof, type WalletLedger } from "../src/flows/types.js";
import { bytesToHex } from "../src/lib/bytes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactsDir = process.env.ARTIFACTS_DIR ?? path.join(root, "apps/wallet/public/zk/circuits-v2");
const rpcUrl = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";
const facilitatorUrl = process.env.FACILITATOR_URL ?? "http://127.0.0.1:4022";
const mailboxUrl = process.env.MAILBOX_URL ?? "http://127.0.0.1:8787";
const deployment = await loadDeployment("anvil");
const mailbox = new MailboxClient(mailboxUrl);

class LocalProofService implements ProofService {
  private readonly artifacts = new Map<CircuitName, Promise<ArtifactSet>>();

  async prove(circuit: CircuitName, input: Record<string, unknown>): Promise<CalldataProof> {
    let artifacts = this.artifacts.get(circuit);
    if (!artifacts) {
      artifacts = loadArtifacts({ circuit, dir: artifactsDir });
      this.artifacts.set(circuit, artifacts);
    }
    const result = await proveCircuit(circuit, input, await artifacts);
    const calldata = toCalldata(result.proof, result.publicSignals);
    return { ...calldata, publicSignals: result.publicSignals };
  }
}

async function waitForService(name: string, url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Local services take a moment to bind their ports.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${name} is not available at ${url}`);
}

async function waitForRpc(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      const body = await response.json() as { result?: string };
      if (response.ok && body.result) return;
    } catch {
      // Local services take a moment to bind their ports.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`anvil is not available at ${url}`);
}

function context(store: AgentStore, state: ChainState): McpToolContext {
  return {
    store,
    state,
    deploymentName: "anvil",
    chainId: deployment.chainId,
    services: {},
    mailbox,
    malicious: false,
    maxPayment: 10_000_000n,
  };
}

const timer = () => performance.now();
const elapsed = (started: number) => Math.round(performance.now() - started);
const scratch = await mkdtemp(path.join(tmpdir(), "shadowpass-wallet-e2e-"));

try {
  await Promise.all([
    waitForRpc(rpcUrl),
    waitForService("facilitator", `${facilitatorUrl}/health`),
    waitForService("mailbox", `${mailboxUrl.replace(/\/$/, "")}/box/${"00".repeat(32)}`),
  ]);

  const buyerStore = await AgentStore.open({ name: "buyer", root: path.join(scratch, "buyer"), network: "anvil", deployment: "anvil" });
  const treasuryStore = await AgentStore.open({ name: "treasury", root: path.join(scratch, "treasury"), network: "anvil", deployment: "anvil" });
  const buyerPairing = buildPairing(buyerStore);
  const treasuryPairing = buildPairing(treasuryStore);
  const bundle = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 11));
  const gateway = new BrowserWalletGateway({ rpcUrl, facilitatorUrl, deployment });
  const relay = gateway.relay.bind(gateway);
  gateway.relay = async (action, args) => {
    if (process.env.DEBUG_RELAY === "1") process.stderr.write(`[relay] ${action} ${JSON.stringify(args)}\n`);
    return relay(action, args);
  };
  const proofs = new LocalProofService();
  const checkpoint: WalletLedger[] = [];

  let ledger = emptyLedger(deployment.chainId, "anvil", bundle.sign.Ax);
  const onboardStarted = timer();
  const opened = await onboard({ ledger, bundle, gateway, proofs, onCheckpoint: async (next) => { checkpoint.push(next); } });
  const onboardElapsed = elapsed(onboardStarted);
  ledger = opened.ledger;

  const depositStarted = timer();
  const funded = await deposit({
    ledger,
    bundle,
    amount: 100_000_000n,
    method: "faucet",
    gateway,
    proofs,
    onCheckpoint: async (next) => { checkpoint.push(next); },
  });
  const depositElapsed = elapsed(depositStarted);
  ledger = funded.ledger;

  let state = await gateway.sync();
  assert.equal(availableStewardBudget(ledger, state, bundle.steward.sk), 100_000_000n);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const payStarted = timer();
  const pay = await issueCard({
    ledger,
    bundle,
    pairing: {
      v: 1,
      name: buyerPairing.payload.name,
      agentPk: { x: BigInt(buyerPairing.payload.agentPk.x), y: BigInt(buyerPairing.payload.agentPk.y) },
      boxPk: buyerPairing.payload.boxPk,
      pair: buyerPairing.payload.pair,
    },
    capability: 1n,
    budget: 40_000_000n,
    expiry: now + 86_400n,
    gateway,
    proofs,
    mailer: mailbox,
    onCheckpoint: async (next) => { checkpoint.push(next); },
    nowSeconds: now,
  });
  const payElapsed = elapsed(payStarted);
  ledger = pay.ledger;

  const treasuryStarted = timer();
  const treasury = await issueCard({
    ledger,
    bundle,
    pairing: {
      v: 1,
      name: treasuryPairing.payload.name,
      agentPk: { x: BigInt(treasuryPairing.payload.agentPk.x), y: BigInt(treasuryPairing.payload.agentPk.y) },
      boxPk: treasuryPairing.payload.boxPk,
      pair: treasuryPairing.payload.pair,
    },
    capability: 2n,
    budget: 50_000_000n,
    expiry: now + 86_400n,
    gateway,
    proofs,
    mailer: mailbox,
    onCheckpoint: async (next) => { checkpoint.push(next); },
    nowSeconds: now,
  });
  const treasuryElapsed = elapsed(treasuryStarted);
  ledger = treasury.ledger;

  state = await gateway.sync();
  assert.equal(availableStewardBudget(ledger, state, bundle.steward.sk), 10_000_000n);
  assert.equal(pay.timings.chainMs >= 0, true);
  assert.equal(treasury.timings.chainMs >= 0, true);

  const buyerInbox = new CredentialInbox({ mailbox, store: buyerStore, state, deploymentName: "anvil", chainId: deployment.chainId });
  const treasuryInbox = new CredentialInbox({ mailbox, store: treasuryStore, state, deploymentName: "anvil", chainId: deployment.chainId });
  const [buyerSync, treasurySync] = await Promise.all([buyerInbox.sync(), treasuryInbox.sync()]);
  assert.equal(buyerSync.accepted, 1);
  assert.equal(treasurySync.accepted, 1);

  const buyerStatus = await walletStatus(context(buyerStore, state));
  const treasuryStatus = await walletStatus(context(treasuryStore, state));
  assert.deepEqual(buyerStatus.capabilities, ["PAY"]);
  assert.equal(buyerStatus.remainingBudget, "40000000");
  assert.deepEqual(treasuryStatus.capabilities, ["TREASURY"]);
  assert.equal(treasuryStatus.remainingBudget, "50000000");

  await publishOwnerSnapshot(mailbox, bundle, ledger);
  const blank = emptyLedger(deployment.chainId, "anvil", bundle.sign.Ax);
  const snapshot = await restoreOwnerSnapshot(mailbox, bundle, blank);
  const recovered = await recoverNotes(snapshot, bundle, state);
  assert.equal(recovered.cards.length, 2);
  assert.equal(availableStewardBudget(recovered, state, bundle.steward.sk), 10_000_000n);

  assert.equal(checkpoint.some((entry) => entry.cards.some((card) => card.status === "pending_delivery")), true);
  assert.equal(ledger.notes.some((entry) => entry.kind === "change" && BigInt(entry.note.q) === 10_000_000n), true);
  assert.equal(new Set(ledger.notes.map((entry) => entry.cm)).size, ledger.notes.length);

  console.log(JSON.stringify({
    ok: true,
    deployment: { chainId: deployment.chainId, gate: deployment.gate, registry: deployment.registry, token: deployment.token },
    timingsMs: {
      onboard: { total: onboardElapsed, ...opened.timings },
      deposit100: { total: depositElapsed, ...funded.timings },
      issuePay40: { total: payElapsed, ...pay.timings },
      issueTreasury50: { total: treasuryElapsed, ...treasury.timings },
    },
    transactions: {
      register: ledger.registrationTx ?? checkpoint.find((entry) => entry.registrationTx)?.registrationTx,
      deposit: funded.transaction,
      buyerIssue: pay.ledger.cards.find((card) => card.id === pay.cardId)?.issueTx,
      buyerTransfer: pay.ledger.cards.find((card) => card.id === pay.cardId)?.transferTx,
      treasuryIssue: treasury.ledger.cards.find((card) => card.id === treasury.cardId)?.issueTx,
      treasuryTransfer: treasury.ledger.cards.find((card) => card.id === treasury.cardId)?.transferTx,
      finalChange: ledger.notes.find((entry) => entry.kind === "change" && BigInt(entry.note.q) === 10_000_000n)?.tx,
    },
    wallet: { stewardRemaining: "10000000", cards: ledger.cards.length },
    mcp: [{ name: buyerStore.name, ...buyerStatus }, { name: treasuryStore.name, ...treasuryStatus }],
    recovery: { cards: recovered.cards.length, stewardRemaining: "10000000", noteCount: recovered.notes.length },
    memoOwner: { boxPk: bytesToHex(bundle.box.publicKey) },
  }, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

process.exit(0);
