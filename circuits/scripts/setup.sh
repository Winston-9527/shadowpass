#!/usr/bin/env bash
# Groth16 setup on the Hermez ptau 2^18 with ONE local phase-2 contribution (demo only, NOT a trusted setup).
set -euo pipefail; cd "$(dirname "$0")/.."
PTAU=../artifacts/ptau/powersOfTau28_hez_final_18.ptau; SJ=node_modules/.bin/snarkjs; mkdir -p build/zk zk
for c in ${CIRCUITS:-main_d1 main_d2 main_reg}; do
  s=$(date +%s); log=build/zk/setup_$c.log
  $SJ groth16 setup build/$c/$c.r1cs $PTAU build/zk/${c}_0.zkey > $log 2>&1
  $SJ zkey contribute build/zk/${c}_0.zkey build/zk/$c.zkey --name=shadowpass-dev -e="$(head -c 32 /dev/urandom | xxd -p -c 64)" >> $log 2>&1
  rm build/zk/${c}_0.zkey
  $SJ zkey verify build/$c/$c.r1cs $PTAU build/zk/$c.zkey >> $log 2>&1 && echo "$c zkey verify OK" || echo "$c zkey verify FAILED"
  $SJ zkey export verificationkey build/zk/$c.zkey zk/vk_$c.json >> $log 2>&1
  name=$(echo $c | sed -E 's/main_d([0-9])/ShadowVerifierD\1/; s/main_reg/ShadowRegisterVerifier/')
  $SJ zkey export solidityverifier build/zk/$c.zkey zk/$name.sol >> $log 2>&1
  sed -i '' "s/contract Groth16Verifier /contract $name /" zk/$name.sol
  echo "$c setup $(( $(date +%s) - s ))s"
done
shasum -a 256 build/zk/*.zkey zk/vk_*.json $PTAU | sed 's#\.\./##' > zk/MANIFEST.sha256
