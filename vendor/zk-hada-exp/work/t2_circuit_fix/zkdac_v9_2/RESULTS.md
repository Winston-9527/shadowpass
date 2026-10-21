# v9.2 = v9.1 + non-zero holder secret (T7c finding F-2) — results
Pre-registration: `PREREGISTRATION.md` (48ba1d5, pushed before the change or any run). Commands: `RUN_RECORD.md`. 2026-10-13, Apple M5 Pro.

## Verdict
- **F-2 is real on v9.1 and closed in v9.2.** For D = 1..4, a chain whose issued (or, for D = 1, registered) holder is the identity point O, with holder_sk = 0:
  - v9.1: the witness is satisfiable, and a real v9.1 proof verifies with the committed v9.1 VK, so anyone can act as that holder;
  - v9.2: unsatisfiable at the new constraint (`ZkDacChainV9 L204`).
- On the real gate (E7d): the same identity-holder proofs are **accepted by a v9.1 gate** and **rejected by the v9.2 gate**.
- **Nothing else changes:**
  - constraints are exactly v9.1 + 1;
  - public inputs are unchanged;
  - the mutation results equal v9.1 row by row;
  - T3 has the same class on all 174 rows;
  - all 75 gate tests pass;
  - the full forge suite passes, 367 / 367.

## Checks
| check | result | file |
|---|---|---|
| 1 compile | D = 1..4: 60,629 / 105,434 / 150,239 / 195,044 constraints (v9.1 + 1); 17 / 18 / 19 / 20 public inputs | results/compile.txt |
| 2 smoke | honest D = 1..4 accepted; the auditor recovers ent[0..D] | results/smoke.txt |
| 3 mutations | 199 / 282 / 408 / 534 field mutations: accepted set and every (field, accepted) row **identical to v9.1** (37 accepted per D, as in v9.1); semantic case outcomes identical | results/mutations_d*.json |
| 4 F-2 PoC | D = 1..4, holder O, holder_sk = 0: v9.1 SAT and the proof verifies; v9.2 UNSAT at L204. holder_sk = l: UNSAT in both (range check; v9.1 L200, v9.2 L201). holder_sk = p − 1: UNSAT in both (Num2Bits) | results/f2_poc.json |
| 5 setup, binding, opening | 4 zkeys verify against Hermez 2^18 (one local phase-2 contribution; not a trusted setup); every public word + 1 fails; opening 10 / 10 per D (single key and 3-of-5; forced 2 shares wrong 10 / 10) | results/setup.txt, public_binding.json, opening_check.json |
| 6 T3 | `../../t3_attacks/v9_2/`: summary and every row's class identical to v9.1 (28 / 118 / 7 / 21). The 27 failure locations that differ are the same templates shifted by the inserted lines (+1 after the header comment, +4 after the new constraint). Exhaustive diff D = 4 identical (534 / 89 / same 3 statement-level rows) | ../../t3_attacks/v9_2/results/ |
| 7 gate | `../../t4_contracts/E7d-v92-gate_20261013/`: V92 history, POLICY, batch (N = 30 per D), G7: **75 / 75**, including the F-2 contrast (v9.1 gate accepts, v9.2 gate rejects) | E7d RESULTS.md |
| 8 verifiers | identical to v9.1 with digits masked, D = 1..4, so verifier gas is unchanged | results/verifier_diff.txt |

## Not changed, and why
These reasons were stated in the pre-registration and are not re-tested beyond check 5.
- **budget_transfer: an owner with sk = 0 is still possible.** Such a note can be created only by the trusted operator or by an owner delegating its own budget to O.
  - It can never be spent: v9.2 EXECUTE rejects it.
  - Conservation still holds when it moves.
  - It cannot reach a usable child, because that child's certificate needs O's signature, and EdDSA rejects a small-order signer.
- **Registration and revocation with s = 0 or sk = 0** concern only the identity key itself.

## Deviations from the pre-registration
- **A25a–d.** The pre-registration placed the F-2 rows as T3 rows A25a–d. They were run instead by `scripts/f2_poc.mjs` (check 4) and E7d (check 7), with the same content: D = 1..4 at witness level; D = 2, 4 on the gate. The T3 script was copied unchanged apart from paths, so its 174 rows remain directly comparable with v9.1.
- **Misleading labels in the E7d log.** In the E7d generator the variable named `V91` points to zkdac_v9_2 (paths only), so the stderr label "offcurve j=… v9.1" there refers to v9.2. The F-2 rows use `V91REAL` for the v9.1 proofs.

## Carry-over
- T5, T6, E6b/E6b2 and E6c are carried over from v9.1 with one constraint added. The opening logic and the ciphertext are unchanged, and check 5 re-verified opening.
- **T8b (second-environment reproduction) covers v9.1, not v9.2.** Re-running it for v9.2 needs a freeze tag and a release; see the PR.
