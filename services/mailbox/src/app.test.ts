import { afterEach, describe, expect, it } from "vitest";
import sodium from "libsodium-wrappers";
import { createMailboxApp, type MailboxApp, type MailboxAppOptions } from "./app.js";
import { SqliteMailboxStore } from "./sqlite-store.js";
import type { MailboxStore } from "./types.js";

const stores: MailboxStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close?.();
});

async function sealed(message: string, recipient: Uint8Array): Promise<string> {
  await sodium.ready;
  return sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(message), recipient), sodium.base64_variants.ORIGINAL);
}

function makeApp(overrides: Partial<MailboxAppOptions> = {}): {
  app: MailboxApp;
  store: SqliteMailboxStore;
  logs: Array<Record<string, unknown>>;
} {
  const store = new SqliteMailboxStore();
  stores.push(store);
  const logs: Array<Record<string, unknown>> = [];
  const app = createMailboxApp({
    store,
    maxMessageBytes: 1024,
    maxBatchSize: 50,
    postLimit: 30,
    getLimit: 120,
    rateWindowMs: 60_000,
    logger: { info: (entry) => logs.push(entry) },
    ...overrides,
  });
  return { app, store, logs };
}

async function post(app: MailboxApp, recipient: string, ct: string, ip = "127.0.0.1"): Promise<Response> {
  return await app(
    new Request(`http://mail.local/box/${recipient}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ct }),
    }),
    { ip },
  );
}

async function get(app: MailboxApp, recipient: string, after = 0, ip = "127.0.0.1"): Promise<Response> {
  return await app(new Request(`http://mail.local/box/${recipient}?after=${after}`), { ip });
}

function spw1Envelope(mode = 0): Uint8Array {
  const bytes = new Uint8Array(81);
  bytes.set(new TextEncoder().encode("SPW1"));
  bytes[4] = mode;
  return bytes;
}

async function postSlot(app: MailboxApp, slot: string, ct: string, ip = "127.0.0.1"): Promise<Response> {
  return await app(
    new Request(`http://mail.local/slot/${slot}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ct }),
    }),
    { ip },
  );
}

async function getSlot(app: MailboxApp, slot: string, after = 0, ip = "127.0.0.1"): Promise<Response> {
  return await app(new Request(`http://mail.local/slot/${slot}?after=${after}`), { ip });
}

describe("mailbox app", () => {
  it("stores only ciphertext and supports incremental reads", async () => {
    await sodium.ready;
    const pair = sodium.crypto_box_keypair();
    const recipient = sodium.to_hex(pair.publicKey);
    const secret = "credential secret";
    const ct = await sealed(secret, pair.publicKey);
    const { app, logs } = makeApp();

    const first = await post(app, recipient.toUpperCase(), ct);
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toEqual({ id: 1 });
    const second = await post(app, recipient, ct);
    await expect(second.json()).resolves.toEqual({ id: 2 });

    const all = await get(app, recipient);
    const body = (await all.json()) as Array<{ id: number; ct: string; ts: number }>;
    expect(body.map((item) => item.id)).toEqual([1, 2]);
    expect(JSON.stringify(body)).not.toContain(secret);
    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(body[0]?.ct ?? "", sodium.base64_variants.ORIGINAL),
      pair.publicKey,
      pair.privateKey,
    );
    expect(sodium.to_string(opened)).toBe(secret);

    const after = await get(app, recipient, 1);
    const afterBody = (await after.json()) as Array<{ id: number }>;
    expect(afterBody.map((item) => item.id)).toEqual([2]);
    expect(JSON.stringify(logs)).not.toContain(secret);
    expect(JSON.stringify(logs)).not.toContain(ct);
    expect(JSON.stringify(logs)).not.toContain(recipient);
  });

  it("enforces the post rate limit", async () => {
    await sodium.ready;
    const pair = sodium.crypto_box_keypair();
    const recipient = sodium.to_hex(pair.publicKey);
    const ct = await sealed("rate limited", pair.publicKey);
    const { app } = makeApp({ postLimit: 1 });
    expect((await post(app, recipient, ct)).status).toBe(201);
    const limited = await post(app, recipient, ct);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("rejects malformed recipients, bodies, oversized ciphertext and wrong methods", async () => {
    const { app } = makeApp({ maxMessageBytes: 64 });
    expect((await post(app, "not-a-key", "AAAA")).status).toBe(400);
    expect((await post(app, "a".repeat(64), "not base64")).status).toBe(400);
    const oversized = Buffer.alloc(65).toString("base64");
    expect((await post(app, "a".repeat(64), oversized)).status).toBe(413);
    expect((await get(app, "a".repeat(64), -1)).status).toBe(400);
    const wrongMethod = await app(
      new Request(`http://mail.local/box/${"a".repeat(64)}`, { method: "DELETE" }),
      { ip: "127.0.0.1" },
    );
    expect(wrongMethod.status).toBe(405);
  });

  it("returns 400 for malformed percent escapes", async () => {
    const { app } = makeApp();
    const response = await app(new Request("http://mail.local/box/%E0%A4%A"), { ip: "127.0.0.1" });
    expect(response.status).toBe(400);
  });

  it("does not log request bodies", async () => {
    const { app, logs } = makeApp();
    const response = await app(
      new Request(`http://mail.local/box/${"a".repeat(64)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ct: "plaintext-that-must-not-be-logged" }),
      }),
      { ip: "127.0.0.1" },
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(logs)).not.toContain("plaintext-that-must-not-be-logged");
  });

  it("stores up to 16 SPW1 envelopes per slot and never evicts", async () => {
    const { app, logs } = makeApp();
    const slot = "cd".repeat(32);
    const ct = Buffer.from(spw1Envelope()).toString("base64");
    for (let index = 0; index < 16; index += 1) {
      expect((await postSlot(app, slot, ct)).status).toBe(201);
    }
    const full = await postSlot(app, slot, ct);
    expect(full.status).toBe(409);
    await expect(full.json()).resolves.toEqual({ error: "slot is full" });
    const page = await getSlot(app, slot, 15);
    const body = (await page.json()) as Array<{ id: number; ct: string }>;
    expect(body).toEqual([{ id: 16, ct, ts: expect.any(Number) }]);
    expect(JSON.stringify(logs)).not.toContain(slot);
  });

  it("rejects malformed SPW1 slot envelopes", async () => {
    const { app } = makeApp();
    const slot = "ef".repeat(32);
    const wrongLength = Buffer.alloc(80).toString("base64");
    expect((await postSlot(app, slot, wrongLength)).status).toBe(400);
    const wrongMagic = spw1Envelope();
    wrongMagic.set(new TextEncoder().encode("NOPE"));
    expect((await postSlot(app, slot, Buffer.from(wrongMagic).toString("base64"))).status).toBe(400);
    expect(
      (await postSlot(app, slot, Buffer.from(spw1Envelope(2)).toString("base64"))).status,
    ).toBe(400);
  });
});
