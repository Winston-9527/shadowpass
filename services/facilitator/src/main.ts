import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import { x402Facilitator } from "@x402/core/facilitator";
import { ShadowpassFacilitatorScheme } from "@shadowpass/x402";
import { loadDeployment, type Deployment, type Hex } from "@shadowpass/sdk";
import { createFacilitatorApp } from "./app.js";
import { InMemoryLatencyRecorder } from "./metrics.js";
import { createViemAccounts, createViemWalletRelayClient } from "./viem-client.js";

export interface FacilitatorConfig {
  rpcUrl: string;
  privateKey: Hex;
  deployment: Deployment;
  port?: number;
  clockSkewSeconds?: number;
  merchantRateLimit?: { limit: number; windowMs: number };
  relayRateLimit?: {
    perMinute?: number;
    faucetPerDay?: number;
    trustProxyHeaders?: boolean;
  };
}

export async function startFacilitator(config: FacilitatorConfig): Promise<{
  app: ReturnType<typeof createFacilitatorApp>;
  server: Server;
}> {
  const metrics = new InMemoryLatencyRecorder();
  const accounts = createViemAccounts(config.rpcUrl, config.privateKey);
  const scheme = new ShadowpassFacilitatorScheme({
    publicClient: accounts.publicClient,
    walletClient: accounts.walletClient,
    deployment: config.deployment,
    clockSkewSeconds: config.clockSkewSeconds,
    merchantRateLimit: config.merchantRateLimit,
  });
  const facilitator = new x402Facilitator().register(
    `eip155:${config.deployment.chainId}`,
    scheme,
  );
  const relay = createViemWalletRelayClient({
    publicClient: accounts.publicClient,
    walletClient: accounts.walletClient,
    deployment: config.deployment,
  });
  const app = createFacilitatorApp({
    facilitator,
    relay,
    metrics,
    relayRateLimit: {
      perMinute: config.relayRateLimit?.perMinute,
      faucetPerDay: config.relayRateLimit?.faucetPerDay,
      trustProxyHeaders: config.relayRateLimit?.trustProxyHeaders,
    },
  });
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
  const { server } = await startFacilitator({
    rpcUrl,
    privateKey: required("FACILITATOR_PK") as Hex,
    deployment,
    port: Number(process.env.PORT ?? 4022),
    merchantRateLimit: {
      limit: Number(process.env.FACILITATOR_RATE_LIMIT ?? 60),
      windowMs: Number(process.env.FACILITATOR_RATE_WINDOW_MS ?? 60_000),
    },
    relayRateLimit: {
      perMinute: Number(process.env.RELAY_RATE_LIMIT ?? 60),
      faucetPerDay: Number(process.env.RELAY_FAUCET_PER_DAY ?? 1),
      trustProxyHeaders: process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "1",
    },
  });
  console.log(JSON.stringify({
    type: "shadowpass.facilitator.started",
    network,
    port: (server.address() as any)?.port,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
