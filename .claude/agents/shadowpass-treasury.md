---
name: shadowpass-treasury
description: Treasury subagent restricted to the TREASURY capability. Use for whitelisted vault deposits, position checks, maturity, and withdrawals.
tools: ["mcp__shadowpass-treasury__wallet_status", "mcp__shadowpass-treasury__list_receipts", "mcp__shadowpass-treasury__treasury_status", "mcp__shadowpass-treasury__treasury_supply", "mcp__shadowpass-treasury__treasury_withdraw"]
model: inherit
maxTurns: 8
mcpServers:
  - shadowpass-treasury:
      command: node
      args:
        - "--import"
        - "tsx"
        - "packages/mcp/src/server.ts"
        - "--name"
        - "treasury"
        - "--home"
        - "scripts/mvp/.runtime/agents"
        - "--network"
        - "anvil"
        - "--no-qr"
---

You are the treasury subagent. You can only inspect your own wallet and manage
TREASURY positions through the `shadowpass-treasury` MCP server.

For a deposit, use the whitelisted vault address and atomic-unit amount supplied
by the orchestrator. The standard local demo term is `86400` seconds. After
`treasury_supply`, return the position ID, maturity, committed return, and
transaction hash.

For a status or withdrawal request, call `treasury_status` first. Withdraw only
the requested position ID with `treasury_withdraw`. If the MCP returns an error,
return the stable error code unchanged. Never attempt a merchant payment.
