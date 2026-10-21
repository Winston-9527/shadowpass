import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

const outputDir = new URL("../e2e-output/", import.meta.url);
await mkdir(outputDir, { recursive: true });

const server = await createServer({
  configFile: new URL("../vite.config.ts", import.meta.url).pathname,
  logLevel: "silent",
  server: { host: "localhost", port: 0 },
});
await server.listen();
const url = server.resolvedUrls?.local[0] ?? "http://localhost:5173";

const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  await context.addInitScript(() => {
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
        get: async () => new MockPublicKeyCredential(new Uint8Array(16).fill(1).buffer),
      },
    });
  });

  const page = await context.newPage();
  await page.goto(url);
  await page.getByTestId("create-wallet").click();
  await page.getByRole("dialog").waitFor();
  const recoveryCode = await page.locator(".recovery-code").textContent();
  if (!recoveryCode) throw new Error("Recovery code was not rendered");
  await page.screenshot({ path: new URL("wallet-recovery.png", outputDir).pathname, fullPage: true });
  await page.getByRole("button", { name: "I stored it" }).click();

  const firstFingerprint = await page.locator(".key-row code").first().textContent();
  await page.getByRole("button", { name: "Lock" }).click();
  await page.locator(".passkey-row").first().click();
  await page.locator(".keys-panel").waitFor();
  if (await page.locator(".key-row code").first().textContent() !== firstFingerprint) throw new Error("Passkey unlock changed the signing key");

  await page.getByRole("button", { name: "Add passkey" }).click();
  await page.getByRole("button", { name: "Lock" }).click();
  if (await page.locator(".passkey-row").count() !== 2) throw new Error("Second passkey was not persisted");

  await page.getByTestId("recovery-input").fill(recoveryCode);
  await page.getByTestId("recover-wallet").click();
  await page.locator(".keys-panel").waitFor();
  if (await page.locator(".key-row code").first().textContent() !== firstFingerprint) throw new Error("Recovery code changed the signing key");
  await page.screenshot({ path: new URL("wallet-unlocked.png", outputDir).pathname, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator(".passkey-row").first().waitFor();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (horizontalOverflow) throw new Error("Mobile layout overflows horizontally");
  await page.screenshot({ path: new URL("wallet-mobile.png", outputDir).pathname, fullPage: true });
  await context.close();

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

  console.log(JSON.stringify({
    ok: true,
    url,
    screenshots: ["wallet-recovery.png", "wallet-unlocked.png", "wallet-mobile.png", "wallet-prf-unavailable.png"],
    checks: ["create", "passkey unlock", "second passkey", "recovery code", "mobile overflow", "PRF unavailable state"],
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
