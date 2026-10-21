#!/usr/bin/env bash
# Compile the ShadowPass circuits (circom 2.2.3). Outputs to build/ (git-ignored).
set -euo pipefail; cd "$(dirname "$0")/.."
INC="-l src -l node_modules -l node_modules/circomlib/circuits -l node_modules/@zk-kit/binary-merkle-root.circom/src"
for c in ${CIRCUITS:-main_d1 main_d2 main_reg}; do
  mkdir -p build/$c
  circom src/$c.circom --r1cs --wasm --sym $INC -o build/$c > build/$c/circom.log
  node_modules/.bin/snarkjs r1cs info build/$c/$c.r1cs | grep -E "# of (Constraints|Private Inputs|Public Inputs)" | sed "s/^/$c /"
done
