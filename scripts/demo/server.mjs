import express from "express";
import path from "node:path";

export function createDemoApp({ engine, publicDir }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("json replacer", (_key, value) => typeof value === "bigint" ? value.toString() : value);
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/status", (_request, response) => {
    response.json(engine.getSnapshot());
  });

  app.get("/api/comparison/:operation", (request, response) => {
    const operation = request.params.operation === "treasury" ? "treasury" : "purchase";
    response.json(engine.comparison(operation));
  });

  app.post("/api/capability-check", (request, response) => {
    const branch = request.body?.branch;
    const operation = request.body?.operation;
    if (!new Set(["buyer", "treasury"]).has(branch) || !new Set(["purchase", "treasury"]).has(operation)) {
      response.status(400).json({ error: "invalid_capability_check" });
      return;
    }
    response.json(engine.attemptCapability(branch, operation));
  });

  app.post("/api/actions/purchase", async (request, response, next) => {
    try {
      response.json(await engine.purchaseAction());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/actions/treasury", async (request, response, next) => {
    try {
      response.json(await engine.treasuryAction());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/actions/treasury-withdraw", async (request, response, next) => {
    try {
      response.json(await engine.withdrawAction());
    } catch (error) {
      next(error);
    }
  });

  app.get("/shadowpass.svg", (_request, response) => {
    response.sendFile(path.resolve(publicDir, "../../../apps/wallet/public/shadowpass.svg"));
  });
  app.use(express.static(publicDir, { extensions: ["html"] }));
  app.use((error, _request, response, _next) => {
    response.status(500).json({
      error: "demo_action_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  });
  return app;
}

export function defaultPublicDir(importMetaUrl) {
  return path.join(path.dirname(new URL(importMetaUrl).pathname), "public");
}
