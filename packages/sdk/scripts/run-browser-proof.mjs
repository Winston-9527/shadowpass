import { chromium } from "playwright";

const url = process.env.SHADOWPASS_BROWSER_URL ?? "http://127.0.0.1:4173/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(globalThis.__SHADOWPASS_RESULT__), null, { timeout: 60_000 });
const result = await page.evaluate(() => globalThis.__SHADOWPASS_RESULT__);
await browser.close();
console.log(JSON.stringify({ url, result, errors }, null, 2));
if (!result?.verified || errors.length > 0) process.exit(1);
