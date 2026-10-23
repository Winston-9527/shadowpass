import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import { isIP } from "node:net";
import type { MailboxApp, MailboxLogger } from "./app.js";

export type TrustedProxyHeader = "x-real-ip" | "cf-connecting-ip";

export interface MailboxServerOptions {
  app: MailboxApp;
  maxRequestBodyBytes: number;
  trustedProxyHeader?: TrustedProxyHeader;
  logger?: MailboxLogger;
}

async function bodyFromRequest(request: IncomingMessage, maxBytes: number): Promise<Uint8Array | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += bytes.length;
    if (total > maxBytes) {
      request.resume();
      return null;
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function sendResponse(target: ServerResponse, response: Response): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, key) => target.setHeader(key, value));
  target.end(Buffer.from(await response.arrayBuffer()));
}

export function resolveClientIp(
  request: IncomingMessage,
  trustedProxyHeader?: TrustedProxyHeader,
): string {
  if (trustedProxyHeader !== undefined) {
    const raw = request.headers[trustedProxyHeader];
    const candidate = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (candidate !== undefined && isIP(candidate) !== 0) return candidate;
  }
  return request.socket.remoteAddress ?? "unknown";
}

export function createMailboxNodeHandler(options: MailboxServerOptions) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(key, item);
        else if (value !== undefined) headers.set(key, value);
      }

      let body: Uint8Array | undefined;
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        const read = await bodyFromRequest(request, options.maxRequestBodyBytes);
        if (read === null) {
          await sendResponse(
            response,
            new Response(JSON.stringify({ error: "request too large" }), {
              status: 413,
              headers: { "content-type": "application/json; charset=utf-8" },
            }),
          );
          return;
        }
        body = read;
      }

      const forwarded = new Request(url, {
        method,
        headers,
        body: body === undefined ? undefined : Buffer.from(body).toString("utf8"),
      });
      const ip = resolveClientIp(request, options.trustedProxyHeader);
      await sendResponse(response, await options.app(forwarded, { ip }));
    } catch (error) {
      options.logger?.error?.({
        event: "mailbox_transport_error",
        error: error instanceof Error ? error.message : String(error),
      });
      if (!response.headersSent) {
        await sendResponse(
          response,
          new Response(JSON.stringify({ error: "internal error" }), {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8" },
          }),
        );
      } else {
        response.end();
      }
    }
  };
}

export function createMailboxServer(options: MailboxServerOptions): Server {
  return createServer(createMailboxNodeHandler(options));
}
