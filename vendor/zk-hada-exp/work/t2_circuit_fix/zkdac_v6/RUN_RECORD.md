# Run record: v6 main circuit (v5 + holder-key revocation) — issue #28
Date 2026-10-08. Env: Apple M5 Pro (15 cores), node 24.14.1, circom 2.2.3, snarkjs 0.7.6, circomlib 2.0.5, @zk-kit/binary-merkle-root.circom 2.0.0,
@zk-kit/lean-imt 2.2.5, poseidon-lite 0.3.0. **ptau: Hermez `powersOfTau28_hez_final_18.ptau`** (`../../ptau/hermez/README.md`); v5 unchanged in ../zkdac_v5.
Decision (party B, 2026-10-08, #28): check delegate keys ent[2..D] (every sub-agent incl. the terminal holder); ent[1] (master) is invalidated by
re-registration (#17); 2^18 ptau from the Hermez ceremony (paper.tex lines 436 / 628 and RESEARCH_SPINE.yaml already name pot18).
Run: `npm ci`; compile `circuits/main_dN.circom` with `-l node_modules -l node_modules/circomlib/circuits -l node_modules/@zk-kit/binary-merkle-root.circom/src
-o build/dN`; `node scripts/smoke.mjs`; `node scripts/mutate_v6.mjs N > results/mutations_dN.json`; `scripts/setup_zkeys.sh`;
`node scripts/check_public_binding.mjs > results/public_binding.json`; `node scripts/prove_bench.mjs 10 > results/prove_bench.json`.

## Circuit
Public inputs unchanged (7, same order as v5; verified in results/public_binding.json). Key entries H(KEY_TAG = 2053861995 "zkrk", Ax, Ay) (Poseidon(3); certificate
entries are Poseidon(7) outputs) live in the same revocation IMT (depth 20) under the same revoked_root. For j = 2..D: `IMTNonMember(20)` of H(KEY_TAG, ent[j]);
private witness k_low_* / k_sib / k_bit[D-1] (D = 1: one slot constrained to 0, no free witness fields).
Constraints D=1..4: **38,266 / 81,944 / 125,622 / 169,300** (v5 + 0 / 13,150 / 26,300 / 39,450; 13,150 per checked key = IMT non-membership + Poseidon(3)).
D = 4 exceeds 2^17 (131,072): FFT domain 2^18, headroom 92,844 (room for R6 accountability, paper: 23,080).

## Mutations (witness level)
| D | single-field | accepted | semantic | unexpected |
|---|---|---|---|---|
| 1 | 157 | issued_root; now; rt_sib (16 padding siblings) | 24 | none |
| 2 | 239 | now; rt_sib (16 padding) | 36 | none |
| 3 | 364 | now; rt_sib (16 padding) | 49 | none |
| 4 | 489 | now; rt_sib (16 padding) | 63 | none |
Same accepted set as v5 (issued_root at D = 1 is bound at proof level, see public_binding.json, now D = 1..4). No k_* field is accepted. New semantic cases, all rejected:
for each j = 2..D, revoked key ent[j] with the old witness vs the new root, predecessor leaf, own leaf, forged skip leaf, end-of-list leaf; the generator finds
no witness; key slots swapped. Expected accepts (documented): revoked master key ent[1] (by design) and revoked human key ent[0] (not a key-revocation subject).

## Proving (Hermez 2^18 ptau, one local phase-2 contribution: phase 2 is NOT a trusted setup)
zkeys D=1..4: setup 19 / 24 / 28 / 41 s, all `snarkjs zkey verify` ("ZKey Ok!"); zk/MANIFEST.sha256; verifiers zk/Groth16VerifierV6D*.sol.
zkey sizes: 19.3 / 40.2 / 56.9 / 82.0 MB (v5: 19.3 / 35.3 / 47.1 / 58.9 MB).
Benchmark (results/prove_bench.json; 10 fresh instances per depth, run after the ptau verification finished, machine otherwise idle), ms, mean ± SD (median):
| D | verified | witness | prove | verify |
|---|---|---|---|---|
| 1 | 10/10 | 86.5 ± 3.2 | 595.2 ± 36.9 (581.3) | 6.4 ± 0.7 |
| 2 | 10/10 | 120.2 ± 1.6 | 1181.1 ± 42.9 (1170.4) | 5.5 ± 0.4 |
| 3 | 10/10 | 155.5 ± 5.1 | 1454.7 ± 15.6 (1450.8) | 6.7 ± 1 |
| 4 | 10/10 | 189.8 ± 4.3 | 2291.9 ± 12.1 (2292.3) | 5.5 ± 0.2 |
v5 re-run in the same session right after (results/prove_bench_v5_rerun_same_session.json; its sample proofs written to the scratchpad, v5 evidence untouched):
601 / 1101 / 1310 / 1509 ms. Cost of key revocation: D = 1 none (identical circuit), D = 2 +80 ms (+7%), D = 3 +145 ms (+11%), **D = 4 +783 ms (+52%)** — the
FFT domain doubles from 2^17 to 2^18 at D = 4. Verification time and on-chain gas are unchanged (7 public inputs; ../../t4_contracts/RUN_RECORD_v6.md).
