import { createMailboxApp } from "./app.js";
import { SqliteMailboxStore } from "./sqlite-store.js";
import type { MailboxStore } from "./types.js";
import { upstashEnv, UpstashMailboxStore } from "./upstash-store.js";
import type { TrustedProxyHeader } from "./server.js";

export interface MailboxRuntimeOptions {
  requireRemote?: boolean;
  defaultTrustedProxyHeader?: TrustedProxyHeader;
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function trustedProxyHeader(
  env: NodeJS.ProcessEnv,
  fallback?: TrustedProxyHeader,
): TrustedProxyHeader | undefined {
  const value = (env.MAILBOX_TRUSTED_PROXY_HEADER || fallback) as TrustedProxyHeader | undefined;
  if (
    value !== undefined &&
    !["x-real-ip", "cf-connecting-ip"].includes(value)
  ) {
    throw new Error("MAILBOX_TRUSTED_PROXY_HEADER must be x-real-ip or cf-connecting-ip");
  }
  return value;
}

export function createMailboxRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options: MailboxRuntimeOptions = {},
) {
  const remote = upstashEnv(env);
  if (options.requireRemote === true && remote === null) {
    throw new Error("serverless mailbox requires MAILBOX_KV_URL and MAILBOX_KV_TOKEN");
  }
  const maxMessageBytes = Math.min(16 * 1024, positiveInteger(env, "MAILBOX_MAX_MESSAGE_BYTES", 16 * 1024));
  const maxBatchSize = Math.min(200, positiveInteger(env, "MAILBOX_MAX_BATCH_SIZE", 200));
  const storeOptions = {
    maxMessages: Math.min(1_000, positiveInteger(env, "MAILBOX_MAX_PER_BOX", 1_000)),
    retentionMs: Math.min(
      30 * 24 * 60 * 60 * 1_000,
      positiveInteger(env, "MAILBOX_RETENTION_MS", 30 * 24 * 60 * 60 * 1_000),
    ),
  };
  const store: MailboxStore = remote
    ? new UpstashMailboxStore(remote.url, remote.token, fetch, storeOptions)
    : new SqliteMailboxStore(env.MAILBOX_DB_PATH ?? ".mailbox.sqlite", storeOptions);
  const logger = {
    info(entry: Record<string, unknown>) {
      console.log(JSON.stringify(entry));
    },
    error(entry: Record<string, unknown>) {
      console.error(JSON.stringify(entry));
    },
  };
  const app = createMailboxApp({
    store,
    maxMessageBytes,
    maxBatchSize,
    postLimit: positiveInteger(env, "MAILBOX_RATE_LIMIT_POST", 30),
    getLimit: positiveInteger(env, "MAILBOX_RATE_LIMIT_GET", 120),
    rateWindowMs: positiveInteger(env, "MAILBOX_RATE_WINDOW_MS", 60_000),
    corsOrigin: env.MAILBOX_CORS_ORIGIN ?? "*",
    logger: env.MAILBOX_LOG_REQUESTS === "1" ? logger : undefined,
  });
  return {
    app,
    store,
    logger,
    maxRequestBodyBytes: Math.ceil(maxMessageBytes * 1.5) + 2048,
    trustedProxyHeader: trustedProxyHeader(env, options.defaultTrustedProxyHeader),
  };
}
