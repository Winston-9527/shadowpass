#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPublicClient, http, keccak256, toBytes } from "viem";
import {
  AgentStore,
  createChainLogClient,
  walletStatus,
} from "@shadowpass/mcp";
import {
  ChainState,
  decodeShadowEvent,
  loadDeployment,
} from "@shadowpass/sdk";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_AGENTS_ROOT = path.join(ROOT, "scripts", "mvp", ".runtime", "agents");
const DEFAULT_DEPLOYMENT = path.join(ROOT, "deployments", "anvil.json");
const DEFAULT_MANIFEST = path.join(ROOT, "scripts", "mvp", ".runtime", "claude-config.json");
const PAY_METHOD = keccak256(toBytes("shadowpass.PAY")).slice(0, 10);
const TREASURY_METHOD = keccak256(toBytes("shadowpass.TREASURY_SUPPLY")).slice(0, 10);

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  teal: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

export function formatAmount(value) {
  if (value === undefined || value === null) return "--";
  const raw = BigInt(value);
  const whole = raw / 1_000_000n;
  const fraction = String(raw % 1_000_000n).padStart(6, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} USDC`;
}

export function shorten(value, head = 10, tail = 6) {
  if (!value) return "--";
  const text = String(value);
  if (text.length <= head + tail + 1) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function methodLabel(method) {
  if (!method) return "unknown";
  const normalized = String(method).toLowerCase();
  if (normalized === PAY_METHOD.toLowerCase()) return "PAY";
  if (normalized === TREASURY_METHOD.toLowerCase()) return "TREASURY_SUPPLY";
  return shorten(normalized, 6, 4);
}

function capabilityLabel(capability) {
  return capability === "PAY" ? "PAY" : capability === "TREASURY" ? "TREASURY" : capability;
}

function color(enabled, value, style) {
  return enabled ? `${ANSI[style]}${value}${ANSI.reset}` : value;
}

function formatTime(ms) {
  if (!ms) return "--";
  return new Date(ms).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

export function parseArgs(argv) {
  const options = {
    rpc: undefined,
    deployment: DEFAULT_DEPLOYMENT,
    agentsRoot: DEFAULT_AGENTS_ROOT,
    agents: ["buyer", "treasury"],
    last: 12,
    watch: false,
    intervalMs: 3_000,
    json: false,
    color: !process.env.NO_COLOR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--rpc") options.rpc = argv[++index];
    else if (argument === "--deployment") options.deployment = path.resolve(argv[++index]);
    else if (argument === "--agents-root") options.agentsRoot = path.resolve(argv[++index]);
    else if (argument === "--agent") {
      options.agents = String(argv[++index] ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    } else if (argument === "--last") {
      const value = Number(argv[++index]);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error("--last must be a positive integer");
      options.last = value;
    } else if (argument === "--watch") options.watch = true;
    else if (argument === "--interval") {
      const value = Number(argv[++index]);
      if (!Number.isSafeInteger(value) || value < 500) throw new Error("--interval must be at least 500 ms");
      options.intervalMs = value;
    } else if (argument === "--json") options.json = true;
    else if (argument === "--no-color") options.color = false;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.json && options.watch) throw new Error("--json and --watch cannot be used together");
  return options;
}

function printHelp() {
  console.log(`ShadowPass Agent Chain Explorer

Usage:
  npm run explorer:mvp
  npm run explorer:mvp -- --watch
  npm run explorer:mvp -- --agent buyer --last 20
  npm run explorer:mvp -- --json

Options:
  --rpc <url>          Anvil RPC. Defaults to the running MVP manifest or port 8545.
  --deployment <file>  Deployment JSON. Defaults to deployments/anvil.json.
  --agents-root <dir>  Agent store directory. Defaults to scripts/mvp/.runtime/agents.
  --agent <names>      Comma-separated buyer,treasury. Defaults to both.
  --last <count>       Recent executions and events to display. Defaults to 12.
  --watch              Refresh continuously.
  --interval <ms>      Refresh interval. Defaults to 3000.
  --json               Print machine-readable output.
  --no-color           Disable ANSI colors.
`);
}

function resolveRpc(options) {
  if (options.rpc) return options.rpc;
  if (process.env.SHADOWPASS_RPC_URL) return process.env.SHADOWPASS_RPC_URL;
  const manifest = readJson(DEFAULT_MANIFEST);
  if (manifest?.rpcUrl) return manifest.rpcUrl;
  return `http://127.0.0.1:${process.env.MVP_ANVIL_PORT ?? "8545"}`;
}

async function loadDeploymentFile(file) {
  const value = readJson(file);
  if (!value) throw new Error(`deployment file not found or invalid: ${file}`);
  return loadDeployment(value);
}

async function loadAgent({
  name,
  deployment,
  agentsRoot,
  state,
  manifest,
  client,
}) {
  const directory = path.join(agentsRoot, name);
  if (!fs.existsSync(path.join(directory, "agent.json")) || !fs.existsSync(path.join(directory, "secrets.json"))) {
    return { name, status: "missing", error: "Agent store has not been created" };
  }
  try {
    const store = await AgentStore.open({ name, root: agentsRoot, network: "anvil", deployment: "anvil" });
    const bundle = await store.loadBundle();
    const receipts = await store.receipts();
    const treasuryPositions = await store.treasuryPositions();
    const maxPayment = BigInt(
      manifest?.mcp?.[name]?.env?.SHADOWPASS_MAX_PAYMENT
      ?? process.env.SHADOWPASS_MAX_PAYMENT
      ?? "100000000",
    );
    const context = {
      store,
      state,
      deploymentName: "anvil",
      chainId: deployment.chainId,
      services: {},
      mailbox: undefined,
      malicious: name === "buyer",
      maxPayment,
      treasuryVaults: [deployment.vault],
    };
    const status = bundle
      ? await walletStatus(context).catch((error) => ({
          name,
          status: "invalid",
          capabilities: [],
          remainingBudget: "0",
          validationErrors: [error instanceof Error ? error.message : String(error)],
        }))
      : {
          name,
          status: "unpaired",
          capabilities: [],
          remainingBudget: "0",
          validationErrors: [],
        };
    const initialBudget = bundle?.note?.q ? BigInt(bundle.note.q) : 0n;
    return {
      name,
      status: status.status,
      paired: store.isPaired,
      capabilities: (status.capabilities ?? []).map(capabilityLabel),
      initialBudget: initialBudget.toString(),
      remainingBudget: String(status.remainingBudget ?? "0"),
      maxPayment: maxPayment.toString(),
      expiry: status.expiry ? String(status.expiry) : bundle?.chain?.at(-1)?.expiry,
      revoked: Boolean(status.revoked),
      holderFingerprint: shorten(store.holder.Ax.toString(), 8, 6),
      receipts: receipts.length,
      unreported: receipts.filter((receipt) => !receipt.reported).length,
      treasuryPositions: treasuryPositions.length,
      validationErrors: status.validationErrors ?? [],
    };
  } catch (error) {
    return {
      name,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function eventLabel(event) {
  const args = event.args;
  switch (event.name) {
    case "Executed":
      return `${methodLabel(args.method)} · ${formatAmount(args.amount)} · ${shorten(args.target)}`;
    case "OwnerCiphertext":
      return `owner-only audit payload · ${Array.isArray(args.ct) ? args.ct.length : 0} segments`;
    case "NullifierSpent":
      return "anonymous spend marker";
    case "NoteInserted":
      return "anonymous note inserted";
    case "NoteMemo":
      return "encrypted note memo";
    case "Issued":
      return `credential issued · ${shorten(args.certHash)}`;
    case "Registered":
      return "root identity registered";
    case "Replaced":
      return "root identity leaf replaced";
    case "Revoked":
      return `credential revoked · ${shorten(args.entry)}`;
    case "Joined":
      return "identity joined privacy group";
    case "StateRegistered":
      return "state root registered";
    default:
      return event.name;
  }
}

async function buildReport(options) {
  const rpcUrl = resolveRpc(options);
  const deployment = await loadDeploymentFile(options.deployment);
  const manifest = readJson(DEFAULT_MANIFEST);
  const client = createPublicClient({ transport: http(rpcUrl) });
  const latestBlock = await client.getBlockNumber();
  const addresses = [deployment.gate, deployment.registry, deployment.revocations, deployment.group];
  const rawLogs = await client.getLogs({
    address: addresses,
    fromBlock: BigInt(deployment.startBlock),
    toBlock: latestBlock,
  });
  const decoded = rawLogs
    .map((log) => decodeShadowEvent(log))
    .filter(Boolean)
    .sort((left, right) => (
      Number(left.log.blockNumber - right.log.blockNumber)
      || Number(left.log.logIndex - right.log.logIndex)
    ));
  const state = await ChainState.sync(createChainLogClient(client), deployment);
  const agentResults = await Promise.all(options.agents.map((name) => loadAgent({
    name,
    deployment,
    agentsRoot: options.agentsRoot,
    state,
    manifest,
    client,
  })));
  const receiptToAgent = new Map();
  for (const agent of agentResults) {
    if (agent.status === "missing" || agent.status === "error") continue;
    const store = await AgentStore.open({
      name: agent.name,
      root: options.agentsRoot,
      network: "anvil",
      deployment: "anvil",
    });
    for (const receipt of await store.receipts()) {
      receiptToAgent.set(receipt.budgetNf, agent.name);
      receiptToAgent.set(receipt.tx.toLowerCase(), agent.name);
    }
  }

  const ownerPayloads = new Map();
  for (const event of decoded) {
    if (event.name !== "OwnerCiphertext") continue;
    ownerPayloads.set(String(event.args.budgetNf), {
      segments: Array.isArray(event.args.ct) ? event.args.ct.length : 0,
      tx: event.log.transactionHash,
    });
  }

  const executionEvents = decoded.filter((event) => event.name === "Executed").slice(-options.last);
  const executions = [];
  for (const event of executionEvents) {
    const budgetNf = String(event.args.budgetNf);
    const transaction = event.log.transactionHash;
    let executor = null;
    try {
      executor = (await client.getTransaction({ hash: transaction })).from;
    } catch {}
    const agent = receiptToAgent.get(budgetNf)
      ?? receiptToAgent.get(String(transaction).toLowerCase())
      ?? "unidentified";
    executions.push({
      blockNumber: Number(event.log.blockNumber),
      timestamp: new Date().toISOString(),
      transaction,
      executor,
      agent,
      method: String(event.args.method),
      methodLabel: methodLabel(event.args.method),
      amount: String(event.args.amount),
      target: String(event.args.target),
      nullifier: budgetNf,
      ownerCiphertextSegments: ownerPayloads.get(budgetNf)?.segments ?? 0,
    });
  }

  const blockTimes = new Map();
  const recentEvents = decoded.slice(-options.last);
  const blockNumbers = [...new Set(recentEvents.map((event) => String(event.log.blockNumber)))];
  await Promise.all(blockNumbers.map(async (value) => {
    const block = await client.getBlock({ blockNumber: BigInt(value) });
    blockTimes.set(value, Number(block.timestamp) * 1000);
  }));
  for (const execution of executions) {
    const key = String(execution.blockNumber);
    execution.timestamp = blockTimes.get(key) ?? null;
  }

  const events = recentEvents.map((event) => ({
    name: event.name,
    blockNumber: Number(event.log.blockNumber),
    timestamp: blockTimes.get(String(event.log.blockNumber)) ?? null,
    transaction: event.log.transactionHash,
    summary: eventLabel(event),
    agent: ["Executed", "OwnerCiphertext", "NullifierSpent"].includes(event.name)
      ? receiptToAgent.get(String(event.args.budgetNf ?? "")) ?? null
      : null,
  }));

  const uniqueExecutors = [...new Set(executions.map((execution) => execution.executor).filter(Boolean))];
  return {
    generatedAt: new Date().toISOString(),
    rpcUrl,
    deploymentFile: options.deployment,
    latestBlock: Number(latestBlock),
    contracts: {
      gate: deployment.gate,
      payout: deployment.payout,
      treasury: deployment.treasury,
      token: deployment.token,
    },
    anonymity: {
      noteSetSize: state.notes.size,
      identitySetSize: state.group.size,
      executions: decoded.filter((event) => event.name === "Executed").length,
      ownerCiphertexts: decoded.filter((event) => event.name === "OwnerCiphertext").length,
      uniqueExecutors,
      caution: "金额、目标、时间与执行账户仍然公开。当前身份层匿名集受限，匿名强度取决于真实可关联票据集合。",
    },
    agents: agentResults,
    executions,
    events,
  };
}

function renderAgent(agent, colorEnabled) {
  const statusColor = agent.status === "active"
    ? "green"
    : agent.status === "revoked" || agent.status === "error"
      ? "red"
      : "yellow";
  const title = `${agent.name.toUpperCase()}  ${color(colorEnabled, agent.status ?? "unknown", statusColor)}`;
  if (agent.status === "missing" || agent.status === "error") {
    return `${title}\n  ${agent.error ?? "unavailable"}`;
  }
  const expiry = agent.expiry
    ? new Date(Number(agent.expiry) * 1000).toLocaleString("zh-CN", { hour12: false })
    : "--";
  return [
    title,
    `  capabilities   ${agent.capabilities.join(", ") || "--"}`,
    `  card limit     ${formatAmount(agent.initialBudget)}`,
    `  remaining      ${color(colorEnabled, formatAmount(agent.remainingBudget), "green")}`,
    `  per payment    ${formatAmount(agent.maxPayment)}`,
    `  expiry         ${expiry}`,
    `  receipts       ${agent.receipts ?? 0}  unreported=${agent.unreported ?? 0}`,
    `  holder key     ${agent.holderFingerprint ?? "--"}`,
  ].join("\n");
}

function renderReport(report, colorEnabled) {
  const width = 108;
  const rule = "─".repeat(width);
  const output = [];
  output.push(color(colorEnabled, "SHADOWPASS  AGENT CHAIN EXPLORER", "bold"));
  output.push(color(colorEnabled, rule, "gray"));
  output.push(`RPC          ${report.rpcUrl}`);
  output.push(`block        ${report.latestBlock}`);
  output.push(`gate         ${shorten(report.contracts.gate, 12, 8)}`);
  output.push(`payout       ${shorten(report.contracts.payout, 12, 8)}`);
  output.push(`treasury     ${shorten(report.contracts.treasury, 12, 8)}`);
  output.push("");
  output.push(color(colorEnabled, "ANONYMITY / LIMITS", "bold"));
  output.push(`  note anonymity set     ${report.anonymity.noteSetSize}`);
  output.push(`  root identity set      ${color(colorEnabled, report.anonymity.identitySetSize, report.anonymity.identitySetSize > 1 ? "green" : "yellow")}`);
  output.push(`  agent executions       ${report.anonymity.executions}`);
  output.push(`  owner ciphertexts      ${report.anonymity.ownerCiphertexts}`);
  output.push(`  execution accounts     ${report.anonymity.uniqueExecutors.map((item) => shorten(item, 10, 6)).join(", ") || "--"}`);
  output.push(`  ${color(colorEnabled, report.anonymity.caution, "yellow")}`);
  output.push("");
  output.push(color(colorEnabled, "AGENTS", "bold"));
  for (const agent of report.agents) {
    output.push(renderAgent(agent, colorEnabled));
    output.push("");
  }
  output.push(color(colorEnabled, "AGENT CHAIN INTERACTIONS", "bold"));
  output.push("  BLOCK   TIME      AGENT       METHOD               AMOUNT          EXECUTOR          TX              OWNER CT");
  if (report.executions.length === 0) {
    output.push(color(colorEnabled, "  waiting for the first Agent execution", "gray"));
  } else {
    for (const execution of report.executions.slice().reverse()) {
      output.push([
        String(execution.blockNumber).padStart(7),
        formatTime(execution.timestamp).padEnd(9),
        String(execution.agent).padEnd(11),
        String(execution.methodLabel).padEnd(20),
        formatAmount(execution.amount).padEnd(15),
        shorten(execution.executor, 9, 5).padEnd(18),
        shorten(execution.transaction, 9, 5).padEnd(17),
        execution.ownerCiphertextSegments ? `${execution.ownerCiphertextSegments} segments` : "--",
      ].join(" "));
    }
  }
  output.push("");
  output.push(color(colorEnabled, "RECENT CHAIN EVENTS", "bold"));
  for (const event of report.events.slice().reverse()) {
    output.push(`  ${String(event.blockNumber).padStart(6)}  ${formatTime(event.timestamp).padEnd(9)}  ${event.name.padEnd(17)} ${event.summary}`);
  }
  output.push("");
  output.push(color(colorEnabled, "PUBLIC", "teal") + " amount, target, method, time, executor and nullifier");
  output.push(color(colorEnabled, "PRIVATE", "green") + " holder identity, delegation chain and cross-agent relationship");
  output.push(`Inspect a transaction: cast tx <tx> --rpc-url ${report.rpcUrl}`);
  return output.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const run = async () => {
    const report = await buildReport(options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (options.watch) process.stdout.write("\x1b[2J\x1b[H");
    console.log(renderReport(report, options.color));
    if (options.watch) console.log(`\n${color(options.color, `refreshing every ${options.intervalMs} ms · Ctrl-C to stop`, "gray")}`);
  };
  if (!options.watch) {
    await run();
    return;
  }
  while (true) {
    await run();
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`explorer failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
