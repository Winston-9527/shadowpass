#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? process.env.DEMO_URL;
if (!baseUrl) {
  throw new Error("usage: DEMO_URL=http://127.0.0.1:4179 node --import tsx scripts/demo/ui-check.mjs");
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const runtime = path.join(root, "scripts", "demo", ".runtime", "ui");
const videoFile = process.env.DEMO_VIDEO ? path.resolve(process.env.DEMO_VIDEO) : undefined;
const desktopScreenshot = path.resolve(process.env.DEMO_DESKTOP_SCREENSHOT ?? path.join(runtime, "desktop.png"));
const mobileScreenshot = path.resolve(process.env.DEMO_MOBILE_SCREENSHOT ?? path.join(runtime, "mobile.png"));
const startedAt = Date.now();

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function text(locator) {
  return (await locator.textContent())?.trim() ?? "";
}

async function waitForText(page, selector, expected, timeout = 90_000) {
  await page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
    { selector, expected },
    { timeout },
  );
}

async function waitForTextContaining(page, selector, expected, timeout = 90_000) {
  await page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent?.includes(expected),
    { selector, expected },
    { timeout },
  );
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  ensure(dimensions.document <= dimensions.viewport + 1, `${label} has horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function caption(page, value, visible = true) {
  if (!videoFile) return;
  await page.evaluate(({ value, visible }) => {
    let element = document.querySelector("#demo-recording-caption");
    if (!element) {
      element = document.createElement("div");
      element.id = "demo-recording-caption";
      Object.assign(element.style, {
        position: "fixed",
        left: "50%",
        bottom: "18px",
        transform: "translateX(-50%)",
        maxWidth: "calc(100vw - 36px)",
        padding: "9px 14px",
        borderRadius: "6px",
        background: "rgba(18, 32, 34, 0.94)",
        color: "#f5faf8",
        font: "600 13px/1.45 -apple-system, BlinkMacSystemFont, sans-serif",
        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.24)",
        zIndex: "100",
        pointerEvents: "none",
      });
      document.body.append(element);
    }
    element.textContent = value;
    element.style.display = visible ? "block" : "none";
    return undefined;
  }, { value, visible });
}

fs.mkdirSync(path.dirname(desktopScreenshot), { recursive: true });
fs.mkdirSync(path.dirname(mobileScreenshot), { recursive: true });
const videoDir = path.join(runtime, "video");
if (videoFile) {
  fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(path.dirname(videoFile), { recursive: true });
}

const browser = await chromium.launch({ headless: true });
let videoPath;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(videoFile ? { recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } } : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#note-set")?.textContent?.includes("25"));

  ensure((await text(page.locator("#simulated-count"))).includes("20 个票据层模拟用户"), "simulation label is missing");
  ensure((await text(page.locator("#simulation-copy"))).includes("模拟"), "simulation data is not disclosed");
  const simulated = await page.evaluate(async () => (await fetch("/api/status")).json());
  ensure(simulated.anonymity.simulatedAmounts.length === 20, "simulated deposit amounts are missing");
  ensure(simulated.anonymity.simulatedAmounts.every((amount) => (
    BigInt(amount) >= 5_000_000n && BigInt(amount) <= 100_000_000n
  )), "simulated deposit amounts are outside 5-100 spUSD");
  ensure((await text(page.locator("#simulated-deposits"))).endsWith("spUSD"), "simulated deposit total is missing");
  ensure((await text(page.locator("#privacy-note-set"))) === String(simulated.anonymity.noteSetSize), "privacy note set is missing");
  ensure((await text(page.locator("#privacy-identity-set"))) === "1", "identity anonymity limitation is missing");
  ensure(
    await page.locator("#privacy-note-dots .set-dot").count() === Math.min(simulated.anonymity.noteSetSize, 32),
    "privacy note dots do not match the anonymity set",
  );
  await assertNoHorizontalOverflow(page, "desktop initial view");
  await caption(page, "1 / 5  20 个模拟用户只扩展票据层匿名集；身份层匿名集仍为 1");
  await page.waitForTimeout(3_000);

  await caption(page, "2 / 5  采购 Agent 尝试 TREASURY，证明器在 CapSubset 约束处拒绝");
  await page.waitForTimeout(1_500);
  await page.locator('[data-capability="buyer"][data-operation="treasury"]').click();
  await waitForTextContaining(page, "#buyer-check", "CapSubset", 20_000);

  await caption(page, "3 / 5  通过真实 x402 中间件购买报告，由 facilitator 代付并结算");
  await page.waitForTimeout(1_500);
  await page.locator('[data-action="purchase"]').click();
  await waitForText(page, "#purchase-status", "已执行");
  ensure((await text(page.locator("#ledger"))).includes("采购 Agent 通过 x402 购买市场报告"), "purchase receipt is missing");
  ensure((await text(page.locator("#receipt-state"))) === "ON-CHAIN", "privacy receipt did not activate");
  ensure((await text(page.locator("#receipt-tx"))).startsWith("0x"), "privacy receipt transaction is missing");
  ensure((await text(page.locator("#receipt-method"))).startsWith("0x"), "privacy receipt method is missing");
  ensure((await text(page.locator("#receipt-owner-chain"))).includes("采购 Agent"), "owner-only chain is missing");
  ensure((await text(page.locator("#receipt-unknown-identity"))).includes("未关联"), "public payer anonymity is not explicit");
  await caption(page, "Alice 用查看钥解密委托链，商家和观察者只看到池内承诺");
  await page.waitForTimeout(2_000);
  await page.locator(".comparison-section").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await caption(page, "", false);
  await page.screenshot({ path: desktopScreenshot, fullPage: true });
  await caption(page, "对照：ERC-7710 / session key 通常会公开账户、delegate 与 calldata");
  await page.waitForTimeout(2_000);

  await caption(page, "4 / 5  理财 Agent 只能进入白名单 ERC-4626，回款票据已在存入时承诺");
  await page.waitForTimeout(1_500);
  await page.locator('[data-action="treasury"]').click();
  await waitForText(page, "#treasury-status", "已存入");
  ensure((await text(page.locator("#return-cm"))) !== "待生成", "treasury return commitment is missing");
  await page.locator('[data-comparison="treasury"]').click();
  ensure((await text(page.locator("#shadowpass-action"))).startsWith("理财存入 ·"), "treasury comparison is stale");
  ensure((await text(page.locator("#receipt-owner-chain"))).includes("理财 Agent"), "treasury privacy receipt is stale");
  await page.waitForTimeout(2_000);

  await caption(page, "5 / 5  到期后赎回，本金和收益进入预先承诺的票据");
  await page.waitForTimeout(1_500);
  await page.locator('[data-action="treasury-withdraw"]').click();
  await waitForText(page, "#treasury-status", "已赎回");
  ensure((await text(page.locator("#ledger"))).includes("金库到期，本金和收益回到预先承诺的票据"), "withdrawal receipt is missing");
  await caption(page, "两条分支互不越权；主人可审计，但不隐藏金额、时间和 IP");
  await page.waitForTimeout(2_500);
  await page.locator("#ledger").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_000);

  const desktopDurationMs = Date.now() - startedAt;
  const purchaseStatus = await text(page.locator("#purchase-status"));
  const treasuryStatus = await text(page.locator("#treasury-status"));
  ensure(desktopDurationMs < 180_000, `desktop flow exceeded 3 minutes: ${desktopDurationMs} ms`);
  await context.close();
  if (videoFile) {
    const recorded = fs.readdirSync(videoDir).find((name) => name.endsWith(".webm"));
    ensure(recorded, "Playwright did not produce a video");
    videoPath = path.join(videoDir, recorded);
    fs.copyFileSync(videoPath, videoFile);
  }

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "networkidle" });
  await mobilePage.waitForFunction(() => document.querySelector("#treasury-status")?.textContent === "已赎回");
  ensure(await mobilePage.locator("#privacy-receipt").isVisible(), "mobile privacy receipt is hidden");
  await assertNoHorizontalOverflow(mobilePage, "mobile view");
  await mobilePage.screenshot({ path: mobileScreenshot, fullPage: true });
  await mobilePage.setViewportSize({ width: 320, height: 568 });
  await assertNoHorizontalOverflow(mobilePage, "320 px view");
  await mobile.close();

  console.log(JSON.stringify({
    result: "ok",
    durationMs: Date.now() - startedAt,
    desktopScreenshot,
    mobileScreenshot,
    video: videoFile ?? null,
    purchase: purchaseStatus,
    treasury: treasuryStatus,
  }, null, 2));
} finally {
  await browser.close();
}
