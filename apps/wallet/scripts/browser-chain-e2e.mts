import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build, preview } from "vite";
import {
  AgentStore,
  CredentialInbox,
  buildPairing,
  walletStatus,
  type McpToolContext,
} from "@shadowpass/mcp";
import { ChainState, loadDeployment, MailboxClient } from "@shadowpass/sdk";
import { createPublicClient, http } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const outputDir = path.join(root, "apps/wallet/e2e-output");
const mailboxUrl = process.env.MAILBOX_URL ?? "http://127.0.0.1:8787";
const facilitatorUrl = process.env.FACILITATOR_URL ?? "http://127.0.0.1:4022";
const rpcUrl = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";
const scratch = await mkdtemp(path.join(tmpdir(), "shadowpass-browser-e2e-"));

process.env.VITE_NETWORK = "anvil";
process.env.VITE_RPC_URL = rpcUrl;
process.env.VITE_MAILBOX_URL = mailboxUrl;
process.env.VITE_FACILITATOR_URL = "/facilitator";
process.env.VITE_FACILITATOR_PROXY_TARGET = facilitatorUrl;
process.env.VITE_ARTIFACTS_URL = "/zk/circuits-v2";

async function waitForService(name: string, url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // The local service may still be binding its port.
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
      if (response.ok) return;
    } catch {
      // The local node may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`anvil is not available at ${url}`);
}

async function waitForIssue(page: import("playwright").Page, started: number): Promise<number> {
  const error = page.locator(".console-error");
  await Promise.race([
    page.getByText("Paired", { exact: true }).waitFor({ state: "hidden", timeout: 120_000 }),
    error.waitFor({ timeout: 120_000 }).then(async () => {
      throw new Error(`card issue failed: ${await error.textContent()}`);
    }),
  ]);
  return Date.now() - started;
}

async function readLedger(page: import("playwright").Page): Promise<{ cards: Array<{ issueTx: string; transferTx: string; timings: { proofMs: number; chainMs: number; totalMs: number } }> }> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("shadowpass-wallet", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<any[]>((resolve, reject) => {
      const request = database.transaction("wallet-state", "readonly").objectStore("wallet-state").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const ledger = rows.find((row) => row.id.startsWith("ledger:"))?.value;
    if (!ledger) throw new Error("wallet ledger was not persisted");
    return { cards: ledger.cards };
  });
}

try {
  await Promise.all([
    waitForRpc(rpcUrl),
    waitForService("facilitator", `${facilitatorUrl}/health`),
    waitForService("mailbox", `${mailboxUrl.replace(/\/$/, "")}/box/${"00".repeat(32)}`),
  ]);
  await mkdir(outputDir, { recursive: true });

  const deployment = await loadDeployment("anvil");
  const mailbox = new MailboxClient(mailboxUrl);
  const buyerStore = await AgentStore.open({ name: "buyer", root: path.join(scratch, "buyer"), network: "anvil", deployment: "anvil" });
  const treasuryStore = await AgentStore.open({ name: "treasury", root: path.join(scratch, "treasury"), network: "anvil", deployment: "anvil" });
  const buyerPairing = buildPairing(buyerStore);
  const treasuryPairing = buildPairing(treasuryStore);

  const configFile = path.join(root, "apps/wallet/vite.config.ts");
  await build({ root: path.join(root, "apps/wallet"), configFile, mode: "production", logLevel: "silent" });
  const server = await preview({
    root: path.join(root, "apps/wallet"),
    configFile,
    logLevel: "silent",
    preview: { host: "localhost", port: 4173, strictPort: false },
  });
  const url = server.resolvedUrls?.local[0] ?? "http://localhost:4173";
  const chrome = await chromium.launch({ channel: "chrome" });

  try {
    const context = await chrome.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript({ path: path.join(here, "install-passkey-double.js") });
    const page = await context.newPage();
    await page.goto(url);
    assert.equal(await page.evaluate(async () => {
      const credential = await navigator.credentials.create({ publicKey: { challenge: new Uint8Array([1]).buffer } });
      return credential instanceof PublicKeyCredential;
    }), true, "passkey double is not installed in the page realm");
    await page.getByTestId("create-wallet").click();
    try {
      await Promise.race([
        page.getByRole("dialog").waitFor(),
        page.locator(".inline-error").waitFor().then(async () => {
          throw new Error(`wallet creation failed: ${await page.locator(".inline-error").textContent()}`);
        }),
      ]);
    } catch (error) {
      await page.screenshot({ path: path.join(outputDir, "wallet-browser-chain-failure.png"), fullPage: true });
      process.stderr.write(`[browser] ${(await page.locator("body").innerText()).slice(0, 2000)}\n`);
      throw error;
    }
    await page.getByRole("button", { name: "I stored it" }).click();
    const onboardButton = page.getByTestId("onboard-wallet");
    await onboardButton.waitFor();

    const onboardStarted = Date.now();
    await onboardButton.click();
    await page.getByRole("button", { name: "100 USDC", exact: true }).waitFor({ timeout: 30_000 });
    const onboardMs = Date.now() - onboardStarted;

    const depositStarted = Date.now();
    await page.getByRole("button", { name: "100 USDC", exact: true }).click();
    await page.waitForFunction(() => {
      const value = document.querySelector(".wallet-toolbar .metric strong")?.textContent ?? "";
      return value.startsWith("100");
    }, undefined, { timeout: 30_000 });
    const depositMs = Date.now() - depositStarted;
    await page.screenshot({ path: path.join(outputDir, "wallet-funded-100.png"), fullPage: true });

    await page.getByRole("button", { name: "Issue card", exact: true }).click();
    await page.getByTestId("pairing-code").fill(buyerPairing.code);
    await page.getByRole("button", { name: "Read pairing" }).click();
    await page.getByText("Paired", { exact: true }).waitFor();
    await page.getByTestId("card-budget").fill("40");
    await page.getByLabel("Expires").selectOption("1");
    const payStarted = Date.now();
    await page.getByTestId("issue-card").click();
    const payMs = await waitForIssue(page, payStarted);

    await page.getByTestId("pairing-code").fill(treasuryPairing.code);
    await page.getByRole("button", { name: "Read pairing" }).click();
    await page.getByRole("button", { name: "Treasury" }).click();
    await page.getByTestId("card-budget").fill("50");
    await page.getByLabel("Expires").selectOption("1");
    const treasuryStarted = Date.now();
    await page.getByTestId("issue-card").click();
    const treasuryMs = await waitForIssue(page, treasuryStarted);

    await page.getByRole("button", { name: "Authorization", exact: true }).click();
    await page.getByText("buyer", { exact: true }).waitFor();
    await page.getByText("treasury", { exact: true }).waitFor();
    const treeText = await page.locator(".tree-panel").textContent();
    assert.match(treeText ?? "", /PAY/);
    assert.match(treeText ?? "", /TREASURY/);
    assert.match(treeText ?? "", /40 \/ 40/);
    assert.match(treeText ?? "", /50 \/ 50/);
    await page.screenshot({ path: path.join(outputDir, "wallet-authorization-tree.png"), fullPage: true });

    const client = createPublicClient({ transport: http(rpcUrl) });
    const state = await ChainState.sync(client, deployment);
    const buyerInbox = new CredentialInbox({ mailbox, store: buyerStore, state, deploymentName: "anvil", chainId: deployment.chainId });
    const treasuryInbox = new CredentialInbox({ mailbox, store: treasuryStore, state, deploymentName: "anvil", chainId: deployment.chainId });
    const [buyerSync, treasurySync] = await Promise.all([buyerInbox.sync(), treasuryInbox.sync()]);
    assert.equal(buyerSync.accepted, 1);
    assert.equal(treasurySync.accepted, 1);
    const toolContext = (store: AgentStore): McpToolContext => ({
      store,
      state,
      deploymentName: "anvil",
      chainId: deployment.chainId,
      services: {},
      mailbox,
      malicious: false,
      maxPayment: 10_000_000n,
    });
    const buyerStatus = await walletStatus(toolContext(buyerStore));
    const treasuryStatus = await walletStatus(toolContext(treasuryStore));
    assert.deepEqual(buyerStatus.capabilities, ["PAY"]);
    assert.equal(buyerStatus.remainingBudget, "40000000");
    assert.deepEqual(treasuryStatus.capabilities, ["TREASURY"]);
    assert.equal(treasuryStatus.remainingBudget, "50000000");
    const ledger = await readLedger(page);
    assert.equal(ledger.cards.length, 2);
    assert.ok(ledger.cards.every((card) => /^0x[0-9a-f]{64}$/i.test(card.issueTx)));
    assert.ok(ledger.cards.every((card) => /^0x[0-9a-f]{64}$/i.test(card.transferTx)));

    console.log(JSON.stringify({
      ok: true,
      browser: { channel: "chrome", version: chrome.version(), platform: process.platform, arm64: process.arch === "arm64" },
      timingsMs: { onboard: onboardMs, faucetDeposit100: depositMs, issuePay40: payMs, issueTreasury50: treasuryMs },
      cardTimings: ledger.cards.map((card) => card.timings),
      authorizationTree: { cards: 2, stewardRemaining: "10000000" },
      mcp: [{ name: buyerStore.name, ...buyerStatus }, { name: treasuryStore.name, ...treasuryStatus }],
      screenshots: ["wallet-funded-100.png", "wallet-authorization-tree.png"],
    }, null, 2));
    await context.close();
  } finally {
    await chrome.close();
    await server.close();
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

process.exit(0);
