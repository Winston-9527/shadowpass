#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const cli = require.resolve("tsx/cli");
const server = fileURLToPath(new URL("../src/server.ts", import.meta.url));
const child = spawn(process.execPath, [cli, server, ...process.argv.slice(2)], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
child.on("exit", (code, signal) => {
  const signalExitCode = signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1;
  process.exit(code ?? signalExitCode);
});
