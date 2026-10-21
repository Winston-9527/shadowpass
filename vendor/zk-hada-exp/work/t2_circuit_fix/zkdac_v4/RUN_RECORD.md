# Run record: v4 main circuit (layout C + indexed Merkle tree revocation) — issues #4, #24
Date 2026-10-08. Env: Apple M5 Pro (15 cores), macOS arm64, node 24.14.1, circom 2.2.3, snarkjs 0.7.6, circomlib 2.0.5, circomlibjs 0.1.7, ethers 5.7.2.
Decision (#24): replace v3's circomlib SMT (RD=16) by an IMT of depth 20 (≤ ~10^6 revocations). v3 stays unchanged in ../zkdac_v3 (archive: ../../ARCHIVE_pre_v4.md).
Run: `npm ci`; `circom circuits/main_dN.circom --r1cs --wasm --sym -l node_modules -o build/dN` (N=1..4); `node scripts/smoke.mjs`;
`node scripts/mutate_v4.mjs N > results/mutations_dN.json`; `scripts/ablation.sh`. r1cs sha256: results/MANIFEST.sha256.
The generator needs `npm ci` in ../zkdac_v2 and ../zkdac_v3 as well (lib_v4 builds on lib_v3, which builds on the v2 generator).

## Circuit
`circuits/zkdac_chain_v4.circom` = `revocation_imt/circuits/zkdac_chain_v3_imt.circom` (validated in PR #25) promoted to a maintained source; `circuits/imt.circom`
copied from revocation_imt. Public inputs unchanged from v3: issued_root, revoked_root, nullifier, now, ctx_hash, act_req_cap. Parameters ZkDacChainV4(D, MD=16, RD=20).

## Constraints (results/constraints_ablation.csv)
D=1..4: 36,079 / 66,607 / 97,135 / 127,663 (identical to PR #25's v3+IMT). Per hop: +520 per revocation-tree level, +520 per issued-tree level.
At equal revocation depth 16, v4 (119,343) is below v3/SMT (120,691). **Capacity of the 2^17 ptau: D=4 fits up to IMT depth 21** (depth 22 = 131,823 > 131,072).

## Mutations (witness level)
| D | single-field mutations | accepted | semantic cases | unexpected |
|---|---|---|---|---|
| 1 | 91 | now | 17 | none |
| 2 | 173 | now | 23 | none |
| 3 | 255 | now | 28 | none |
| 4 | 337 | now | 33 | none |
Only `now` +1 (another valid statement) is accepted; the benign isOld0 fields of the SMT version no longer exist. Semantic cases as in v3 plus, for every hop,
revoking that certificate and then trying: stale witness vs new root, predecessor leaf, own leaf, forged skip leaf, end-of-list leaf — all rejected.

## Proving (dev ptau 2^17, 2026-10-08)
- ptau: `work/ptau/make_pot17.sh` — new 2 s, one contribution 17 s, prepare phase 2 **507 s**, verify 9 s ("Powers of Tau Ok"); 150,996,395 bytes,
  sha256 28671bef15ba2c1c86aa8bc452540a12d0a7f86b8ec3fadce1565ad8c15c3a2b. **Dev-only, single local contribution — not a trusted setup.**
- zkeys: `scripts/setup_zkeys.sh` — D=1..4 setup 19 / 22 / 24 / 25 s, each `snarkjs zkey verify` OK against r1cs + ptau; hashes in zk/MANIFEST.sha256;
  verification keys zk/vk_d*.json and Solidity verifiers zk/Groth16VerifierV4D*.sol committed. zkeys + ptau archived in release `v4-proving-material-20261008`.
- Benchmark: `node scripts/prove_bench.mjs 10 > results/prove_bench.json` — 10 runs per depth, **each run a fresh instance** (seed 1000+run: new keys,
  certificates, trees, witness); snarkjs 0.7.6 in node 24 (wasm prover), Apple M5 Pro, nothing else heavy running. Times in ms, mean ± SD (median):
| D | constraints | verified | witness | prove | verify (snarkjs) |
|---|---|---|---|---|---|
| 1 | 36,079 | 10/10 | 89.5 ± 5.5 | 594.2 ± 36.4 (583.7) | 6.7 ± 0.5 |
| 2 | 66,607 | 10/10 | 116.0 ± 2.0 | 1103.0 ± 14.7 (1103.8) | 7.1 ± 0.1 |
| 3 | 97,135 | 10/10 | 143.7 ± 4.4 | 1315.3 ± 23.2 (1308.0) | 5.7 ± 0.6 |
| 4 | 127,663 | 10/10 | 170.8 ± 2.9 | 1529.8 ± 18.6 (1531.0) | 7.2 ± 0.2 |
  Proof: 8 field elements on-chain (256 B), 6 public inputs, independent of D. The jump D=1→2 is larger than D=2→3→4, plausibly because D=1 fits an FFT
  domain of 2^16 while D=2..4 need 2^17 (not isolated experimentally). These are T5 preview numbers (one machine, N=10); the full latency study is T5 (#7).
  Not comparable to the paper's "1.51 s ± 0.53" (46,593-constraint historical circuit, unknown machine, no artefact — see work/t1/CLAIM_EVIDENCE_MAP.md).
