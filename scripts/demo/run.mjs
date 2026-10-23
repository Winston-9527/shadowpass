#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createPublicClient, http } from "viem";
import { loadDeployment } from "@shadowpass/sdk";
import { createMerchantApp } from "@shadowpass/merchant-demo";
import { startFacilitator } from "@shadowpass/facilitator";
import { ensureDemoArtifacts } from "./artifacts.mjs";
import { DemoEngine } from "./engine.mjs";
import { createDemoApp, defaultPublicDir } from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const runtimeDir = path.join(here, ".runtime");
const e2e = process.argv.includes("--e2e");
const RPC_PORT = Number(process.env.ANVIL_PORT ?? 8545);
const RPC_URL = process.env.ANVIL_RPC_URL ?? `http://127.0.0.1:${RPC_PORT}`;
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const FACILITATOR_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const MERCHANT_PAY_TO = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
let anvil;
let facilitatorServer;
let merchantServer;
let demoServer;
let closing = false;

function log(message) {
  console.log(`[demo] ${message}`);
}

function commandExists(command) {
  return spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function run(command, args, options = {}) {
  log(`运行 ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}`);
}

async function ensureDependencies() {
  for (const command of ["node", "npm", "anvil", "cast", "forge", "jq", "circom"]) {
    if (!commandExists(command)) throw new Error(`missing required command: ${command}`);
  }
  if (!fs.existsSync(path.join(root, "node_modules"))) run("npm", ["install"]);
}

async function ensureAnvil() {
  const client = createPublicClient({ transport: http(RPC_URL) });
  try {
    const chainId = await client.getChainId();
    if (chainId !== 31337) throw new Error(`existing RPC is chain ${chainId}, expected 31337`);
    log(`复用 Anvil ${RPC_URL}`);
    return;
  } catch (error) {
    if (String(error).includes("expected 31337")) throw error;
  }

  log(`启动 Anvil ${RPC_URL}`);
  anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", String(RPC_PORT), "--silent"], {
    cwd: root,
    stdio: ["ignore", fs.openSync(path.join(root, ".anvil.log"), "a"), fs.openSync(path.join(root, ".anvil.log"), "a")],
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if (await client.getChainId() === 31337) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Anvil did not become ready; see .anvil.log");
}

function snapshotFile(file) {
  return fs.existsSync(file) ? fs.readFileSync(file) : undefined;
}

function restoreFile(file, bytes) {
  if (bytes === undefined) fs.rmSync(file, { force: true });
  else fs.writeFileSync(file, bytes);
}

async function deploy(artifacts) {
  const deploymentFile = path.join(root, "deployments", "anvil.json");
  const deploymentSnapshot = snapshotFile(deploymentFile);
  const contractSourceDir = path.join(root, "contracts", "src");
  const verifierFiles = artifacts.verifierOverridesDir
    ? fs.readdirSync(artifacts.verifierOverridesDir).filter((name) => name.endsWith(".sol"))
    : [];
  const verifierSnapshots = artifacts.verifierOverridesDir
    ? new Map(verifierFiles.map((name) => [name, snapshotFile(path.join(contractSourceDir, name))]))
    : undefined;

  try {
    if (artifacts.verifierOverridesDir) {
      for (const name of verifierFiles) {
        fs.copyFileSync(path.join(artifacts.verifierOverridesDir, name), path.join(contractSourceDir, name));
      }
    }
    run("bash", ["scripts/dev-chain.sh"], {
      env: { ANVIL_PORT: String(RPC_PORT), KEEP_ANVIL: "0", DEPLOYER_PK },
    });
    const deployment = await loadDeployment(JSON.parse(fs.readFileSync(deploymentFile, "utf8")));
    fs.writeFileSync(path.join(runtimeDir, "deployment.json"), JSON.stringify(deployment, null, 2));
    return deployment;
  } finally {
    restoreFile(deploymentFile, deploymentSnapshot);
    if (verifierSnapshots) {
      for (const [name, bytes] of verifierSnapshots) restoreFile(path.join(contractSourceDir, name), bytes);
    }
  }
}

async function listen(app, port, host = "127.0.0.1") {
  const server = app.listen(port, host);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind server");
  return { server, url: `http://${host}:${address.port}` };
}

async function startServices(deployment) {
  const facilitatorPort = e2e ? 0 : Number(process.env.SHADOWPASS_FACILITATOR_PORT ?? 4022);
  const facilitator = await startFacilitator({
    rpcUrl: RPC_URL,
    privateKey: FACILITATOR_PK,
    deployment,
    port: facilitatorPort,
    relayRateLimit: { perMinute: 500, faucetPerDay: 200, trustProxyHeaders: false },
    paymentRateLimit: { perMinute: 500 },
    merchantRateLimit: { limit: 500, windowMs: 60_000 },
  });
  facilitatorServer = facilitator.server;
  const facilitatorAddress = facilitatorServer.address();
  if (!facilitatorAddress || typeof facilitatorAddress === "string") throw new Error("facilitator bind failed");
  const facilitatorUrl = `http://127.0.0.1:${facilitatorAddress.port}`;

  const merchant = createMerchantApp({
    facilitatorUrl,
    deployment,
    asset: deployment.token,
    merchantPayTo: MERCHANT_PAY_TO,
  });
  await merchant.ready;
  const merchantPort = e2e ? 0 : Number(process.env.SHADOWPASS_MERCHANT_PORT ?? 4021);
  const listener = await listen(merchant.app, merchantPort);
  merchantServer = listener.server;
  return { facilitatorUrl, merchantUrl: listener.url };
}

async function startDemo(engine) {
  const app = createDemoApp({ engine, publicDir: defaultPublicDir(import.meta.url) });
  const port = e2e ? 0 : Number(process.env.SHADOWPASS_DEMO_PORT ?? 4179);
  const listener = await listen(app, port);
  demoServer = listener.server;
  return listener.url;
}

async function runE2e(url) {
  const status = await fetch(`${url}/api/status`).then((response) => response.json());
  if (status.simulated !== true || status.anonymity.simulatedDepositors !== 20) {
    throw new Error("simulated anonymity set was not prepared");
  }
  if (status.anonymity.noteSetSize < 25) throw new Error("note anonymity set is too small");

  const purchase = await post(url, "/api/actions/purchase");
  if (!purchase.record.tx) throw new Error("purchase did not settle on-chain");
  const treasury = await post(url, "/api/actions/treasury");
  if (!treasury.record.tx) throw new Error("treasury supply did not settle on-chain");
  const withdraw = await post(url, "/api/actions/treasury-withdraw");
  if (!withdraw.record.tx) throw new Error("treasury withdrawal did not settle on-chain");

  const finalStatus = await fetch(`${url}/api/status`).then((response) => response.json());
  if (!finalStatus.position?.withdrawn) throw new Error("treasury position is not withdrawn");
  const capability = await post(url, "/api/capability-check", { branch: "buyer", operation: "treasury" });
  if (capability.allowed !== false) throw new Error("capability isolation was not enforced");

  console.log(JSON.stringify({
    result: "ok",
    simulatedDepositors: status.anonymity.simulatedDepositors,
    initialNoteSetSize: status.anonymity.noteSetSize,
    purchase: { tx: purchase.record.tx, proofMs: purchase.record.proofMs, ownerView: purchase.record.ownerView },
    treasury: { tx: treasury.record.tx, proofMs: treasury.record.proofMs, ownerView: treasury.record.ownerView },
    withdraw: { tx: withdraw.record.tx, amount: withdraw.record.amount },
    finalNoteSetSize: finalStatus.anonymity.noteSetSize,
    capabilityCheck: capability.reason,
  }, null, 2));
}

async function post(baseUrl, route, body = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: ${result.message ?? result.error ?? response.status}`);
  return result;
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
    setTimeout(resolve, 1_000).unref();
  });
}

async function closeChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function shutdown(exitCode = 0) {
  if (closing) return;
  closing = true;
  await Promise.all([closeServer(demoServer), closeServer(merchantServer), closeServer(facilitatorServer)]);
  await closeChild(anvil);
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

try {
  fs.mkdirSync(runtimeDir, { recursive: true });
  await ensureDependencies();
  const artifacts = await ensureDemoArtifacts(root);
  await ensureAnvil();
  const deployment = await deploy(artifacts);
  const services = await startServices(deployment);
  const engine = new DemoEngine({
    root,
    deployment,
    rpcUrl: RPC_URL,
    artifactDir: artifacts.dir,
    manifestHashes: artifacts.manifestHashes,
    merchantUrl: services.merchantUrl,
    facilitatorUrl: services.facilitatorUrl,
    merchantPayTo: MERCHANT_PAY_TO,
    deployerPrivateKey: DEPLOYER_PK,
  });
  log("准备 20 个模拟存款与 Alice 双分支预算");
  await engine.prepare();
  const url = await startDemo(engine);
  log(`演示面板 ${url}`);
  log(`Gate ${deployment.gate}`);
  if (e2e) {
    await runE2e(url);
    await shutdown(0);
  } else {
    console.log("\n按 Ctrl-C 结束本地链与演示服务。\n");
  }
} catch (error) {
  console.error(error);
  await shutdown(1);
}
