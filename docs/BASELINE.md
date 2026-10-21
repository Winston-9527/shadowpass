# Baseline (2026-10-21, before any change)

| Check | Result |
|---|---|
| `forge test --match-contract 'V92Test|V92PolicyTest'` | 45 / 45 pass |
| `node scripts/smoke.mjs` (v9.2, D = 1..4) | all ACCEPT; auditor recovers ent[0..D] |
| `prove_bench.mjs 3` (snarkjs, Apple M5 Pro) | prove median: D1 852 ms, D2 1,513 ms, D3 2,336 ms, D4 2,519 ms; witness 160–242 ms; verify ~5 ms; 12 / 12 verified |

Notes for the design:
- The demo tree (Alice → steward → procurement / treasury) puts leaf agents at D = 2: about 1.5 s to prove.
- `test_GB7_revocationFreezesBudget`: budget held by a revoked certificate cannot be spent by anyone. The parent has no reclaim path. Disclose this; reclaim is roadmap.
- Capability bits must be a subset along the chain (`zkdac_chain_v9.circom:188`) and expiry must not grow (`:189`), so the {PAY} / {TREASURY} split is enforced by the circuit as is.
