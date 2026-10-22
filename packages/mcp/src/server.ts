#!/usr/bin/env -S node --import tsx
import { createPublicClient, http } from "viem";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChainState,
  loadDeployment,
  MailboxClient,
} from "@shadowpass/sdk";
import type { Deployment } from "@shadowpass/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import qrcode from "qrcode-terminal";
import { z } from "zod";
import { CredentialInbox } from "./inbox.js";
import { buildPairing } from "./pairing.js";
import { AgentStore } from "./store.js";
import {
  delegate,
  listReceipts,
  pay,
  treasuryStatus,
  treasurySupply,
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
  const mailbox = options.mailbox ?? (deployment?.mailbox ? new MailboxClient(deployment.mailbox) : undefined);
  const services = options.services ?? {};
  const maxPayment = options.maxPayment ?? asBigInt(process.env.SHADOWPASS_MAX_PAYMENT ?? "10000000", "SHADOWPASS_MAX_PAYMENT");
  const malicious = options.malicious ?? false;
  const context: McpToolContext = {
    store,
    state: options.state,
    deploymentName: network,
    chainId: deployment?.chainId ?? 0,
    services,
    mailbox,
    malicious,
    maxPayment,
    nowSeconds: options.nowSeconds,
  };
  return { store, deployment, state: options.state, mailbox, services, malicious, maxPayment, nowSeconds: options.nowSeconds, pairing: buildPairing(store), context };
}

async function syncState(deployment: Deployment, rpcUrl: string): Promise<ChainState> {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return ChainState.sync({
    getLogs: (args) => client.getLogs(args as any),
    getBlockNumber: () => client.getBlockNumber(),
  }, deployment);
}

async function syncInbox(runtime: McpRuntime): Promise<void> {
  if (!runtime.mailbox || !runtime.deployment) return;
  try {
    const result = await new CredentialInbox({
      mailbox: runtime.mailbox,
      store: runtime.store,
      state: runtime.state,
      deploymentName: runtime.store.deployment,
      chainId: runtime.deployment.chainId,
    }).sync();
    if (result.accepted || result.rejected) {
      process.stderr.write(`[shadowpass] mailbox sync accepted=${result.accepted} rejected=${result.rejected}\n`);
    }
  } catch (error) {
    process.stderr.write(`[shadowpass] mailbox sync skipped: ${String(error)}\n`);
  }
}

async function refreshRuntime(runtime: McpRuntime, options: RunOptions): Promise<void> {
  if (!runtime.state && runtime.deployment) {
    const rpcUrl = options.rpcUrl ?? process.env.SHADOWPASS_RPC_URL ?? process.env.ANVIL_RPC_URL;
    if (rpcUrl) {
      try {
        runtime.state = await syncState(runtime.deployment, rpcUrl);
        runtime.context.state = runtime.state;
      } catch (error) {
        process.stderr.write(`[shadowpass] chain sync skipped: ${String(error)}\n`);
      }
    }
  }
  await syncInbox(runtime);
}

export function createMcpServer(runtime: McpRuntime): McpServer {
  const server = new McpServer({ name: "shadowpass-mcp", version: "0.1.0" });
  const tool = (name: string, config: { description: string; inputSchema?: any }, handler: (args: any) => Promise<unknown>) => {
    server.registerTool(name, config, async (args: any) => {
      try {
        return jsonResult(await handler(args));
      } catch (error) {
        const code = error instanceof McpToolError ? error.code : "tool_error";
        const message = error instanceof Error ? error.message : String(error);
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
  rpcUrl?: string;
}

export async function runServer(options: RunOptions): Promise<void> {
  const runtime = await createRuntime(options);
  process.stderr.write(`[shadowpass] agent=${runtime.store.name} dir=${runtime.store.paths.directory}\n`);
  process.stderr.write(`[shadowpass] pairing code: ${runtime.pairing.code}\n`);
  process.stderr.write(`[shadowpass] pairing url: ${runtime.pairing.url}\n`);
  if (!options.noQr) {
    qrcode.generate(runtime.pairing.url, { small: true }, (qr) => process.stderr.write(`${qr}\n`));
  }
  if (options.printPairing) return;

  const server = createMcpServer(runtime);
  await server.connect(new StdioServerTransport());
  void refreshRuntime(runtime, options);
}

function parseArgs(argv: string[]): RunOptions {
  let name = process.env.SHADOWPASS_AGENT_NAME ?? "default";
  let root: string | undefined;
  let network = process.env.SHADOWPASS_NETWORK ?? "anvil";
  let rpcUrl: string | undefined;
  let malicious = false;
  let noQr = false;
  let printPairing = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--name") name = argv[++index] ?? name;
    else if (argument === "--home") root = argv[++index];
    else if (argument === "--network") network = argv[++index] ?? network;
    else if (argument === "--rpc") rpcUrl = argv[++index];
    else if (argument === "--malicious") malicious = true;
    else if (argument === "--no-qr") noQr = true;
    else if (argument === "--print-pairing") printPairing = true;
    else if (argument === "--help") {
      process.stderr.write("usage: shadowpass-mcp [--name <name>] [--home <dir>] [--network <network>] [--rpc <url>] [--malicious] [--no-qr] [--print-pairing]\n");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return { name, root, network, rpcUrl, malicious, noQr, printPairing };
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
