import { createServer as createHttpServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

const outputDir = new URL("../e2e-output/", import.meta.url);
await mkdir(outputDir, { recursive: true });

const slots = new Map();
const mailbox = createHttpServer((request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-headers", "content-type");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  const match = url.pathname.match(/^\/box\/([0-9a-f]{64})$/);
  if (!match) {
    response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }));
    return;
  }
  const slot = match[1];
  const entries = slots.get(slot) ?? [];
  if (request.method === "POST") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length !== 1 || typeof parsed.ct !== "string") {
          response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid" }));
          return;
        }
        entries.push({ id: entries.length + 1, ct: parsed.ct, ts: Date.now() });
        slots.set(slot, entries);
        response.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id: entries.length }));
      } catch {
        response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid json" }));
      }
    });
    return;
  }
  if (request.method === "GET") {
    const after = Number(url.searchParams.get("after") ?? "0");
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(entries.filter((entry) => entry.id > after)));
    return;
  }
  response.writeHead(405).end();
});
await new Promise((resolve) => mailbox.listen(0, "127.0.0.1", resolve));
const mailboxAddress = mailbox.address();
if (!mailboxAddress || typeof mailboxAddress === "string") throw new Error("mailbox did not bind a TCP port");
process.env.VITE_MAILBOX_URL = `http://127.0.0.1:${mailboxAddress.port}`;

const server = await createServer({
  configFile: new URL("../vite.config.ts", import.meta.url).pathname,
  logLevel: "silent",
  server: { host: "localhost", port: 5173, strictPort: false },
});
await server.listen();
const url = server.resolvedUrls?.local[0] ?? "http://localhost:5173";

function installMockCredential() {
  let counter = 0;
  class MockPublicKeyCredential {
    constructor(rawId) {
      this.rawId = rawId;
      this.id = Array.from(new Uint8Array(rawId), (byte) => byte.toString(16).padStart(2, "0")).join("");
      this.type = "public-key";
      this.response = {
        getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: new Uint8Array(32).fill(7).buffer } } }),
      };
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
      create: async () => new MockPublicKeyCredential(new Uint8Array(16).fill(++counter).buffer),
      get: async (options) => {
        const requested = options?.publicKey?.allowCredentials?.[0]?.id;
        const rawId = requested instanceof ArrayBuffer ? requested : new Uint8Array(16).fill(1).buffer;
        const credential = new MockPublicKeyCredential(rawId);
        credential.response = {
          getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(32).fill(7).buffer } } }),
        };
        return credential;
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
  await context.addInitScript(installMockCredential);
  const page = await context.newPage();
  await page.goto(url);
  await page.getByTestId("create-wallet").click();
  await Promise.race([
    page.getByRole("dialog").waitFor(),
    page.locator(".inline-error").waitFor().then(async () => {
      throw new Error(`wallet creation failed: ${await page.locator(".inline-error").textContent()}`);
    }),
  ]);
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator(".passkey-row").first().waitFor();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (horizontalOverflow) throw new Error("Mobile layout overflows horizontally");
  await page.screenshot({ path: new URL("wallet-mobile.png", outputDir).pathname, fullPage: true });
  await context.close();

  const syncedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await syncedContext.addInitScript(installMockCredential);
  const syncedPage = await syncedContext.newPage();
  await syncedPage.goto(url);
  await syncedPage.getByRole("button", { name: "Use synced passkey" }).click();
  await waitForUnlocked(syncedPage);
  if (await syncedPage.locator(".key-row code").first().textContent() !== firstFingerprint) throw new Error("Passkey slot restore changed the signing key");
  await syncedContext.close();

  const recoveryContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await recoveryContext.addInitScript(installMockCredential);
  const recoveryPage = await recoveryContext.newPage();
  await recoveryPage.goto(url);
  await recoveryPage.getByTestId("recovery-input").fill(recoveryCode);
  await recoveryPage.getByTestId("recover-wallet").click();
  await waitForUnlocked(recoveryPage);
  if (await recoveryPage.locator(".key-row code").first().textContent() !== firstFingerprint) throw new Error("Recovery slot changed the signing key");
  await recoveryContext.close();

  const unavailableContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await unavailableContext.addInitScript(() => {
    class UnavailablePublicKeyCredential {}
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: UnavailablePublicKeyCredential });
    Object.defineProperty(UnavailablePublicKeyCredential, "isUserVerifyingPlatformAuthenticatorAvailable", {
      configurable: true,
      value: async () => false,
    });
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
      response = {
        getClientExtensionResults: () => ({ prf: { enabled: false } }),
      };
    }
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: NoPrfPublicKeyCredential });
    Object.defineProperty(NoPrfPublicKeyCredential, "isUserVerifyingPlatformAuthenticatorAvailable", {
      configurable: true,
      value: async () => true,
    });
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

  console.log(JSON.stringify({
    ok: true,
    url,
    mailbox: process.env.VITE_MAILBOX_URL,
    screenshots: ["wallet-recovery.png", "wallet-unlocked.png", "wallet-mobile.png", "wallet-prf-unavailable.png", "wallet-prf-unsupported.png"],
    checks: ["create", "passkey unlock", "second passkey unlock", "synced passkey slot", "recovery slot in new browser", "mobile overflow", "no platform authenticator", "authenticator without PRF"],
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
  await new Promise((resolve) => mailbox.close(resolve));
}
