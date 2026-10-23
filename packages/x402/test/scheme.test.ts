import { describe, expect, it } from "vitest";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ctxHash, type Deployment } from "@shadowpass/sdk";
import {
  ShadowpassFacilitatorCore,
  ShadowpassPayloadSchema,
  ShadowpassServerScheme,
  ViemGateClient,
  assembleShadowpassPayload,
  checkPayment,
  createSerializedSender,
  type GateClient,
  type PaymentChainView,
  type Roots,
  type TransactionResult,
} from "../src/index.js";

const NETWORK = "eip155:84532" as const;
const ASSET = "0x0000000000000000000000000000000000000a55" as const;
const GATE = "0x0000000000000000000000000000000000000aa1" as const;
const PAYOUT = "0x000000000000000000000000000000000000beef" as const;
const MERCHANT = "0x000000000000000000000000000000000000cafe" as const;
const TX = `0x${"11".repeat(32)}` as const;

const DEPLOYMENT: Deployment = {
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
  facilitator: "http://localhost:4022",
  mailbox: "http://localhost:4023",
};

function requirements(): PaymentRequirements {
  return {
    scheme: "shadowpass",
    network: NETWORK,
    asset: ASSET,
    amount: "2000000",
    payTo: MERCHANT,
    maxTimeoutSeconds: 120,
    extra: { gate: GATE, payout: PAYOUT, method: "0x00000001" },
  };
}

function payload(memoChange: `0x${string}` = "0x01", budgetNf = "22", roots: Roots = {
  issued: "11", revoked: "12", root: "13",
}) {
  return assembleShadowpassPayload({
    requirements: requirements(),
    resourceUrl: "https://merchant.example/report",
    proof: { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"] },
    roots,
    nowTs: 999,
    nonce: "9",
    ct: ["1", "2", "3", "4", "5", "6", "7", "8"],
    budget: { noteRoot: "21", budgetNf, cmChange: "23", qSpent: "2000000" },
    memoChange,
  });
}

function payment(memoChange: `0x${string}` = "0x01", budgetNf = "22", roots?: Roots): PaymentPayload {
  const req = requirements();
  return {
    x402Version: 2,
    resource: { url: "https://merchant.example/report" },
    accepted: req,
    payload: payload(memoChange, budgetNf, roots) as unknown as Record<string, unknown>,
  };
}

function chainView(registered = true): PaymentChainView & { register: () => void } {
  let state = registered;
  return {
    deployment: DEPLOYMENT,
    async blockTimestamp() { return 1_000; },
    async isStateRegistered() { return state; },
    register() { state = true; },
  };
}

function receipt(): TransactionResult {
  return { transaction: TX, blockNumber: 1n, logs: [] };
}

function gateClient(view = chainView()): GateClient & {
  reads: Roots[];
  registrations: Roots[];
  sent: number;
} {
  return {
    reads: [],
    registrations: [],
    sent: 0,
    async simulateExecute() {},
    async sendExecute() {
      this.sent += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return receipt();
    },
    async registerState(roots) {
      this.registrations.push(roots);
      this.reads.push(roots);
      view.register();
      return receipt();
    },
  };
}

describe("§8.3 checkPayment", () => {
  it("returns each specified error code in order", async () => {
    const view = chainView();
    const base = payment();
    const cases: Array<[string, PaymentPayload, PaymentRequirements, PaymentChainView]> = [];

    cases.push([
      "invalid_scheme",
      { ...base, accepted: { ...requirements(), network: "eip155:1" } },
      { ...requirements(), network: "eip155:1" },
      view,
    ]);
    const badLength = payment();
    (badLength.payload as any).ct = ["1"];
    cases.push(["invalid_payload", badLength, requirements(), view]);
    const wrongTarget = payment();
    (wrongTarget.payload as any).action.target = "0x000000000000000000000000000000000000dead";
    cases.push(["wrong_target", wrongTarget, requirements(), view]);
    const wrongMethod = payment();
    (wrongMethod.payload as any).action.method = "0xdeadbeef";
    cases.push(["wrong_target", wrongMethod, requirements(), view]);
    const wrongAmount = payment();
    (wrongAmount.payload as any).action.amount = "1";
    cases.push(["amount_mismatch", wrongAmount, requirements(), view]);
    const wrongBinding = payment();
    (wrongBinding.payload as any).action.params = "0x00";
    cases.push(["binding_mismatch", wrongBinding, requirements(), view]);
    const stale = payment();
    (stale.payload as any).nowTs = "1";
    cases.push(["stale", stale, requirements(), view]);
    const future = payment();
    (future.payload as any).nowTs = "1100";
    cases.push(["stale", future, requirements(), view]);
    cases.push(["unknown_state", payment(), requirements(), chainView(false)]);

    for (const [expected, candidate, req, candidateView] of cases) {
      await expect(checkPayment(candidate, req, candidate.resource!.url, candidateView, {
        clockSkewSeconds: 60,
      })).resolves.toMatchObject({ isValid: false, invalidReason: expected });
    }
  });

  it("binds memoChange through the real SDK ctxHash", () => {
    const action = {
      target: "0x2222222222222222222222222222222222222222" as const,
      method: "0x12345678" as const,
      amount: 12345n,
      nonce: 7n,
      params: "0xdeadbeef" as const,
    };
    const first = ctxHash({
      chainId: 84532n,
      gate: "0x1111111111111111111111111111111111111111",
      action,
      memoChange: "0x010203",
    });
    expect(first).toBe(269967330513118763063442127486799396061052212780023532984835628296506995388n);
    expect(ctxHash({
      chainId: 84532n,
      gate: "0x1111111111111111111111111111111111111111",
      action,
      memoChange: "0x010204",
    })).not.toBe(first);
  });
});

describe("facilitator settlement", () => {
  it("returns simulation_failed:<Name> and never reports revert as success", async () => {
    const view = chainView();
    const gate = gateClient(view);
    gate.simulateExecute = async () => {
      throw Object.assign(new Error("reverted"), { data: { errorName: "BadClock" } });
    };
    const facilitator = new ShadowpassFacilitatorCore({
      gateClient: gate,
      chainView: view,
      signers: [MERCHANT],
    });
    await expect(facilitator.verify(payment(), requirements())).resolves.toMatchObject({
      isValid: false,
      invalidReason: "simulation_failed:BadClock",
    });

    gate.simulateExecute = async () => {};
    gate.sendExecute = async () => { throw new Error("transaction reverted"); };
    await expect(facilitator.settle(payment("0x01", "24"), requirements())).resolves.toMatchObject({
      success: false,
      errorReason: "settlement_failed:unknown",
    });
  });

  it("registers an unknown state once and then settles", async () => {
    const view = chainView(false);
    const gate = gateClient(view);
    const facilitator = new ShadowpassFacilitatorCore({
      gateClient: gate,
      chainView: view,
      signers: [MERCHANT],
    });
    await expect(facilitator.verify(payment(), requirements())).resolves.toMatchObject({
      isValid: false,
      invalidReason: "unknown_state",
    });
    await expect(facilitator.settle(payment(), requirements())).resolves.toMatchObject({
      success: true,
      transaction: TX,
    });
    expect(gate.registrations).toHaveLength(1);
  });

  it("serializes concurrent settle for the same budgetNf", async () => {
    const view = chainView();
    const gate = gateClient(view);
    const facilitator = new ShadowpassFacilitatorCore({
      gateClient: gate,
      chainView: view,
      signers: [MERCHANT],
    });
    const first = payment();
    const results = await Promise.all([
      facilitator.settle(first, requirements()),
      facilitator.settle(first, requirements()),
      facilitator.settle(first, requirements()),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(gate.sent).toBe(1);
  });

  it("limits by the immutable merchant payTo", async () => {
    const view = chainView();
    const gate = gateClient(view);
    const facilitator = new ShadowpassFacilitatorCore({
      gateClient: gate,
      chainView: view,
      signers: [MERCHANT],
      merchantRateLimit: { limit: 1, windowMs: 60_000 },
    });
    await expect(facilitator.settle(payment("0x01", "31"), requirements())).resolves.toMatchObject({ success: true });
    await expect(facilitator.settle(payment("0x01", "32"), requirements())).resolves.toMatchObject({
      success: false,
      errorReason: "merchant_rate_limited",
    });
  });
});

describe("schemas and serialized sender", () => {
  it("rejects ct length above the D=3 maximum", () => {
    const bad = payload();
    (bad as any).ct = Array.from({ length: 10 }, (_, i) => String(i + 1));
    expect(ShadowpassPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it("checks the receipt status", async () => {
    const publicClient = {
      async waitForTransactionReceipt() { return { status: "reverted", blockNumber: 1n, logs: [] }; },
    } as any;
    const walletClient = { account: { address: MERCHANT } } as any;
    const gate = new ViemGateClient({ publicClient, walletClient, deployment: DEPLOYMENT });
    await expect((gate as any).sender.write(async () => TX)).rejects.toThrow("transaction_reverted");
  });

  it("serializes wallet writes so concurrent notes do not collide on nonce", async () => {
    let active = 0;
    let maxActive = 0;
    const publicClient = {
      async waitForTransactionReceipt() {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { status: "success", blockNumber: 1n, logs: [] };
      },
    } as any;
    const walletClient = { account: { address: MERCHANT } } as any;
    const sender = createSerializedSender(publicClient, walletClient);
    const senderFromRelay = createSerializedSender(publicClient, walletClient);
    await Promise.all([
      sender.write(async () => {
        active += 1; maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return TX;
      }),
      senderFromRelay.write(async () => {
        active += 1; maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return TX;
      }),
    ]);
    expect(maxActive).toBe(1);
  });
});
