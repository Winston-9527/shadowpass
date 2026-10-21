#!/usr/bin/env bash
# Compile the ShadowPass circuits (circom 2.2.3). Outputs to build/ (git-ignored).
set -euo pipefail; cd "$(dirname "$0")/.."
NM=$(cd .. && pwd)/node_modules   # npm workspaces hoist dependencies to the repo root
INC="-l src -l $NM -l $NM/circomlib/circuits -l $NM/@zk-kit/binary-merkle-root.circom/src"
for c in ${CIRCUITS:-main_d1 main_d2 main_d3 main_reg main_revoke budget_transfer budget_mint}; do
  mkdir -p build/$c
  circom src/$c.circom --r1cs --wasm --sym $INC -o build/$c > build/$c/circom.log
  ../node_modules/.bin/snarkjs r1cs info build/$c/$c.r1cs | grep -E "# of (Constraints|Private Inputs|Public Inputs)" | sed "s/^/$c /"
done
