import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import { x402Facilitator } from "@x402/core/facilitator";
import { privateKeyToAccount } from "viem/accounts";
import { ShadowpassFacilitator } from "@shadowpass/x402";
import { loadDeployment, type Deployment, type Hex } from "@shadowpass/sdk";
import { createFacilitatorApp } from "./app.js";
import { InMemoryLatencyRecorder } from "./metrics.js";
import { createViemGateClient, createViemWalletRelayClient } from "./viem-client.js";

export interface FacilitatorConfig {
  rpcUrl: string;
  privateKey: Hex;
  deployment: Deployment;
  port?: number;
  clockSkewSeconds?: number;
  rateLimit?: { limit: number; windowMs: number };
}

export async function startFacilitator(config: FacilitatorConfig): Promise<{
  app: ReturnType<typeof createFacilitatorApp>;
  server: Server;
}> {
  const metrics = new InMemoryLatencyRecorder();
  const signer = privateKeyToAccount(config.privateKey).address;
  const gateClient = createViemGateClient({
    rpcUrl: config.rpcUrl,
    privateKey: config.privateKey,
    gate: config.deployment.gate,
  });
  const relay = createViemWalletRelayClient({
    rpcUrl: config.rpcUrl,
    privateKey: config.privateKey,
    gate: config.deployment.gate,
    registry: config.deployment.registry,
    group: config.deployment.group,
  });
  const facilitator = new x402Facilitator().register(
    `eip155:${config.deployment.chainId}`,
    new ShadowpassFacilitator({
      gateClient,
      signers: [signer],
      clockSkewSeconds: config.clockSkewSeconds,
      rateLimit: config.rateLimit,
    }),
  );
  const app = createFacilitatorApp({ facilitator, relay, metrics });
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(config.port ?? 4022, () => resolve(listening));
  });
  return { app, server };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function main(): Promise<void> {
  const network = process.env.SHADOWPASS_NETWORK ?? "anvil";
  const deployment = await loadDeployment(network);
  const rpcUrl = network === "anvil"
    ? process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545"
    : required("BASE_SEPOLIA_RPC");
  const rateLimit = {
    limit: Number(process.env.FACILITATOR_RATE_LIMIT ?? 60),
    windowMs: Number(process.env.FACILITATOR_RATE_WINDOW_MS ?? 60_000),
  };
  const { server } = await startFacilitator({
    rpcUrl,
    privateKey: required("FACILITATOR_PK") as Hex,
    deployment,
    port: Number(process.env.PORT ?? 4022),
    rateLimit,
  });
  console.log(JSON.stringify({ type: "shadowpass.facilitator.started", network, port: (server.address() as any)?.port }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
