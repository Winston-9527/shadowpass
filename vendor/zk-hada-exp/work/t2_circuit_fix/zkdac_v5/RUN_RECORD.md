# Run record: v5 main circuit (v4 + registered-root tree) — issue #17 option b
Date 2026-10-08. Env: Apple M5 Pro (15 cores), node 24.14.1, circom 2.2.3, snarkjs 0.7.6, circomlib 2.0.5, @zk-kit/binary-merkle-root.circom 2.0.0,
@zk-kit/lean-imt 2.2.5, poseidon-lite 0.3.0. Dev ptau 2^17 (`../../ptau`, not a trusted setup). v4 unchanged in ../zkdac_v4.
Decision (#17, option b): the hop-0 certificate must be a leaf of the registered-root LeanIMT maintained by the registry contract; hops >= 1 stay in the
delegation (issued) tree. Rationale in #17 (research design §4 lines 83/117/123/322; paper R1/R2 lines 288–290).
Run: `npm ci` (also in ../zkdac_v2, ../zkdac_v3, ../zkdac_v4); compile `circuits/main_dN.circom` with
`-l node_modules -l node_modules/circomlib/circuits -l node_modules/@zk-kit/binary-merkle-root.circom/src -o build/dN`; `node scripts/smoke.mjs`;
`node scripts/mutate_v5.mjs N > results/mutations_dN.json`; `scripts/setup_zkeys.sh`; `node scripts/check_public_binding.mjs`; `node scripts/prove_bench.mjs 10`.

## Circuit
Public inputs (snarkjs order, verified in results/public_binding.json): issued_root, revoked_root, **root_root**, nullifier, now, ctx_hash, act_req_cap (7).
Hop 0: `BinaryMerkleRoot(RT=20)` membership of cert[0] in root_root (depth bounded in-circuit); its issued-tree path inputs are constrained to 0.
Hops >= 1: unchanged MerkleMember(MD=16) against issued_root. Everything else as v4 (IMT revocation depth 20, layout C action binding).
Constraints D=1..4: 38,266 / 68,794 / 99,322 / 129,850 (v4 + 2,187, independent of D). **D=4 leaves 1,222 constraints of headroom under the 2^17 ptau.**

## Mutations (witness level)
| D | single-field | accepted | semantic | unexpected |
|---|---|---|---|---|
| 1 | 114 | now; rt_sib[4..19]; issued_root | 22 | none |
| 2 | 196 | now; rt_sib[4..19] | 28 | none |
| 3 | 278 | now; rt_sib[4..19] | 33 | none |
| 4 | 360 | now; rt_sib[4..19] | 38 | none |
- rt_sib[k] for k >= rt_depth (= 4 here) are padding that BinaryMerkleRoot never reads (same as Semaphore): statement unchanged, benign.
- issued_root at D=1: the only certificate is checked against root_root, so no constraint uses issued_root. **Proof level** (public_binding.json): for D=1, 2, 4,
  changing any of the 7 public inputs by +1 makes the real proof fail to verify — snarkjs' setup binds every public input, so there is no malleability.
- New semantic cases, all rejected: cert0 not registered; another registered leaf's path; replaced master (old path vs new root); rt_depth > RT with root 0;
  cert0 only in the delegation tree.

## Proving
zkeys D=1..4: setup 19 / 22 / 25 / 24 s, all `snarkjs zkey verify` OK (zk/MANIFEST.sha256; verifiers zk/Groth16VerifierV5D*.sol).
Benchmark (results/prove_bench.json; 10 fresh instances per depth, Apple M5 Pro x15), ms, mean ± SD (median):
| D | verified | witness | prove | verify |
|---|---|---|---|---|
| 1 | 10/10 | 88.7 ± 2.7 | 617 ± 35.8 (608.6) | 6.8 ± 0.8 |
| 2 | 10/10 | 116.6 ± 3 | 1130.9 ± 17.3 (1132.7) | 7.4 ± 0.3 |
| 3 | 10/10 | 144.9 ± 3.9 | 1326.1 ± 12.6 (1321.3) | 5.4 ± 0.1 |
| 4 | 10/10 | 172.8 ± 5.3 | 1533 ± 19.5 (1537.6) | 7.4 ± 0.2 |
vs v4 (594 / 1103 / 1315 / 1530 ms): +23 / +28 / +11 / +3 ms (≤ 4%; D=2 ≈ 1.7 SD). The extra 2,187 constraints do not change the FFT domain (2^16 for D=1, 2^17 for D=2..4).
