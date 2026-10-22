import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { createFacilitatorApp } from "../src/app.js";
import { InMemoryLatencyRecorder } from "../src/metrics.js";

const calls: unknown[] = [];
type Hex = `0x${string}`;
const relay = {
  async join(commitment: string): Promise<Hex> { calls.push(["join", commitment]); return "0x01"; },
  async issue(certHash: string): Promise<Hex> { calls.push(["issue", certHash]); return "0x02"; },
  async register(request: unknown): Promise<Hex> { calls.push(["register", request]); return "0x03"; },
  async deposit(request: unknown): Promise<Hex> { calls.push(["deposit", request]); return "0x04"; },
  async transferBudget(request: unknown): Promise<Hex> { calls.push(["transfer", request]); return "0x05"; },
};

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  while (servers.length) servers.pop()?.close();
  calls.length = 0;
});

describe("facilitator HTTP service", () => {
  it("exposes supported and relay endpoints with memo passthrough", async () => {
    const app = createFacilitatorApp({
      facilitator: {
        getSupported: () => ({ kinds: [{ x402Version: 2, scheme: "shadowpass", network: "eip155:84532" }], extensions: [], signers: {} }),
        verify: async () => ({ isValid: true }),
        settle: async () => ({ success: true, transaction: "0x05", network: "eip155:84532" }),
      },
      relay,
      metrics: new InMemoryLatencyRecorder(),
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("listen failed");
    const base = `http://127.0.0.1:${address.port}`;

    await expect((await fetch(`${base}/supported`)).json()).resolves.toMatchObject({
      kinds: [{ scheme: "shadowpass" }],
    });
    const deposit = await fetch(`${base}/relay/deposit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
        cm: "1", q: "2", memo: "0x1234",
      }),
    });
    expect(deposit.status).toBe(200);
    expect(calls[0]).toEqual(["deposit", expect.objectContaining({ memo: "0x1234" })]);
    const transfer = await fetch(`${base}/relay/transfer-budget`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
        noteRoot: "1", revokedRoot: "2", nullifier: "3", cm1: "4", cm2: "5",
        memo1: "0x01", memo2: "0x02",
      }),
    });
    expect(transfer.status).toBe(200);
    expect(calls[1]).toEqual(["transfer", expect.objectContaining({ memo1: "0x01", memo2: "0x02" })]);
  });
});
