# v9.2 = v9.1 + non-zero holder secret (finding F-2) — pre-registration (committed and pushed BEFORE any run)

**Trigger.**
- Finding F-2 of T7c (`../../t7_proofs/T7c-proof-mapping_20261013/RELATION_SPEC_v9_1.md` §8, `RESULTS.md`).
- User decision, 2026-10-13: fix it with a constraint.
- v9.1 (`../zkdac_v9_1`, tag `v9.1-freeze-20261013`) and all v9.1 evidence stay unchanged.

## Problem
- EX-8 accepts holder_sk = 0: `Num2Bits(251)` and `holder_sk < l` both pass, and BabyPbk(0) = O = (0, 1). T7c checked that 0·B8 = (0, 1).
- If an issuer certifies the identity point O as a holder and the certificate is in the issued tree, anyone can act as that holder.
  - Its budget notes are spendable by anyone: budget_nf = H_3(TAG_BNF, 0, cm) is public knowledge.
  - The opening shows O at hop D. The issuer ent[D−1] is still identified.
- T3 A03b tested only an *unregistered* identity hop, which MerkleMember rejects.

## Change
- One constraint in `ZkDacChainV9`: `holder_sk` has an inverse (`sk_inv <-- 1 / holder_sk; sk_inv * holder_sk === 1`), so holder_sk ≠ 0.
- Since B8 has prime order l and holder_sk < l, this is equivalent to ent[D] = holder_sk·B8 ≠ O.
- Nothing else changes: the same public inputs and order, the same witness format apart from the new internal signal, and the same scripts. The setup script names the verifiers V92.
- **Expected constraints:** v9.1 + 1. For D = 1..4: 60,629 / 105,434 / 150,239 / 195,044.
- **Not changed, with reasons:**
  - **budget_transfer** (owner sk = 0). An O-owned note can only arise from the operator (trusted mint) or from an owner delegating its own budget to O (TR-7). With v9.2 such a note can never be spent by EXECUTE. Moving it with TRANSFER cannot create budget, because conservation (TR-4) still holds. It also cannot hand the note to a usable child: the child's certificate would need O's signature, and EdDSA rejects a small-order signer key (8·A ≠ O). So the effect is limited to the delegator's own budget becoming unusable.
  - **registration and revocation circuits.** s = 0 or sk = 0 there concerns only the identity key itself (Semaphore membership is decided by the operator; a key entry for O revokes nothing anyone uses).

  These reasons go into RESULTS.md and are not re-tested beyond check 5.

## Checks (in this directory unless stated)
1. Compile D = 1..4. The constraint counts are as expected and the public-input counts (17..20) are unchanged.
2. `scripts/smoke.mjs`: honest instances D = 1..4 satisfiable; the auditor recovers ent[0..D].
3. `scripts/mutate_v9.mjs` D = 1..4. The set of accepted field mutations is identical to v9.1 (`../zkdac_v9_1/results/mutations_d*.json`), and the semantic cases have the same outcome. The new constraint only adds rejections where holder_sk = 0.
4. **F-2 PoC** (`scripts/f2_poc.mjs`). D = 1..4, in a world where the issuer of hop D−1 has certified O as the holder and that certificate is in the issued tree (for D = 1: registered as the master).
   - Expected for v9.1: the witness is satisfiable, and a real v9.1 proof verifies with the committed v9.1 VK. This shows F-2 is real.
   - Expected for v9.2: unsatisfiable at the new constraint, for every D.
   - Also expected: holder_sk = l and holder_sk = p − 1 are UNSAT in both versions, at the existing range checks.
5. Groth16 setup on Hermez 2^18, with one new local phase-2 contribution (not a trusted setup). Then `check_public_binding.mjs`, and `opening_check.mjs 10` (opening unchanged: single key and 3-of-5 exact, 10 / 10 per D).
6. T3: the v9.1 attack suite re-run on v9.2 (`../../t3_attacks/v9_2/`, paths only). Expected: every v9.1 row has the same class, plus new rows A25a–d (F-2 at D = 1..4): AGREE_REJECT on v9.2, FALSE_ACCEPT for the same rows judged on v9.1.
7. Gate: the E7c suites (H history, P POLICY, B batch N = 30 per D, G7) ported to the V92 verifiers (`../../t4_contracts/E7d-v92-gate_20261013/`, paths only).
   - Expected: every test passes as on v9.1.
   - Plus a new gate test: an F-2 proof made with v9.1 is accepted by a v9.1 gate and rejected by the v9.2 gate.
8. Verifiers: identical to v9.1 with digits masked (same number of IC points), so verifier gas is unchanged.

**Carry-over, stated before measuring.**
- One constraint out of ~195k. Proving time and gas are not re-measured.
- T5, T6, E6b/E6b2, E6c and T8b are carried over from v9.1 with this note. The opening logic and the ciphertext are unchanged; check 5 re-verifies opening on v9.2.
- The v9.1 second-environment reproduction (T8b) does **not** cover v9.2. Re-running it for v9.2 is a separate step: it needs a new freeze tag and release.

## Outputs
- build/ (git-ignored);
- zk/ (VKs, verifiers, MANIFEST);
- results/, RESULTS.md, RUN_RECORD.md;
- release `v9.2-proving-material-<date>` after the checks;
- failures are kept.
