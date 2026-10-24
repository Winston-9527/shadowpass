import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const serverPath = fileURLToPath(new URL("../src/server.ts", import.meta.url));

describe("stdio MCP server", () => {
  it("lists tools and serves wallet_status over the official client transport", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "shadowpass-mcp-stdio-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import=tsx", serverPath, "--home", home, "--name", "stdio", "--no-qr"],
      stderr: "pipe",
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
    });
    const client = new Client({ name: "shadowpass-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        "wallet_status",
        "list_receipts",
        "pay",
        "treasury_supply",
        "treasury_status",
        "treasury_withdraw",
        "delegate",
      ]);
      const result = await client.callTool({ name: "wallet_status", arguments: {} });
      expect(result.isError).not.toBe(true);
      const content = result.content as Array<{ type: "text"; text: string }>;
      expect(JSON.parse(content[0]!.text)).toMatchObject({
        name: "stdio",
        status: "unpaired",
      });
    } finally {
      await client.close();
    }
  }, 20_000);
});
