# v9.1 = v9 + on-curve check of every encrypted chain key — results (audit #53)
Pre-registration: `PREREGISTRATION.md` (8b82adf, pushed before any run). Commands: `RUN_RECORD.md`.

## Verdict
- **#53 is real on v9, at every hop, and closed in v9.1.**
  - An off-curve intermediate key A with 8·A = q·B8 (point from `scripts/offcurve.py`, seed 1) placed at ent[j]: v9 accepts the witness for every
    j = 0..3, and for j = 3 a real v9 proof verifies with the committed v9 vk.
  - The compressed opening then returns the wrong key at exactly position j (`results/offcurve_poc.json`).
  - v9.1 rejects all four at `BabyCheck` (L82). The oracle rejects all four (circomlibjs checks the curve).
- **Nothing else changes.**
  - Constraints are exactly as predicted: +3(D + 1), i.e. 60,628 / 105,433 / 150,238 / 195,043.
  - Public inputs: 17–20, unchanged.
  - T2 field mutations: the same accepted set as v9 at D = 1..4.
  - Semantic cases: same outcomes as v9, 0 unexpected.
  - Public binding: every public word + 1 fails.
  - Threshold opening: 10 / 10 per D.
  - Verifiers: identical to v9's modulo key constants, so gas is unchanged.
  - Proving time: no measurable change (paired, check 6).
- **T3 on v9.1:** 174 rows, 170 with the same class as v9, plus A24 × 4 AGREE_REJECT (`../../t3_attacks/v9_1/RESULTS_v9_1.md`).

## Checks
| check | result | file |
|---|---|---|
| 1 compile | D = 1..4: 60,628 / 105,433 / 150,238 / 195,043 constraints; 17 / 18 / 19 / 20 public inputs | results/compile.txt |
| 2 smoke | honest D = 1..4 accepted; auditor recovers ent[0..D] | results/smoke.txt |
| 3 mutations | 199 / 282 / 408 / 534 fields, accepted set identical to v9; semantic cases identical to v9, 0 unexpected. All revoked_cert{i}_* cases with the other hops refreshed (#57): stale → IMTPath L39, predecessor → IMTNonMember L67, own / end leaf → L59, forged → IMTPath L39 | results/mutations_d*.json |
| 4 setup | 4 zkeys verify against Hermez 2^18 (one new local phase-2 contribution; not a trusted setup); public binding OK; opening 10 / 10 single key and 3-of-5, forced 2 shares wrong 10 / 10 | results/setup.txt, public_binding.json, opening_check.json |
| 5 off-curve PoC | j = 0..3: v9 sat, v9.1 BabyCheck L82; opening wrong exactly at j; v9 proof (j = 3) verifies | results/offcurve_poc.json |
| 6 proving, paired (v9, v9.1, v9, v9.1; 10 fresh instances each, same seeds) | prove ms D = 1..4, run 1 / run 2: v9 799 / 793, 1,422 / 1,405, 2,305 / 2,310, 2,627 / 2,688; v9.1 787 / 787, 1,377 / 1,377, 2,240 / 2,311, 2,585 / 2,543. v9.1 is not slower; the differences (−6 to −145 ms) are of the size of the run-to-run variation of one version (up to 61 ms at D = 4), so the 3(D + 1) extra constraints have no measurable cost. All proofs verify 10 / 10 | results/prove_bench_paired_v9_v91.txt |
| 7 verifiers | identical to v9 with digits masked, D = 1..4 | results/verifier_diff.txt |

## Carry-over
T5, T6 and E6b were measured on v9 and are carried over to v9.1. v9.1 changes no public input, no witness format, no contract and no verifier
structure; the proving delta is in check 6.
The v9.1 zkeys are local (build/zk, git-ignored); their hashes are in `zk/MANIFEST.sha256`. They were not uploaded as a release.

## Deviations
- Copying the v9 scripts unchanged (pre-registered) also copied `mutate_v9.mjs` and `witness_v9.mjs`. These were then changed as pre-registered (other-hop
  refresh, failure location); the diffs are in the commit history.
