# v8 = v7 (mode C) + private budget note (H3, option C) — pre-registration (committed BEFORE any run)
Issue #39 (user decision 2026-10-09: no title shrink; H3 via option C). Branch `v8-budget-note` from main cd18d8e. Pre-study: PR #38.
Research design anchors: P3/C3 (lines 105–123), Q2 (line 151), E2 (lines 177, 231), ablation "consumable budget → independent child caps" (line 284).

## Design
- **Note** = Poseidon(owner.x, owner.y, q, lin[0], lin[1], lin[2], lin[3], rho); q < 2^64; one asset unit (stated).
- **Action proof v8 (circuit `zkdac_chain_v8.circom`)** = v7 mode C unchanged, plus a budget section. The spent note has
  - owner = ent[D] (the terminal holder, already proven by holder_sk);
  - lin[j] = cert[j] for j < D and 0 otherwise.

  Revocation inheritance is therefore exactly v7's per-hop / per-key checks: no new revocation logic.
  New public inputs, after v7's: note_root, budget_nf = Poseidon(TAG_BNF, holder_sk, cm_in), cm_change, q_spent. New constraints: LeanIMT membership of cm_in
  (depth ≤ 20); 64-bit ranges; q_in = q_spent + q_change; cm_change = note(ent[D], q_change, lin, rho_change).
- **Budget transfer proof (`budget_transfer.circom`)**: one input note, two outputs, from the pre-study `note_transfer`. Differences:
  - the new lineage entry for a delegation is the child CERTIFICATE hash Poseidon(d, owner, child, cap, expiry), with d = the number of active slots;
  - inputs from a revoked lineage or a revoked owner key cannot move.
- **Mint (`budget_mint.circom`)**: proves cm opens to the public q (64-bit). Mint is operator-only in the contract: a trusted issuer. Funding is out of scope.
- **Contract `ZkDacGateV8`** = ZkDacGateV7R plus
  - a LeanIMT note tree; a note root is accepted while current or retired < noteWindow;
  - a budget-nullifier set;
  - `q_spent == act.amount`;
  - insertion of cm_change;
  - `transferBudget` (verify, nullifier, insert 2 notes) and operator `mint` (verify, insert, totalMinted += q).

## T2 (witness level, D = 1..4)
- Single-field +1 mutation of every input. Expected accepted set: the v7 set (`now`, LeanIMT padding siblings, issued_root at D = 1) plus note-tree padding
  siblings nt_sib[j ≥ nt_depth] (unused by BinaryMerkleRoot; the root is still bound). Every other new field must be rejected.
- Semantic budget cases (expected reject unless stated):
| ID | Case |
|---|---|
| B1 | q_spent > q_in (change would be negative), and q_spent = q_in + 1 with q_change = p − 1 (field wrap) |
| B2 | note of another holder (same lineage, other owner) |
| B3 | note whose lineage is a SIBLING chain's certificates (the budget of a sibling) |
| B4 | note not in the note tree; nt_index of another leaf |
| B5 | budget_nf from another secret / from the public key |
| B6 | change note with another owner or another lineage (budget laundering) |
| B7 | spend everything: q_change = 0 (expected ACCEPT) |
Public-input binding at proof level for D = 1..4 (every input +1 fails; order = v7's 23 (D = 4), then note_root, budget_nf, cm_change, q_spent).

## Budget transfer / mint (witness level)
Valid: split; delegate at depth 1..3 to a child whose certificate is the real v8 chain certificate (the child can then spend in a v8 action proof — end-to-end
check). Invalid (reject): conservation broken, field wrap, dropping a lineage entry, delegating without the child certificate entry, wrong sk, revoked
lineage or owner key, depth-4 note delegating. Mint: q opened ≠ public q → reject.

## Contract (forge, real proofs; D = 2 and D = 4)
| ID | Case | Expected |
|---|---|---|
| G-B1 | valid budgeted action | executes; budget nullifier spent; change inserted; note root advances |
| G-B2 | q_spent ≠ act.amount | revert |
| G-B3 | second action from the same note version (replayed budget_nf, new action nullifier) | revert (budget nullifier) |
| G-B4 | proof against a note root retired < noteWindow ago / ≥ noteWindow ago | accept / revert |
| G-B5 | mint by non-operator | revert |
| G-B6 | transfer then child spends | both succeed; totals conserved (minted = spent + Σ unspent, checked off-chain from events) |
| G-B7 | after an issuer revokes the child's certificate (ZkDacRevocations): child action and child transfer | rejected after Δ |
v7/V7R tests must still pass unchanged.

## E2 (anvil, real transactions; automine off so all candidates land in ONE block)
Budget 100 minted to M; delegates on D = 2 chains under M; each attempt spends 10. A note can only be spent by its owner, so budget reaches delegates only
through M's budget transfers.
| variant | setup | expected |
|---|---|---|
| a1 | M splits 100 into 10 notes of 10 for 10 delegates; 32 delegates attempt (22 hold no note, so cannot build a proof) | 10 succeed, accepted total 100 |
| a2 | 4 delegates hold 25 each; each submits 3 actions of 10 built on the same note version, same block | 1 per note succeeds (the others reuse budget_nf); total 40 ≤ 100 |
| a3 | per-edge caps only (v7 gate, no budget), 32 delegates with "≤ 10" certificates, plus each repeats 2× | 640 accepted: the counterexample on the real gate |
Revocation freeze: revoke one delegate's certificate; after Δ its note can be neither spent nor transferred; siblings unaffected.
Report accepted totals, failures by revert reason, gas.

## Measurements
Constraints and prove time for v8 D = 1..4 (N = 10 fresh) vs v7; transfer and mint circuits; gas of budgeted execute (forge + one anvil receipt) vs
v7R execute; transfer and mint gas.

## Pass criterion
No FALSE_ACCEPT outside stated POLICY / EXPECT_ACCEPT rows; no accepted total above the minted budget in any E2 variant using v8; invariant holds. Deviations
are reported, raw outputs kept.
