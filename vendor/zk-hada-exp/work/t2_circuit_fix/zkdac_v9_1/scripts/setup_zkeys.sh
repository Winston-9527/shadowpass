#!/usr/bin/env bash
# Groth16 setup for v9.1 (= v9 script, verifier names V91) (mode C) D=1..4 on the Hermez ptau 2^18; phase 2 = ONE local contribution (dev only, NOT a trusted setup).
set -euo pipefail; cd "$(dirname "$0")/.."; PTAU=../../ptau/hermez/powersOfTau28_hez_final_18.ptau; SJ=node_modules/.bin/snarkjs; mkdir -p build/zk zk
for D in ${DS:-1 2 3 4}; do
  s=$(date +%s)
  $SJ groth16 setup build/c$D/main_c_d$D.r1cs $PTAU build/zk/c${D}_0.zkey > build/zk/setup_c$D.log 2>&1
  $SJ zkey contribute build/zk/c${D}_0.zkey build/zk/c$D.zkey --name=dev-local -e="$(head -c 32 /dev/urandom | xxd -p -c 64)" >> build/zk/setup_c$D.log 2>&1
  rm build/zk/c${D}_0.zkey
  $SJ zkey verify build/c$D/main_c_d$D.r1cs $PTAU build/zk/c$D.zkey >> build/zk/setup_c$D.log 2>&1 && echo "c$D zkey verify OK" || echo "c$D zkey verify FAILED"
  $SJ zkey export verificationkey build/zk/c$D.zkey zk/vk_c$D.json >> build/zk/setup_c$D.log 2>&1
  $SJ zkey export solidityverifier build/zk/c$D.zkey zk/Groth16VerifierV91CD$D.sol >> build/zk/setup_c$D.log 2>&1
  sed -i '' "s/contract Groth16Verifier /contract Groth16VerifierV91CD$D /" zk/Groth16VerifierV91CD$D.sol
  echo "c$D setup $(( $(date +%s) - s ))s"
done
shasum -a 256 build/zk/c*.zkey zk/vk_*.json $PTAU | sed 's#\.\./\.\./##' > zk/MANIFEST.sha256
