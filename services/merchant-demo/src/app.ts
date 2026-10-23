import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
  type RoutesConfig,
} from "@x402/core/server";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";
import type { Address, Deployment } from "@shadowpass/sdk";
import { ShadowpassServerScheme } from "@shadowpass/x402";

export interface MerchantDemoOptions {
  facilitatorUrl: string;
  deployment: Deployment;
  asset: Address;
  merchantPayTo: Address;
}

export function validatePaymentResource(header: string, actualUrl: string): boolean {
  try {
    const payment = decodePaymentSignatureHeader(header);
    return payment.resource?.url === actualUrl;
  } catch {
    return false;
  }
}

function unavailableHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(() => {
      response.status(503).json({ error: "facilitator_unavailable" });
    });
  };
}

export function createMerchantApp(options: MerchantDemoOptions) {
  const network = `eip155:${options.deployment.chainId}` as const;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  let handled = 0;
  const resourceServer = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: options.facilitatorUrl }),
  ).register(network, new ShadowpassServerScheme({
    deployment: options.deployment,
    asset: options.asset,
    payout: options.deployment.payout,
    decimals: 6,
  }));

  const routes: RoutesConfig = {
    "GET /report": {
      accepts: [{
        scheme: "shadowpass",
        price: "$2.00",
        network,
        payTo: options.merchantPayTo,
        maxTimeoutSeconds: 120,
        extra: { gate: options.deployment.gate, payout: options.deployment.payout },
      }],
      description: "Market report",
      mimeType: "application/json",
    },
    "GET /news": {
      accepts: [{
        scheme: "shadowpass",
        price: "$0.50",
        network,
        payTo: options.merchantPayTo,
        maxTimeoutSeconds: 120,
        extra: { gate: options.deployment.gate, payout: options.deployment.payout },
      }],
      description: "News feed",
      mimeType: "application/json",
    },
  };
  const httpServer = new x402HTTPResourceServer(resourceServer, routes).onProtectedRequest(
    async (context) => {
      const header = context.adapter.getHeader("payment-signature");
      if (!header) return;
      if (!validatePaymentResource(header, context.adapter.getUrl())) {
        return { abort: true, reason: "resource_url_mismatch" };
      }
    },
  );
  const middleware = paymentMiddlewareFromHTTPServer(
    httpServer,
    undefined,
    undefined,
    false,
  );

  let initError: unknown;
  const ready = httpServer.initialize().catch((error: unknown) => {
    initError = error;
  });
  const protectedMiddleware: RequestHandler = async (request, response, next) => {
    await ready;
    if (initError) {
      response.status(503).json({ error: "facilitator_unavailable" });
      return;
    }
    await middleware(request, response, next);
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
  app.use((_error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    response.status(502).json({ error: "merchant_upstream_error" });
  });
  return { app, resourceServer, ready };
}
