import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const MAX_ENTRIES = 16;
const PAGE_SIZE = 200;

function decodeEnvelope(value) {
  if (typeof value !== "string") return null;
  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.length !== 81 || bytes.subarray(0, 4).toString("ascii") !== "SPW1" || (bytes[4] !== 0 && bytes[4] !== 1)) return null;
    return bytes;
  } catch {
    return null;
  }
}

export async function startSlotServer(port = 8787) {
  const slots = new Map();
  const server = createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-headers", "content-type");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/slot\/([0-9a-f]{64})$/);
    if (!match) {
      response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }));
      return;
    }
    const slot = match[1];
    const entries = slots.get(slot) ?? [];
    if (request.method === "POST") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length !== 1 || !decodeEnvelope(parsed.ct)) {
            response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid envelope" }));
            return;
          }
          if (entries.length >= MAX_ENTRIES) {
            response.writeHead(409, { "content-type": "application/json" }).end(JSON.stringify({ error: "slot full" }));
            return;
          }
          entries.push({ id: entries.length + 1, ct: parsed.ct, ts: Date.now() });
          slots.set(slot, entries);
          response.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id: entries.length }));
        } catch {
          response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid json" }));
        }
      });
      return;
    }
    if (request.method === "GET") {
      const after = Number(url.searchParams.get("after") ?? "0");
      response.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify(entries.filter((entry) => entry.id > after).slice(0, PAGE_SIZE)),
      );
      return;
    }
    response.writeHead(405).end();
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MAILBOX_PORT ?? "8787");
  await startSlotServer(port);
  console.log(`ShadowPass dev mailbox: http://127.0.0.1:${port}`);
}
