#!/usr/bin/env -S node --import tsx
import { createPublicClient, http, toHex, type PublicClient } from "viem";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChainState,
  loadDeployment,
  MailboxClient,
} from "@shadowpass/sdk";
import type { ChainLogClient, Deployment } from "@shadowpass/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import qrcode from "qrcode-terminal";
import { z } from "zod";
import { CredentialInbox } from "./inbox.js";
import { SerialTaskQueue } from "./execution.js";
import { reconcileNotes } from "./notes.js";
import { buildPairing } from "./pairing.js";
import { PaymentBuilderError } from "./payment-builder.js";
import { createShadowpassPaymentService } from "./payment.js";
import { AgentStore } from "./store.js";
import { createShadowpassTreasuryService } from "./treasury.js";
import {
  delegate,
  listReceipts,
  pay,
  treasuryStatus,
  treasurySupply,
  treasuryWithdraw,
  walletStatus,
  type McpToolContext,
} from "./tools.js";
import { McpToolError, type McpServices } from "./types.js";

export interface RuntimeOptions {
  name: string;
  root?: string;
  network?: string;
  deployment?: Deployment;
  state?: ChainState;
  mailbox?: MailboxClient;
  services?: McpServices;
  malicious?: boolean;
  maxPayment?: bigint;
  nowSeconds?: bigint;
  rpcUrl?: string;
  refreshState?: () => Promise<ChainState>;
  stateRefreshIntervalMs?: number;
}

export interface McpRuntime {
  store: AgentStore;
  deployment?: Deployment;
  state?: ChainState;
  mailbox?: MailboxClient;
  services: McpServices;
  malicious: boolean;
  maxPayment: bigint;
  nowSeconds?: bigint;
  rpcUrl?: string;
  chainClient?: PublicClient;
  stateRefreshIntervalMs: number;
  lastStateRefreshAt?: number;
  refreshState?: () => Promise<ChainState>;
  refreshPromise?: Promise<void>;
  pairing: ReturnType<typeof buildPairing>;
  context: McpToolContext;
}

function asBigInt(value: string | number | bigint, name: string): bigint {
  try {
    const result = BigInt(value);
    if (result < 0n) throw new Error("negative");
    return result;
  } catch {
    throw new McpToolError("invalid_number", `${name} must be a non-negative integer`);
  }
}

function asNumber(value: string | number, name: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new McpToolError("invalid_number", `${name} must be a non-negative integer`);
  }
  return result;
}

function jsonResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export async function createRuntime(options: RuntimeOptions): Promise<McpRuntime> {
  const network = options.network ?? process.env.SHADOWPASS_NETWORK ?? "anvil";
  const store = await AgentStore.open({
    name: options.name,
    root: options.root,
    network,
    deployment: network,
  });
  let deployment = options.deployment;
  if (!deployment) {
    try {
      deployment = await loadDeployment(network);
    } catch {
      deployment = undefined;
    }
  }
  const mailboxUrl = process.env.SHADOWPASS_MAILBOX?.trim() || deployment?.mailbox;
  const mailbox = options.mailbox ?? (mailboxUrl ? new MailboxClient(mailboxUrl) : undefined);
  const maxPayment = options.maxPayment ?? asBigInt(process.env.SHADOWPASS_MAX_PAYMENT ?? "10000000", "SHADOWPASS_MAX_PAYMENT");
  const malicious = options.malicious ?? false;
  const rpcUrl = options.rpcUrl ?? process.env.SHADOWPASS_RPC_URL ?? process.env.ANVIL_RPC_URL;
  const chainClient = rpcUrl ? createPublicClient({ transport: http(rpcUrl) }) : undefined;
  const stateRefreshIntervalMs = options.stateRefreshIntervalMs
    ?? asNumber(process.env.SHADOWPASS_STATE_TTL_MS ?? "2000", "SHADOWPASS_STATE_TTL_MS");
  const services: McpServices = { ...options.services };
  const executionQueue = new SerialTaskQueue();
  let context!: McpToolContext;
  if (!services.payment && deployment) {
    services.payment = createShadowpassPaymentService({
      store,
      deployment,
      state: () => context.state,
      maxPayment,
      queue: executionQueue,
      blockTimestamp: chainClient
        ? async () => (await chainClient.getBlock({ blockTag: "latest" })).timestamp
        : async () => { throw new PaymentBuilderError("rpc_unavailable"); },
    });
  }
  if (!services.treasury && deployment) {
    services.treasury = createShadowpassTreasuryService({
      store,
      deployment,
      state: () => context.state,
      maxPayment,
      rpcUrl,
      queue: executionQueue,
    });
  }
  context = {
    store,
    state: options.state,
    deploymentName: network,
    chainId: deployment?.chainId ?? 0,
    services,
    mailbox,
    malicious,
    maxPayment,
    nowSeconds: options.nowSeconds,
    treasuryVaults: deployment ? [deployment.vault] : [],
  };
  return {
    store,
    deployment,
    state: options.state,
    mailbox,
    services,
    malicious,
    maxPayment,
    nowSeconds: options.nowSeconds,
    rpcUrl,
    refreshState: options.refreshState,
    chainClient,
    stateRefreshIntervalMs,
    pairing: buildPairing(store),
    context,
  };
}

export function createChainLogClient(client: PublicClient): ChainLogClient {
  return {
    getLogs: (args) => client.request({
      method: "eth_getLogs",
      params: [{
        address: args.address,
        fromBlock: toHex(args.fromBlock),
        toBlock: args.toBlock === undefined ? "latest" : toHex(args.toBlock),
        topics: args.topics?.map((topic) => Array.isArray(topic) ? [...topic] : topic),
      }],
    }) as Promise<any[]>,
    getBlockNumber: () => client.getBlockNumber(),
  };
}

async function syncState(client: PublicClient, deployment: Deployment): Promise<ChainState> {
  return ChainState.sync(createChainLogClient(client), deployment);
}

async function syncInbox(runtime: McpRuntime): Promise<void> {
  if (!runtime.mailbox || !runtime.deployment || !runtime.context.state) return;
  try {
    const result = await new CredentialInbox({
      mailbox: runtime.mailbox,
      store: runtime.store,
      state: runtime.context.state,
      deploymentName: runtime.store.deployment,
      chainId: runtime.deployment.chainId,
    }).sync();
    if (result.accepted || result.rejected) {
      process.stderr.write(`[shadowpass] mailbox sync accepted=${result.accepted} rejected=${result.rejected}\n`);
    }
  } catch {
    process.stderr.write("[shadowpass] mailbox sync failed\n");
  }
}

async function refreshRuntimeOnce(runtime: McpRuntime): Promise<void> {
  const now = Date.now();
  const stale = runtime.lastStateRefreshAt === undefined
    || now - runtime.lastStateRefreshAt >= runtime.stateRefreshIntervalMs;
  if (stale && (runtime.refreshState || runtime.chainClient && runtime.deployment)) {
    try {
      if (runtime.refreshState) runtime.state = await runtime.refreshState();
      else if (runtime.state) await runtime.state.update();
      else runtime.state = await syncState(runtime.chainClient!, runtime.deployment!);
      runtime.context.state = runtime.state;
      runtime.lastStateRefreshAt = Date.now();
    } catch {
      process.stderr.write("[shadowpass] chain state unavailable\n");
      if (!runtime.context.state) return;
    }
  }
  if (!runtime.context.state) return;

  try {
    const reconciliation = await reconcileNotes(runtime.store, runtime.context.state);
    if (reconciliation.added) process.stderr.write(`[shadowpass] recovered notes=${reconciliation.added}\n`);
    for (const warning of reconciliation.warnings) process.stderr.write(`[shadowpass] note warning=${warning}\n`);
  } catch {
    process.stderr.write("[shadowpass] note reconciliation failed\n");
  }
  await syncInbox(runtime);
}

export function refreshRuntime(runtime: McpRuntime): Promise<void> {
  if (runtime.refreshPromise) return runtime.refreshPromise;
  runtime.refreshPromise = (async () => {
    try {
      await refreshRuntimeOnce(runtime);
    } finally {
      runtime.refreshPromise = undefined;
    }
  })();
  return runtime.refreshPromise;
}

export function createMcpServer(runtime: McpRuntime): McpServer {
  const server = new McpServer({ name: "shadowpass-mcp", version: "0.1.0" });
  const tool = (name: string, config: { description: string; inputSchema?: any }, handler: (args: any) => Promise<unknown>) => {
    server.registerTool(name, config, async (args: any) => {
      try {
        await refreshRuntime(runtime);
        return jsonResult(await handler(args));
      } catch (error) {
        const code = error instanceof McpToolError ? error.code : "tool_error";
        const message = error instanceof McpToolError ? error.message : "tool_execution_failed";
        return { ...jsonResult({ error: code, message }), isError: true };
      }
    });
  };

  tool("wallet_status", {
    description: "Show the local agent authorization, capabilities, budget and revocation status.",
  }, async () => walletStatus(runtime.context));
  tool("list_receipts", {
    description: "List locally recorded payment receipts, including receipts that were not delivered to the owner.",
  }, async () => listReceipts(runtime.context));
  tool("pay", {
    description: "Pay an x402 resource within the local spend limit. Requires PAY capability.",
    inputSchema: { url: z.string().url(), maxAmount: z.string().regex(/^[0-9]+$/) },
  }, async (args) => pay(runtime.context, { url: args.url, maxAmount: asBigInt(args.maxAmount, "maxAmount") }));
  tool("treasury_supply", {
    description: "Supply treasury budget to a whitelisted vault. Requires TREASURY capability.",
    inputSchema: {
      vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      amount: z.string().regex(/^[0-9]+$/),
      termSeconds: z.string().regex(/^[0-9]+$/),
    },
  }, async (args) => treasurySupply(runtime.context, {
    vault: args.vault,
    amount: asBigInt(args.amount, "amount"),
    termSeconds: asBigInt(args.termSeconds, "termSeconds"),
  }));
  tool("treasury_status", {
    description: "Show configured treasury positions.",
  }, async () => treasuryStatus(runtime.context));
  tool("treasury_withdraw", {
    description: "Withdraw a matured treasury position. Requires TREASURY capability.",
    inputSchema: { positionId: z.string().regex(/^[1-9][0-9]*$/) },
  }, async (args) => treasuryWithdraw(runtime.context, asBigInt(args.positionId, "positionId")));
  tool("delegate", {
    description: "Create a delegated child agent. Requires a delegation backend.",
    inputSchema: {
      name: z.string().min(1),
      cap: z.string().regex(/^[0-9]+$/),
      expiry: z.string().regex(/^[0-9]+$/),
      amount: z.string().regex(/^[0-9]+$/),
    },
  }, async (args) => delegate(runtime.context, {
    name: args.name,
    cap: asBigInt(args.cap, "cap"),
    expiry: asBigInt(args.expiry, "expiry"),
    amount: asBigInt(args.amount, "amount"),
  }));
  return server;
}

export interface RunOptions extends RuntimeOptions {
  noQr?: boolean;
  printPairing?: boolean;
  newPairing?: boolean;
}

export async function runServer(options: RunOptions): Promise<void> {
  const runtime = await createRuntime(options);
  if (options.newPairing) await runtime.store.rotatePairing();
  runtime.pairing = buildPairing(runtime.store);
  process.stderr.write(`[shadowpass] agent=${runtime.store.name} dir=${runtime.store.paths.directory}\n`);
  if (!runtime.store.isPaired) {
    process.stderr.write(`[shadowpass] pairing code: ${runtime.pairing.code}\n`);
    process.stderr.write(`[shadowpass] pairing url: ${runtime.pairing.url}\n`);
    if (!options.noQr) {
      qrcode.generate(runtime.pairing.url, { small: true }, (qr) => process.stderr.write(`${qr}\n`));
    }
  }
  if (options.printPairing) return;

  const server = createMcpServer(runtime);
  await server.connect(new StdioServerTransport());
  void refreshRuntime(runtime);
}

function parseArgs(argv: string[]): RunOptions {
  let name = process.env.SHADOWPASS_AGENT_NAME ?? "default";
  let root: string | undefined;
  let network = process.env.SHADOWPASS_NETWORK ?? "anvil";
  let rpcUrl: string | undefined;
  let malicious = false;
  let noQr = false;
  let printPairing = false;
  let newPairing = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--name") name = argv[++index] ?? name;
    else if (argument === "--home") root = argv[++index];
    else if (argument === "--network") network = argv[++index] ?? network;
    else if (argument === "--rpc") rpcUrl = argv[++index];
    else if (argument === "--malicious") malicious = true;
    else if (argument === "--no-qr") noQr = true;
    else if (argument === "--print-pairing") printPairing = true;
    else if (argument === "--new-pairing") newPairing = true;
    else if (argument === "--help") {
      process.stderr.write("usage: shadowpass-mcp [--name <name>] [--home <dir>] [--network <network>] [--rpc <url>] [--malicious] [--no-qr] [--print-pairing] [--new-pairing]\n");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return { name, root, network, rpcUrl, malicious, noQr, printPairing, newPairing };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  await runServer(parseArgs(argv));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[shadowpass] fatal: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
