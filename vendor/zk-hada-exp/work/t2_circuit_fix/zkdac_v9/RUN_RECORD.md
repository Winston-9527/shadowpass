# Run record: v9 (fewer public inputs) — issue #41
Date 2026-10-09. Env as ../zkdac_v8/RUN_RECORD.md (Apple M5 Pro, node 24.14.1, circom 2.2.3, snarkjs 0.7.6; node_modules: `ln -s ../zkdac_v7/node_modules node_modules`;
Hermez 2^18 ptau, one local phase-2 contribution — not a trusted setup). anvil 1.5.1 prague for receipts. Pre-registration eb7dad9.
Commands (this directory):
```
for D in 1 2 3 4; do circom circuits/main_c_d$D.circom --r1cs --wasm --sym -l circuits -l ../zkdac_v7/circuits -l node_modules -l node_modules/circomlib/circuits \
   -l node_modules/@zk-kit/binary-merkle-root.circom/src -o build/c$D; done
node scripts/smoke.mjs
for D in 1 2 3 4; do node scripts/mutate_v9.mjs $D > results/mutations_d$D.json 2> results/mutations_d$D.stderr; done
./scripts/setup_zkeys.sh
node scripts/check_public_binding.mjs > results/public_binding.json
node scripts/prove_bench.mjs 10 > results/prove_bench.json
(paired) for v in v8 v9 v8 v9: prove_bench.mjs 10 in ../zkdac_$v  -> results/prove_bench_paired_v8_v9.txt
node scripts/opening_check.mjs 10 > results/opening_check.json
cd ../../t4_contracts && node gen_fixtures_v9.mjs && cd foundry && forge test --match-contract V9Test -vv > ../results/forge_v9.txt
node receipts/receipts_v8_v9.mjs > results/receipts_v8_v9.json 2> results/receipts_v8_v9.stderr
```
Results and deviations: RESULTS.md.
