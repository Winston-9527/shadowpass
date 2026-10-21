# Run record: v8 main circuit (v7 C + budget note) — issue #39
Date 2026-10-09. Env: Apple M5 Pro (15 cores), macOS 26.4, node 24.14.1, circom 2.2.3, snarkjs 0.7.6, circomlib 2.0.5, poseidon-lite 0.3.0, @zk-kit/lean-imt
(all from ../zkdac_v7/node_modules: `ln -s ../zkdac_v7/node_modules node_modules`), forge 1.5.1 (solc 0.8.28, cancun). ptau: Hermez 2^18; phase 2 = one local
contribution (NOT a trusted setup). Pre-registration 9ca27ec.
Commands (this directory):
```
for D in 1 2 3 4; do circom circuits/main_c_d$D.circom --r1cs --wasm --sym -l circuits -l ../zkdac_v7/circuits -l node_modules -l node_modules/circomlib/circuits \
   -l node_modules/@zk-kit/binary-merkle-root.circom/src -o build/c$D; done          # same -l flags for budget_transfer, budget_mint (-o build/<name>)
node scripts/smoke.mjs
for D in 1 2 3 4; do node scripts/mutate_v8.mjs $D > results/mutations_d$D.json 2> results/mutations_d$D.stderr; done
./scripts/setup_zkeys.sh; ./scripts/setup_zkeys_budget.sh          # zk/MANIFEST*.sha256; zkeys not committed
node scripts/check_public_binding.mjs > results/public_binding.json
node scripts/prove_bench.mjs 10 > results/prove_bench.json; node scripts/bench_budget.mjs 10 > results/bench_budget.json
node scripts/cases_budget.mjs > results/cases_budget.json 2> results/cases_budget.stderr
cd ../../t4_contracts && node gen_fixtures_v8.mjs && cd foundry && forge test --match-contract V8Test -vv > ../results/forge_v8.txt
cd ../../t5_e2/E2-budget_20261009 && node e2_anvil.mjs > results/e2_anvil.json 2> results/e2_anvil.stderr
```
Results and deviations: RESULTS.md.
