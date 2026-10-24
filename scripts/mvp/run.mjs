#!/usr/bin/env node
import { printClaudeInstructions, startMvp, writeRuntimeManifest } from "./services.mjs";

const e2e = process.argv.includes("--e2e");
const context = await startMvp({ e2e });
let stopping = false;

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  await context.close();
  process.exit(exitCode);
}

process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));

try {
  console.log(JSON.stringify({
    type: "shadowpass.mvp.ready",
    wallet: context.walletUrl,
    rpc: context.rpcUrl,
    facilitator: context.facilitatorUrl,
    mailbox: context.mailboxUrl,
    merchant: context.merchantUrl,
    gate: context.deployment.gate,
    simulatedDepositors: context.simulated.count,
    simulatedDepositRange: {
      min: context.simulated.amounts.reduce((left, right) => left < right ? left : right).toString(),
      max: context.simulated.amounts.reduce((left, right) => left > right ? left : right).toString(),
    },
  }, null, 2));
  writeRuntimeManifest(context);
  printClaudeInstructions(context);

  if (e2e) {
    const { runMvpE2e } = await import("./e2e.mjs");
    const result = await runMvpE2e(context);
    console.log(JSON.stringify(result, null, 2));
    await stop(0);
  } else {
    console.log("\n按 Ctrl-C 停止钱包、MCP 所需服务、Anvil 和本地链。\n");
    await new Promise(() => {});
  }
} catch (error) {
  console.error(error);
  await stop(1);
}
