#!/usr/bin/env bash
# Groth16 setup for v7 (modes a, c) D=1..4 on the Hermez ceremony ptau 2^18 (54 contributions + beacon; blake2b checked against the snarkjs README).
# Phase 2 (circuit-specific) has ONE local contribution: dev-only, NOT a trusted setup for phase 2.
set -euo pipefail; cd "$(dirname "$0")/.."; PTAU=../../ptau/hermez/powersOfTau28_hez_final_18.ptau; mkdir -p build/zk zk
for T in ${MODES:-a c}; do for D in ${DS:-1 2 3 4}; do
  s=$(date +%s); U=$(echo $T | tr a-z A-Z)
  snarkjs groth16 setup build/$T$D/main_${T}_d$D.r1cs $PTAU build/zk/$T${D}_0.zkey > build/zk/setup_$T$D.log 2>&1
  snarkjs zkey contribute build/zk/$T${D}_0.zkey build/zk/$T$D.zkey --name=dev-local -e="$(head -c 32 /dev/urandom | xxd -p)" >> build/zk/setup_$T$D.log 2>&1
  rm build/zk/$T${D}_0.zkey
  snarkjs zkey verify build/$T$D/main_${T}_d$D.r1cs $PTAU build/zk/$T$D.zkey >> build/zk/setup_$T$D.log 2>&1 && echo "$T$D zkey verify OK" || echo "$T$D zkey verify FAILED"
  snarkjs zkey export verificationkey build/zk/$T$D.zkey zk/vk_$T$D.json >> build/zk/setup_$T$D.log 2>&1
  snarkjs zkey export solidityverifier build/zk/$T$D.zkey zk/Groth16VerifierV7${U}D$D.sol >> build/zk/setup_$T$D.log 2>&1
  sed -i '' "s/contract Groth16Verifier /contract Groth16VerifierV7${U}D$D /" zk/Groth16VerifierV7${U}D$D.sol
  echo "$T$D setup $(( $(date +%s) - s ))s"
done; done
shasum -a 256 build/zk/[ac]*.zkey zk/vk_*.json $PTAU | sed 's#\.\./\.\./##' > zk/MANIFEST.sha256
