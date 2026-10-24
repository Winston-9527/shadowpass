#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: path.resolve(here, "../../../.."),
  encoding: "utf8",
}).stdout.trim();
if (!repo) throw new Error("shadowpass-mvp must run inside the ShadowPass repository");

const runtime = path.join(repo, "scripts", "mvp", ".runtime");
const skillState = path.join(runtime, "claude-skill");
const pidFile = path.join(skillState, "up.pid");
const logFile = path.join(skillState, "up.log");
const testLog = path.join(skillState, "test.log");
const deploymentSnapshot = path.join(skillState, "anvil.json.snapshot");
const manifestFile = path.join(runtime, "claude-config.json");
const defaultPtau = path.join(repo, "artifacts", "ptau", "powersOfTau28_hez_final_18.ptau");
const ptau = process.env.SHADOWPASS_PTAU || defaultPtau;
const command = process.argv[2] ?? "help";
const flags = new Set(process.argv.slice(3));

function ensureState() {
  fs.mkdirSync(skillState, { recursive: true, mode: 0o700 });
}

function readPid() {
  if (!fs.existsSync(pidFile)) return undefined;
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readManifest() {
  if (!fs.existsSync(manifestFile)) return undefined;
  return JSON.parse(fs.readFileSync(manifestFile, "utf8"));
}

function checkCommand(name) {
  return spawnSync("sh", ["-c", `command -v ${name}`], { stdio: "ignore" }).status === 0;
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function checkEnvironment() {
  const required = ["node", "npm", "anvil", "cast", "forge", "circom", "jq", "git"];
  const missing = required.filter((name) => !checkCommand(name));
  const ports = { anvil: 8545, facilitator: 4022, mailbox: 8787, merchant: 4021, wallet: 4173 };
  const busy = [];
  for (const [name, port] of Object.entries(ports)) {
    if (!(await portFree(port))) busy.push(`${name}:${port}`);
  }
  return {
    ok: missing.length === 0 && fs.existsSync(ptau) && busy.length === 0,
    repo,
    ptau: { path: ptau, exists: fs.existsSync(ptau) },
    missingCommands: missing,
    busyPorts: busy,
    hint: fs.existsSync(ptau)
      ? undefined
      : "Set SHADOWPASS_PTAU to powersOfTau28_hez_final_18.ptau or place it under artifacts/ptau/.",
  };
}

async function waitReady(timeoutMs = 600_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(manifestFile) && fs.existsSync(logFile) && fs.readFileSync(logFile, "utf8").includes("shadowpass.mvp.ready")) {
      return readManifest();
    }
    if (!alive(readPid())) throw new Error(`MVP exited before ready. See ${logFile}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`MVP did not become ready within ${Math.round(timeoutMs / 1000)} seconds. See ${logFile}`);
}

function printReady(manifest) {
  console.log(JSON.stringify({
    result: "ready",
    wallet: manifest.walletUrl,
    pairings: manifest.pairings,
    merchant: manifest.merchantUrl,
    rpc: manifest.rpcUrl,
    manifest: manifestFile,
    next: "Run `mvp.mjs configure` after user confirmation, then reopen Claude so the MCP tools load.",
  }, null, 2));
}

async function start() {
  const check = await checkEnvironment();
  if (!check.ok) {
    console.log(JSON.stringify(check, null, 2));
    process.exitCode = 1;
    return;
  }
  const existing = readPid();
  if (alive(existing)) {
    const manifest = readManifest();
    console.log(JSON.stringify({ result: "already_running", pid: existing, manifest }, null, 2));
    return;
  }
  fs.rmSync(manifestFile, { force: true });
  ensureState();
  const trackedDeployment = path.join(repo, "deployments", "anvil.json");
  fs.rmSync(deploymentSnapshot, { force: true });
  if (fs.existsSync(trackedDeployment)) fs.copyFileSync(trackedDeployment, deploymentSnapshot);
  const output = fs.openSync(logFile, "w");
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/mvp/run.mjs"], {
    cwd: repo,
    detached: true,
    stdio: ["ignore", output, output],
    env: { ...process.env, SHADOWPASS_PTAU: ptau },
  });
  fs.writeFileSync(pidFile, `${child.pid}\n`, { mode: 0o600 });
  child.unref();
  try {
    const manifest = await waitReady();
    printReady(manifest);
  } catch (error) {
    await stop();
    throw error;
  }
}

async function test() {
  const check = await checkEnvironment();
  if (!check.ok) {
    console.log(JSON.stringify(check, null, 2));
    process.exitCode = 1;
    return;
  }
  ensureState();
  const output = fs.openSync(testLog, "w");
  const child = spawn("npm", ["run", "test:mvp"], {
    cwd: repo,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, SHADOWPASS_PTAU: ptau },
  });
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    fs.writeSync(output, chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    fs.writeSync(output, chunk);
  });
  const code = await new Promise((resolve) => child.on("exit", (value) => resolve(value ?? 1)));
  fs.closeSync(output);
  process.exitCode = code;
  if (code === 0) console.log(`\nE2E passed. Complete log: ${testLog}`);
}

async function status() {
  const pid = readPid();
  const manifest = readManifest();
  const running = alive(pid);
  let health;
  if (running && manifest) {
    health = {};
    for (const [name, url] of Object.entries({
      facilitator: `${manifest.facilitatorUrl}/health`,
      merchant: `${manifest.merchantUrl}/health`,
      wallet: manifest.walletUrl,
    })) {
      try {
        const response = await fetch(url);
        health[name] = { status: response.status, ok: response.ok };
      } catch {
        health[name] = { ok: false };
      }
    }
  }
  console.log(JSON.stringify({ running, pid, manifest, health, log: logFile }, null, 2));
}

function claudeMcpExists(name) {
  return spawnSync("claude", ["mcp", "get", name], { cwd: repo, stdio: "ignore" }).status === 0;
}

function configureOne(name, config) {
  if (claudeMcpExists(name)) {
    if (!flags.has("--replace")) {
      throw new Error(`MCP ${name} already exists. Re-run with --replace after user confirmation.`);
    }
    const removed = spawnSync("claude", ["mcp", "remove", name], { cwd: repo, stdio: "inherit" });
    if (removed.status !== 0) throw new Error(`Failed to remove existing MCP ${name}`);
  }
  const args = ["mcp", "add", name];
  for (const [key, value] of Object.entries(config.env)) args.push("--env", `${key}=${value}`);
  args.push("--", config.command, ...config.args);
  const added = spawnSync("claude", args, { cwd: repo, stdio: "inherit" });
  if (added.status !== 0) throw new Error(`Failed to add MCP ${name}`);
}

function configure() {
  const manifest = readManifest();
  if (!manifest) throw new Error("No running MVP manifest. Start the MVP first.");
  if (flags.has("--dry-run")) {
    console.log(JSON.stringify({
      replace: flags.has("--replace"),
      mcp: {
        "shadowpass-buyer": manifest.mcp.buyer,
        "shadowpass-treasury": manifest.mcp.treasury,
      },
    }, null, 2));
    return;
  }
  if (!checkCommand("claude")) throw new Error("Claude Code CLI is not installed");
  configureOne("shadowpass-buyer", manifest.mcp.buyer);
  configureOne("shadowpass-treasury", manifest.mcp.treasury);
  console.log("Configured shadowpass-buyer and shadowpass-treasury. Restart Claude Code to load the MCP tools.");
}

async function stop() {
  const pid = readPid();
  if (!alive(pid)) {
    fs.rmSync(pidFile, { force: true });
    console.log(JSON.stringify({ result: "not_running" }));
    return;
  }
  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 40 && alive(pid); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (alive(pid)) {
    try { process.kill(-pid, "SIGKILL"); } catch { process.kill(pid, "SIGKILL"); }
  }
  const portOwner = spawnSync("lsof", ["-tiTCP:8545", "-sTCP:LISTEN"], { encoding: "utf8" }).stdout.trim();
  for (const value of portOwner.split(/\s+/).filter(Boolean)) {
    try { process.kill(Number(value), "SIGTERM"); } catch {}
  }
  const trackedDeployment = path.join(repo, "deployments", "anvil.json");
  if (fs.existsSync(deploymentSnapshot)) {
    fs.copyFileSync(deploymentSnapshot, trackedDeployment);
    fs.rmSync(deploymentSnapshot, { force: true });
  }
  fs.rmSync(pidFile, { force: true });
  console.log(JSON.stringify({ result: "stopped", pid }));
}

function logs() {
  if (!fs.existsSync(logFile)) throw new Error("No MVP log yet");
  const lines = fs.readFileSync(logFile, "utf8").split(/\r?\n/);
  console.log(lines.slice(-200).join("\n"));
}

async function main() {
  if (command === "check") console.log(JSON.stringify(await checkEnvironment(), null, 2));
  else if (command === "start") await start();
  else if (command === "test") await test();
  else if (command === "status") await status();
  else if (command === "pairs") {
    const manifest = readManifest();
    if (!manifest) throw new Error("No MVP manifest. Start the MVP first.");
    console.log(JSON.stringify(manifest.pairings, null, 2));
  } else if (command === "configure") configure();
  else if (command === "stop") await stop();
  else if (command === "logs") logs();
  else {
    console.log("Usage: mvp.mjs <check|start|test|status|pairs|configure|stop|logs> [--replace|--dry-run]");
  }
}

await main();
