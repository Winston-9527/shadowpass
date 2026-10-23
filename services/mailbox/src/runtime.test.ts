import { describe, expect, it } from "vitest";
import { createMailboxRuntime } from "./runtime.js";

describe("createMailboxRuntime", () => {
  it("requires remote storage for serverless deployments", () => {
    expect(() => createMailboxRuntime({}, { requireRemote: true })).toThrow(
      "serverless mailbox requires MAILBOX_KV_URL and MAILBOX_KV_TOKEN",
    );
  });

  it("uses Upstash when credentials are configured", () => {
    const runtime = createMailboxRuntime(
      {
        MAILBOX_KV_URL: "https://kv.example",
        MAILBOX_KV_TOKEN: "token",
        MAILBOX_TRUSTED_PROXY_HEADER: "x-real-ip",
      },
      { requireRemote: true },
    );
    expect(runtime.store.constructor.name).toBe("UpstashMailboxStore");
    expect(runtime.trustedProxyHeader).toBe("x-real-ip");
  });
});
