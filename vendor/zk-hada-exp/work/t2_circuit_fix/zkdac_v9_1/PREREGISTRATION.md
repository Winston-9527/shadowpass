# v9.1 = v9 + on-curve check of every encrypted chain key — pre-registration (committed BEFORE any run)
Trigger: audit issue #53 (verified 2026-10-12). User decision 2026-10-12: fix in the circuit (v9.1), not by an issuance-side policy.
v9 (`../zkdac_v9`) and all v9 evidence stay unchanged.

## Problem (from #53, confirmed by reading the code)
- `EdDSAPoseidonVerifier` (circomlib 2.0.5) uses the public key only through 8·A (three `BabyDbl`) and checks 8·A.x ≠ 0. It does not check that A is
  on the curve. In v9 only the terminal key ent[D] is forced onto the curve (via `BabyPbk`).
- The compressed accountability ciphertext (v9 ④) encrypts y and the parity of x. The auditor recovers x from the curve equation, so for an
  off-curve ent[j] (j < D) it opens x' ≠ x. Key revocation by the opened key, H(KEY_TAG, x', y), then misses the key the circuit checks.
- The research design requires "ciphertext bound to the witness → only valid curve points" (§ metric table, line 287), and the threat model
  includes malicious sub-agents (line 87), who choose their own public keys. H4 is therefore affected.

## Change
`AccHybridCompressed(N)`: `BabyCheck(px[j], py[j])` for every j < N (N = D + 1). Three constraints per key; ent[D] is checked twice (harmless).
Nothing else changes: same public inputs and order, same witness format, same scripts (copied from v9; setup script renames the verifiers V91).
Expected constraints: v9 + 3(D + 1) → D = 1..4: 60,628 / 105,433 / 150,238 / 195,043.

## Checks (all in this directory unless stated)
1. compile D = 1..4; constraint counts as expected.
2. `scripts/smoke.mjs`: honest instances D = 1..4 satisfiable.
3. `scripts/mutate_v9.mjs` D = 1..4 → `results/mutations_d$D.json`, with the audit #57 fix: the `revoked_cert{i}_*` cases refresh the revocation
   witnesses of every OTHER hop, so the targeted hop is the only stale one. The failing template and line are recorded for every rejected case.
4. Groth16 setup (Hermez 2^18, one new local phase-2 contribution; not a trusted setup), `check_public_binding.mjs`, `opening_check.mjs 10`.
5. **Off-curve PoC** (`scripts/offcurve.py` from #53, `scripts/offcurve_poc.mjs`): an off-curve ent[j], j = 0..3, D = 4, signature S = r + h·q
   with 8·A = q·B8.
   Expected: v9 witness satisfiable for every j, and for j = 3 a v9 proof that verifies with the committed v9 vk, plus a wrong opening.
   v9.1: unsatisfiable at `BabyCheck` for every j.
6. Proving time, paired v9 / v9.1 / v9 / v9.1, 10 fresh instances each, D = 1..4 (`prove_bench.mjs 10`). Expected: no difference beyond noise.
7. Verifier: the v9.1 Solidity verifiers differ from v9 only in the key constants (same number of IC points), so verifier gas is unchanged. Checked
   by diffing with digits masked; no new anvil receipts.

## Carry-over (stated before measuring)
T5, T6 and E6b were measured on v9. v9.1 adds 3(D + 1) of ~195k constraints and changes no public input. Those results are carried over to v9.1
with the paired proving delta of check 6 stated next to them; they are not re-measured. The T3 suite is re-run on v9.1 (`../../t3_attacks/v9_1/`).

## Outputs
build/ (git-ignored), zk/ (vks, verifiers, MANIFEST), results/, RESULTS.md, RUN_RECORD.md. Failures kept.
