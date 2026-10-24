#!/usr/bin/env bash
# Start Anvil (unless one is already running), deploy ShadowPass, and fund demo accounts.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PORT=${ANVIL_PORT:-8545}
RPC="http://127.0.0.1:${PORT}"
# Anvil's first public development key; never use it for a funded network.
ANVIL_PK=${ANVIL_PK:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
KEEP_ANVIL=${KEEP_ANVIL:-1}
STARTED_ANVIL=0

cd "$ROOT"

if ! command -v anvil >/dev/null || ! command -v cast >/dev/null || ! command -v jq >/dev/null; then
  echo "dev-chain requires anvil, cast and jq on PATH" >&2
  exit 1
fi

cleanup() {
  if [[ "$STARTED_ANVIL" == "1" && "$KEEP_ANVIL" != "1" ]]; then
    kill "$ANVIL_PID" 2>/dev/null || true
  fi
}

if cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then
  CHAIN_ID=$(cast chain-id --rpc-url "$RPC")
  if [[ "$CHAIN_ID" != "31337" ]]; then
    echo "existing node at $RPC is chain $CHAIN_ID, expected Anvil chain 31337" >&2
    exit 1
  fi
  echo "using existing Anvil at $RPC"
else
  anvil --host 127.0.0.1 --port "$PORT" --block-time 1 --silent > .anvil.log 2>&1 &
  ANVIL_PID=$!
  STARTED_ANVIL=1
  trap cleanup EXIT
  for _ in $(seq 1 50); do
    if [[ "$(cast chain-id --rpc-url "$RPC" 2>/dev/null || true)" == "31337" ]]; then break; fi
    sleep 0.1
  done
  if [[ "$(cast chain-id --rpc-url "$RPC" 2>/dev/null || true)" != "31337" ]]; then
    echo "Anvil failed to start; see .anvil.log" >&2
    exit 1
  fi
fi

(
  cd contracts
  export DEPLOYER_PK="$ANVIL_PK"
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast
) > .deploy.log 2>&1 || {
  cat .deploy.log >&2
  exit 1
}

SHADOWPASS_NETWORK=anvil node scripts/record-deployment.mjs --rpc-url "$RPC" >> .deploy.log 2>&1 || {
  cat .deploy.log >&2
  exit 1
}

TOKEN=$(jq -r '.token' deployments/anvil.json)
GATE=$(jq -r '.gate' deployments/anvil.json)
for account in \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; do
  # Fund only demo accounts with the local development key.
  cast send "$TOKEN" 'mint(address,uint256)' "$account" 1000000000 \
    --rpc-url "$RPC" --private-key "$ANVIL_PK" >/dev/null
done

echo "ShadowPass deployed on Anvil"
echo "  rpc:   $RPC"
echo "  gate:  $GATE"
echo "  token: $TOKEN"
echo "  file:  deployments/anvil.json"

if [[ "$STARTED_ANVIL" == "1" && "$KEEP_ANVIL" == "1" ]]; then
  echo "Anvil is running; press Ctrl-C to stop."
  wait "$ANVIL_PID"
fi
