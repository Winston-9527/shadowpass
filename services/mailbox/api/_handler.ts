import type { IncomingMessage, ServerResponse } from "node:http";
import { createMailboxNodeHandler } from "../src/server.js";
import { createMailboxRuntime } from "../src/runtime.js";

let handler: ReturnType<typeof createMailboxNodeHandler> | undefined;

export async function vercelMailboxHandler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  handler ??= createMailboxNodeHandler(
    createMailboxRuntime(process.env, {
      requireRemote: true,
      defaultTrustedProxyHeader: "x-real-ip",
    }),
  );
  request.url = request.url?.replace(/^\/api(?=\/|$)/, "") || "/";
  await handler(request, response);
}
