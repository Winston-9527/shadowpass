#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const child = spawn(process.execPath, ["--import", "tsx", "scripts/demo/run.mjs", "--e2e"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    ANVIL_PORT: process.env.DEMO_E2E_ANVIL_PORT ?? "8555",
  },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
