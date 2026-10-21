# Run record: v9.2 (T7c F-2), 2026-10-13, Apple M5 Pro, node 24.14.1, circom 2.2.3, snarkjs 0.7.6; node_modules -> ../zkdac_v7/node_modules
Pre-registration 48ba1d5. Commands (this directory; circuits and scripts copied from ../zkdac_v9_1, then the one-constraint change and V92 names):
```
for D in 1 2 3 4; do mkdir -p build/c$D; circom circuits/main_c_d$D.circom --r1cs --wasm --sym -l circuits -l ../zkdac_v7/circuits -l node_modules \
  -l node_modules/circomlib/circuits -l node_modules/@zk-kit/binary-merkle-root.circom/src -o build/c$D; done          # + snarkjs r1cs info -> results/compile.txt
node scripts/smoke.mjs | tail -4 > results/smoke.txt
for D in 1 2 3 4; do node scripts/mutate_v9.mjs $D C > results/mutations_d$D.json 2> results/mutations_d$D.stderr; done   # in parallel
./scripts/setup_zkeys.sh > results/setup.txt 2>&1                           # background, ~3 min
node scripts/f2_poc.mjs > results/f2_poc.json 2> results/f2_poc.stderr
node scripts/check_public_binding.mjs > results/public_binding.json; node scripts/opening_check.mjs 10 > results/opening_check.json
for D in 1 2 3 4; do diff <(digits masked ../zkdac_v9_1/zk/Groth16VerifierV91CD$D.sol) <(digits masked zk/Groth16VerifierV92CD$D.sol); done > results/verifier_diff.txt
(../../t3_attacks) node v9_2/attacks_v9_2.mjs > v9_2/results/attacks_v9_2.json; node v9_2/exhaustive_diff_v9_2.mjs 4 > v9_2/results/exhaustive_diff_v9_2_d4.json
(../../t4_contracts) node E7d-v92-gate_20261013/gen_fixtures_v92.mjs; N=30 node E7d-v92-gate_20261013/gen_batch_v92.mjs; (foundry) forge test --match-path "test/V92*.t.sol" -vv
```
The first gen_batch_v92 run failed before producing anything: the F-2 instance block had been inserted above the declaration of `human`, giving a ReferenceError. The block was moved below the off-curve instances and the run repeated. The forge run against the missing fixture (10 setUp failures) is kept in no file; it was replaced by the run in E7d/results/forge_v92.txt.
