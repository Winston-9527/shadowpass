import { once } from "node:events";
import { encodeAbiParameters, zeroHash } from "viem";
import { x402Facilitator } from "@x402/core/facilitator";
import { wrapFetchWithPayment } from "@x402/fetch";
import {
  assembleShadowpassPayload,
  createShadowpassClient,
  ShadowpassFacilitator,
  SHADOWPASS_NETWORK,
} from "@shadowpass/x402";
import { createFacilitatorApp } from "@shadowpass/facilitator";
import { InMemoryLatencyRecorder } from "@shadowpass/facilitator";
import { createMerchantApp } from "../src/index.ts";

const ASSET = "0x0000000000000000000000000000000000000a55";
const GATE = "0x0000000000000000000000000000000000000aa1";
const PAYOUT = "0x000000000000000000000000000000000000beef";
const EVIL = "0x000000000000000000000000000000000000dead";
const TX = `0x${"11".repeat(32)}`;

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind server");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function proof() {
  return {
    a: ["1", "2"],
    b: [["3", "4"], ["5", "6"]],
    c: ["7", "8"],
  };
}

function payloadBuilder({ tamperedPayTo = false } = {}) {
  return {
    async build({ requirements, resourceUrl, memoChange }) {
      const payload = assembleShadowpassPayload({
        requirements,
        resourceUrl,
        proof: proof(),
        roots: { issued: "11", revoked: "12", root: "13" },
        nowTs: Math.floor(Date.now() / 1000),
        nonce: "42",
        ct: ["21", "22", "23", "24", "25", "26", "27", "28"],
        budget: {
          noteRoot: "31",
          budgetNf: "4242",
          cmChange: "32",
          qSpent: requirements.amount,
        },
        memoChange,
        proofMs: 17.5,
      });
      if (!tamperedPayTo) return payload;
      return {
        ...payload,
        action: {
          ...payload.action,
          params: encodeAbiParameters(
            [{ type: "address" }, { type: "bytes32" }],
            [EVIL, zeroHash],
          ),
        },
      };
    },
  };
}

const metrics = new InMemoryLatencyRecorder();
const seenMemos = [];
const gateClient = {
  async simulateExecute(request) {
    if (request.memoChange !== "0x01") throw new Error("memoChange binding mismatch");
    seenMemos.push(request.memoChange);
  },
  async sendExecute() {
    return TX;
  },
  async waitForConfirmation() {},
};
const coreFacilitator = new x402Facilitator().register(
  SHADOWPASS_NETWORK,
  new ShadowpassFacilitator({
    gateClient,
    signers: ["0x000000000000000000000000000000000000fac1"],
  }),
);
const relayCalls = [];
const relay = {
  async join(commitment) { relayCalls.push(["join", commitment]); return TX; },
  async issue(certHash) { relayCalls.push(["issue", certHash]); return TX; },
  async register(request) { relayCalls.push(["register", request.nf, request.memo]); return TX; },
  async deposit(request) { relayCalls.push(["deposit", request.q, request.memo]); return TX; },
  async transferBudget(request) {
    relayCalls.push(["transfer", request.cm1, request.cm2, request.memo1, request.memo2]);
    return TX;
  },
};
const facilitatorApp = createFacilitatorApp({
  facilitator: coreFacilitator,
  relay,
  metrics,
});
const facilitator = await listen(facilitatorApp);
const merchant = createMerchantApp({
  facilitatorUrl: facilitator.url,
  asset: ASSET,
  gate: GATE,
  payout: PAYOUT,
});
const merchantServer = await listen(merchant.app);

const reportUrl = `${merchantServer.url}/report`;
const unpaid = await fetch(reportUrl);
const paidFetch = wrapFetchWithPayment(
  fetch,
  createShadowpassClient({
    builder: payloadBuilder(),
    memoChange: "0x01",
    spendControls: {
      allowedAssets: [{ network: SHADOWPASS_NETWORK, asset: ASSET, maxAmountPerPayment: "2000000" }],
    },
  }),
);
const paid = await paidFetch(reportUrl);
const paidBody = await paid.json();
const replay = await paidFetch(reportUrl);
const tamperedFetch = wrapFetchWithPayment(
  fetch,
  createShadowpassClient({
    builder: payloadBuilder({ tamperedPayTo: true }),
    memoChange: "0x01",
    spendControls: {
      allowedAssets: [{ network: SHADOWPASS_NETWORK, asset: ASSET, maxAmountPerPayment: "2000000" }],
    },
  }),
);
const tampered = await tamperedFetch(reportUrl);
const healthAfterTamper = await (await fetch(`${merchantServer.url}/health`)).json();

const unavailableMerchant = createMerchantApp({
  facilitatorUrl: "http://127.0.0.1:1",
  asset: ASSET,
  gate: GATE,
  payout: PAYOUT,
});
const unavailableServer = await listen(unavailableMerchant.app);
const unavailableFetch = wrapFetchWithPayment(
  fetch,
  createShadowpassClient({
    builder: payloadBuilder(),
    memoChange: "0x01",
    spendControls: {
      allowedAssets: [{ network: SHADOWPASS_NETWORK, asset: ASSET, maxAmountPerPayment: "2000000" }],
    },
  }),
);
const originalConsoleError = console.error;
console.error = () => {};
let unavailable;
let unavailableBody;
try {
  unavailable = await unavailableFetch(`${unavailableServer.url}/report`);
  unavailableBody = await unavailable.json();
} finally {
  console.error = originalConsoleError;
}

await fetch(`${facilitator.url}/relay/deposit`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ proof: proof(), cm: "1", q: "2", memo: "0x1234" }),
});
await fetch(`${facilitator.url}/relay/transfer-budget`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    proof: proof(),
    noteRoot: "1",
    revokedRoot: "2",
    nullifier: "3",
    cm1: "4",
    cm2: "5",
    memo1: "0x01",
    memo2: "0x02",
  }),
});

const metricsBody = await (await fetch(`${facilitator.url}/metrics`)).json();
const result = {
  unpaidStatus: unpaid.status,
  paidStatus: paid.status,
  paidBody,
  replayStatus: replay.status,
  tamperedStatus: tampered.status,
  merchantHandledAfterTamper: healthAfterTamper.handled,
  unavailableStatus: unavailable.status,
  unavailableError: unavailableBody.error,
  relayCalls,
  writtenMemos: seenMemos,
  timings: metricsBody.records,
};
console.log(JSON.stringify(result, null, 2));

for (const { server } of [facilitator, merchantServer, unavailableServer]) server.close();

if (unpaid.status !== 402) throw new Error(`unpaid status ${unpaid.status}`);
if (paid.status !== 200) throw new Error(`paid status ${paid.status}`);
if (replay.status !== 402) throw new Error(`replay status ${replay.status}`);
if (tampered.status !== 402) throw new Error(`tampered status ${tampered.status}`);
if (healthAfterTamper.handled !== 1) throw new Error(`handler ran after tamper: ${healthAfterTamper.handled}`);
if (unavailable.status !== 503 || unavailableBody.error !== "facilitator_unavailable") {
  throw new Error(`unavailable facilitator response was not explicit: ${unavailable.status}`);
}
