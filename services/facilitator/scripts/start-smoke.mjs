import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "start"], {
  cwd,
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    PORT: "0",
    SHADOWPASS_NETWORK: "anvil",
    FACILITATOR_PK: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    RELAY_FAUCET_PER_DAY: "3",
    FACILITATOR_CORS_ORIGINS: "https://wallet.example",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let finished = false;

function stop() {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") child.kill();
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
}

const timeout = setTimeout(() => {
  if (finished) return;
  finished = true;
  stop();
  console.error(output);
  console.error("facilitator start smoke timed out");
  process.exitCode = 1;
}, 20_000);

function inspect(chunk) {
  output += chunk.toString();
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== "shadowpass.facilitator.started" || finished) continue;
    if (event.relayFaucetPerDay !== 3) continue;
    if (!event.corsOrigins?.includes("https://wallet.example")) continue;

    finished = true;
    clearTimeout(timeout);
    fetch(`http://127.0.0.1:${event.port}/health`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`health returned ${response.status}`);
        const body = await response.json();
        if (body.ok !== true) throw new Error("health response was not ok");
        console.log(JSON.stringify({
          result: "ok",
          port: event.port,
          relayFaucetPerDay: event.relayFaucetPerDay,
          corsOrigins: event.corsOrigins,
        }));
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      })
      .finally(stop);
  }
}

child.stdout.on("data", inspect);
child.stderr.on("data", inspect);
child.on("exit", (code) => {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  console.error(output);
  console.error(`facilitator start exited before readiness with code ${code}`);
  process.exitCode = 1;
});
