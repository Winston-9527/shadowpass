import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import type {
  DepositRelayRequest,
  GateClient,
  RegisterRelayRequest,
  ShadowpassFacilitator,
  TransferBudgetRelayRequest,
  WalletRelayClient,
} from "@shadowpass/x402";
import {
  calldataProofSchema,
  hexSchema,
  uintSchema,
} from "@shadowpass/x402";
import type { InMemoryLatencyRecorder } from "./metrics.js";

const registerSchema = z.object({
  proof: calldataProofSchema,
  groupRoot: uintSchema,
  nf: uintSchema,
  leaf0: uintSchema,
  siblingNodes: z.array(uintSchema),
}).strict();

const depositSchema = z.object({
  proof: calldataProofSchema,
  cm: uintSchema,
  q: uintSchema,
  memo: hexSchema,
}).strict();

const transferSchema = z.object({
  proof: calldataProofSchema,
  noteRoot: uintSchema,
  revokedRoot: uintSchema,
  nullifier: uintSchema,
  cm1: uintSchema,
  cm2: uintSchema,
  memo1: hexSchema,
  memo2: hexSchema,
}).strict();

const joinSchema = z.object({ commitment: uintSchema }).strict();
const issueSchema = z.object({ certHash: uintSchema }).strict();

const verifyBodySchema = z.object({
  x402Version: z.number().int().positive().optional(),
  paymentPayload: z.record(z.string(), z.unknown()),
  paymentRequirements: z.record(z.string(), z.unknown()),
}).strict();

export interface FacilitatorAppOptions {
  facilitator: {
    verify: ShadowpassFacilitator["verify"];
    settle: ShadowpassFacilitator["settle"];
    getSupported: () => ReturnType<import("@x402/core/facilitator").x402Facilitator["getSupported"]>;
  };
  relay: WalletRelayClient;
  metrics: InMemoryLatencyRecorder;
}

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function transactionResponse(transaction: string): { transaction: string } {
  return { transaction };
}

export function createFacilitatorApp(options: FacilitatorAppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/supported", (_request, response) => response.json(options.facilitator.getSupported()));
  app.get("/health", (_request, response) => response.json({ ok: true }));
  app.get("/metrics", (_request, response) => response.json({ records: options.metrics.list() }));

  app.post("/verify", asyncHandler(async (request, response) => {
    const body = verifyBodySchema.parse(request.body);
    const started = performance.now();
    const result = await options.facilitator.verify(
      body.paymentPayload as any,
      body.paymentRequirements as any,
    );
    const timings = (result.extra as any)?.shadowpass;
    options.metrics.record({
      operation: "verify",
      totalMs: performance.now() - started,
      verifyMs: timings?.verifyMs,
      simulationMs: timings?.simulationMs,
      proofMs: timings?.proofMs,
      budgetNf: typeof body.paymentPayload.payload === "object"
        ? String((body.paymentPayload.payload as any)?.budget?.budgetNf ?? "")
        : undefined,
      network: typeof body.paymentRequirements.network === "string" ? body.paymentRequirements.network : undefined,
      timestamp: new Date().toISOString(),
    });
    response.json(result);
  }));

  app.post("/settle", asyncHandler(async (request, response) => {
    const body = verifyBodySchema.parse(request.body);
    const started = performance.now();
    const result = await options.facilitator.settle(
      body.paymentPayload as any,
      body.paymentRequirements as any,
    );
    const timings = (result.extra as any)?.shadowpass;
    options.metrics.record({
      operation: "settle",
      totalMs: performance.now() - started,
      simulationMs: timings?.simulationMs,
      settleMs: timings?.settleMs,
      proofMs: timings?.proofMs,
      budgetNf: typeof body.paymentPayload.payload === "object"
        ? String((body.paymentPayload.payload as any)?.budget?.budgetNf ?? "")
        : undefined,
      transaction: result.transaction || undefined,
      network: result.network,
      timestamp: new Date().toISOString(),
    });
    response.json(result);
  }));

  app.post("/relay/join", asyncHandler(async (request, response) => {
    const body = joinSchema.parse(request.body);
    response.json(transactionResponse(await options.relay.join(body.commitment)));
  }));

  app.post("/relay/issue", asyncHandler(async (request, response) => {
    const body = issueSchema.parse(request.body);
    response.json(transactionResponse(await options.relay.issue(body.certHash)));
  }));

  app.post("/relay/register", asyncHandler(async (request, response) => {
    const body = registerSchema.parse(request.body) as RegisterRelayRequest;
    response.json(transactionResponse(await options.relay.register(body)));
  }));

  app.post("/relay/deposit", asyncHandler(async (request, response) => {
    const body = depositSchema.parse(request.body) as DepositRelayRequest;
    response.json(transactionResponse(await options.relay.deposit(body)));
  }));

  app.post("/relay/transfer-budget", asyncHandler(async (request, response) => {
    const body = transferSchema.parse(request.body) as TransferBudgetRelayRequest;
    response.json(transactionResponse(await options.relay.transferBudget(body)));
  }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "invalid_request", message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    response.status(502).json({ error: "relay_or_facilitator_unavailable", message });
  });

  return app;
}

export type FacilitatorGateClient = GateClient;
