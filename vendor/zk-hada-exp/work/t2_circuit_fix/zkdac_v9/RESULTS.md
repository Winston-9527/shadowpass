# v9 = v8 with fewer public inputs — results (issue #41)
Pre-registration: `PREREGISTRATION.md` (commit eb7dad9, pushed before any run).

Changes, each detailed below:
- ① no action nullifier;
- ③ one public state root;
- ④ compressed accountability keys.

## Verdict
- **Public inputs**: D = 4 goes from 27 to **20** (D = 1..4: 17 / 18 / 19 / 20).
- **Real transaction (anvil, prague)**: a budgeted D = 4 action costs **564,147 gas, vs 636,125 for v8 (−71,978, −11.3 %)**. At D = 2: 577,509 vs 671,054.
- **Proving time**: unchanged (paired measurement).
- **Security**: every pre-registered check holds, and the auditor still recovers every key, also through the E6 threshold opening.
- **Compared with v7 without a budget** (484,925 at D = 4), the budget now adds ≈ 79k gas per action.

## Circuit
| D | constraints v8 → v9 | public inputs v8 → v9 |
|---|---|---|
| 1 | 60,708 → 60,622 | 21 → 17 |
| 2 | 105,598 → 105,424 | 23 → 18 |
| 3 | 150,488 → 150,226 | 25 → 19 |
| 4 | 195,378 → 195,028 | 27 → 20 |
**Proving, paired** (v8, v9, v8, v9 in one session; 10 fresh instances each; results/prove_bench_paired_v8_v9.txt):

| | v8 | v9 |
|---|---|---|
| D = 4, run 1 / run 2 (ms) | 2,565 / 2,532 | 2,556 / 2,528 |

There is no difference. The first unpaired v9 run (2,592 ms, results/prove_bench.json) against the earlier v8 run (2,468 ms) differed only because the
machine state differed between sessions.

## Checks
- **T2** (results/mutations_d{1..4}.json; 199 / 282 / 408 / 534 single-field mutations; 37 / 49 / 62 / 76 semantic cases; **0 unexpected**).
  - The accepted field set is v8's minus `issued_root` at D = 1 (now bound through state_root), **plus `ctx_hash` and `act_req_cap`**.
  - Why those two are accepted at witness level: in v8 they were tied to the holder secret through the action nullifier. Without it they are free public
    inputs — a holder may prove for any context, or any req_cap ⊆ its cap; this is the same statement as v8's EXPECT_ACCEPT case "holder re-proves for
    another ctx". They are bound at **proof level** (next item) and by the gate, which computes ctx_hash and req_cap itself (#18 G4 / G5).
  - `ctx_hash` appears in a dummy square constraint, so it is not an unconstrained public input.
  - v9 cases (all rejected as pre-registered):

    | case | result |
    |---|---|
    | S1: state_root + 1 | rejected |
    | S2: issued and revoked roots swapped, state_root kept | rejected |
    | S2b: same swap, state_root recomputed | rejected |
    | K1: parity word + 1 | rejected |
    | K2: y-word of another key | rejected |

  - All v8 budget, revocation and registry cases keep their outcomes. For them, state_root is recomputed after each mutation, so the rejection comes from
    the real check and not from a state-root mismatch.
- **Public inputs bound at proof level**, D = 1..4: the original proof verifies; the order is state_root, now, ctx_hash, req_cap, tpk, c1, c2, e[0..D], e_sign,
  note_root, budget_nf, cm_change, q_spent; and every single +1 fails (results/public_binding.json).
- **Auditor opening from the compressed ciphertext** (results/opening_check.json; 10 fresh instances per D):

  | check | D = 1..4 |
  |---|---|
  | single committee key: exact recovery | 10/10 |
  | E6 threshold 3-of-5 (DLEQ shares, no tsk reconstruction): exact recovery | 10/10 |
  | witnesses encrypted to the committee key: satisfiable | 10/10 |
  | forced 2-share opening: wrong output | 10/10 |

  A wrong K almost never yields a parity word < 2^N and valid curve points, so the compressed format keeps mode C's built-in consistency check.

## Contract ZkDacGateV9 (forge, real proofs; results in ../../t4_contracts/results/forge_v9.txt)
**11/11 tests pass**:
- the whole v8 history (mint, transfers, actions at D = 2 and D = 4, a second spend of the same note → BudgetSpent);
- AmountMismatch;
- StaleNoteRoot after the window;
- mint authority and amount;
- an action then a transfer of the same note;
- revocation freezes the budget after Δ (latency unchanged);
- **replay of an executed proof → BudgetSpent**: without an action nullifier, the budget nullifier makes proofs single-use;
- an unregistered root combination → UnknownState;
- registerState equals the circuit's Poseidon, is permissionless and is idempotent.

| gas | v8 | v9 | Δ |
|---|---|---|---|
| execute D = 4 (forge, excl. intrinsic / calldata) | 552,684 | 480,879 | −71,805 |
| execute D = 2 (forge, first execute) | 583,771 | 528,611 | −55,160 |
| **execute D = 4 (anvil receipt, incl. everything)** | 636,125 | **564,147** | **−71,978** |
| execute D = 2 (anvil receipt) | 671,054 | 577,509 | −93,545 |
| calldata D = 4 | 1,316 B | 1,156 B | −160 B |
| registerState, new combination / already registered | — | 106,105 / 1,841 | once per root change |

- The pre-registered estimate was ≈ −0.07 M at D = 4; measured −0.072 M.
- D = 2 saves more in the receipts because v8's first execute also pays the cold action-nullifier SSTORE.
- Mint and transfer are unchanged (≈ 320k and ≈ 510k receipts).

## Deviations (transparent)
- **Public-input count.** My message to the user said 27 → 18; it is 27 → 20. Corrected in the pre-registration before any run.
- **Estimate for ③.** Revised down before any run (≈ −11k instead of −13k), because a per-root acceptance check needs one storage read.
- **The receipts script** was derived from E2's. Two problems on its way to a run, neither of which produced any output:
  1. Library linking: v9 links PoseidonT3 and PoseidonT4. The E2 deploy helper replaced every placeholder with one address; it now links by position.
  2. A duplicate declaration from the copied code was removed.
- **Prove bench, first unpaired run**: see "Proving, paired" above.

## Limits
- v9 actions must be budgeted. Non-value actions also consume a note: mint zero-value or small notes for them, or use the v7 gate.
- A new root combination needs one registerState (≈ 0.1 M gas, anyone can pay it) before proofs against it can be submitted.
- T3 attack suite on v9: not run yet (next task).

## Corrections 2026-10-12 (audits #53 / #57; appended, text above unchanged)
- **"The auditor still recovers every key" is false for v9 (#53).**
  - Intermediate keys ent[0..D-1] are not checked to be on the curve. circomlib's EdDSA verifier uses only 8·A, computed with the addition formula.
  - An off-curve A with 8·A = q·B8 passes at every hop j = 0..3: v9 witness satisfiable, and for j = 3 a real v9 proof verifies with the committed vk.
  - The compressed opening then returns a different x for that key, so the key-revocation entry computed from the opening misses the key the
    circuit checks.
  - Evidence: `../zkdac_v9_1/results/offcurve_poc.json`.
  - **Fixed in v9.1** (`../zkdac_v9_1/`): `BabyCheck` on every encrypted key, +3(D + 1) constraints. The same inputs are rejected at BabyCheck. v9 is
    kept as the measured artefact. T5 / T6 / E6b numbers carry over to v9.1 with the paired proving delta stated in v9.1's RESULTS.
- **T2 "0 unexpected" is relative to the author's labels** (#57). A semantic case is expected to be accepted iff its name contains
  `EXPECT_ACCEPT`. Single-field mutations have no expectation; only the accepted fields are listed. "Satisfiable" means the wasm computes a
  witness; it was not re-checked against the r1cs.
- **The revoked_cert{i ≥ 1}_* cases (#57)** were built with stale witnesses on the other hops (and on the key slots), so they failed at IMTPath
  for an unrelated reason. Re-run on v9.1 with the other hops refreshed: every case fails at the intended check (IMTNonMember L67 / L59 or
  IMTPath L39 for the forged leaf), and the acceptance pattern is identical to v9 (`../zkdac_v9_1/results/mutations_d*.json`).
