import type { MailboxEnvelope, MailboxStore, RateLimitResult } from "./types.js";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface UpstashResponse<T> {
  result?: T;
  error?: string;
}

export interface UpstashMailboxStoreOptions {
  maxMessages?: number;
  retentionMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

const MESSAGE_APPEND_SCRIPT = `
local id = redis.call("INCR", KEYS[1])
local payloadKey = ARGV[2] .. id
redis.call("SET", payloadKey, ARGV[1], "PX", ARGV[6])
redis.call("ZADD", KEYS[2], id, id)
redis.call("ZADD", KEYS[3], ARGV[3], id)
local expired = redis.call("ZRANGEBYSCORE", KEYS[3], "-inf", ARGV[4])
for _, oldId in ipairs(expired) do
  redis.call("DEL", ARGV[2] .. oldId)
  redis.call("ZREM", KEYS[2], oldId)
end
redis.call("ZREMRANGEBYSCORE", KEYS[3], "-inf", ARGV[4])
local excess = redis.call("ZCARD", KEYS[2]) - tonumber(ARGV[5])
if excess > 0 then
  local oldest = redis.call("ZRANGE", KEYS[2], 0, excess - 1)
  for _, oldId in ipairs(oldest) do
    redis.call("DEL", ARGV[2] .. oldId)
    redis.call("ZREM", KEYS[3], oldId)
  end
  redis.call("ZREMRANGEBYRANK", KEYS[2], 0, excess - 1)
end
redis.call("PEXPIRE", KEYS[2], ARGV[6])
redis.call("PEXPIRE", KEYS[3], ARGV[6])
return id
`;

const SLOT_APPEND_SCRIPT = `
if redis.call("ZCARD", KEYS[2]) >= 16 then
  return -1
end
local id = redis.call("INCR", KEYS[1])
redis.call("SET", ARGV[2] .. id, ARGV[1])
redis.call("ZADD", KEYS[2], id, id)
return id
`;

const RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return {count, redis.call("PTTL", KEYS[1])}
`;

export class UpstashMailboxStore implements MailboxStore {
  readonly #url: string;
  readonly #token: string;
  readonly #fetch: FetchLike;
  readonly #maxMessages: number;
  readonly #retentionMs: number;
  readonly #timeoutMs: number;
  readonly #now: () => number;

  constructor(
    url: string,
    token: string,
    fetchImpl: FetchLike = fetch,
    options: UpstashMailboxStoreOptions = {},
  ) {
    this.#url = url.replace(/\/+$/, "");
    this.#token = token;
    this.#fetch = fetchImpl;
    this.#maxMessages = Math.min(1_000, options.maxMessages ?? 1_000);
    this.#retentionMs = Math.min(
      30 * 24 * 60 * 60 * 1_000,
      options.retentionMs ?? 30 * 24 * 60 * 60 * 1_000,
    );
    this.#timeoutMs = options.timeoutMs ?? 5_000;
    this.#now = options.now ?? Date.now;
  }

  async #command<T>(command: Array<string | number>): Promise<T> {
    const response = await this.#fetch(this.#url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) throw new Error(`upstash request failed with ${response.status}`);
    const body = (await response.json()) as UpstashResponse<T>;
    if (body.error !== undefined) throw new Error(`upstash: ${body.error}`);
    return body.result as T;
  }

  async append(recipient: string, ct: string, ts: number): Promise<number> {
    return Number(await this.#command<number>([
      "EVAL",
      MESSAGE_APPEND_SCRIPT,
      3,
      `mailbox:id:${recipient}`,
      `mailbox:index:${recipient}`,
      `mailbox:expiry:${recipient}`,
      JSON.stringify({ ct, ts }),
      `mailbox:msg:${recipient}:`,
      ts,
      ts - this.#retentionMs,
      this.#maxMessages,
      this.#retentionMs,
    ]));
  }

  async list(recipient: string, after: number, limit: number): Promise<MailboxEnvelope[]> {
    return await this.#readBox({
      indexKey: `mailbox:index:${recipient}`,
      expiryKey: `mailbox:expiry:${recipient}`,
      payloadPrefix: `mailbox:msg:${recipient}:`,
      after,
      limit,
      cutoff: this.#now() - this.#retentionMs,
    });
  }

  async appendSlot(slot: string, ct: string, ts: number): Promise<number | null> {
    const id = Number(await this.#command<number>([
      "EVAL",
      SLOT_APPEND_SCRIPT,
      2,
      `mailbox:slot:id:${slot}`,
      `mailbox:slot:index:${slot}`,
      JSON.stringify({ ct, ts }),
      `mailbox:slot:msg:${slot}:`,
    ]));
    return id < 1 ? null : id;
  }

  async listSlot(slot: string, after: number, limit: number): Promise<MailboxEnvelope[]> {
    return await this.#readBox({
      indexKey: `mailbox:slot:index:${slot}`,
      payloadPrefix: `mailbox:slot:msg:${slot}:`,
      after,
      limit,
    });
  }

  async #readBox(options: {
    indexKey: string;
    expiryKey?: string;
    payloadPrefix: string;
    after: number;
    limit: number;
    cutoff?: number;
  }): Promise<MailboxEnvelope[]> {
    const ids = await this.#command<string[]>([
      "ZRANGEBYSCORE",
      options.indexKey,
      `(${options.after}`,
      "+inf",
      "LIMIT",
      0,
      options.limit,
    ]);
    if (ids.length === 0) return [];
    const payloadKeys = ids.map((id) => `${options.payloadPrefix}${id}`);
    const values = await this.#command<Array<string | null>>(["MGET", ...payloadKeys]);
    const output: MailboxEnvelope[] = [];
    const stale: number[] = [];
    for (let index = 0; index < ids.length; index += 1) {
      const idText = ids[index] ?? "";
      const id = Number(idText);
      const raw = values[index];
      if (raw === null || raw === undefined) {
        stale.push(index);
        continue;
      }
      let value: { ct?: unknown; ts?: unknown };
      try {
        value = JSON.parse(raw) as { ct?: unknown; ts?: unknown };
      } catch {
        stale.push(index);
        continue;
      }
      const ts = Number(value.ts);
      if (
        !Number.isSafeInteger(id) ||
        typeof value.ct !== "string" ||
        !Number.isSafeInteger(ts) ||
        (options.cutoff !== undefined && ts < options.cutoff)
      ) {
        stale.push(index);
        continue;
      }
      output.push({ id, ct: value.ct, ts });
    }
    if (stale.length > 0) {
      const staleIds = stale.map((index) => ids[index] ?? "").filter(Boolean);
      if (staleIds.length > 0) {
        await this.#command<number>(["ZREM", options.indexKey, ...staleIds]);
        if (options.expiryKey !== undefined) {
          await this.#command<number>(["ZREM", options.expiryKey, ...staleIds]);
        }
        await this.#command<number>([
          "DEL",
          ...staleIds.map((id) => `${options.payloadPrefix}${id}`),
        ]);
      }
    }
    return output;
  }

  async hitRateLimit(
    bucket: string,
    limit: number,
    windowMs: number,
    _now: number,
  ): Promise<RateLimitResult> {
    const key = `mailbox:ratelimit:${bucket}`;
    const [rawCount, rawTtl] = await this.#command<[number, number]>([
      "EVAL",
      RATE_LIMIT_SCRIPT,
      1,
      key,
      windowMs,
    ]);
    const count = Number(rawCount);
    const ttl = Number(rawTtl);
    if (count <= limit) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: Math.max(1, ttl) };
  }
}

export function upstashEnv(env: NodeJS.ProcessEnv = process.env): {
  url: string;
  token: string;
} | null {
  const url = env.MAILBOX_KV_URL ?? env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.MAILBOX_KV_TOKEN ?? env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
