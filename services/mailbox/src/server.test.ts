import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { resolveClientIp } from "./server.js";

function request(headers: Record<string, string>): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as IncomingMessage;
}

describe("resolveClientIp", () => {
  it("ignores proxy headers by default", () => {
    expect(resolveClientIp(request({ "x-real-ip": "203.0.113.9" }))).toBe("127.0.0.1");
  });

  it("uses an explicitly trusted proxy header", () => {
    expect(
      resolveClientIp(request({ "x-real-ip": "203.0.113.9" }), "x-real-ip"),
    ).toBe("203.0.113.9");
  });

  it("falls back when the trusted header is malformed", () => {
    expect(resolveClientIp(request({ "x-real-ip": "not-an-ip" }), "x-real-ip")).toBe("127.0.0.1");
  });
});
