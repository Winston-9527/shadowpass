import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import {
  RELAY_ACTIONS,
  hexSchema,
  proofSchema,
  uintSchema,
  type RelayAction,
  type WalletRelayClient,
} from "@shadowpass/x402";
import type { InMemoryLatencyRecorder } from "./metrics.js";
import { RelayRevertError } from "./viem-client.js";

const relaySchemas = {
  join: z.object({ commitment: uintSchema }).strict(),
  register: z.object({
    proof: proofSchema, groupRoot: uintSchema, nf: uintSchema, leaf0: uintSchema,
    siblingNodes: z.array(uintSchema),
  }).strict(),
  faucetDeposit: z.object({
    proof: proofSchema,
    cm: uintSchema,
    q: uintSchema.refine((value) => BigInt(value) > 0n && BigInt(value) <= 100_000_000n, "invalid_faucet_amount"),
    memo: hexSchema,
  }).strict(),
  issue: z.object({ certHash: uintSchema }).strict(),
  transferBudget: z.object({
    proof: proofSchema, noteRoot: uintSchema, revokedRoot: uintSchema, nullifier: uintSchema,
    cm1: uintSchema, cm2: uintSchema, memo1: hexSchema, memo2: hexSchema,
  }).strict(),
  revoke: z.object({ proof: proofSchema, newRoot: uintSchema, entry: uintSchema }).strict(),
  registerState: z.object({ issued: uintSchema, revoked: uintSchema, root: uintSchema }).strict(),
} satisfies Record<RelayAction, z.ZodTypeAny>;

const verifyBodySchema = z.object({
  x402Version: z.number().int().positive().optional(),
  paymentPayload: z.record(z.string(), z.unknown()),
  paymentRequirements: z.record(z.string(), z.unknown()),
}).strict();

export interface RelayRateLimitConfig {
  perMinute: number;
  faucetPerDay: number;
  trustProxyHeaders: boolean;
}

export class RelayRateLimiter {
  private readonly minuteHits = new Map<string, number[]>();
  private readonly faucetHits = new Map<string, number>();

  constructor(
    private readonly config: RelayRateLimitConfig,
    private readonly now: () => number = Date.now,
  ) {}

  allow(ip: string, action: RelayAction): boolean {
    const now = this.now();
    const cutoff = now - 60_000;
    const recent = (this.minuteHits.get(ip) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.config.perMinute) return false;
    recent.push(now);
    this.minuteHits.set(ip, recent);
    if (action !== "faucetDeposit") return true;
    const day = Math.floor(now / 86_400_000);
    if (this.faucetHits.get(ip) === day) return false;
    this.faucetHits.set(ip, day);
    return true;
  }
}

export class PaymentRateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(ip: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(ip) ?? []).filter((timestamp) => timestamp > now - 60_000);
    if (recent.length >= this.limit) return false;
    recent.push(now);
    this.hits.set(ip, recent);
    return true;
  }
}

function clientIp(request: Request, trustProxyHeaders: boolean): string {
  if (trustProxyHeaders) {
    const header = request.headers["x-real-ip"];
    if (typeof header === "string" && header.trim()) return header.trim();
  }
  return request.socket.remoteAddress ?? "unknown";
}

export interface FacilitatorAppOptions {
  facilitator: {
    verify: (payload: any, requirements: any) => Promise<any>;
    settle: (payload: any, requirements: any) => Promise<any>;
    getSupported: () => unknown;
  };
  relay: WalletRelayClient;
  metrics: InMemoryLatencyRecorder;
  relayRateLimit?: Partial<RelayRateLimitConfig>;
  paymentRateLimit?: { perMinute?: number };
  now?: () => number;
}

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function createFacilitatorApp(options: FacilitatorAppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  const trustProxyHeaders = options.relayRateLimit?.trustProxyHeaders
    ?? process.env.VERCEL === "1";
  const relayLimiter = new RelayRateLimiter({
    perMinute: options.relayRateLimit?.perMinute ?? 60,
    faucetPerDay: options.relayRateLimit?.faucetPerDay ?? 1,
    trustProxyHeaders,
  }, options.now);
  const paymentLimiter = new PaymentRateLimiter(
    options.paymentRateLimit?.perMinute ?? 120,
    options.now,
  );

  app.get("/supported", (_request, response) => response.json(options.facilitator.getSupported()));
  app.get("/health", (_request, response) => response.json({ ok: true }));
  app.get("/metrics", (_request, response) => response.json({ records: options.metrics.list() }));

  app.post("/verify", asyncHandler(async (request, response) => {
    if (!paymentLimiter.allow(clientIp(request, trustProxyHeaders))) {
      response.status(429).json({ error: "rate_limited" });
      return;
    }
    const body = verifyBodySchema.parse(request.body);
    const started = performance.now();
    let result: any;
    try {
      result = await options.facilitator.verify(body.paymentPayload, body.paymentRequirements);
    } catch {
      result = { isValid: false, invalidReason: "facilitator_error" };
    }
    options.metrics.record({
      operation: "verify",
      totalMs: performance.now() - started,
      verifyMs: result?.extra?.shadowpass?.verifyMs,
      proofMs: result?.extra?.shadowpass?.proofMs,
      network: String(body.paymentRequirements.network ?? ""),
      timestamp: new Date().toISOString(),
    });
    response.json(result);
  }));

  app.post("/settle", asyncHandler(async (request, response) => {
    if (!paymentLimiter.allow(clientIp(request, trustProxyHeaders))) {
      response.status(429).json({ error: "rate_limited" });
      return;
    }
    const body = verifyBodySchema.parse(request.body);
    const started = performance.now();
    let result: any;
    try {
      result = await options.facilitator.settle(body.paymentPayload, body.paymentRequirements);
    } catch {
      result = {
        success: false,
        errorReason: "facilitator_error",
        transaction: "",
        network: String(body.paymentRequirements.network ?? ""),
      };
    }
    options.metrics.record({
      operation: "settle",
      totalMs: performance.now() - started,
      settleMs: result?.extra?.shadowpass?.settleMs,
      proofMs: result?.extra?.shadowpass?.proofMs,
      transaction: result?.transaction || undefined,
      network: result?.network,
      timestamp: new Date().toISOString(),
    });
    response.json(result);
  }));

  app.post("/relay/:action", asyncHandler(async (request, response) => {
    const action = request.params.action as RelayAction;
    if (!RELAY_ACTIONS.includes(action)) {
      response.status(404).json({ error: "unknown_relay_action" });
      return;
    }
    const ip = clientIp(request, trustProxyHeaders);
    if (!relayLimiter.allow(ip, action)) {
      response.status(429).json({ error: "rate_limited" });
      return;
    }
    const body = z.object({ args: z.record(z.string(), z.unknown()) }).strict().parse(request.body);
    const args = relaySchemas[action].parse(body.args);
    try {
      response.json(await options.relay.relay(action, args));
    } catch (error) {
      if (error instanceof RelayRevertError) {
        response.status(400).json({ error: `simulation_failed:${error.revertName}` });
        return;
      }
      response.status(502).json({ error: "relay_failed" });
    }
  }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      response.status(400).json({ error: "invalid_request" });
      return;
    }
    response.status(502).json({ error: "facilitator_unavailable" });
  });

  return app;
}
