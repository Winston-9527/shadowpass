import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveKeys } from "../src/keys.js";
import { MailboxClient } from "../src/mailbox.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MailboxClient", () => {
  it("seals messages and opens them on poll", async () => {
    const owner = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
    const store: Array<{ id: number; ct: string; ts: number }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { ct: string };
        store.push({ id: store.length + 1, ct: body.ct, ts: 1 });
        return new Response(JSON.stringify({ id: store.length }), { status: 200 });
      }
      return new Response(JSON.stringify(store), { status: 200 });
    }));
    const client = new MailboxClient("https://mailbox.example");
    const id = await client.send(owner.box.publicKey, { type: "receipt", amount: "1" }, "agent");
    expect(id).toBe(1);
    const messages = await client.poll(owner.box, 0);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.value).toEqual({ type: "receipt", amount: "1" });
  });
});
