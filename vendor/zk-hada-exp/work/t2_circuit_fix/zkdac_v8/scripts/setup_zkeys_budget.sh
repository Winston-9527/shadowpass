#!/usr/bin/env bash
# zkeys for budget_transfer and budget_mint (#39): Hermez 2^18 phase 1, ONE local phase-2 contribution (not a trusted setup).
set -euo pipefail; cd "$(dirname "$0")/.."; PTAU=../../ptau/hermez/powersOfTau28_hez_final_18.ptau; SJ=node_modules/.bin/snarkjs; mkdir -p build/zk zk
for C in budget_transfer budget_mint; do
  $SJ groth16 setup build/$C/$C.r1cs $PTAU build/zk/${C}_0.zkey > build/zk/setup_$C.log 2>&1
  $SJ zkey contribute build/zk/${C}_0.zkey build/zk/$C.zkey --name=dev-local -e="$(head -c 32 /dev/urandom | xxd -p -c 64)" >> build/zk/setup_$C.log 2>&1; rm build/zk/${C}_0.zkey
  $SJ zkey verify build/$C/$C.r1cs $PTAU build/zk/$C.zkey >> build/zk/setup_$C.log 2>&1 && echo "$C zkey verify OK" || echo "$C zkey verify FAILED"
  $SJ zkey export verificationkey build/zk/$C.zkey zk/vk_$C.json >> build/zk/setup_$C.log 2>&1
  N=$( [ $C = budget_transfer ] && echo BudgetTransfer || echo BudgetMint )
  $SJ zkey export solidityverifier build/zk/$C.zkey zk/Groth16Verifier$N.sol >> build/zk/setup_$C.log 2>&1
  sed -i '' "s/contract Groth16Verifier /contract Groth16Verifier$N /" zk/Groth16Verifier$N.sol
done
shasum -a 256 build/zk/budget_*.zkey zk/vk_budget_*.json > zk/MANIFEST_budget.sha256
