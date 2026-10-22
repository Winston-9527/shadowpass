#!/usr/bin/env bash
# Start Anvil (unless one is already running), deploy ShadowPass, and fund demo accounts.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
RPC=${ANVIL_RPC:-http://127.0.0.1:8545}
PORT=${ANVIL_PORT:-8545}
ANVIL_PK=${ANVIL_PK:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
KEEP_ANVIL=${KEEP_ANVIL:-1}
STARTED_ANVIL=0

cd "$ROOT"

if ! command -v anvil >/dev/null || ! command -v cast >/dev/null || ! command -v jq >/dev/null; then
  echo "dev-chain requires anvil, cast and jq on PATH" >&2
  exit 1
fi

if cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "using existing Anvil at $RPC"
else
  anvil --host 127.0.0.1 --port "$PORT" --silent > .anvil.log 2>&1 &
  ANVIL_PID=$!
  STARTED_ANVIL=1
  for _ in $(seq 1 50); do
    if cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then break; fi
    sleep 0.1
  done
  if ! cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then
    echo "Anvil failed to start; see .anvil.log" >&2
    exit 1
  fi
fi

cleanup() {
  if [[ "$STARTED_ANVIL" == "1" && "$KEEP_ANVIL" != "1" ]]; then
    kill "$ANVIL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

(
  cd contracts
  export DEPLOYER_PK="$ANVIL_PK"
  export SHADOWPASS_NETWORK=anvil
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast
) > .deploy.log 2>&1 || {
  cat .deploy.log >&2
  exit 1
}

TOKEN=$(jq -r '.token' deployments/anvil.json)
GATE=$(jq -r '.gate' deployments/anvil.json)
for account in \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; do
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
