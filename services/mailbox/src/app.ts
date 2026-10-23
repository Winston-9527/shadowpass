import { Buffer } from "node:buffer";
import { z } from "zod";
import type { MailboxStore } from "./types.js";

const RECIPIENT = /^[0-9a-fA-F]{64}$/;
const BODY_SCHEMA = z.object({ ct: z.string().min(1) }).strict();

export interface MailboxLogger {
  info?(entry: Record<string, unknown>): void;
  error?(entry: Record<string, unknown>): void;
}

export interface MailboxAppOptions {
  store: MailboxStore;
  maxMessageBytes: number;
  maxBatchSize: number;
  postLimit: number;
  getLimit: number;
  rateWindowMs: number;
  corsOrigin?: string;
  logger?: MailboxLogger;
  now?: () => number;
}

export interface MailboxRequestContext {
  ip: string;
}

export type MailboxApp = (request: Request, context: MailboxRequestContext) => Promise<Response>;

function decodeBase64(value: string): Uint8Array | null {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64");
    return bytes.toString("base64") === value ? Uint8Array.from(bytes) : null;
  } catch {
    return null;
  }
}

function json(body: unknown, status: number, corsOrigin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": corsOrigin,
    },
  });
}

function rateHeaders(retryAfterMs: number, corsOrigin: string): HeadersInit {
  return {
    "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
    "access-control-allow-origin": corsOrigin,
  };
}

function isRecipient(value: string): boolean {
  return RECIPIENT.test(value);
}

function decodeRecipient(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return isRecipient(decoded) ? decoded.toLowerCase() : null;
  } catch {
    return null;
  }
}

function isSpw1Envelope(bytes: Uint8Array): boolean {
  if (bytes.length !== 81) return false;
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  return magic === "SPW1" && (bytes[4] === 0 || bytes[4] === 1);
}

export function createMailboxApp(options: MailboxAppOptions): MailboxApp {
  const now = options.now ?? Date.now;
  const corsOrigin = options.corsOrigin ?? "*";

  return async (request, context) => {
    const started = performance.now();
    const url = new URL(request.url);
    const boxMatch = /^\/box\/([^/]+)$/.exec(url.pathname);
    const slotMatch = /^\/slot\/([^/]+)$/.exec(url.pathname);
    const logPath = boxMatch !== null
      ? "/box/:recipient"
      : slotMatch !== null
        ? "/slot/:slot"
        : url.pathname;
    let response: Response;

    const respond = async (): Promise<Response> => {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": corsOrigin,
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers": "content-type",
            "access-control-max-age": "86400",
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true }, 200, corsOrigin);
      }

      if (boxMatch === null && slotMatch === null) return json({ error: "not found" }, 404, corsOrigin);
      const isSlot = slotMatch !== null;
      const decodedId = decodeRecipient((isSlot ? slotMatch[1] : boxMatch?.[1]) ?? "");
      if (decodedId === null) {
        return json({ error: isSlot ? "invalid slot" : "invalid recipient" }, 400, corsOrigin);
      }

      if (request.method === "POST") {
        const limited = await options.store.hitRateLimit(
          `post:${context.ip}`,
          options.postLimit,
          options.rateWindowMs,
          now(),
        );
        if (!limited.allowed) {
          return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
            status: 429,
            headers: {
              "content-type": "application/json; charset=utf-8",
              ...rateHeaders(limited.retryAfterMs, corsOrigin),
            },
          });
        }
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
          return json({ error: "content-type must be application/json" }, 415, corsOrigin);
        }
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > Math.ceil(options.maxMessageBytes * 1.5) + 1024) {
          return json({ error: "request too large" }, 413, corsOrigin);
        }
        const text = await request.text();
        if (Buffer.byteLength(text) > Math.ceil(options.maxMessageBytes * 1.5) + 1024) {
          return json({ error: "request too large" }, 413, corsOrigin);
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return json({ error: "invalid json" }, 400, corsOrigin);
        }
        const body = BODY_SCHEMA.safeParse(parsed);
        if (!body.success) return json({ error: "body must contain ct" }, 400, corsOrigin);
        const bytes = decodeBase64(body.data.ct);
        if (bytes === null) return json({ error: "ct must be canonical base64" }, 400, corsOrigin);
        if (isSlot && !isSpw1Envelope(bytes)) {
          return json({ error: "slot ct must be an 81-byte SPW1 envelope" }, 400, corsOrigin);
        }
        if (!isSlot && bytes.length < 48) {
          return json({ error: "ct is shorter than a sealed box" }, 400, corsOrigin);
        }
        if (!isSlot && bytes.length > options.maxMessageBytes) {
          return json({ error: "ct exceeds size limit" }, 413, corsOrigin);
        }
        const id = isSlot
          ? await options.store.appendSlot(decodedId, body.data.ct, now())
          : await options.store.append(decodedId, body.data.ct, now());
        if (id === null) return json({ error: "slot is full" }, 409, corsOrigin);
        return json({ id }, 201, corsOrigin);
      }

      if (request.method === "GET") {
        const limited = await options.store.hitRateLimit(
          `get:${context.ip}`,
          options.getLimit,
          options.rateWindowMs,
          now(),
        );
        if (!limited.allowed) {
          return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
            status: 429,
            headers: {
              "content-type": "application/json; charset=utf-8",
              ...rateHeaders(limited.retryAfterMs, corsOrigin),
            },
          });
        }
        const rawAfter = url.searchParams.get("after") ?? "0";
        if (!/^\d+$/.test(rawAfter)) return json({ error: "after must be a non-negative integer" }, 400, corsOrigin);
        const after = Number(rawAfter);
        if (!Number.isSafeInteger(after)) return json({ error: "after is too large" }, 400, corsOrigin);
        return json(
          isSlot
            ? await options.store.listSlot(decodedId, after, options.maxBatchSize)
            : await options.store.list(decodedId, after, options.maxBatchSize),
          200,
          corsOrigin,
        );
      }

      return json({ error: "method not allowed" }, 405, corsOrigin);
    };

    try {
      response = await respond();
    } catch (error) {
      options.logger?.error?.({
        event: "mailbox_request_error",
        method: request.method,
        path: logPath,
        error: error instanceof Error ? error.message : String(error),
      });
      response = json({ error: "internal error" }, 500, corsOrigin);
    }
    options.logger?.info?.({
      event: "mailbox_request",
      method: request.method,
      path: logPath,
      status: response.status,
      durationMs: +(performance.now() - started).toFixed(1),
      ip: context.ip,
    });
    return response;
  };
}
