---
name: shadowpass-mvp
description: "Operate and validate the complete ShadowPass MVP: wallet PWA, two MCP stdio agents, facilitator, encrypted mailbox, x402 merchant, and local Anvil. Use when the user asks to start, run, test, demo, debug, integrate, or validate ShadowPass; launch the full system; pair buyer or treasury agents; issue PAY or TREASURY cards; connect Claude MCP; run an x402 purchase; supply or withdraw treasury funds; inspect bills or alerts; revoke an agent; collect E2E evidence; or rehearse the MVP demo. Triggers include '跑整个系统', '启动 MVP', '联调钱包和 MCP', '真机演示', 'shadowpass demo', 'buy EV report', 'treasury supply', and 'revoke buyer'."
argument-hint: "[check|start|test|status|configure|stop]"
---

# ShadowPass MVP

IRON LAW: NEVER CLAIM THE MVP IS READY WITHOUT A SUCCESSFUL `check`, `start`, OR `test` RESULT FROM THE BUNDLED CLI. NEVER PRESENT PLAYWRIGHT PASSKEYS AS REAL TOUCH ID.

## Workflow

Copy this checklist and update it as work proceeds:

```
ShadowPass MVP Progress:

- [ ] Step 1: Select test or interactive-start mode ⚠️ REQUIRED
- [ ] Step 2: Run environment check ⛔ BLOCKING
- [ ] Step 3: Start the product stack or run headless E2E
- [ ] Step 4: Configure MCP only after confirmation ⚠️ REQUIRED
- [ ] Step 5: Guide the human wallet and Claude flow
- [ ] Step 6: Report evidence and distinguish recording status
- [ ] Step 7: Stop services only after confirmation ⚠️ REQUIRED
```

All commands run from the ShadowPass repository root. The deterministic CLI is:

```bash
node .claude/skills/shadowpass-mvp/scripts/mvp.mjs <command>
```

## Step 1: Select Mode

Ask: Does the user want a repeatable pass/fail check or an interactive system?

- Use `test` for CI, regression checks, evidence collection, or “does the whole system work?”
- Use `start` when the user will open the wallet, pair real agents, or rehearse the demo.
- Do not run both simultaneously; they use the same default ports.

## Step 2: Check Environment ⛔ BLOCKING

Run:

```bash
node .claude/skills/shadowpass-mvp/scripts/mvp.mjs check
```

Require `ok: true`. If commands are missing, ports are busy, or PTAU is absent, stop and report the exact missing item. Do not install global toolchains without asking.

## Step 3: Test or Start

Headless E2E:

```bash
node .claude/skills/shadowpass-mvp/scripts/mvp.mjs test
```

This runs the actual wallet PWA, two MCP stdio processes, x402 payment, treasury supply/withdraw, bill alert, revocation, and isolation checks. A passing run must print `result: "ok"` and `simulatedDepositsRelayed: 20`.

Interactive product stack:

```bash
node .claude/skills/shadowpass-mvp/scripts/mvp.mjs start
```

Wait for `result: "ready"`. Report these values:

- `wallet`
- buyer and treasury local pairing links
- buyer and treasury pairing codes
- runtime manifest path

Open the wallet with the exact `http://localhost:4173` URL. Do not substitute `127.0.0.1` because passkey RP IDs differ.

## Step 4: Configure Claude MCP ⚠️ REQUIRED

Ask the user whether to replace existing `shadowpass-buyer` or `shadowpass-treasury` MCP entries. Only after explicit confirmation run:

```bash
node .claude/skills/shadowpass-mvp/scripts/mvp.mjs configure
```

If replacement was explicitly approved, add `--replace`.

Use `--dry-run` when the user wants to inspect the MCP configuration without changing Claude settings.

After configuration, tell the user to restart Claude Code so the two MCP servers and their tools reload. Do not claim tools are available in the current session before restart.

## Step 5: Guide the Human Flow

Wallet:

1. Create a wallet with the local passkey.
2. Open the wallet and claim 100 test USDC.
3. Issue buyer with PAY and budget 40.
4. Issue treasury with TREASURY and budget 50.

Claude purchase prompt:

```text
Call pay for http://127.0.0.1:4021/report with maxAmount 2000000.
```

Treasury prompts:

```text
Call treasury_supply with the vault from deployments/anvil.json, amount 20000000, termSeconds 86400.
Call treasury_status and report the positionId.
```

After advancing Anvil time by 86401 seconds and mining one block:

```text
Call treasury_withdraw for that positionId.
```

Wallet verification:

1. Open Bills and wait for both branches and the unreported-spend alert.
2. Open Authorization and revoke buyer.
3. Wait through the disclosure window; buyer `pay` must return `revoked` while treasury remains active.

## Step 6: Evidence

For a test run, report:

- total duration
- 20/20 relayed simulated deposits
- buyer and treasury card issue/transfer hashes
- payment, treasury supply, withdrawal, and revoke hashes
- `billAlert.shown`
- `buyerRejected`
- `treasuryUnaffected`

For an interactive run, inspect:

```bash
node .claude/skills/shadowpass-mvp/scripts/mvp.mjs status
node .claude/skills/shadowpass-mvp/scripts/mvp.mjs pairs
```

Real Touch ID recording remains a human acceptance item. The automated E2E uses a Playwright passkey double and cannot satisfy that item.

## Step 7: Stop ⚠️ REQUIRED

Ask before stopping because it shuts down the wallet, services, and Anvil. After confirmation:

```bash
node .claude/skills/shadowpass-mvp/scripts/mvp.mjs stop
```

## Failure Handling

If a command fails, load `references/troubleshooting.md` and use the matching symptom. Prefer `logs` before restarting:

```bash
node .claude/skills/shadowpass-mvp/scripts/mvp.mjs logs
```

## Anti-Patterns

- Do not tell the user to run the six-step flow manually without first running `check`.
- Do not use production wallet URLs while the local stack is running.
- Do not run `configure --replace` without explicit approval.
- Do not call the automated passkey flow “real Touch ID.”
- Do not leave background services running silently after the user finishes.
- Do not copy protocol-layer demo evidence as product-MVP evidence.

## Pre-Delivery Checklist

- [ ] `check` returned `ok: true`
- [ ] `start` returned `result: ready` or `test` returned `result: ok`
- [ ] local `localhost:4173` pairing links were used
- [ ] MCP replacement was explicitly approved before `--replace`
- [ ] transaction hashes or test log path were reported
- [ ] real Touch ID recording status was stated accurately
- [ ] background processes were stopped when requested
