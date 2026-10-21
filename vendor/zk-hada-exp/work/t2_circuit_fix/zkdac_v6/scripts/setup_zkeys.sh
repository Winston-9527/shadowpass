#!/usr/bin/env bash
# Groth16 setup for v6 D=1..4 on the Hermez ceremony ptau 2^18 (54 contributions + beacon; blake2b checked against the snarkjs README).
# Phase 2 (circuit-specific) has ONE local contribution: dev-only, NOT a trusted setup for phase 2.
set -euo pipefail; cd "$(dirname "$0")/.."; PTAU=../../ptau/hermez/powersOfTau28_hez_final_18.ptau; mkdir -p build/zk zk
for D in ${DS:-1 2 3 4}; do
  s=$(date +%s)
  snarkjs groth16 setup build/d$D/main_d$D.r1cs $PTAU build/zk/d${D}_0.zkey > build/zk/setup_d$D.log 2>&1
  snarkjs zkey contribute build/zk/d${D}_0.zkey build/zk/d$D.zkey --name=dev-local -e="$(head -c 32 /dev/urandom | xxd -p)" >> build/zk/setup_d$D.log 2>&1
  rm build/zk/d${D}_0.zkey
  snarkjs zkey verify build/d$D/main_d$D.r1cs $PTAU build/zk/d$D.zkey >> build/zk/setup_d$D.log 2>&1 && echo "d$D zkey verify OK" || echo "d$D zkey verify FAILED"
  snarkjs zkey export verificationkey build/zk/d$D.zkey zk/vk_d$D.json >> build/zk/setup_d$D.log 2>&1
  snarkjs zkey export solidityverifier build/zk/d$D.zkey zk/Groth16VerifierV6D$D.sol >> build/zk/setup_d$D.log 2>&1
  sed -i '' "s/contract Groth16Verifier /contract Groth16VerifierV6D$D /" zk/Groth16VerifierV6D$D.sol
  echo "d$D setup $(( $(date +%s) - s ))s"
done
shasum -a 256 build/zk/d*.zkey zk/vk_d*.json $PTAU | sed 's#\.\./\.\./##' > zk/MANIFEST.sha256
