import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { build, preview } from "vite";
import { startSlotServer } from "./dev-mailbox.mjs";

const outputDir = new URL("../e2e-output/", import.meta.url);
await mkdir(outputDir, { recursive: true });

const mailbox = await startSlotServer(0);
const mailboxAddress = mailbox.address();
if (!mailboxAddress || typeof mailboxAddress === "string") throw new Error("mailbox did not bind a TCP port");
process.env.VITE_MAILBOX_URL = `http://127.0.0.1:${mailboxAddress.port}`;

const rpc = createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-headers", "content-type");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    try {
      const payload = JSON.parse(body);
      const respond = (call) => ({
        jsonrpc: "2.0",
        id: call.id,
        result: call.method === "eth_blockNumber" ? "0x0" : call.method === "eth_getLogs" ? [] : "0x0",
      });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(Array.isArray(payload) ? payload.map(respond) : respond(payload)));
    } catch {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid rpc request" }));
    }
  });
});
await new Promise((resolve) => rpc.listen(0, "127.0.0.1", resolve));
const rpcAddress = rpc.address();
if (!rpcAddress || typeof rpcAddress === "string") throw new Error("rpc did not bind a TCP port");
process.env.VITE_RPC_URL = `http://127.0.0.1:${rpcAddress.port}`;

const configFile = new URL("../vite.config.ts", import.meta.url).pathname;
await build({ configFile, mode: "production", logLevel: "silent" });
const server = await preview({
  configFile,
  logLevel: "silent",
  preview: { host: "localhost", port: 4173, strictPort: false },
});
const url = server.resolvedUrls?.local[0] ?? "http://localhost:4173";

function installMockCredential(mode = "direct") {
  let counter = 0;
  const prfFor = (rawId) => new Uint8Array(32).fill(5 + new Uint8Array(rawId)[0]);

  class MockPublicKeyCredential {
    constructor(rawId, assertion = false) {
      this.rawId = rawId;
      this.id = Array.from(new Uint8Array(rawId), (byte) => byte.toString(16).padStart(2, "0")).join("");
      this.type = "public-key";
      this.response = {};
      this.getClientExtensionResults = () => ({
        prf: assertion || mode === "direct"
          ? { enabled: true, results: { first: prfFor(rawId).buffer } }
          : { enabled: true },
      });
    }
  }

  Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: MockPublicKeyCredential });
  Object.defineProperty(MockPublicKeyCredential, "isUserVerifyingPlatformAuthenticatorAvailable", {
    configurable: true,
    value: async () => true,
  });
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: {
      create: async () => new MockPublicKeyCredential(new Uint8Array(16).fill(++counter).buffer, false),
      get: async (options) => {
        const requested = options?.publicKey?.allowCredentials?.[0]?.id;
        const rawId = requested instanceof ArrayBuffer ? requested : new Uint8Array(16).fill(1).buffer;
        return new MockPublicKeyCredential(rawId, true);
      },
    },
  });
}

async function waitForUnlocked(page) {
  await Promise.race([
    page.locator(".keys-panel").waitFor(),
    page.locator(".inline-error").waitFor().then(async () => {
      throw new Error(`wallet unlock failed: ${await page.locator(".inline-error").textContent()}`);
    }),
  ]);
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  await context.addInitScript(installMockCredential, "direct");
  const page = await context.newPage();
  const simulationWrites = [];
  const trackSimulationRequests = (request) => {
    if (request.method() !== "POST") return;
    const requestUrl = new URL(request.url());
    if (
      requestUrl.pathname.startsWith("/slot/")
      || requestUrl.pathname.startsWith("/box/")
      || requestUrl.pathname.startsWith("/facilitator")
      || requestUrl.port === String(rpcAddress.port)
      || requestUrl.port === String(mailboxAddress.port)
    ) {
      simulationWrites.push(`${request.method()} ${requestUrl.pathname}`);
    }
  };
  page.on("request", trackSimulationRequests);
  const response = await page.goto(url);
  const csp = response?.headers()["content-security-policy"] ?? "";
  if (!csp.includes("'wasm-unsafe-eval'")) throw new Error("preview response missing wasm CSP");
  await page.evaluate(() => WebAssembly.compile(Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0)));

  await page.getByTestId("simulation-toggle").click();
  await page.getByTestId("simulation-panel").waitFor();
  await page.getByTestId("simulation-open").click();
  await page.getByTestId("simulation-fund").click();
  await page.getByTestId("simulation-issue-tab").click();
  await page.getByTestId("simulation-agent-name").fill("Purchasing Agent");
  await page.getByTestId("simulation-card-budget").fill("40");
  await page.getByTestId("simulation-issue").click();
  await page.getByText("Purchasing Agent card issued in simulation.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await page.getByTestId("simulation-action-sim-card-1").click();
  await page.getByRole("button", { name: "Bills", exact: true }).click();
  await page.getByTestId("simulation-bill-row").waitFor();
  await page.getByTestId("simulation-tree-tab").click();
  await page.getByTestId("simulation-revoke-sim-card-1").click();
  await page.getByTestId("simulation-tree-sim-card-1").getByText("revoked", { exact: true }).waitFor();
  if (simulationWrites.length > 0) {
    throw new Error(`Simulation attempted external writes: ${simulationWrites.join(", ")}`);
  }
  page.off("request", trackSimulationRequests);
  await page.screenshot({ path: new URL("wallet-simulation.png", outputDir).pathname, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const simulationOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: new URL("wallet-simulation-mobile.png", outputDir).pathname, fullPage: true });
  if (simulationOverflow) throw new Error("Simulation layout overflows horizontally on mobile");
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.getByTestId("simulation-toggle").click();
  await page.getByTestId("simulation-panel").waitFor({ state: "hidden" });
  await page.getByTestId("create-wallet").waitFor();

  await page.getByTestId("create-wallet").click();
  await page.getByRole("dialog").waitFor();
  const recoveryCode = await page.locator(".recovery-code").textContent();
  if (!recoveryCode) throw new Error("Recovery code was not rendered");
  await page.screenshot({ path: new URL("wallet-recovery.png", outputDir).pathname, fullPage: true });
  await page.getByRole("button", { name: "I stored it" }).click();

  const firstFingerprint = await page.locator(".key-row code").first().textContent();
  await page.getByRole("button", { name: "Lock" }).click();
  await page.locator(".passkey-row").first().click();
  await waitForUnlocked(page);
  if (await page.locator(".key-row code").first().textContent() !== firstFingerprint) throw new Error("Passkey unlock changed the signing key");

  await page.getByRole("button", { name: "Add passkey" }).click();
  await page.getByRole("button", { name: "Lock" }).click();
  if (await page.locator(".passkey-row").count() !== 2) throw new Error("Second passkey was not persisted");
  await page.locator(".passkey-row").nth(1).click();
  await waitForUnlocked(page);
  if (await page.locator(".key-row code").first().textContent() !== firstFingerprint) throw new Error("Second passkey changed the signing key");
  await page.screenshot({ path: new URL("wallet-unlocked.png", outputDir).pathname, fullPage: true });

  const pairingCode = Buffer.from(JSON.stringify({
    v: 1,
    name: "采购 Agent",
    agentPk: {
      x: "5299619240641551281634865583518297030282874472190772894086521144482721001553",
      y: "16950150798460657717958625567821834550301663161624707787222815936182638968203",
    },
    boxPk: "ab".repeat(32),
    pair: "cd".repeat(16),
  })).toString("base64url");
  await page.goto(`${url.replace(/\/$/, "")}/pair#${pairingCode}`);
  await page.locator(".passkey-row").first().click();
  await waitForUnlocked(page);
  try {
    await page.locator(".owner-console").waitFor({ timeout: 15_000 });
  } catch (error) {
    console.error(JSON.stringify({ pageText: await page.locator("body").innerText(), url: page.url() }, null, 2));
    throw error;
  }
  await page.getByRole("button", { name: "Issue card" }).click();
  await page.getByText("Paired", { exact: true }).waitFor();
  if (!(await page.getByTestId("pairing-code").inputValue()).includes(pairingCode)) throw new Error("Pairing code from the URL was not retained");
  await page.screenshot({ path: new URL("wallet-pairing.png", outputDir).pathname, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator(".passkey-row").first().waitFor();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: new URL("wallet-mobile.png", outputDir).pathname, fullPage: true });
  if (horizontalOverflow) {
    const offenders = await page.evaluate(() => [...document.querySelectorAll("*")]
      .map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width }))
      .filter((entry) => entry.right > window.innerWidth + 1)
      .slice(0, 10));
    throw new Error(`Mobile layout overflows horizontally: ${JSON.stringify(offenders)}`);
  }
  await context.close();

  const syncedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await syncedContext.addInitScript(installMockCredential, "direct");
  const syncedPage = await syncedContext.newPage();
  await syncedPage.goto(url);
  await syncedPage.getByRole("button", { name: "Use synced passkey" }).click();
  await waitForUnlocked(syncedPage);
  if (await syncedPage.locator(".key-row code").first().textContent() !== firstFingerprint) throw new Error("Passkey slot restore changed the signing key");
  await syncedContext.close();

  const recoveryContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await recoveryContext.addInitScript(installMockCredential, "direct");
  const recoveryPage = await recoveryContext.newPage();
  await recoveryPage.goto(url);
  await recoveryPage.getByTestId("recovery-input").fill(recoveryCode);
  await recoveryPage.getByTestId("recover-wallet").click();
  await waitForUnlocked(recoveryPage);
  if (await recoveryPage.locator(".key-row code").first().textContent() !== firstFingerprint) throw new Error("Recovery slot changed the signing key");
  await recoveryContext.close();

  const unavailableContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await unavailableContext.addInitScript(() => {
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "credentials", { configurable: true, value: {} });
  });
  const unavailablePage = await unavailableContext.newPage();
  await unavailablePage.goto(url);
  await unavailablePage.getByTestId("prf-unavailable").waitFor();
  await unavailablePage.screenshot({ path: new URL("wallet-prf-unavailable.png", outputDir).pathname, fullPage: true });
  await unavailableContext.close();

  const noPrfContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await noPrfContext.addInitScript(() => {
    class NoPrfPublicKeyCredential {
      rawId = new Uint8Array(16).fill(3).buffer;
      id = "no-prf";
      type = "public-key";
      response = {};
      getClientExtensionResults = () => ({ prf: { enabled: false } });
    }
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: NoPrfPublicKeyCredential });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        create: async () => new NoPrfPublicKeyCredential(),
        get: async () => {
          throw new Error("PRF fallback prompt must not run");
        },
      },
    });
  });
  const noPrfPage = await noPrfContext.newPage();
  await noPrfPage.goto(url);
  await noPrfPage.getByTestId("create-wallet").click();
  await noPrfPage.locator(".inline-error").waitFor();
  if (!(await noPrfPage.locator(".inline-error").textContent())?.includes("does not expose")) {
    throw new Error("PRF-disabled registration did not show the expected message");
  }
  await noPrfPage.screenshot({ path: new URL("wallet-prf-unsupported.png", outputDir).pathname, fullPage: true });
  await noPrfContext.close();

  const enabledOnlyContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await enabledOnlyContext.addInitScript(installMockCredential, "enabled-only");
  const enabledOnlyPage = await enabledOnlyContext.newPage();
  await enabledOnlyPage.goto(url);
  await enabledOnlyPage.getByTestId("create-wallet").click();
  await enabledOnlyPage.getByRole("dialog").waitFor();
  await enabledOnlyContext.close();

  const configFailureContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await configFailureContext.addInitScript(installMockCredential, "direct");
  const configFailurePage = await configFailureContext.newPage();
  await configFailurePage.route("**/deployments/anvil.json", (route) => route.abort());
  await configFailurePage.goto(url);
  await configFailurePage.getByTestId("create-wallet").click();
  await configFailurePage.getByRole("dialog").waitFor();
  await configFailurePage.getByText(/Wallet access is available, but chain controls are unavailable/).waitFor();
  await configFailureContext.close();

  console.log(JSON.stringify({
    ok: true,
    url,
    previewHeaders: { csp },
    mailbox: process.env.VITE_MAILBOX_URL,
    screenshots: ["wallet-simulation.png", "wallet-simulation-mobile.png", "wallet-recovery.png", "wallet-unlocked.png", "wallet-pairing.png", "wallet-mobile.png", "wallet-prf-unavailable.png", "wallet-prf-unsupported.png"],
    checks: ["simulation opens, issues, pays and revokes without real services", "simulation issues zero external write requests", "simulation mobile layout has no horizontal overflow", "production CSP + WebAssembly", "registration returns PRF directly", "enabled-only registration with targeted PRF login", "create", "passkey unlock", "second passkey with distinct PRF", "synced passkey slot", "recovery slot in new browser with pagination", "pairing URL and pairing code", "mobile overflow", "no WebAuthn", "authenticator without PRF", "passkey remains usable when deployment config fails"],
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
  await new Promise((resolve) => rpc.close(resolve));
  await new Promise((resolve) => mailbox.close(resolve));
}
