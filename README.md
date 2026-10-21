# ShadowPass

Hackathon prototype: a private, revocable, owner-auditable prepaid card for AI agents, built on ZK-DAC v9.2 (ZK-HADA research).

Product plan: https://claude.ai/artifact/9z7TQfc9Bh5v1NnbUbxxy6

## Layout

| Path | What |
|---|---|
| `vendor/zk-hada-exp/` | Read-only copy of the research circuits, scripts and Foundry contracts (see `docs/PROVENANCE.md`). Do not edit; changes go in our own packages. |
| `docs/` | Provenance, baselines, decisions. |

Packages for the hackathon (circuits fork, contracts, MCP server, facilitator, PWA) are added as they are built.

## Demo use case

Alice → steward agent {PAY, TREASURY}
- → procurement agent {PAY}: buys reports and news over x402
- → treasury agent {TREASURY}: parks idle budget in a whitelisted vault; returns only to a pre-committed note

## Reproduce the baseline

```bash
# contracts (45 tests)
cd vendor/zk-hada-exp/work/t4_contracts && npm ci && cd foundry && forge test --match-contract 'V92Test|V92PolicyTest'
# circuits (needs build/ artifacts, not in git; see docs/PROVENANCE.md)
cd vendor/zk-hada-exp/work/t2_circuit_fix/zkdac_v7 && npm ci
cd ../zkdac_v9_2 && node scripts/smoke.mjs
```
