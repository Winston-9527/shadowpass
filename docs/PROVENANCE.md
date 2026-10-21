# Provenance

- Source: `Winston-9527/zk-hada-exp` @ `c794b29` (Merge PR #74), local clone `~/Developer/zk-hada-exp`, clean tree.
- Copied 2026-10-21 into `vendor/zk-hada-exp/work/` with the original layout (relative imports between `zkdac_v2` … `zkdac_v9_2` depend on it):
  - `t2_circuit_fix/zkdac_v2 … zkdac_v9_2`: circuits, scripts, package files, manifests (no `node_modules`, `build`, `results`).
  - `t4_contracts/foundry` (src, test, fixtures) and `t4_contracts/package*.json`.
- `node_modules`: `npm ci` from the copied lockfiles in `zkdac_v2 … zkdac_v7` and `t4_contracts`; `zkdac_v8 … v9_2` symlink to `../zkdac_v7/node_modules`, as in the research repo.
- Build artifacts (git-ignored) copied from the research repo: `zkdac_v9_2/build`, `zkdac_v8/build`.

## Artifact hashes (match `zkdac_v9_2/zk/MANIFEST.sha256`)

```
89fb39e16062b54b2d2856440d52ef86f93a55dd15fc191e0279ef4bf28a7115  build/zk/c1.zkey
fab85f74aaad416ae5b1fc663fdf3ba32e9c952e87f3f73b852105b05443e876  build/zk/c2.zkey
2e5f9519562a1c26987826dd47dbc62f4f2f7368bdf131e93812c1bf45cfa307  zk/vk_c1.json
6f541b66549ff30a4989948aec64183bfdc632c0dfec48f96a2ac348a8e9db15  zk/vk_c2.json
```

The zkeys have a single local phase-2 contribution over Hermez 2^18. Demo only, not a trusted setup.

## Toolchain

node 24.14.1, circom 2.2.3, snarkjs 0.7.6, forge 1.5.1, Apple M5 Pro.
