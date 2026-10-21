# v8 = v7 (mode C) + private budget note (H3, option C) — results (issue #39)
Pre-registration: `PREREGISTRATION.md` (commit 9ca27ec, pushed before any run). E2 on real transactions: `../../t5_e2/E2-budget_20261009/`.

## Verdict
The counterexample of the research design (line 107) is **closed on the real system**:
- On the v7 gate, 32 delegates × 2 actions of 10 in one block were all accepted: **640** (E2 a3).
- On the v8 gate, with a minted budget of 100, at most 100 is ever accepted:
  - 10 notes of 10 → exactly 100 in one block;
  - 3 attempts per note in one block → 1 per note.
- Spent ≤ minted on chain, and a revoked branch's budget is frozen.

The cost is small in the circuit (+13,650 constraints, +23 ms proving at D = 4). On chain it is a ≈ +0.11 M gas execution increase (forge, D = 4) and
≈ +0.20–0.26 M gas per real transaction (D = 2 receipts).

## Circuit (zkdac_chain_v8.circom = v7 mode C + budget section; lineage = the chain's own certificates, owner = ent[D])
| D | constraints v7 C → v8 | public inputs | prove ms v7 C → v8 (10 fresh, M5 Pro) |
|---|---|---|---|
| 1 | 47,058 → 60,708 | 17 → 21 | 680 → 776 ± 48 |
| 2 | 91,948 → 105,598 | 19 → 23 | 1,280 → 1,336 ± 9 |
| 3 | 136,838 → 150,488 | 21 → 25 | 2,133 → 2,185 ± 13 |
| 4 | 181,728 → 195,378 | 23 → 27 | 2,445 → 2,468 ± 15 |
- **+13,650 constraints at every depth**, matching the pre-study measurement of the added components (14,886 with two outputs; v8 has one).
- D = 4 stays in the 2^18 domain, which is why its proving time barely moves.
- Budget transfer: 83,008 constraints, prove 1,181 ± 45 ms. Mint: 1,236 constraints, prove 34 ms. All verified 10/10 (results/bench_budget.json).

## T2 and witness cases
- **Single-field mutations** (results/mutations_d{1..4}.json; 200 / 284 / 411 / 538 fields). The accepted set is v7's — `now`, registered-root padding
  siblings, issued_root at D = 1 — plus the note-tree padding siblings `nt_sib[j ≥ nt_depth]` (here nt_depth = 2: indices 2–19 accepted, 0–1 rejected).
  No other new field is accepted.
- **Semantic cases**: 37 / 49 / 62 / 76 (D = 1..4); every v7 case gives the same outcome, and **0 are unexpected**.
- **Budget cases B1–B9**:
  - rejected: overspend with field wrap; conservation +1; note of another holder; note with a sibling's lineage; note not in the tree; another leaf's
    index; budget_nf from another secret or from the public key; change to another owner; change dropping a lineage entry; stale path with a newer root;
  - accepted, as pre-registered: spending everything (q_change = 0), and an older note root (POLICY, closed by the gate's note-root window).
- **Public inputs bound at proof level** for D = 1..4: the original proof verifies, the order is v7's then note_root, budget_nf, cm_change, q_spent, and
  every +1 fails (results/public_binding.json).
- **Transfer / mint / end-to-end (results/cases_budget.json, 27 rows, all as pre-registered)**:
  - mint opens only to its public q;
  - M → S1 → S11 → S111 delegations, each followed by the receiver spending in a real v8 action proof (D = 2 and D = 4);
  - a sibling cannot spend another's note;
  - rejected: conservation broken, field wrap, change dropping lineage, delegation without (or with the wrong) child certificate entry, wrong cap, wrong
    sk, depth-4 delegation;
  - after M's certificate to S1 is revoked: S1 and S11 can neither transfer nor act, while M and the sibling S2 still split, delegate and spend.
    The pre-revocation witness with the old root is accepted (POLICY, gate window).

## Contract ZkDacGateV8 (forge, real proofs; results in ../../t4_contracts/results/forge_v8.txt; full suite 167/167)
**8/8 tests pass.** They replay an ordered history:
- mint 100;
- M → S1 40;
- S1 spends 10;
- S1 spends again from the same note version (BudgetSpent);
- M → S2 20;
- S1 spends on a retired note root inside the window;
- S2 spends 20;
- S1 → S11 → S111;
- S111 spends at D = 4.

Separate tests:
- AmountMismatch;
- StaleNoteRoot after the window;
- mint by a non-operator, and mint with the wrong amount;
- an action then a transfer of the same note (BudgetSpent: one nullifier space);
- revocation by the issuer freezes S1's budget for actions and transfers after Δ.

| gas (forge, excluding intrinsic and calldata) | v8 | V7R |
|---|---|---|
| execute D = 4, budgeted | **552,684** | 441,751 (+110,933) |
| execute D = 2, budgeted (first execute: cold storage) | 583,771 | — |
| transferBudget (2 note inserts) | 473,346 | — |
| mint | 300,982 | — |

## E2 — real transactions, one block per race (anvil 1.5.1, prague; ../../t5_e2/E2-budget_20261009/results/e2_anvil.json)
| race | setup | submitted | succeeded | rejected | accepted total |
|---|---|---|---|---|---|
| a1 (v8) | 100 split into 10 notes of 10; 32 delegates attempt 10 each (22 hold no note, so no proof can be built) | 10 | 10 | 0 | **100** of 100 |
| a2 (v8) | 4 delegates × 25; each submits 3 actions of 10 on the same note version | 12 | 4 | 8 BudgetSpent | 40 |
| revocation (v8) | M revokes T1's certificate; after Δ = 30 s: T1's pre-built proof and T2's proof | 2 | 1 (T2) | 1 StaleRevokedRoot (T1) | — |
| a3 (v7 gate, no budget) | 32 delegates × 2 actions of 10 | 64 | 64 | 0 | **640** |
- After the revocation, T1 cannot even build a fresh proof (no non-membership witness exists).
- Conservation on chain: minted 200, spent 150 (BudgetUsed events). The 50 unspent are T1 15 (frozen), T2 5, T3 15, T4 15. The on-chain note root equals
  the off-chain mirror.
- **Real receipt gas** (including intrinsic and calldata):

  | | gas |
  |---|---|
  | v8 budgeted execute, D = 2 | 619,586–681,390 (the variation is the LeanIMT insert path length and cold storage) |
  | v7R execute, D = 2 | 416,904–416,976 |
  | difference | +0.20–0.26 M per action |

  This is above my earlier estimate of +0.185 M (that estimate excluded the 4 extra calldata words, the note-root retirement SSTORE and the events).

## Deviations from pre-registration (transparent)
- **One gate for all depths.** The pre-registration described V7R plus budget (a V7R gate serves one D). Budget flows across depths (M at D = 1 → S111 at
  D = 4), so per-depth gates would have separate note trees. ZkDacGateV8 therefore maps the number of ciphertext words to the D-specific verifier, and all
  depths share one note tree (storage lookups instead of immutables; included in the gas above).
- `cases_budget.mjs` run 1 crashed: a test constructed a note that was not in the tree. The intended case — a sibling spends the real note of S1 — was
  rewritten; run 1 stderr is kept.
- The forge fixture's mint step has no `expect` field. The first V8 test run failed on reading it (5/8). The test now reads `expect` only for non-mint
  steps; the fixtures were not regenerated.
- E2 run 1 failed at deployment: ZkDacGateV8 links PoseidonT3 through LeanIMT, and my deploy script did not link it. Fixed; run 1 stderr is kept.
- The v8 `node_modules` symlink to v7's was committed in e1b96a5 and untracked in the next commit (.gitignore now also ignores symlinks).

## Limits
- Mint is operator-only (trusted issuer); funding, refunds and re-issue are out of scope. Single asset.
- One note version per block. Concurrency needs pre-split notes (a2), and pre-splitting costs one transfer transaction (≈ 0.47 M gas) per split.
- A note-root window is required (proofs are built on retired roots inside it). Its value trades availability for nothing security-relevant: double
  spending is prevented by budget_nf, not by the root.
- Public information per action: q_spent (= the action amount, already public), budget_nf, cm_change, and the note-root update. The number of budgeted
  actions is visible, but not who made them.
- Accountability ciphertexts cover the chain keys, not the note.
- No formal proof. Re-check ZKM (near neighbour) before submission.

## Corrections 2026-10-12 (audits #56 / #59; appended, text above unchanged)
- **Budget transfer constraints: 84,008, not 83,008.** The r1cs and the claim ledger both give 84,008.
- **E2 a3 is not a "per-edge cap" counterexample.**
  - v7's `cap` is a 32-bit permission bitmap, and neither the v7 circuit nor the v7R gate has any quantity limit. The last constructor argument
    `10` in `e2_anvil.mjs:61` is the number of ciphertext words, not a cap. The "≤ 10 certificates" of the pre-registration had no implementation.
  - a3 shows that **v7 has no quantity semantics at all.** Any per-delegate amount would also be accepted.
  - It does not show the research-design statement (line 107) that local caps do not imply a sibling-total cap, because there were no local caps.
    The v8 results (a1 100 / 100, a2) are unaffected.
- **a2 wording.** "12 submitted, 4 succeeded" is 4 notes × 3 attempts on each, and exactly 1 per note succeeded, as pre-registered. The
  design's case "32 delegates sharing one note" cannot be constructed in v8 (a note has one owner) and was not tested.
- **Concurrency.** All transactions in a race come from one EOA with consecutive nonces, so the execution order is fixed and the first attempt per
  note always wins. Random order, multiple senders, conflict retries and p95 / p99 (research design E2) were not done. Safety does not depend on
  the order, because the nullifier set rejects every second spend whatever the order. This is disclosed, not re-run.
- **Revocation freeze.** T1's pre-built proof was rejected with StaleRevokedRoot. Any proof built before *any* revocation is rejected the same way
  after the window, and there was no unrevoked pre-built control. "The note cannot be transferred" was not tested on chain. The circuit-level
  check is in T3 (A12, A18e) and in T5b (301 / 301 blocked agents rejected by the circuit).
