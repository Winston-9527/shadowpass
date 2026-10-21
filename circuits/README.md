# ShadowPass circuits

Fork of ZK-DAC v9.2 (`vendor/zk-hada-exp/work/t2_circuit_fix/zkdac_v9_2`) with the owner view key/owner ciphertext (A1) and the LeanIMT issued tree, Poseidon9-aware revocation and budget circuits (A2).

## What changed against v9.2

| | v9.2 | ShadowPass |
|---|---|---|
| Root certificate hash | `Poseidon(0, ent0, ent1, cap0, expiry0)` (7) | `Poseidon(0, ent0, ent1, cap0, expiry0, vpk.x, vpk.y)` (9) |
| View key check | — | `vpk = 8 * own_w`, `own_w` on curve, `vpk.x != 0` (`src/owner_key.circom`) |
| Chain ciphertext | to the global auditor key `tpk` (public input) | to the owner's `vpk` (private, bound by cert[0]) |
| Registration `leaf0` | Poseidon(7) | Poseidon(9), same `OwnerViewKey` check (`src/register.circom`) |
| Hops >= 1 issued tree | fixed sparse tree, `MD = 16`, `m_sib/m_bit` | dynamic LeanIMT, maximum `MD = 20`, `m_depth/m_index/m_sib` |
| Revocation root certificate | Poseidon(7) only | Poseidon9 for hop 0 via `own_w`; Poseidon7 for hops >= 1 |
| Additional circuits | `main_reg` | `main_d3`, `main_revoke`, `budget_transfer`, `budget_mint` |
| Cap subset, expiry, budget note, state root | | unchanged |

`budget_transfer` is unchanged from v8: it hashes child certificates with Poseidon(7) and is only used for hops >= 1. The owner's budget is minted straight to the steward with lineage `[cert0]`; a hop-0 delegation through `budget_transfer` would produce a note no action can spend.

## Results (Apple M5 Pro x15, snarkjs 0.7.6, 5 fresh instances each)

| Circuit | Constraints | v9.2 |
|---|---|---|
| `main_d1` | 60,801 | 60,629 |
| `main_d2` | 107,793 | 105,434 |
| `main_d3` | 154,785 | 150,239 |
| `main_reg` | 17,608 | — |
| `main_revoke` | 53,077 | research 51,815 |
| `budget_transfer` | 84,008 | 84,008 |
| `budget_mint` | 1,236 | 1,236 |

| Circuit | Verified | Public inputs | Perturbed public inputs rejected | fullProve median (ms) | verify (ms) |
|---|---|---|---|---|---|
| `main_d1` | 5/5 | 15 | 15/15 | 889.0 | 7.4 |
| `main_d2` | 5/5 | 16 | 16/16 | 1,560.5 | 6.0 |
| `main_d3` | 5/5 | 17 | 17/17 | 2,460.9 | 4.5 |
| `main_reg` | 5/5 | 4 | 4/4 | 362.7 | 6.5 |
| `main_revoke` | 5/5 | 4 | 4/4 | 800.8 | 5.4 |
| `budget_transfer` | 5/5 | 5 | 5/5 | 1,303.3 | 5.3 |
| `budget_mint` | 5/5 | 2 | 2/2 | 58.9 | 5.1 |

- On-chain gas must be re-measured against the new D1/D2 verifiers in the contract ticket; the previous A1 verifier measured 291,606 gas for D2.
- Witness tests (`npm test`, `results/test.txt`): **44 / 44 as expected**. This includes the A1 regressions plus honest D3, issued-tree depth/membership checks, revocation authority/root-format/insertion/key-revocation cases, and budget mint/transfer accept/reject cases.
- Setup: Hermez ptau 2^18 with one local phase-2 contribution. Demo only. Hashes in `zk/MANIFEST.sha256`.

## Commands

```bash
npm ci
npm run build    # circom 2.2.3 -> build/
npm test         # witness-level tests
npm run setup    # zkeys (needs ../artifacts/ptau/powersOfTau28_hez_final_18.ptau)
node --no-warnings scripts/prove.mjs 5 > results/prove.json
npm run publish-artifacts -w @shadowpass/circuits -- v2
```
