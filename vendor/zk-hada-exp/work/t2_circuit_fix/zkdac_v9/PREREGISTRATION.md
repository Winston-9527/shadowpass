# v9 = v8 with fewer public inputs (①③④) — pre-registration (committed BEFORE any run)
User decision 2026-10-09: implement ① ③ ④ (② hard-coding TPK rejected). Base: main b60bc1b (v8 merged). v8 stays unchanged in ../zkdac_v8.

## Changes (D = 4: 27 → 18 public inputs)
① **Drop the action nullifier.** Every v9 action consumes a budget note, so `budget_nf` alone makes each proof single-use. The proof still binds ctx_hash;
   the gate keeps only the budget-nullifier set (one SSTORE fewer).
③ **One state root.** `state_root = Poseidon(issued_root, revoked_root, root_root)`; the three roots become private inputs.
   - The gate keeps `stateOf[keccak(issued, revoked, root)] = state_root`, filled by a permissionless `registerState()`: one on-chain Poseidon per new
     combination of roots.
   - `execute` receives the three roots in calldata, looks up state_root (1 SLOAD) and checks EACH root with its own rule, exactly as v8 does (issued
     window, ZkDacRevocations.rootAccepted, registry.rootAccepted). Revocation latency is therefore unchanged.
   - Rejected alternative: accepting a combined root by its own window would delay revocation until someone refreshes the combination.
④ **Compressed accountability keys.** The keystream now encrypts y-coordinates only, plus one word with the x-parity bits:
   `e[j] = y_j + PRF(K, j)` for j = 0..D and `e_sign = Σ_j parity(x_j)·2^j + PRF(K, D+1)`. That is D + 2 words instead of 2(D + 1).
   The auditor recovers x_j from y_j by the curve equation and the parity bit. Mode C only.

Order of public inputs: state_root, now, ctx_hash, act_req_cap, tpk(2), c1(2), c2(2), e[0..D], e_sign, note_root, budget_nf, cm_change, q_spent.

## Estimates stated before measuring (per action, D = 4)
| item | inputs | gas |
|---|---|---|
| ① | −1 | ≈ −6.6k verifier, −22.1k SSTORE |
| ③ | −2 | ≈ −13.3k verifier, +≈2.3k (SLOAD + keccak) |
| ④ | −4 | ≈ −26.6k verifier, ≈ −2k calldata |
| total | −7 vs v8 (27 → 20) | ≈ −0.07 M |

Correction to my message to the user ("27 → 18, ≈ −0.08 M"): the calldata still carries the three roots for ③, and ① removes one input, so the count is
27 → 20. Constraints: +≈1.5k (parity bits) + 1 Poseidon(3) − the nullifier Poseidon.

## Checks
- T2: single-field mutations D = 1..4 and the v8 semantic + budget cases (the action-nullifier cases are removed; budget_nf cases kept). New:
  - S1 state_root not matching the three private roots → reject;
  - S2 two roots swapped → reject;
  - K1 e_sign parity bit flipped → reject;
  - K2 y-word of another key → reject.
- Public binding at proof level, D = 1..4 (every +1 fails; order as above).
- Auditor opening (single key and the E6 threshold opening) recovers ent[0..D] exactly from the compressed ciphertext for D = 1..4, N = 10 fresh instances
  each.
- Contract ZkDacGateV9 (forge, real proofs):
  - the v8 history S0..S9;
  - replay of an executed proof → BudgetSpent;
  - an unregistered state combination → revert;
  - a revoked root inside / after Δ (latency unchanged);
  - registerState is permissionless and idempotent.
- Gas: forge execute D = 2 / D = 4 vs v8 on the same history; anvil receipts for one budgeted action, v8 vs v9.
- Prove time D = 1..4 (N = 10).
- T3 attack suite on v9: next task (not in this PR).

## Pass criterion
No FALSE_ACCEPT outside stated POLICY / EXPECT_ACCEPT rows; the auditor recovers every key; gas measured (no promise of the estimate).
