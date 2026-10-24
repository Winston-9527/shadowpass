import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const agentsRoot = path.join(root, ".claude", "agents");

function readAgent(name) {
  const source = fs.readFileSync(path.join(agentsRoot, `${name}.md`), "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${name} must have YAML frontmatter`);
  return { frontmatter: match[1], body: source.slice(match[0].length) };
}

test("orchestrator has no MCP server and can only spawn the two demo subagents", () => {
  const { frontmatter } = readAgent("shadowpass-orchestrator");
  assert.match(frontmatter, /name: shadowpass-orchestrator/);
  assert.match(frontmatter, /Agent\(shadowpass-buyer, shadowpass-treasury\)/);
  assert.doesNotMatch(frontmatter, /mcpServers:/);
  assert.doesNotMatch(frontmatter, /mcp__/);
});

test("buyer receives only its own scoped MCP server and PAY tools", () => {
  const { frontmatter } = readAgent("shadowpass-buyer");
  assert.match(frontmatter, /mcpServers:\n  - shadowpass-buyer:/);
  assert.match(frontmatter, /mcp__shadowpass-buyer__pay/);
  assert.match(frontmatter, /mcp__shadowpass-buyer__wallet_status/);
  assert.match(frontmatter, /mcp__shadowpass-buyer__list_receipts/);
  assert.doesNotMatch(frontmatter, /treasury_supply|treasury_withdraw|shadowpass-treasury/);
  assert.doesNotMatch(frontmatter, /delegate/);
});

test("treasury receives only its own scoped MCP server and TREASURY tools", () => {
  const { frontmatter } = readAgent("shadowpass-treasury");
  assert.match(frontmatter, /mcpServers:\n  - shadowpass-treasury:/);
  assert.match(frontmatter, /mcp__shadowpass-treasury__treasury_supply/);
  assert.match(frontmatter, /mcp__shadowpass-treasury__treasury_status/);
  assert.match(frontmatter, /mcp__shadowpass-treasury__treasury_withdraw/);
  assert.doesNotMatch(frontmatter, /mcp__shadowpass-treasury__pay|shadowpass-buyer/);
  assert.doesNotMatch(frontmatter, /delegate/);
});

test("agent definitions contain no wallets secrets or private keys", () => {
  for (const name of ["shadowpass-orchestrator", "shadowpass-buyer", "shadowpass-treasury"]) {
    const source = fs.readFileSync(path.join(agentsRoot, `${name}.md`), "utf8");
    assert.doesNotMatch(source, /holderPrv|boxSk|0x[0-9a-fA-F]{64}/);
    assert.doesNotMatch(source.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "", /\$\{/);
  }
});
