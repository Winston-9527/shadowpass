#!/usr/bin/env bash
# Fail if the exported verifier sources drift from circuits/zk.
set -euo pipefail
cd "$(dirname "$0")/../.."

files=(
  ShadowVerifierD1.sol
  ShadowVerifierD2.sol
  ShadowVerifierD3.sol
  ShadowRegisterVerifier.sol
  ShadowRevokeVerifier.sol
  ShadowBudgetTransferVerifier.sol
  ShadowBudgetMintVerifier.sol
)

for file in "${files[@]}"; do
  if ! cmp -s "circuits/zk/$file" "contracts/src/$file"; then
    echo "verifier drift: $file" >&2
    diff -u "circuits/zk/$file" "contracts/src/$file" >&2 || true
    exit 1
  fi
done

echo "all contract verifiers match circuits/zk"
