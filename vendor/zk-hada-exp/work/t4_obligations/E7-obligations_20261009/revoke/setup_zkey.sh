#!/bin/bash
# zkey for revoke_transition (Hermez 2^18 phase 1; ONE local phase-2 contribution: not a trusted setup)
set -euo pipefail
cd "$(dirname "$0")"
SJ=../../../t2_circuit_fix/zkdac_v7/node_modules/.bin/snarkjs
PTAU=../../../ptau/hermez/powersOfTau28_hez_final_18.ptau
mkdir -p build/zk zk
$SJ groth16 setup build/revoke_transition.r1cs $PTAU build/zk/rt_0.zkey > build/zk/setup.log
$SJ zkey contribute build/zk/rt_0.zkey build/zk/rt.zkey --name="e7-local" -e="$(head -c 32 /dev/urandom | xxd -p -c 64)" >> build/zk/setup.log
$SJ zkey verify build/revoke_transition.r1cs $PTAU build/zk/rt.zkey >> build/zk/setup.log
$SJ zkey export verificationkey build/zk/rt.zkey zk/vk_rt.json
$SJ zkey export solidityverifier build/zk/rt.zkey zk/Groth16VerifierRevoke.sol
sed -i '' 's/contract Groth16Verifier /contract Groth16VerifierRevoke /' zk/Groth16VerifierRevoke.sol
rm build/zk/rt_0.zkey
shasum -a 256 build/revoke_transition.r1cs build/revoke_transition_js/revoke_transition.wasm build/zk/rt.zkey zk/vk_rt.json zk/Groth16VerifierRevoke.sol > zk/MANIFEST.sha256
