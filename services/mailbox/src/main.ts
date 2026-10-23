import { createMailboxServer } from "./server.js";
import { createMailboxRuntime } from "./runtime.js";
import { upstashEnv } from "./upstash-store.js";

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const port = positiveInteger("MAILBOX_PORT", 8787);
if (port > 65_535) throw new Error("MAILBOX_PORT must be <= 65535");
const host = process.env.MAILBOX_HOST ?? "127.0.0.1";
const runtime = createMailboxRuntime();
const server = createMailboxServer(runtime);

server.listen(port, host, () => {
  runtime.logger.info({
    event: "mailbox_listening",
    host,
    port,
    storage: upstashEnv() ? "upstash" : "sqlite",
  });
});

function shutdown(): void {
  server.close(() => {
    runtime.store.close?.();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
