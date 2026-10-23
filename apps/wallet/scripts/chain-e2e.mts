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
  decodeNoteMemo,
  deriveKeys,
  loadArtifacts,
  loadDeployment,
  MailboxClient,
  noteCm,
  scanBill,
  truncateKey,
  prove as proveCircuit,
  toCalldata,
  type ArtifactSet,
  type CircuitName,
} from "@shadowpass/sdk";
import { createPublicClient, http } from "viem";
import { BrowserWalletGateway, waitForChainState } from "../src/flows/chain.js";
import { loadBillSnapshot, mergeWalletBills } from "../src/flows/bill.js";
import { deposit } from "../src/flows/deposit.js";
import { availableStewardBudget, issueCard } from "../src/flows/issue.js";
import { onboard } from "../src/flows/onboard.js";
import type { ProofService } from "../src/flows/prove.js";
import { publishOwnerRecords, recoverNotes, restoreOwnerRecords } from "../src/flows/snapshot.js";
import { revokeAgent, revokeTree } from "../src/flows/revoke.js";
import { emptyLedger, type CalldataProof, type WalletLedger } from "../src/flows/types.js";
import { bytesToHex } from "../src/lib/bytes.js";
import { preparePayment, prepareTreasurySupply, registerActionState, simulateAction, submitAction } from "./live-chain-actions.mts";
import { buildAuthorizationTree } from "../src/views/Tree.js";

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
  assert.equal(availableStewardBudget(ledger, state, bundle.steward), 100_000_000n);

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
  assert.equal(availableStewardBudget(ledger, state, bundle.steward), 10_000_000n);
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

  const buyerBundle = await buyerStore.loadBundle();
  const treasuryBundle = await treasuryStore.loadBundle();
  if (!buyerBundle || !treasuryBundle) throw new Error("credential bundle was not delivered to an Agent store");
  const buyerNote = buyerBundle.note;
  const treasuryNote = treasuryBundle.note;
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const merchant = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;

  const payment = await preparePayment({
    deployment,
    state,
    store: buyerStore,
    bundle: buyerBundle,
    note: buyerNote,
    amount: 5_000_000n,
    payTo: merchant,
    resource: "shadowpass://e2e/malicious-report",
    seed: "bill-e2e-payment-1",
    artifactsDir,
  });
  await registerActionState(gateway, payment);
  const paymentStarted = timer();
  const paymentTx = await submitAction(publicClient, rpcUrl, deployment, payment);
  const paymentElapsed = elapsed(paymentStarted);
  state = await waitForChainState(gateway, (candidate) => candidate.spentNullifiers.has(payment.budget.budgetNf.toString()));
  assert.equal(state.spentNullifiers.has(payment.budget.budgetNf.toString()), true);

  const ownerBills = mergeWalletBills({
    entries: scanBill(state, await gateway.logs(), bundle.view.vsk),
    ledger,
    receipts: [],
  });
  const maliciousBill = ownerBills.find((bill) => bill.budgetNf === payment.budget.budgetNf);
  assert.ok(maliciousBill, "owner did not see the real Gate payment");
  assert.equal(maliciousBill.agentName, "buyer");
  assert.equal(maliciousBill.amount, 5_000_000n);
  assert.equal(maliciousBill.reported, false);

  const otherView = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 177));
  const unseenBills = scanBill(state, await gateway.logs(), otherView.view.vsk);
  assert.equal(unseenBills.length >= 1, true);
  assert.equal(unseenBills.every((bill) => bill.chain === null), true);

  const changeMemo = state.memos.get(noteCm({
    own: [BigInt(payment.change.own[0]), BigInt(payment.change.own[1])],
    q: BigInt(payment.change.q),
    lin: payment.change.lin.map(BigInt) as [bigint, bigint, bigint, bigint],
    rho: BigInt(payment.change.rho),
  }).toString());
  if (!changeMemo) throw new Error("payment change memo is missing");
  const paymentChange = await decodeNoteMemo(changeMemo, buyerStore.boxPrivateKey);
  if (!paymentChange) throw new Error("buyer could not decrypt its payment change note");
  await buyerStore.addNote({
    own: paymentChange.own.map(String) as [string, string],
    q: paymentChange.q.toString(),
    lin: paymentChange.lin.map(String) as [string, string, string, string],
    rho: paymentChange.rho.toString(),
  });

  const pendingPayment = await preparePayment({
    deployment,
    state,
    store: buyerStore,
    bundle: buyerBundle,
    note: {
      own: paymentChange.own.map(String) as [string, string],
      q: paymentChange.q.toString(),
      lin: paymentChange.lin.map(String) as [string, string, string, string],
      rho: paymentChange.rho.toString(),
    },
    amount: 2_000_000n,
    payTo: merchant,
    resource: "shadowpass://e2e/after-revoke",
    seed: "bill-e2e-payment-2",
    artifactsDir,
  });
  await registerActionState(gateway, pendingPayment);

  const buyerCard = ledger.cards.find((card) => card.id === pay.cardId);
  if (!buyerCard) throw new Error("buyer card is missing from the wallet ledger");
  const revokeStarted = timer();
  const agentRevocation = await revokeAgent({ ledger, bundle, gateway, proofs, card: buyerCard });
  const revokeElapsed = elapsed(revokeStarted);
  state = await gateway.sync();
  const windowSeconds = await gateway.revocationWindow();
  assert.equal(windowSeconds, 10n);

  const treasurySupply = await prepareTreasurySupply({
    publicClient,
    deployment,
    state,
    store: treasuryStore,
    bundle: treasuryBundle,
    note: treasuryNote,
    amount: 10_000_000n,
    term: 60n,
    seed: "bill-e2e-treasury",
    artifactsDir,
  });
  await registerActionState(gateway, treasurySupply);
  const treasurySupplyStarted = timer();
  const treasuryTx = await submitAction(publicClient, rpcUrl, deployment, treasurySupply);
  const treasurySupplyElapsed = elapsed(treasurySupplyStarted);
  state = await waitForChainState(gateway, (candidate) => candidate.spentNullifiers.has(treasurySupply.budget.budgetNf.toString()));
  assert.equal(state.spentNullifiers.has(treasurySupply.budget.budgetNf.toString()), true);
  assert.equal(state.revoked.has(truncateKey(BigInt(buyerCard.id))), true);
  const treeAfterAgentRevoke = buildAuthorizationTree(ledger, bundle, state, ownerBills);
  assert.equal(treeAfterAgentRevoke.cards.find((card) => card.id === buyerCard.id)?.status, "revoked");
  assert.equal(treeAfterAgentRevoke.cards.find((card) => card.id === treasury.cardId)?.status, "active");

  await mailbox.send(bundle.box.publicKey, {
    type: "receipt",
    budgetNf: treasurySupply.budget.budgetNf.toString(),
    tx: treasuryTx,
    resource: "treasury://e2e/supply",
    amount: treasurySupply.action.amount.toString(),
  });
  const receiptSnapshot = await loadBillSnapshot({
    ledger,
    gateway,
    mailbox,
    bundle,
  });
  assert.equal(receiptSnapshot.bills.find((bill) => bill.budgetNf === treasurySupply.budget.budgetNf)?.reported, true);

  await publicClient.request({ method: "evm_increaseTime", params: [Number(windowSeconds) + 2] } as any);
  await publicClient.request({ method: "evm_mine", params: [] } as any);
  let stalePaymentRejected = false;
  let stalePaymentError = "";
  try {
    await simulateAction(publicClient, deployment, pendingPayment);
  } catch (error) {
    stalePaymentError = String(error);
    stalePaymentRejected = /StaleRevokedRoot/.test(stalePaymentError);
  }
  assert.equal(stalePaymentRejected, true, `old revoked root was not rejected as expected: ${stalePaymentError}`);

  const treeRevocation = await revokeTree({ ledger, bundle, gateway, proofs });
  state = await gateway.sync();
  assert.equal(state.revoked.has(truncateKey(BigInt(ledger.root!.hash))), true);
  const finalOtherViewBills = scanBill(state, await gateway.logs(), otherView.view.vsk);
  assert.equal(finalOtherViewBills.length >= 2, true);
  assert.equal(finalOtherViewBills.every((bill) => bill.chain === null), true);

  await publishOwnerRecords(mailbox, bundle, ledger);
  const blank = emptyLedger(deployment.chainId, "anvil", bundle.sign.Ax);
  const records = await restoreOwnerRecords(mailbox, bundle, state, blank);
  const recovered = await recoverNotes(records, bundle, state);
  assert.equal(recovered.cards.length, 2);
  assert.equal(availableStewardBudget(recovered, state, bundle.steward), 10_000_000n);

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
      maliciousPayment: paymentElapsed,
      revokeBuyer: revokeElapsed,
      treasurySupply: treasurySupplyElapsed,
    },
    transactions: {
      register: ledger.registrationTx ?? checkpoint.find((entry) => entry.registrationTx)?.registrationTx,
      deposit: funded.transaction,
      buyerIssue: pay.ledger.cards.find((card) => card.id === pay.cardId)?.issueTx,
      buyerTransfer: pay.ledger.cards.find((card) => card.id === pay.cardId)?.transferTx,
      treasuryIssue: treasury.ledger.cards.find((card) => card.id === treasury.cardId)?.issueTx,
      treasuryTransfer: treasury.ledger.cards.find((card) => card.id === treasury.cardId)?.transferTx,
      finalChange: ledger.notes.find((entry) => entry.kind === "change" && BigInt(entry.note.q) === 10_000_000n)?.tx,
      maliciousPayment: paymentTx,
      revokeBuyer: agentRevocation.transaction,
      treasurySupply: treasuryTx,
      revokeTree: treeRevocation.transaction,
    },
    wallet: { stewardRemaining: "10000000", cards: ledger.cards.length },
    bills: {
      ownerDecrypted: ownerBills.length,
      maliciousUnreported: maliciousBill.reported === false,
      otherViewKeyDecrypted: finalOtherViewBills.filter((bill) => bill.chain !== null).length,
      treasuryReceiptMatched: receiptSnapshot.bills.find((bill) => bill.budgetNf === treasurySupply.budget.budgetNf)?.reported === true,
    },
    revocation: {
      windowSeconds: windowSeconds.toString(),
      buyerRevoked: state.revoked.has(truncateKey(BigInt(buyerCard.id))),
      treeRevoked: state.revoked.has(truncateKey(BigInt(ledger.root!.hash))),
      stalePaymentRejected,
      treasuryUnaffected: treeAfterAgentRevoke.cards.find((card) => card.id === treasury.cardId)?.status,
    },
    mcp: [{ name: buyerStore.name, ...buyerStatus }, { name: treasuryStore.name, ...treasuryStatus }],
    recovery: { cards: recovered.cards.length, stewardRemaining: "10000000", noteCount: recovered.notes.length },
    memoOwner: { boxPk: bytesToHex(bundle.box.publicKey) },
  }, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

process.exit(0);
