# Run record: E7-obligations (#18)
- Date / operator(agent): 2026-10-09 / Claude (party B session)
- Issue / PR: #18; branch `t18-obligations` (from main 2eeac99)
- Source commit (zk-hada-exp): pre-registration d22546b; code + results in the commit that adds this file.
- Environment: macOS 26.4, Apple M5 Pro (15 cores), node 24.14.1, circom 2.2.3, snarkjs 0.7.6, circomlibjs 0.1.7; forge/anvil/cast 1.5.1 (solc 0.8.28,
  cancun for forge tests, optimizer 200), geth 1.17.7-stable (go1.27.1), python 3. ptau: Hermez powersOfTau28_hez_final_18 (../../ptau/hermez).
- Commands (verbatim):
  ```
  cd revoke && circom circuits/revoke_transition.circom --r1cs --wasm --sym -l ../../../t2_circuit_fix/zkdac_v7/circuits \
       -l ../../../t2_circuit_fix/zkdac_v7/node_modules -l ../../../t2_circuit_fix/zkdac_v7/node_modules/circomlib/circuits -o build
  cd revoke && ./setup_zkey.sh                 # zk/MANIFEST.sha256; zkey not committed
  cd revoke && node cases_witness.mjs > ../results/revoke_witness.json 2> ../results/revoke_witness.stderr
  cd revoke && node bench_revoke.mjs 10 > ../results/revoke_bench.json
  cd revoke && node gen_fixtures_revoke.mjs    # -> t4_contracts/foundry/test/fixtures_revoke.json
  cp revoke/zk/Groth16VerifierRevoke.sol ../../t4_contracts/foundry/src/
  cd ../../t4_contracts/foundry && forge test --match-contract "ObligationsV7Test|RevokeV7RTest" -vv > ../../t4_obligations/E7-obligations_20261009/results/forge_obligations.txt
  cd ../../t4_contracts/foundry && forge test   # full suite 152/152 (125 on main + 15 ObligationsV7 + 12 RevokeV7R)
  cd receipts && SCRATCH=<scratch dir> python3 e2e_v7r.py > ../results/e2e_v7r.json 2> ../results/e2e_v7r.stderr
  ```
- New contracts: `t4_contracts/foundry/src/{ZkDacRevocations,ZkDacGateV7R,Groth16VerifierRevoke}.sol`; ZkDacGateV7R is ZkDacGateV7 with the revoked-root
  check delegated (generated from ZkDacGateV7.sol by a scripted edit; diff = constructor, `updateIssuedRoot` replaces `updateRoots`, revoked-root check).
  New tests: `test/{ObligationsV7,RevokeV7R}.t.sol`, fixture `test/fixtures_revoke.json`.
- Inputs + seeds: v7 instances buildInstanceV7({D:4, seed:1}) (witness cases), seeds 2000..2009 (bench), the fixtures_V7 C_D4 arguments (forge fixtures),
  real-time fixtures for receipts (`results/e2e_v7r_fixtures.json`, now = start − 30 s). Test keys only (anvil account #0 is public).
- Outputs: `results/*` (sha256 in MANIFEST.sha256).
- Results / deviations / limits: RESULTS.md, POLICY_CLOSURE.md.
