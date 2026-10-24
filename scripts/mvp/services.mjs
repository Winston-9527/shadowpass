import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AgentStore, buildPairing } from "@shadowpass/mcp";
import { createMerchantApp } from "@shadowpass/merchant-demo";
import { createMailboxRuntime, createMailboxServer } from "@shadowpass/mailbox";
import { startFacilitator } from "@shadowpass/facilitator";
import { loadDeployment } from "@shadowpass/sdk";
import { ensureDemoArtifacts, MVP_CIRCUITS } from "../demo/artifacts.mjs";
import { DemoEngine } from "../demo/engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../..");
const RUNTIME_ROOT = path.join(here, ".runtime");
const AGENTS_ROOT = path.join(RUNTIME_ROOT, "agents");
const WALLET_ARTIFACT_VERSION = "circuits-v2";
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const FACILITATOR_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const MERCHANT_PAY_TO = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

function commandExists(command) {
  return spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function run(command, args, env = process.env) {
  console.log(`[mvp] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
}

function ensureDependencies() {
  for (const command of ["node", "npm", "anvil", "cast", "forge", "jq", "circom"]) {
    if (!commandExists(command)) throw new Error(`missing required command: ${command}`);
  }
  if (!fs.existsSync(path.join(ROOT, "node_modules"))) run("npm", ["install"]);
}

function assertPortAvailable(port, name) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error(`invalid ${name} port: ${port}`);
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => {
      reject(new Error(`${name} port ${port} is unavailable: ${error.message}`));
    });
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

async function waitForRpc(url) {
  const client = createPublicClient({ transport: http(url), pollingInterval: 300 });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if (await client.getChainId() === 31337) return client;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Anvil is not ready at ${url}`);
}

async function listen(server, port, host = "127.0.0.1") {
  server.listen(port, host);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind service");
  return `http://${host}:${address.port}`;
}

function snapshot(file) {
  return fs.existsSync(file) ? fs.readFileSync(file) : undefined;
}

function restore(file, bytes) {
  if (bytes === undefined) fs.rmSync(file, { force: true });
  else fs.writeFileSync(file, bytes);
}

function publishWalletArtifacts(artifacts) {
  const destination = path.join(ROOT, "apps", "wallet", "public", "zk", WALLET_ARTIFACT_VERSION);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const circuit of MVP_CIRCUITS) {
    for (const file of [`${circuit}.wasm`, `${circuit}.zkey`, `vk_${circuit}.json`]) {
      fs.copyFileSync(path.join(artifacts.dir, file), path.join(destination, file));
    }
  }
  fs.copyFileSync(path.join(artifacts.dir, "MANIFEST.sha256"), path.join(destination, "MANIFEST.sha256"));
}

async function startWalletPreview({ rpcUrl, mailboxUrl, facilitatorUrl, walletPort }) {
  Object.assign(process.env, {
    VITE_NETWORK: "anvil",
    VITE_RPC_URL: rpcUrl,
    VITE_MAILBOX_URL: mailboxUrl,
    VITE_FACILITATOR_URL: "/facilitator",
    VITE_FACILITATOR_PROXY_TARGET: facilitatorUrl,
    VITE_ARTIFACTS_URL: `/zk/${WALLET_ARTIFACT_VERSION}`,
    VITE_TRUST_LOCAL_ARTIFACTS: "1",
  });
  const { build, preview } = await import("vite");
  const walletRoot = path.join(ROOT, "apps", "wallet");
  const configFile = path.join(walletRoot, "vite.config.ts");
  await build({ root: walletRoot, configFile, mode: "production", logLevel: "silent" });
  const server = await preview({
    root: walletRoot,
    configFile,
    logLevel: "silent",
    preview: { host: "localhost", port: walletPort, strictPort: true },
  });
  return { server, url: `http://localhost:${walletPort}` };
}

export function mcpConfiguration(context, name) {
  const serverPath = path.join(ROOT, "packages", "mcp", "src", "server.ts");
  const malicious = name === "buyer" ? ["--malicious"] : [];
  const args = [
    "--import", "tsx", serverPath,
    "--name", name,
    "--home", context.agentsRoot,
    "--network", "anvil",
    "--rpc", context.rpcUrl,
    "--no-qr",
    ...malicious,
  ];
  const env = {
    SHADOWPASS_NETWORK: "anvil",
    SHADOWPASS_RPC_URL: context.rpcUrl,
    SHADOWPASS_MAILBOX: context.mailboxUrl,
    SHADOWPASS_FACILITATOR: context.facilitatorUrl,
    SHADOWPASS_ARTIFACTS: context.artifacts.dir,
    SHADOWPASS_MAX_PAYMENT: "100000000",
    SHADOWPASS_TRUST_LOCAL_ARTIFACTS: "1",
  };
  return { command: process.execPath, args, env };
}

export function printMcpConfiguration(context) {
  const buyer = mcpConfiguration(context, "buyer");
  const treasury = mcpConfiguration(context, "treasury");
  const claudeCommand = (name, config) => [
    "claude mcp add", `shadowpass-${name}`,
    ...Object.entries(config.env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    "--", config.command, ...config.args.map((value) => JSON.stringify(value)),
  ].join(" ");
  const desktop = {
    mcpServers: {
      "shadowpass-buyer": buyer,
      "shadowpass-treasury": treasury,
    },
  };
  console.log("\nClaude Code:\n");
  console.log(claudeCommand("buyer", buyer));
  console.log(claudeCommand("treasury", treasury));
  console.log("\nClaude Desktop JSON:\n");
  console.log(JSON.stringify(desktop, null, 2));
  console.log("\n本地钱包配对链接:\n");
  console.log(`buyer:    ${context.walletUrl}/pair#${context.pairings.buyer.code}`);
  console.log(`treasury: ${context.walletUrl}/pair#${context.pairings.treasury.code}`);
  console.log("\n配对码:\n");
  console.log(`buyer:    ${context.pairings.buyer.code}`);
  console.log(`treasury: ${context.pairings.treasury.code}`);
}

export async function startMvp({ e2e = false } = {}) {
  ensureDependencies();
  const ports = {
    rpc: Number(process.env.MVP_ANVIL_PORT ?? 8545),
    facilitator: Number(process.env.MVP_FACILITATOR_PORT ?? 4022),
    mailbox: Number(process.env.MVP_MAILBOX_PORT ?? 8787),
    merchant: Number(process.env.MVP_MERCHANT_PORT ?? 4021),
    wallet: Number(process.env.MVP_WALLET_PORT ?? 4173),
  };
  for (const [name, port] of Object.entries(ports)) await assertPortAvailable(port, name);

  fs.mkdirSync(RUNTIME_ROOT, { recursive: true });
  fs.rmSync(AGENTS_ROOT, { recursive: true, force: true });
  fs.mkdirSync(AGENTS_ROOT, { recursive: true, mode: 0o700 });
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(path.join(RUNTIME_ROOT, `mailbox.sqlite${suffix}`), { force: true });
  }

  const facilitatorMetricsToken = crypto.randomUUID();
  const rpcUrl = `http://127.0.0.1:${ports.rpc}`;
  const facilitatorUrl = `http://127.0.0.1:${ports.facilitator}`;
  const mailboxUrl = `http://127.0.0.1:${ports.mailbox}`;
  const merchantUrl = `http://127.0.0.1:${ports.merchant}`;
  const deploymentFile = path.join(ROOT, "deployments", "anvil.json");
  const deploymentSnapshot = snapshot(deploymentFile);
  const contractSourceDir = path.join(ROOT, "contracts", "src");
  const anvilLog = fs.openSync(path.join(RUNTIME_ROOT, "anvil.log"), "a");
  const anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", String(ports.rpc), "--block-time", "1", "--silent"], {
    cwd: ROOT,
    stdio: ["ignore", anvilLog, anvilLog],
  });
  let facilitatorServer;
  let mailboxServer;
  let merchantServer;
  let walletServer;
  let mailboxStore;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.allSettled([
      walletServer ? walletServer.close() : Promise.resolve(),
      new Promise((resolve) => merchantServer?.close(resolve) ?? resolve()),
      new Promise((resolve) => facilitatorServer?.close(resolve) ?? resolve()),
      new Promise((resolve) => mailboxServer?.close(resolve) ?? resolve()),
    ]);
    mailboxStore?.close?.();
    if (anvil.exitCode === null) {
      const exited = once(anvil, "exit");
      anvil.kill("SIGTERM");
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
      if (anvil.exitCode === null) anvil.kill("SIGKILL");
    }
    restore(deploymentFile, deploymentSnapshot);
  };

  try {
    const rpcClient = await waitForRpc(rpcUrl);
    const artifacts = await ensureDemoArtifacts(ROOT, {
      circuits: MVP_CIRCUITS,
      runtimeRoot: RUNTIME_ROOT,
    });
    publishWalletArtifacts(artifacts);
    const verifierNames = fs.readdirSync(artifacts.verifierOverridesDir).filter((name) => name.endsWith(".sol"));
    const verifierSnapshots = new Map(verifierNames.map((name) => [name, snapshot(path.join(contractSourceDir, name))]));
    try {
      for (const name of verifierNames) {
        fs.copyFileSync(path.join(artifacts.verifierOverridesDir, name), path.join(contractSourceDir, name));
      }
      run("bash", ["scripts/dev-chain.sh"], {
        ANVIL_PORT: String(ports.rpc),
        KEEP_ANVIL: "0",
        DEPLOYER_PK,
        SHADOWPASS_FACILITATOR: facilitatorUrl,
        SHADOWPASS_MAILBOX: mailboxUrl,
      });
    } finally {
      for (const [name, bytes] of verifierSnapshots) restore(path.join(contractSourceDir, name), bytes);
    }
    const deployment = await loadDeployment(JSON.parse(fs.readFileSync(deploymentFile, "utf8")));

    const facilitator = await startFacilitator({
      rpcUrl,
      privateKey: FACILITATOR_PK,
      deployment,
      port: ports.facilitator,
      relayRateLimit: { perMinute: 1_000, faucetPerDay: 1_000, trustProxyHeaders: false },
      paymentRateLimit: { perMinute: 1_000 },
      merchantRateLimit: { limit: 1_000, windowMs: 60_000 },
      metricsToken: facilitatorMetricsToken,
    });
    facilitatorServer = facilitator.server;
    const facilitatorAddress = privateKeyToAccount(FACILITATOR_PK).address;

    const mailboxRuntime = createMailboxRuntime({
      ...process.env,
      MAILBOX_DB_PATH: path.join(RUNTIME_ROOT, "mailbox.sqlite"),
      MAILBOX_CORS_ORIGIN: `http://localhost:${ports.wallet}`,
      MAILBOX_RATE_LIMIT_POST: "1000",
      MAILBOX_RATE_LIMIT_GET: "2000",
    });
    mailboxStore = mailboxRuntime.store;
    mailboxServer = createMailboxServer(mailboxRuntime);
    await listen(mailboxServer, ports.mailbox);

    const merchant = createMerchantApp({
      facilitatorUrl,
      deployment,
      asset: deployment.token,
      merchantPayTo: MERCHANT_PAY_TO,
    });
    await merchant.ready;
    merchantServer = merchant.app.listen(ports.merchant, "127.0.0.1");
    await once(merchantServer, "listening");

    const wallet = await startWalletPreview({ rpcUrl, mailboxUrl, facilitatorUrl, walletPort: ports.wallet });
    walletServer = wallet.server;

    const engine = new DemoEngine({
      root: ROOT,
      deployment,
      rpcUrl,
      artifactDir: artifacts.dir,
      manifestHashes: artifacts.manifestHashes,
      merchantUrl,
      facilitatorUrl,
      facilitatorMetricsToken,
      facilitatorAddress,
      merchantPayTo: MERCHANT_PAY_TO,
      deployerPrivateKey: DEPLOYER_PK,
    });
    await engine.initializeArtifacts();
    await engine.sync();
    await engine.createSimulatedDepositors();
    const simulatedAmounts = engine.simulated.map((entry) => entry.q);
    if (engine.simulated.length !== 20) throw new Error("MVP anonymity set must contain 20 simulated deposits");

    const buyerStore = await AgentStore.open({ name: "buyer", root: AGENTS_ROOT, network: "anvil", deployment: "anvil" });
    const treasuryStore = await AgentStore.open({ name: "treasury", root: AGENTS_ROOT, network: "anvil", deployment: "anvil" });
    const pairings = { buyer: buildPairing(buyerStore), treasury: buildPairing(treasuryStore) };
    await rpcClient.getBlockNumber();

    return {
      root: ROOT,
      runtimeRoot: RUNTIME_ROOT,
      agentsRoot: AGENTS_ROOT,
      artifacts,
      deployment,
      rpcUrl,
      facilitatorUrl,
      facilitatorAddress,
      facilitatorMetricsToken,
      mailboxUrl,
      merchantUrl,
      walletUrl: wallet.url,
      ports,
      pairings,
      buyerStore,
      treasuryStore,
      simulated: {
        count: engine.simulated.length,
        amounts: simulatedAmounts,
        transactions: engine.simulated.map((entry) => entry.tx),
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
