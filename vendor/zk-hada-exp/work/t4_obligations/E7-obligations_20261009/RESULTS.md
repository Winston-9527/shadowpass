# #18 contract obligations on the main gate — results
Pre-registration: `PREREGISTRATION.md` (commit d22546b, pushed before any run). Raw outputs: `results/`. Run details: `RUN_RECORD.md`.

## Summary against the research design
- **P1 (line 83)**: roots, clock, nullifiers, context and req_cap are enforced by the v7 gate. Every one of the 18 T3 v7 POLICY rows has a closing contract test
  (`POLICY_CLOSURE.md`).
- **C2 (line 97) — met**: a revocation must now prove authority. The issuer of the certificate, its holder, or the revoked key itself must know the secret
  key; knowing the entry or the public keys does not suffice. The revocation set only moves forward: the "un-revoke" found in E3 is gone.
- **E7 (line 180)**: real receipts on geth and anvil. Statuses agree on all clients; gas is identical across clients for the same fork; breakdown below.

## Part 1 — obligations on ZkDacGateV7 (real mode C D = 4 proof; results/forge_obligations.txt)
15/15 as pre-registered:
- G1 clock: now = ts and ts − skew accepted; ts − skew − 1 and ts + 1 → BadClock.
- G2 business revert: whole tx reverts, nullifier unspent; retry succeeds once, then NullifierSpent.
- G3 re-entrant replay from the callback → NullifierSpent.
- G4 other chainId / gate / method / amount / params / nonce / target → InvalidProof (7/7).
- G5 contract-supplied req_cap → InvalidProof.
- G6 disabled method → UnknownMethod.

## Part 2 — authorized, monotonic revocation
**Circuit `revoke/circuits/revoke_transition.circom`**: 51,815 constraints (27,631 non-linear), 4 public inputs (old_root, new_root, entry, next_index).
Proving: 742 ± 143 ms (median 682), witness 82 ms, verify 6.3 ms, 10/10 verified (results/revoke_bench.json). zkey: Hermez 2^18 + one local phase-2
contribution (not a trusted setup).

**Witness level (results/revoke_witness.json, 19 rows, all as pre-registered)**:
| ID | Case | Result |
|---|---|---|
| V1 | issuer revokes cert hop 1 / 2 / 3; new root equals the reference IMT insertion | accept (3/3) |
| V2 | holder self-revokes its incoming cert hop 1 / 2 / 3 | accept (3/3) |
| V3 | key ent[2] / [3] / [4] revokes its own key entry | accept (3/3) |
| V4 | ancestor ent[1], not the issuer, with its own sk; or presenting its own cert as authority | reject (2/2) |
| V5 | random sk; key entry with who = 1 and the child's sk; key entry with the issuer's sk | reject (3/3) |
| V6 | wrong new_root; entry already revoked; each of the 12 non-predecessor leaves as low leaf; occupied slot | reject (all) |
| V6 | empty slot ≠ count | circuit accepts (as pre-registered); the contract supplies count (forge) |

**Contract level (forge RevokeV7RTest, 12/12)**:
- V1–V3 + V11 in sequence: the on-chain root after each step equals the root from replaying the event log.
- V7 replay of an applied proof → InvalidProof.
- V8 concurrent proofs against the same root: the second fails; the one rebuilt on the new root succeeds.
- V6 slot ≠ count → InvalidProof. Tampered newRoot, another entry → InvalidProof. Field overflow → BadField.
- V9: there is no root setter (`updateRoots` / `setRoot` calls fail), and the old root expires after Δ.
- V10: the real v7 C D=4 action proof whose own hop-2 certificate is revoked by its issuer is accepted at t0 + Δ and rejected (StaleRevokedRoot) at t0 + Δ + 1.

Gas (forge, excluding intrinsic and calldata):
- `revoke`: 237,029, of which verifyProof is 213,891.
- `ZkDacGateV7R.execute`: 441,751, which is +3,177 over ZkDacGateV7 (438,574) for the external `rootAccepted` call.

## Part 3 — real receipts (results/e2e_v7r.json, run 4; chain id 1337)
Clients:
- geth 1.17.7 `--dev` with the genesis it ships, which activates shanghai … osaka **and bogota** at 0;
- the same genesis without bogotaTime (Osaka only);
- anvil 1.5.1 `--hardfork` osaka, prague and cancun.

| tx (gasUsed) | geth Osaka-only | anvil osaka | anvil prague | anvil cancun | geth as shipped (Bogota) |
|---|---|---|---|---|---|
| register (2) | 362,597 / 405,414 | same | same | same | 802,997 / 860,614 |
| execute #1 (valid) | 484,925 | 484,925 | 484,925 | 484,925 | 750,585 |
| execute #1 replay (forced into a block) | status 0, 59,040 | status 0, 59,040 | status 0, 59,040 | status 0, **55,213** | status 0, 59,040 |
| revoke (issuer, hop 2) | 273,544 | 273,544 | 273,544 | 273,544 | 376,364 |
| execute #2, old root after the window (forced) | status 0 | status 0 | status 0 | status 0 | status 0 |
| MockTarget calls at the end | 1 | 1 | 1 | 1 | 1 |
(All values from run 4. Gas differs slightly between runs (e.g. register +36) because each run uses freshly generated proofs with different calldata bytes.)

Observations:
- Statuses agree on all five runs, and gas is identical between geth and anvil for the same fork.
- The reverted replay costs **59,040** under prague/osaka: this is the EIP-7623 calldata floor (21,000 + 10 × tokens), which binds for cheap reverts. Under
  cancun it costs 55,213.
- geth's shipped dev genesis activates **bogota**: SSTORE-heavy frames cost far more there (business call 225,183 vs 49,243), and execute rises to 750,585. Which
  fork a paper number refers to must be stated.

**Breakdown of execute #1 (484,925, Osaka; client call tracer)**:
| component | gas |
|---|---|
| intrinsic | 21,000 |
| calldata, 1,188 B (316 zero / 872 non-zero; EIP-2028; the floor of 59,040 does not bind) | 15,216 |
| Groth16 verifyProof, 23 public inputs: 23 × (ecMul 6,000 + ecAdd 150) + pairing 181,000 + overhead | 335,156 |
| registry.rootAccepted + revocations.rootAccepted | 2,486 + 2,462 |
| business call (MockTarget, 2 cold SSTOREs) | 49,243 |
| gate logic: cold SLOADs, keccak ctx_hash, nullifier SSTORE (cold 0→1), Executed + Accountability events (14 words), memory | 59,362 (remainder) |

**revoke (273,544)** = intrinsic 21,000 + calldata 5,172 + verifyProof 208,946 + remainder 38,426 (retiredAt SSTORE, root and count updates, event).

**Finding — revocation latency is in BLOCK time.** In run 2, geth accepted the old-root proof after 7 s of wall-clock time with Δ = 5 s. Run 3 (timestamps
recorded) shows why:
- geth `--dev` stamps each block at parent + 1 s and ran ≈ 14 s ahead of the wall clock;
- the revoke block and the next block were 1 s apart, so the gate correctly accepted the old root inside the window.

Run 4 sends filler transactions until block time passes revoke + Δ, and then every client rejects. For the paper: Δ is measured in block timestamps, which
depend on the chain's timestamp rules. On Ethereum mainnet, slot time bounds this; on chains with free-running timestamps, Δ could be stated in blocks.

## Deviations from pre-registration (transparent)
- V6 "low leaf not the predecessor", run 1: the case selected only leaves below k, and for this entry none existed (0/0 — a vacuous check, flagged by the
  pass criterion). Rerun over every non-predecessor leaf (0/12 accepted). Run 1 output kept (`revoke_witness_run1.*`).
- Part 3:
  - run 1: `forge create` reported "contract was not deployed" on geth `--dev` although the transaction succeeded. Fixed by deploying with
    `cast send --create` (manual library linking, ABI-encoded constructor arguments); stderr kept.
  - run 2: the geth old-root acceptance described above; output kept (`e2e_v7r_run2*`).
  - run 3: block timestamps recorded; output kept (`e2e_v7r_run3*`).
  - run 4: filler transactions added; this is the reported run.
- The pre-registration expected "geth --dev (its default fork)". That genesis activates bogota, so both the shipped and the Osaka-only geneses were run;
  anvil osaka was added.
- Part 3 uses clockSkew = 3600 s, because one set of fixtures (proof `now` = start − 30 s) serves all clients; the forge tests use 60 s.

## Limits
- **Spam**: anyone can revoke an entry for a certificate made with their own keys. It costs ≈ 274k gas per entry and uses up IMT capacity (2^20); no rate
  limit or fee is implemented.
- Genesis root and count are trusted at deployment.
- The issued root is still posted by the operator (issuance authority not addressed).
- Mainnet-fork / testnet not run (no RPC configured).
- The bogota results are reported as observed; which EIPs cause the difference was not analysed.
- Revocations are verified on-chain; holders rebuild the tree from the `Revoked` events (V11), which matches the broadcast update in E3.3.
