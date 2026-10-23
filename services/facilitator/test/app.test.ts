import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { createFacilitatorApp } from "../src/app.js";
import { InMemoryLatencyRecorder } from "../src/metrics.js";
import { RelayRevertError } from "../src/viem-client.js";

const calls: unknown[] = [];
const relay = {
  async relay(action: string, args: unknown) {
    calls.push([action, args]);
    return { transaction: "0x01" as `0x${string}`, blockNumber: "1", logs: [] };
  },
};
const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  while (servers.length) servers.pop()?.close();
  calls.length = 0;
});

describe("facilitator HTTP service", () => {
  it("exposes §14 relay actions and passes memo args", async () => {
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
    const faucet = await fetch(`${base}/relay/faucetDeposit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        args: {
          proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
          cm: "1", q: "2", memo: "0x1234",
        },
      }),
    });
    expect(faucet.status).toBe(200);
    expect(calls[0]).toEqual(["faucetDeposit", expect.objectContaining({ memo: "0x1234" })]);
    const transfer = await fetch(`${base}/relay/transferBudget`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        args: {
          proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
          noteRoot: "1", revokedRoot: "2", nullifier: "3", cm1: "4", cm2: "5",
          memo1: "0x01", memo2: "0x02",
        },
      }),
    });
    expect(transfer.status).toBe(200);
    expect(calls[1]).toEqual(["transferBudget", expect.objectContaining({ memo1: "0x01", memo2: "0x02" })]);
  });

  it("rate limits relay calls by trusted IP", async () => {
    let now = 1_000_000;
    const app = createFacilitatorApp({
      facilitator: {
        getSupported: () => ({ kinds: [], extensions: [], signers: {} }),
        verify: async () => ({ isValid: true }),
        settle: async () => ({ success: true, transaction: "0x05", network: "eip155:84532" }),
      },
      relay,
      metrics: new InMemoryLatencyRecorder(),
      relayRateLimit: { perMinute: 1, faucetPerDay: 1, trustProxyHeaders: true },
      now: () => now,
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("listen failed");
    const base = `http://127.0.0.1:${address.port}`;
    const body = JSON.stringify({ args: { commitment: "1" } });
    const headers = { "content-type": "application/json", "x-real-ip": "203.0.113.7" };

    expect((await fetch(`${base}/relay/join`, { method: "POST", headers, body })).status).toBe(200);
    expect((await fetch(`${base}/relay/join`, { method: "POST", headers, body })).status).toBe(429);
    now += 60_001;
    expect((await fetch(`${base}/relay/join`, { method: "POST", headers, body })).status).toBe(200);
  });

  it("limits faucetDeposit to once per IP per day", async () => {
    let now = 1_000_000;
    const app = createFacilitatorApp({
      facilitator: {
        getSupported: () => ({ kinds: [], extensions: [], signers: {} }),
        verify: async () => ({ isValid: true }),
        settle: async () => ({ success: true, transaction: "0x05", network: "eip155:84532" }),
      },
      relay,
      metrics: new InMemoryLatencyRecorder(),
      relayRateLimit: { perMinute: 10, faucetPerDay: 1, trustProxyHeaders: true },
      now: () => now,
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("listen failed");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { "content-type": "application/json", "x-real-ip": "203.0.113.8" };
    const body = JSON.stringify({
      args: {
        proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
        cm: "1", q: "2", memo: "0x1234",
      },
    });
    expect((await fetch(`${base}/relay/faucetDeposit`, { method: "POST", headers, body })).status).toBe(200);
    now += 60_001;
    expect((await fetch(`${base}/relay/faucetDeposit`, { method: "POST", headers, body })).status).toBe(429);
  });

  it("returns only sanitized relay failure codes", async () => {
    const app = createFacilitatorApp({
      facilitator: {
        getSupported: () => ({ kinds: [], extensions: [], signers: {} }),
        verify: async () => ({ isValid: true }),
        settle: async () => ({ success: true, transaction: "0x05", network: "eip155:84532" }),
      },
      relay: {
        async relay() {
          throw new RelayRevertError("FaucetLimit");
        },
      },
      metrics: new InMemoryLatencyRecorder(),
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("listen failed");
    const response = await fetch(`http://127.0.0.1:${address.port}/relay/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: { commitment: "1" } }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "simulation_failed:FaucetLimit" });
  });
});
