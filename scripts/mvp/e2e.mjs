import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
import { mcpConfiguration } from "./services.mjs";

const revocationsAbi = parseAbi([
  "event Revoked(uint256 indexed entry,uint256 index,uint256 oldRoot,uint256 newRoot)",
]);

function now() {
  return performance.now();
}

function elapsed(started) {
  return Math.round(performance.now() - started);
}

function toolValue(result) {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find((entry) => entry?.type === "text")?.text;
  if (typeof text !== "string") throw new Error("MCP tool returned no text content");
  return JSON.parse(text);
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const value = toolValue(result);
  if (result.isError) {
    throw Object.assign(new Error(value.message ?? value.error ?? `${name} failed`), { code: value.error, value });
  }
  return value;
}

async function callToolResult(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  return { isError: result.isError === true, value: toolValue(result) };
}

async function waitForTool(client, name, predicate, args = {}, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    const result = await callToolResult(client, name, args);
    last = result;
    if (!result.isError && predicate(result.value)) return result.value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} did not reach the expected state: ${JSON.stringify(last?.value)}`);
}

async function connectMcp(context, name) {
  const config = mcpConfiguration(context, name);
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: {
      ...process.env,
      ...config.env,
      SHADOWPASS_STATE_TTL_MS: "0",
    },
    cwd: context.root,
    stderr: "pipe",
  });
  const client = new Client({ name: `shadowpass-mvp-${name}`, version: "1.0.0" });
  await client.connect(transport);
  return client;
}

async function launchChrome() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

async function waitForUnlocked(page) {
  await Promise.race([
    page.locator(".owner-console").waitFor({ timeout: 30_000 }),
    page.locator(".inline-error").waitFor({ timeout: 30_000 }).then(async () => {
      throw new Error(`wallet unlock failed: ${await page.locator(".inline-error").textContent()}`);
    }),
  ]);
}

async function waitForIssue(page, started) {
  const error = page.locator(".console-error");
  await Promise.race([
    page.getByText("Paired", { exact: true }).waitFor({ state: "hidden", timeout: 120_000 }),
    error.waitFor({ timeout: 120_000 }).then(async () => {
      throw new Error(`card issue failed: ${await error.textContent()}`);
    }),
  ]);
  return elapsed(started);
}

async function readLedger(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("shadowpass-wallet", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const request = database.transaction("wallet-state", "readonly").objectStore("wallet-state").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const ledger = rows.find((row) => row.id.startsWith("ledger:"))?.value;
    if (!ledger) throw new Error("wallet ledger was not persisted");
    return ledger;
  });
}

async function issueCard(page, pairingCode, { budget, treasury = false }) {
  await page.getByRole("button", { name: "Issue card", exact: true }).click();
  await page.getByTestId("pairing-code").fill(pairingCode);
  await page.getByRole("button", { name: "Read pairing" }).click();
  await page.getByText("Paired", { exact: true }).waitFor();
  if (treasury) await page.getByRole("button", { name: "Treasury" }).click();
  await page.getByTestId("card-budget").fill(budget);
  await page.getByLabel("Expires").selectOption("1");
  const started = now();
  await page.getByTestId("issue-card").click();
  return waitForIssue(page, started);
}

export async function runMvpE2e(context) {
  const e2eStarted = now();
  const client = createPublicClient({ transport: http(context.rpcUrl), pollingInterval: 300 });
  const browser = await launchChrome();
  let buyer;
  let treasury;
  let walletContext;
  try {
    buyer = await connectMcp(context, "buyer");
    treasury = await connectMcp(context, "treasury");
    for (const hash of context.simulated.transactions) {
      const transaction = await client.getTransaction({ hash });
      assert.equal(transaction.from.toLowerCase(), context.facilitatorAddress.toLowerCase());
    }

    walletContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await walletContext.addInitScript({ path: path.join(context.root, "apps/wallet/scripts/install-passkey-double.js") });
    let page = await walletContext.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") process.stderr.write(`[wallet console] ${message.text()}\n`);
    });
    page.on("pageerror", (error) => process.stderr.write(`[wallet pageerror] ${error.message}\n`));
    await page.goto(context.walletUrl);

    const createStarted = now();
    await page.getByTestId("create-wallet").click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "I stored it" }).click();
    const createMs = elapsed(createStarted);
    await page.getByTestId("onboard-wallet").waitFor();
    const onboardStarted = now();
    await page.getByTestId("onboard-wallet").click();
    try {
      await Promise.race([
        page.getByRole("button", { name: "100 USDC", exact: true }).waitFor({ timeout: 120_000 }),
        page.locator(".console-error").waitFor({ timeout: 120_000 }).then(async () => {
          throw new Error(`wallet onboarding failed: ${await page.locator(".console-error").textContent()}`);
        }),
      ]);
    } catch (error) {
      await page.screenshot({ path: path.join(context.runtimeRoot, "onboarding-failure.png"), fullPage: true });
      process.stderr.write(`[wallet body] ${(await page.locator("body").innerText()).slice(0, 2000)}\n`);
      throw error;
    }
    const onboardMs = elapsed(onboardStarted);

    const depositStarted = now();
    await page.getByRole("button", { name: "100 USDC", exact: true }).click();
    await page.waitForFunction(() => {
      const value = document.querySelector(".wallet-toolbar .metric strong")?.textContent ?? "";
      return value.startsWith("100");
    }, undefined, { timeout: 120_000 });
    const depositMs = elapsed(depositStarted);

    const buyerIssueMs = await issueCard(page, context.pairings.buyer.code, { budget: "40" });
    const treasuryIssueMs = await issueCard(page, context.pairings.treasury.code, { budget: "50", treasury: true });
    const ledgerAfterIssue = await readLedger(page);
    assert.equal(ledgerAfterIssue.cards.length, 2);
    const buyerCard = ledgerAfterIssue.cards.find((card) => card.name === "buyer");
    const treasuryCard = ledgerAfterIssue.cards.find((card) => card.name === "treasury");
    assert.ok(buyerCard?.issueTx && treasuryCard?.issueTx, "wallet did not persist both card transactions");

    const buyerStatus = await waitForTool(buyer, "wallet_status", (value) => value.status === "active" && value.remainingBudget === "40000000");
    const treasuryStatus = await waitForTool(treasury, "wallet_status", (value) => value.status === "active" && value.remainingBudget === "50000000");

    await page.close();
    const payStarted = now();
    const payWallStarted = Date.now();
    const payment = await callTool(buyer, "pay", {
      url: `${context.merchantUrl}/report`,
      maxAmount: "2000000",
    });
    const payMs = elapsed(payStarted);
    assert.match(payment.resourceContent?.text ?? "", /EV market Q3/);
    assert.match(payment.tx ?? "", /^0x[0-9a-f]{64}$/i);
    assert.equal(payment.receiptReported, false);

    const supplyStarted = now();
    const supply = await callTool(treasury, "treasury_supply", {
      vault: context.deployment.vault,
      amount: "20000000",
      termSeconds: "86400",
    });
    const supplyMs = elapsed(supplyStarted);
    assert.match(supply.tx ?? "", /^0x[0-9a-f]{64}$/i);

    await client.request({ method: "evm_increaseTime", params: [86_401] });
    await client.request({ method: "evm_mine", params: [] });
    const withdrawStarted = now();
    const withdrawal = await callTool(treasury, "treasury_withdraw", { positionId: supply.positionId });
    const withdrawMs = elapsed(withdrawStarted);
    assert.equal(withdrawal.recovered, true);

    const alertElapsed = Date.now() - payWallStarted;
    if (alertElapsed < 31_000) await new Promise((resolve) => setTimeout(resolve, 31_000 - alertElapsed));

    page = await walletContext.newPage();
    await page.goto(context.walletUrl);
    await page.locator(".passkey-row").first().click();
    await waitForUnlocked(page);
    await page.getByTestId("bill-alert").waitFor({ timeout: 60_000 });
    const alertText = await page.getByTestId("bill-alert").textContent();
    assert.match(alertText ?? "", /Unreported spend/);
    await page.getByRole("button", { name: "Review bills", exact: true }).click();
    await page.getByTestId("bill-row").first().waitFor({ timeout: 30_000 });
    const billsText = await page.locator(".bills-layout").textContent();
    assert.match(billsText ?? "", /buyer/);
    assert.match(billsText ?? "", /treasury/);
    assert.match(billsText ?? "", /Unreported/);

    await page.getByRole("button", { name: "Authorization", exact: true }).click();
    await page.getByTestId("revoke-buyer").click();
    const revokeBlock = await client.getBlockNumber();
    await page.getByRole("button", { name: "Confirm revoke", exact: true }).click();
    await page.getByText("revoked", { exact: true }).waitFor({ timeout: 120_000 });
    const revokeLogs = await client.getLogs({
      address: context.deployment.revocations,
      event: revocationsAbi[0],
      fromBlock: revokeBlock,
      toBlock: "latest",
    });
    assert.ok(revokeLogs.length >= 1, "revocation transaction was not found");
    const revokeTx = revokeLogs.at(-1).transactionHash;

    await client.request({ method: "evm_increaseTime", params: [12] });
    await client.request({ method: "evm_mine", params: [] });
    const revokedStatus = await waitForTool(buyer, "wallet_status", (value) => value.status === "revoked");
    const rejected = await callToolResult(buyer, "pay", {
      url: `${context.merchantUrl}/report`,
      maxAmount: "2000000",
    });
    assert.equal(rejected.isError, true);
    assert.equal(rejected.value.error, "revoked");
    const treasuryAfter = await callTool(treasury, "wallet_status");
    assert.equal(treasuryAfter.status, "active");
    const positionStatus = await callTool(treasury, "treasury_status");
    assert.equal(positionStatus.positions.some((position) => position.positionId === supply.positionId && position.withdrawn), true);

    return {
      result: "ok",
      productComponents: ["wallet PWA", "MCP buyer stdio", "MCP treasury stdio", "facilitator", "mailbox", "merchant", "Anvil"],
      simulatedAnonymitySet: context.simulated.count,
      simulatedDepositsRelayed: context.simulated.transactions.length,
      steps: [
        { step: "create wallet", ms: createMs },
        { step: "onboard", ms: onboardMs },
        { step: "faucet 100", ms: depositMs },
        { step: "issue PAY 40", ms: buyerIssueMs },
        { step: "issue TREASURY 50", ms: treasuryIssueMs },
        { step: "MCP pay", ms: payMs },
        { step: "MCP treasury supply", ms: supplyMs },
        { step: "MCP treasury withdraw", ms: withdrawMs },
      ],
      cards: ledgerAfterIssue.cards.map((card) => ({ name: card.name, issueTx: card.issueTx, transferTx: card.transferTx })),
      mcp: { buyer: buyerStatus, treasury: treasuryStatus, revokedBuyer: revokedStatus, treasuryAfterRevoke: treasuryAfter },
      transactions: {
        payment: payment.tx,
        treasurySupply: supply.tx,
        treasuryWithdraw: withdrawal.tx,
        revoke: revokeTx,
      },
      billAlert: { shown: true, buyerRejected: rejected.value.error, treasuryUnaffected: treasuryAfter.status === "active" },
      totalMs: elapsed(e2eStarted),
    };
  } finally {
    await Promise.allSettled([buyer?.close(), treasury?.close(), walletContext?.close(), browser.close()]);
  }
}
