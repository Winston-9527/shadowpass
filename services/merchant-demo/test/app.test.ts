import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import type { Deployment } from "@shadowpass/sdk";
import { createMerchantApp } from "../src/app.js";

const deployment: Deployment = {
  chainId: 84532,
  gate: "0x0000000000000000000000000000000000000aa1",
  registry: "0x0000000000000000000000000000000000000b01",
  revocations: "0x0000000000000000000000000000000000000b02",
  group: "0x0000000000000000000000000000000000000b03",
  payout: "0x000000000000000000000000000000000000beef",
  treasury: "0x0000000000000000000000000000000000000b04",
  vault: "0x0000000000000000000000000000000000000b05",
  token: "0x0000000000000000000000000000000000000a55",
  verifiers: {
    d1: "0x0000000000000000000000000000000000000c01",
    d2: "0x0000000000000000000000000000000000000c02",
    d3: "0x0000000000000000000000000000000000000c03",
    reg: "0x0000000000000000000000000000000000000c04",
    revoke: "0x0000000000000000000000000000000000000c05",
    transfer: "0x0000000000000000000000000000000000000c06",
    mint: "0x0000000000000000000000000000000000000c07",
  },
  startBlock: 0,
  facilitator: "",
  mailbox: "",
};

const servers: Array<{ close: () => void }> = [];
afterEach(() => {
  while (servers.length) servers.pop()?.close();
});

describe("merchant demo", () => {
  it("keeps health available and returns an explicit 503 when the facilitator is down", async () => {
    const originalError = console.error;
    console.error = () => {};
    const merchant = createMerchantApp({
      facilitatorUrl: "http://127.0.0.1:1",
      deployment,
      asset: deployment.token,
      merchantPayTo: "0x000000000000000000000000000000000000cafe",
    });
    await merchant.ready;
    console.error = originalError;
    const server = merchant.app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("listen failed");
    const base = `http://127.0.0.1:${address.port}`;
    await expect((await fetch(`${base}/health`)).json()).resolves.toMatchObject({ ok: true });
    const report = await fetch(`${base}/report`);
    expect(report.status).toBe(503);
    await expect(report.json()).resolves.toEqual({ error: "facilitator_unavailable" });
  });
});
