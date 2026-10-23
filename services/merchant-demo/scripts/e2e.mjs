import { once } from "node:events";
import { encodeAbiParameters, zeroHash } from "viem";
import { wrapFetchWithPayment } from "@x402/fetch";
import {
  ShadowpassFacilitatorCore,
  assembleShadowpassPayload,
  createShadowpassClient,
} from "@shadowpass/x402";
import { createFacilitatorApp, InMemoryLatencyRecorder } from "@shadowpass/facilitator";
import { createMerchantApp } from "../src/index.ts";

const NETWORK = "eip155:84532";
const ASSET = "0x0000000000000000000000000000000000000a55";
const GATE = "0x0000000000000000000000000000000000000aa1";
const PAYOUT = "0x000000000000000000000000000000000000beef";
const MERCHANT = "0x000000000000000000000000000000000000cafe";
const FACILITATOR = "0x000000000000000000000000000000000000fac1";
const EVIL = "0x000000000000000000000000000000000000dead";
const TX = `0x${"11".repeat(32)}`;
const deployment = {
  chainId: 84532,
  gate: GATE,
  registry: "0x0000000000000000000000000000000000000b01",
  revocations: "0x0000000000000000000000000000000000000b02",
  group: "0x0000000000000000000000000000000000000b03",
  payout: PAYOUT,
  treasury: "0x0000000000000000000000000000000000000b04",
  vault: "0x0000000000000000000000000000000000000b05",
  token: ASSET,
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

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind server");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function proof() {
  return { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] };
}

const state = {
  registered: false,
  registerCalls: 0,
  sent: 0,
  memos: [],
};
const gateClient = {
  deployment,
  async blockTimestamp() { return Math.floor(Date.now() / 1000); },
  async isStateRegistered() { return state.registered; },
  async registerState() {
    state.registerCalls += 1;
    state.registered = true;
    return { transaction: TX, blockNumber: 1n, logs: [] };
  },
  async simulateExecute(payload) {
    if (!state.registered) throw new Error("UnknownState");
    state.memos.push(payload.memoChange);
  },
  async sendExecute() {
    state.sent += 1;
    return { transaction: TX, blockNumber: 1n, logs: [] };
  },
};
const core = new ShadowpassFacilitatorCore({
  gateClient,
  chainView: gateClient,
  signers: [FACILITATOR],
});
const metrics = new InMemoryLatencyRecorder();
const relayCalls = [];
const relay = {
  async relay(action, args) {
    relayCalls.push([action, args]);
    return { transaction: TX, blockNumber: "1", logs: [{ address: GATE }] };
  },
};
const facilitatorApp = createFacilitatorApp({
  facilitator: {
    getSupported: () => ({
      kinds: [{ x402Version: 2, scheme: "shadowpass", network: NETWORK }],
      extensions: [],
      signers: { "eip155:*": [FACILITATOR] },
    }),
    verify: core.verify.bind(core),
    settle: core.settle.bind(core),
  },
  relay,
  metrics,
});
const facilitator = await listen(facilitatorApp);
const merchant = createMerchantApp({
  facilitatorUrl: facilitator.url,
  deployment,
  asset: ASSET,
  merchantPayTo: MERCHANT,
});
await merchant.ready;
const merchantServer = await listen(merchant.app);
const reportUrl = `${merchantServer.url}/report`;
const unpaid = await fetch(reportUrl);

function builder({ budgetNf = "4242", nonce = "42", memoChange = "0x01", tamperedPayTo = false } = {}) {
  return {
    async buildPayment(requirements, resourceUrl) {
      const proofStarted = performance.now();
      const payload = assembleShadowpassPayload({
        requirements,
        resourceUrl,
        proof: proof(),
        roots: { issued: "11", revoked: "12", root: "13" },
        nowTs: await gateClient.blockTimestamp(),
        nonce,
        ct: ["21", "22", "23", "24", "25", "26", "27", "28"],
        budget: {
          noteRoot: "31",
          budgetNf,
          cmChange: "32",
          qSpent: requirements.amount,
        },
        memoChange,
      });
      payload.timings = { proofMs: performance.now() - proofStarted };
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

const paidFetch = wrapFetchWithPayment(fetch, createShadowpassClient({
  builder: builder(),
  spendControls: {
    allowedAssets: [{ network: NETWORK, asset: ASSET, maxAmountPerPayment: "2000000" }],
  },
}));
const paid = await paidFetch(reportUrl);
const paidBody = await paid.json();
const replay = await paidFetch(reportUrl);

// Same payTo + URL + amount, different nullifier: Payout must not deduplicate reqHash.
const secondPayment = wrapFetchWithPayment(fetch, createShadowpassClient({
  builder: builder({ budgetNf: "4243", nonce: "43", memoChange: "0x02" }),
  spendControls: {
    allowedAssets: [{ network: NETWORK, asset: ASSET, maxAmountPerPayment: "2000000" }],
  },
}));
const secondPaid = await secondPayment(reportUrl);

const tampered = await wrapFetchWithPayment(fetch, createShadowpassClient({
  builder: builder({ budgetNf: "4244", nonce: "44", tamperedPayTo: true }),
  spendControls: {
    allowedAssets: [{ network: NETWORK, asset: ASSET, maxAmountPerPayment: "2000000" }],
  },
}))(reportUrl);
const healthAfterTamper = await (await fetch(`${merchantServer.url}/health`)).json();

const unavailableMerchant = createMerchantApp({
  facilitatorUrl: "http://127.0.0.1:1",
  deployment,
  asset: ASSET,
  merchantPayTo: MERCHANT,
});
await unavailableMerchant.ready;
const unavailableServer = await listen(unavailableMerchant.app);
const originalConsoleError = console.error;
console.error = () => {};
let unavailable;
let unavailableBody;
try {
  unavailable = await wrapFetchWithPayment(fetch, createShadowpassClient({
    builder: builder({ budgetNf: "4245", nonce: "45" }),
    spendControls: {
      allowedAssets: [{ network: NETWORK, asset: ASSET, maxAmountPerPayment: "2000000" }],
    },
  }))(`${unavailableServer.url}/report`);
  unavailableBody = await unavailable.json();
} finally {
  console.error = originalConsoleError;
}

const relayHeaders = { "content-type": "application/json", "x-real-ip": "203.0.113.7" };
const faucet = await fetch(`${facilitator.url}/relay/faucetDeposit`, {
  method: "POST",
  headers: relayHeaders,
  body: JSON.stringify({
    args: { proof: proof(), cm: "1", q: "2", memo: "0x1234" },
  }),
});
const transfer = await fetch(`${facilitator.url}/relay/transferBudget`, {
  method: "POST",
  headers: relayHeaders,
  body: JSON.stringify({
    args: {
      proof: proof(), noteRoot: "1", revokedRoot: "2", nullifier: "3",
      cm1: "4", cm2: "5", memo1: "0x01", memo2: "0x02",
    },
  }),
});
const oldDeposit = await fetch(`${facilitator.url}/relay/deposit`, {
  method: "POST",
  headers: relayHeaders,
  body: JSON.stringify({ args: {} }),
});

const metricsBody = await (await fetch(`${facilitator.url}/metrics`)).json();
const result = {
  unpaidStatus: unpaid.status,
  paidStatus: paid.status,
  paidBody,
  replayStatus: replay.status,
  sameReqHashSecondPaymentStatus: secondPaid.status,
  tamperedStatus: tampered.status,
  merchantHandledAfterTamper: healthAfterTamper.handled,
  unavailableStatus: unavailable.status,
  unavailableError: unavailableBody.error,
  registerStateCalls: state.registerCalls,
  sentTransactions: state.sent,
  memos: state.memos,
  relayStatuses: { faucet: faucet.status, transfer: transfer.status, oldDeposit: oldDeposit.status },
  relayCalls: relayCalls.map(([action]) => action),
  timings: metricsBody.records,
};
console.log(JSON.stringify(result, null, 2));

for (const { server } of [facilitator, merchantServer, unavailableServer]) server.close();
if (unpaid.status !== 402) throw new Error(`unpaid ${unpaid.status}`);
if (paid.status !== 200) throw new Error(`paid ${paid.status}`);
if (replay.status !== 402) throw new Error(`replay ${replay.status}`);
if (secondPaid.status !== 200) throw new Error(`same reqHash second payment ${secondPaid.status}`);
if (tampered.status !== 402) throw new Error(`tampered ${tampered.status}`);
if (healthAfterTamper.handled !== 2) throw new Error(`handler count ${healthAfterTamper.handled}`);
if (unavailable.status !== 503 || unavailableBody.error !== "facilitator_unavailable") {
  throw new Error(`unavailable ${unavailable.status}`);
}
if (state.registerCalls !== 1) throw new Error(`registerState calls ${state.registerCalls}`);
if (oldDeposit.status !== 404) throw new Error(`old relay action ${oldDeposit.status}`);
