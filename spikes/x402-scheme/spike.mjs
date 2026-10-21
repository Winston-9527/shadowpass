// Spike: can a custom "shadowpass" scheme run through the stock x402 v2 SDK (express middleware + HTTP facilitator + fetch client)
// with settle-before-handler ("upfront")? Proof and chain calls are faked; the binding check is real.
import express from "express";
import crypto from "crypto";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";

const NETWORK = "eip155:84532";                                   // Base Sepolia
const ASSET = "0x0000000000000000000000000000000000000a55";       // placeholder test token
const PAY_TO = "0x000000000000000000000000000000000000beef";
const log = (...a) => console.log("  ", ...a);

// Binding the proof will carry in ctx_hash: payTo, amount, asset, network and the resource.
const bindingOf = (req, resource) =>
  crypto.createHash("sha256").update(JSON.stringify([req.network, req.asset, req.amount, req.payTo, resource ?? ""])).digest("hex");

// ---- scheme: server side (merchant) ----
class ShadowpassServer {
  scheme = "shadowpass";
  defaultAssetTransferMethod = "default";
  paymentFlows = { default: { supported: ["upfront"], default: "upfront" } };
  async parsePrice(price) {
    const usd = typeof price === "string" ? Number(price.replace("$", "")) : Number(price);
    return { amount: String(Math.round(usd * 1e6)), asset: ASSET, extra: {} };
  }
  async enhancePaymentRequirements(r) { return { ...r, extra: { ...r.extra, gate: "0xGate", payout: "0xShadowPayout" } }; }
}

// ---- scheme: facilitator side ----
const settled = new Set();
class ShadowpassFacilitator {
  scheme = "shadowpass";
  caipFamily = "eip155:*";
  getExtra() { return undefined; }
  getSigners() { return ["0x00000000000000000000000000000000000fac17"]; }
  async verify(payload, req) {
    const p = payload.payload;
    if (p.binding !== bindingOf(req, payload.resource?.url)) return { isValid: false, invalidReason: "binding_mismatch" };
    if (settled.has(p.nullifier)) return { isValid: false, invalidReason: "nullifier_spent" };
    log("facilitator /verify ok (would eth_call Gate.execute)");
    return { isValid: true, payer: "shadowpass-pool" };
  }
  async settle(payload, req) {
    const v = await this.verify(payload, req);
    if (!v.isValid) return { success: false, errorReason: v.invalidReason, transaction: "", network: req.network };
    settled.add(payload.payload.nullifier);
    const tx = "0x" + crypto.randomBytes(32).toString("hex");
    log("facilitator /settle ok (would send Gate.execute) tx", tx.slice(0, 12) + "…");
    return { success: true, transaction: tx, network: req.network, payer: "shadowpass-pool", amount: req.amount };
  }
}

// ---- scheme: client side (MCP server inside the agent) ----
class ShadowpassClient {
  scheme = "shadowpass";
  async createPaymentPayload(x402Version, req, ctx) {
    log("client builds proof for", req.amount, "to", req.payTo.slice(0, 10) + "…", ctx ? "" : "");
    return { x402Version, payload: { proof: "<groth16>", nullifier: crypto.randomBytes(16).toString("hex"), binding: bindingOf(req, this.resource) } };
  }
}

// ---- facilitator HTTP service ----
const fac = new x402Facilitator().register(NETWORK, new ShadowpassFacilitator());
const facApp = express().use(express.json());
facApp.get("/supported", (_q, r) => r.json(fac.getSupported()));
facApp.post("/verify", async (q, r) => r.json(await fac.verify(q.body.paymentPayload, q.body.paymentRequirements)));
facApp.post("/settle", async (q, r) => r.json(await fac.settle(q.body.paymentPayload, q.body.paymentRequirements)));
const facSrv = facApp.listen(4022);

// ---- merchant: stock middleware, only the scheme is ours ----
const rs = new x402ResourceServer(new HTTPFacilitatorClient({ url: "http://localhost:4022" })).register(NETWORK, new ShadowpassServer());
const shop = express();
shop.use(paymentMiddleware({ "GET /report": { accepts: [{ scheme: "shadowpass", price: "$2.00", network: NETWORK, payTo: PAY_TO }], description: "Market report" } }, rs));
let handled = 0;
shop.get("/report", (_q, r) => { handled++; log("merchant handler runs (after settle)"); r.json({ report: "EV market Q3", bytes: 1234 }); });
const shopSrv = shop.listen(4021);

await new Promise((r) => setTimeout(r, 300));
const sc = new ShadowpassClient(); sc.resource = "http://localhost:4021/report";
const pay = wrapFetchWithPayment(fetch, x402Client.fromConfig({ schemes: [{ network: NETWORK, client: sc }], spendControls: false }));

console.log("1. unpaid request");
const raw = await fetch("http://localhost:4021/report");
log("status", raw.status, raw.headers.get("payment-required") ? "(PAYMENT-REQUIRED header present)" : "");

console.log("2. paid request through x402 fetch wrapper");
const res = await pay("http://localhost:4021/report");
log("status", res.status, JSON.stringify(await res.json()), "| payment-response header:", Boolean(res.headers.get("payment-response")));

console.log("3. tampered binding is rejected before the handler");
const bad = new ShadowpassClient(); bad.resource = "http://elsewhere/";
const payBad = wrapFetchWithPayment(fetch, x402Client.fromConfig({ schemes: [{ network: NETWORK, client: bad }], spendControls: false }));
const r3 = await payBad("http://localhost:4021/report").catch((e) => ({ status: "threw: " + e.message }));
log("status", r3.status, "| handler runs so far:", handled);

facSrv.close(); shopSrv.close();
