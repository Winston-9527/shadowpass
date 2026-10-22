import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "@x402/express";
import { ShadowpassServer, SHADOWPASS_NETWORK } from "@shadowpass/x402";

type Address = `0x${string}`;
type Network = `${string}:${string}`;

export interface MerchantDemoOptions {
  facilitatorUrl: string;
  asset: Address;
  gate: Address;
  payout: Address;
  network?: Network;
}

function unavailableHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      response.status(503).json({ error: "facilitator_unavailable", message });
    });
  };
}

export function createMerchantApp(options: MerchantDemoOptions) {
  const network = options.network ?? SHADOWPASS_NETWORK;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  let handled = 0;
  const resourceServer = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: options.facilitatorUrl }),
  ).register(network, new ShadowpassServer({
    asset: options.asset,
    gate: options.gate,
    payout: options.payout,
    network,
  }));

  const middleware = paymentMiddleware({
    "GET /report": {
      accepts: [{
        scheme: "shadowpass",
        price: "$2.00",
        network,
        payTo: options.payout,
        maxTimeoutSeconds: 60,
        extra: { gate: options.gate, payout: options.payout },
      }],
      description: "Market report",
      mimeType: "application/json",
    },
    "GET /news": {
      accepts: [{
        scheme: "shadowpass",
        price: "$0.50",
        network,
        payTo: options.payout,
        maxTimeoutSeconds: 60,
        extra: { gate: options.gate, payout: options.payout },
      }],
      description: "News feed",
      mimeType: "application/json",
    },
  }, resourceServer, undefined, undefined, false);

  let initError: unknown;
  const ready = resourceServer.initialize().catch((error: unknown) => {
    initError = error;
  });
  const protectedMiddleware: RequestHandler = async (request, response, next) => {
    try {
      await ready;
      if (initError) throw initError;
      await middleware(request, response, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(503).json({ error: "facilitator_unavailable", message });
    }
  };

  app.get("/health", (_request, response) => response.json({ ok: true, handled }));
  app.use(unavailableHandler(protectedMiddleware));
  app.get("/report", (_request, response) => {
    handled += 1;
    response.json({ report: "EV market Q3", bytes: 1_234 });
  });
  app.get("/news", (_request, response) => {
    handled += 1;
    response.json({ headlines: ["Battery costs fall again"], bytes: 321 });
  });
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    if (/facilitator|supported kinds/i.test(message)) {
      response.status(503).json({ error: "facilitator_unavailable", message });
      return;
    }
    response.status(500).json({ error: "merchant_error", message });
  });
  return { app, resourceServer, ready };
}
