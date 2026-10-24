#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MANIFEST="$ROOT/scripts/mvp/.runtime/claude-config.json"

if [[ ! -f "$MANIFEST" ]]; then
  printf 'ShadowPass MVP is not running. Start it with: npm run demo:mvp\n' >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  printf 'Claude Code CLI is not installed or not on PATH\n' >&2
  exit 1
fi

manifest_value() {
  node -e '
    const fs = require("node:fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const value = process.argv.slice(2).reduce((current, key) => current?.[key], manifest);
    if (value === undefined || value === null) process.exit(2);
    process.stdout.write(String(value));
  ' "$MANIFEST" "$@"
}

export SHADOWPASS_MVP_RPC_URL="$(manifest_value rpcUrl)"
export SHADOWPASS_MVP_MAILBOX_URL="$(manifest_value mailboxUrl)"
export SHADOWPASS_MVP_FACILITATOR_URL="$(manifest_value facilitatorUrl)"
export SHADOWPASS_MVP_MERCHANT_URL="$(manifest_value merchantUrl)"
export SHADOWPASS_MVP_VAULT="$(manifest_value deployment vault)"
export SHADOWPASS_NETWORK="anvil"
export SHADOWPASS_RPC_URL="$SHADOWPASS_MVP_RPC_URL"
export SHADOWPASS_MAILBOX="$SHADOWPASS_MVP_MAILBOX_URL"
export SHADOWPASS_FACILITATOR="$SHADOWPASS_MVP_FACILITATOR_URL"
export SHADOWPASS_ARTIFACTS="$ROOT/scripts/mvp/.runtime/artifacts"
export SHADOWPASS_MAX_PAYMENT="100000000"
export SHADOWPASS_TRUST_LOCAL_ARTIFACTS="1"

RUNTIME_PROMPT="ShadowPass local runtime: rpc=${SHADOWPASS_MVP_RPC_URL}; merchant=${SHADOWPASS_MVP_MERCHANT_URL}; report=${SHADOWPASS_MVP_MERCHANT_URL}/report; vault=${SHADOWPASS_MVP_VAULT}. Pass the full report URL and vault address to the relevant subagent."

cd "$ROOT"
exec claude \
  --agent shadowpass-orchestrator \
  --append-system-prompt "$RUNTIME_PROMPT" \
  "$@"
