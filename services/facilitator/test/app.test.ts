import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { createFacilitatorApp } from "../src/app.js";
import { InMemoryLatencyRecorder } from "../src/metrics.js";
import { RelayInFlightError, RelayRevertError } from "../src/viem-client.js";

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
    const execute = await fetch(`${base}/relay/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        args: {
          proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
          roots: { issued: "1", revoked: "2", root: "3" },
          nowTs: "4",
          action: {
            target: "0x0000000000000000000000000000000000000001",
            method: "0x12345678",
            amount: "5",
            nonce: "6",
            params: "0x1234",
          },
          ct: ["7", "8"],
          budget: { noteRoot: "9", budgetNf: "10", cmChange: "11", qSpent: "5" },
          memoChange: "0xabcd",
        },
      }),
    });
    expect(execute.status).toBe(200);
    expect(calls[2]).toEqual(["execute", expect.objectContaining({
      roots: expect.objectContaining({ issued: "1" }),
      action: expect.objectContaining({ method: "0x12345678" }),
    })]);
    const withdraw = await fetch(`${base}/relay/treasuryWithdraw`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: { positionId: "12" } }),
    });
    expect(withdraw.status).toBe(200);
    expect(calls[3]).toEqual(["treasuryWithdraw", { positionId: "12" }]);
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

  it("does not consume the daily faucet quota when simulation fails", async () => {
    let attempts = 0;
    const retryingRelay = {
      async relay(action: string, args: unknown) {
        attempts += 1;
        if (attempts === 1) throw new RelayRevertError("InvalidProof");
        return relay.relay(action, args);
      },
    };
    const app = createFacilitatorApp({
      facilitator: {
        getSupported: () => ({ kinds: [], extensions: [], signers: {} }),
        verify: async () => ({ isValid: true }),
        settle: async () => ({ success: true, transaction: "0x05", network: "eip155:84532" }),
      },
      relay: retryingRelay,
      metrics: new InMemoryLatencyRecorder(),
      relayRateLimit: { perMinute: 10, faucetPerDay: 1, trustProxyHeaders: true },
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("listen failed");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { "content-type": "application/json", "x-real-ip": "203.0.113.10" };
    const body = JSON.stringify({
      args: {
        proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
        cm: "1", q: "2", memo: "0x1234",
      },
    });

    expect((await fetch(`${base}/relay/faucetDeposit`, { method: "POST", headers, body })).status).toBe(400);
    expect((await fetch(`${base}/relay/faucetDeposit`, { method: "POST", headers, body })).status).toBe(200);
    expect((await fetch(`${base}/relay/faucetDeposit`, { method: "POST", headers, body })).status).toBe(429);
  });

  it("allows wallet origins and answers CORS preflight", async () => {
    const app = createFacilitatorApp({
      facilitator: {
        getSupported: () => ({ kinds: [], extensions: [], signers: {} }),
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

    for (const origin of ["https://shadowpass-wallet.vercel.app", "http://localhost:5173"]) {
      const response = await fetch(`${base}/health`, { headers: { origin } });
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    }

    const preflight = await fetch(`${base}/relay/faucetDeposit`, {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");

    const denied = await fetch(`${base}/health`, { headers: { origin: "https://evil.example" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps metrics private and rejects malformed JSON with 400", async () => {
    const app = createFacilitatorApp({
      facilitator: {
        getSupported: () => ({ kinds: [], extensions: [], signers: {} }),
        verify: async () => ({ isValid: true }),
        settle: async () => ({ success: true, transaction: "0x05", network: "eip155:84532" }),
      },
      relay,
      metrics: new InMemoryLatencyRecorder(),
      metricsToken: "metrics-secret",
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("listen failed");
    const base = `http://127.0.0.1:${address.port}`;

    expect((await fetch(`${base}/metrics`)).status).toBe(404);
    expect((await fetch(`${base}/metrics`, {
      headers: { authorization: "Bearer wrong" },
    })).status).toBe(404);
    expect((await fetch(`${base}/metrics`, {
      headers: { authorization: "Bearer metrics-secret" },
    })).status).toBe(200);

    const malformed = await fetch(`${base}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "invalid_request" });
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

  it("returns the shared in-flight error code", async () => {
    const app = createFacilitatorApp({
      facilitator: {
        getSupported: () => ({ kinds: [], extensions: [], signers: {} }),
        verify: async () => ({ isValid: true }),
        settle: async () => ({ success: true, transaction: "0x05", network: "eip155:84532" }),
      },
      relay: {
        async relay() {
          throw new RelayInFlightError("budget:1");
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
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "operation_in_progress" });
  });

  it("rate limits verify and settle by client IP", async () => {
    const app = createFacilitatorApp({
      facilitator: {
        getSupported: () => ({ kinds: [], extensions: [], signers: {} }),
        verify: async () => ({ isValid: true }),
        settle: async () => ({ success: true, transaction: "0x05", network: "eip155:84532" }),
      },
      relay,
      metrics: new InMemoryLatencyRecorder(),
      relayRateLimit: { trustProxyHeaders: true },
      paymentRateLimit: { perMinute: 1 },
    });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("listen failed");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { "content-type": "application/json", "x-real-ip": "203.0.113.9" };
    const body = JSON.stringify({
      x402Version: 2,
      paymentPayload: { payload: { budget: { budgetNf: "1" } } },
      paymentRequirements: { network: "eip155:84532" },
    });
    expect((await fetch(`${base}/verify`, { method: "POST", headers, body })).status).toBe(200);
    expect((await fetch(`${base}/settle`, { method: "POST", headers, body })).status).toBe(429);
  });
});
