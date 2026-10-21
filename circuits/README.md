# ShadowPass circuits

Fork of ZK-DAC v9.2 (`vendor/zk-hada-exp/work/t2_circuit_fix/zkdac_v9_2`) with the owner view key and owner ciphertext. Spec: `docs/DEV_PLAN.md` (A1).

## What changed against v9.2

| | v9.2 | ShadowPass |
|---|---|---|
| Root certificate hash | `Poseidon(0, ent0, ent1, cap0, expiry0)` (7) | `Poseidon(0, ent0, ent1, cap0, expiry0, vpk.x, vpk.y)` (9) |
| View key check | — | `vpk = 8 * own_w`, `own_w` on curve, `vpk.x != 0` (`src/owner_key.circom`) |
| Chain ciphertext | to the global auditor key `tpk` (public input) | to the owner's `vpk` (private, bound by cert[0]) |
| Registration `leaf0` | Poseidon(7) | Poseidon(9), same `OwnerViewKey` check (`src/register.circom`) |
| Hops >= 1, revocation, cap subset, expiry, budget note, state root | | unchanged |

`budget_transfer` is unchanged: it hashes child certificates with Poseidon(7) and is only used for hops >= 1. The owner's budget is minted straight to the steward with lineage `[cert0]`; a hop-0 delegation through `budget_transfer` would produce a note no action can spend.

## Results (Apple M5 Pro x15, snarkjs 0.7.6, 5 fresh instances each)

| Circuit | Constraints | v9.2 |
|---|---|---|
| `main_d1` | 60,801 | 60,629 |
| `main_d2` | 105,606 | 105,434 |
| `main_reg` | 17,608 | — |

| Circuit | Verified | Public inputs | Perturbed public inputs rejected | fullProve median (ms) | verify (ms) |
|---|---|---|---|---|---|
| `main_d1` | 5/5 | 15 | 15/15 | 946.3 | 7.1 |
| `main_d2` | 5/5 | 16 | 16/16 | 1,566.7 | 5.6 |
| `main_reg` | 5/5 | 4 | 4/4 | 374.2 | 6.6 |

- On-chain: `ShadowVerifierD2.verifyProof` = **291,606 gas** on a real proof (`contracts/test/VerifierGas.t.sol`). Verifier only; `execute` adds state checks and note-tree inserts.
- Witness tests (`npm test`, `results/test.txt`): **26 / 26 as expected** — honest D1/D2/registration accept; owner opens the chain with `vsk`, another key cannot; cap split (procurement cannot TREASURY, treasury cannot PAY); every owner-ciphertext word tampered; agent encrypts to another key (with and without swapping `own_w`); `own_w` off curve, identity, order-2 point, `-w`, another valid key; legacy Poseidon(7) root; registration with another key or tampered `leaf0`; revoked certificate.
- Setup: Hermez ptau 2^18 with one local phase-2 contribution. Demo only. Hashes in `zk/MANIFEST.sha256`.

## Commands

```bash
npm ci
npm run build    # circom 2.2.3 -> build/
npm test         # witness-level tests
npm run setup    # zkeys (needs ../artifacts/ptau/powersOfTau28_hez_final_18.ptau)
node --no-warnings scripts/prove.mjs 5 > results/prove.json
```
