# Run record: v7 main circuit (v6 + R6 accountability) — issue #30
Date 2026-10-08. Env: Apple M5 Pro (15 cores), node 24.14.1, circom 2.2.3, snarkjs 0.7.6, circomlib 2.0.5, @zk-kit/binary-merkle-root.circom 2.0.0, poseidon-lite 0.3.0.
ptau: Hermez `powersOfTau28_hez_final_18.ptau` (../../ptau/hermez/README.md); phase 2 = one local contribution (not a trusted setup). v6 unchanged in ../zkdac_v6.
Decision (party B, 2026-10-08, #11 / #30): R6 goes into the action circuit; encrypt all chain keys ent[0..D].
Run: `npm ci`; compile `circuits/main_{a,c}_dN.circom` with `-l node_modules -l node_modules/circomlib/circuits -l node_modules/@zk-kit/binary-merkle-root.circom/src
-o build/{a,c}N`; `node scripts/smoke.mjs`; `node scripts/mutate_v7.mjs N MODE > results/mutations_MODE_dN.json`; `scripts/setup_zkeys.sh`;
`node scripts/check_public_binding.mjs > results/public_binding.json`; `MODE=A|C node scripts/prove_bench.mjs 10 > results/prove_bench_MODE.json`.

## Design (circuits/accountability.circom)
Fixes two problems of paper R6 (#30): the ciphertexts were witness-private (the auditors could never decrypt) and fixed per certificate (would link
actions). v7 encrypts ent[0..D] in every action proof with fresh randomness; ciphertexts and the committee key TPK are public inputs; ZkDacGateV7 supplies TPK
from immutable storage and emits the ciphertexts (`Accountability(nullifier, ct)`).
- **Mode A** (AccElGamal): one BabyJub ElGamal ciphertext per key, c1 = r_j·Base8, c2 = P_j + r_j·TPK, independent r_j (a shared r would publish P_j − P_k,
  constant for a chain, linking its actions); plaintext points on-curve checked.
- **Mode C** (AccHybrid): ElGamal encapsulates one ephemeral curve point K; coordinates encrypted as e[j][b] = coord_b(P_j) + Poseidon(Kx, Ky, 2j + b).
  Extra assumption: Poseidon as a PRF. Opening is exact for any field values.
- Mode B (one public Poseidon commitment, ciphertexts recomputed on-chain) measured and rejected: the on-chain sponge alone costs 688,776 gas for 14 words and
  858,110 for 20 (PoseidonT6 169,870 per call; ../../t4_contracts/results/forge_gas_v7.txt).
- Randomness r < 2^251; 2^251 > subgroup order l, so r and r + l can both be accepted — same ciphertext, no statement effect (T3 v7 A19f).

## Constraints and public inputs
| D | v6 | mode A | mode C | public inputs v6 / A / C |
|---|---|---|---|---|
| 1 | 38,266 | 51,002 | 47,058 | 7 / 17 / 17 |
| 2 | 81,944 | 101,048 | 91,948 | 7 / 21 / 19 |
| 3 | 125,622 | 151,094 | 136,838 | 7 / 25 / 21 |
| 4 | 169,300 | 201,140 | 181,728 | 7 / 29 / 23 |
Mode A: +6,368 per key. Mode C: +7,580 fixed + 1,212 per key. All under 2^18; v7 D=3 now exceeds 2^17 in both modes (FFT domain 2^18).

## Mutations (witness level; results/mutations_{A,C}_dN.json)
Single-field: A 173 / 260 / 390 / 520, C 170 / 254 / 381 / 508 (D = 1..4). Accepted set identical to v6 in every mode and depth (now; 16 LeanIMT padding
siblings; issued_root at D = 1, bound at proof level). No acc_* field is accepted. v6 semantic cases (24 / 36 / 49 / 63): no unexpected outcome.
Proof level (results/public_binding.json): for every mode and D = 1..4 the real proof verifies, the public-signal order is the 7 v6 inputs, tpk, then the
ciphertext words, and changing any single public input by +1 makes verification fail.

## Proving (results/prove_bench_{A,C}.json; 10 fresh instances per depth; ms, mean ± SD (median))
| mode | D | verified | witness | prove | verify |
|---|---|---|---|---|---|
| A | 1 | 10/10 | 115.5 ± 1.7 | 706.1 ± 36.7 (693.8) | 5.7 ± 0.6 |
| A | 2 | 10/10 | 162.5 ± 1.4 | 1348.4 ± 20.5 (1341.9) | 4.7 ± 0.1 |
| A | 3 | 10/10 | 209.4 ± 1.9 | 2222.6 ± 19 (2217) | 4.7 ± 0.1 |
| A | 4 | 10/10 | 257.9 ± 4.4 | 2542.6 ± 13 (2539.2) | 5.6 ± 1.7 |
| C | 1 | 10/10 | 105 ± 5 | 679.5 ± 35.6 (668) | 5.4 ± 0.8 |
| C | 2 | 10/10 | 140.9 ± 3.9 | 1279.6 ± 8.3 (1280.8) | 6 ± 0.6 |
| C | 3 | 10/10 | 176.4 ± 3.9 | 2133.3 ± 7.3 (2135.9) | 5.9 ± 0.4 |
| C | 4 | 10/10 | 212.5 ± 4.7 | 2445.4 ± 18.8 (2440.6) | 4.7 ± 0.2 |
v6 (same machine, same day): 595 / 1181 / 1455 / 2292 ms. Mode C costs +84 / +99 / +678 / +153 ms; the D = 3 jump is the 2^17 → 2^18 domain change.
zkeys: setup 19–39 s each, all "ZKey Ok!"; sizes A 25.0 / 48.8 / 76.8 / 96.3 MB, C 23.0 / 44.3 / 69.9 / 87.0 MB (zk/MANIFEST.sha256; release v7-proving-material-20261008).

## Recommendation
Mode C as the main circuit: fewer constraints, fewer public inputs, less gas (D = 4: execute 438,574 vs 482,508), faster proving, in exchange for the Poseidon-PRF
assumption. Mode A stays as the measured alternative that needs only ElGamal (DDH). Gas: ../../t4_contracts/RUN_RECORD_v7.md.
Not done here (E6): threshold sharing of the committee secret with partial decryption + share proofs; the auditor side above uses a single secret.

## Addendum 2026-10-09 (appended; E6, PR #33): mode A cannot detect a wrong opening from its output
Found by the E6 negative control `O3 forced` (`../../t4_accountability/E6-threshold-opening_20261009/results/cases.json`): when an opening is computed from
wrong decryption material (here: Lagrange interpolation on t−1 = 2 shares, i.e. S' ≠ tsk·c1), **mode A outputs c2_j − S'_j, which is always a valid
prime-order-subgroup point** (150/150 recovered points, D = 4, 30 openings) — a plausible but wrong "accountable key". Nothing in the output reveals the error,
so a buggy or malicious combiner that skips share verification could attribute an action to a key that never signed it (framing risk, G-NFF).
In **mode C** the same error gives a wrong K, and the Poseidon keystream then yields coordinates that are not on the curve (0/420 on-curve, D = 1..4), so the
opening output carries a built-in consistency check.
In both modes the actual protection is the verification of every partial decryption (DLEQ against the member's published key; E6 O6/O7/O12); mode C adds a
free second check. Decision 2026-10-09 (user): mode C is the main circuit; mode A remains the measured ElGamal-only alternative and, if used, MUST verify every
share before combining. Recommendation above unchanged; this is an additional reason for C.
