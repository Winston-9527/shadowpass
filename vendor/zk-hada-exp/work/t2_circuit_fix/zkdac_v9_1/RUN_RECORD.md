# Run record: v9.1 (audit #53), 2026-10-12, Apple M5 Pro, node 24.14.1, circom 2.2.3, snarkjs 0.7.6; node_modules -> ../zkdac_v7/node_modules
Pre-registration 8b82adf. Commands (this directory):
```
for D in 1 2 3 4; do mkdir -p build/c$D; circom circuits/main_c_d$D.circom --r1cs --wasm --sym -l circuits -l ../zkdac_v7/circuits -l node_modules \
  -l node_modules/circomlib/circuits -l node_modules/@zk-kit/binary-merkle-root.circom/src -o build/c$D; done          # + snarkjs r1cs info -> results/compile.txt
node scripts/smoke.mjs                                                       # -> results/smoke.txt (tail)
./scripts/setup_zkeys.sh > results/setup.txt                                 # run in background while 3 ran
for D in 1 2 3 4; do node scripts/mutate_v9.mjs $D > results/mutations_d$D.json 2> results/mutations_d$D.stderr; done
python3 scripts/offcurve.py 1 > results/offcurve_point.json && node scripts/offcurve_poc.mjs results/offcurve_point.json > results/offcurve_poc.json 2> results/offcurve_poc.stderr
node scripts/check_public_binding.mjs > results/public_binding.json ; node scripts/opening_check.mjs 10 > results/opening_check.json
for D in 1 2 3 4; do diff <(digits masked ../zkdac_v9/zk/Groth16VerifierV9CD$D.sol) <(digits masked zk/Groth16VerifierV91CD$D.sol); done > results/verifier_diff.txt
(paired, after E6b2 finished, machine otherwise idle) for v in v9 v9_1 v9 v9_1: (cd ../zkdac_$v && node scripts/prove_bench.mjs 10) -> results/prove_bench_paired_v9_v91.txt
```
The first compile attempt failed because build/c$D did not exist ("invalid output path"); nothing was produced, and it was rerun after `mkdir`.
