# Run record: T2 re-run on the v3 main circuit (layout C) — issue #4
Date 2026-10-07. Env: macOS arm64, node 24.14.1, circom 2.2.3, snarkjs 0.7.6, circomlib 2.0.5, circomlibjs 0.1.7, ethers 5.7.2.
Run: `npm ci`; `circom circuits/main_dN.circom --r1cs --wasm --sym -l node_modules -o build/dN` (N=1..4); `node scripts/smoke.mjs`;
`node scripts/mutate_v3.mjs N > results/mutations_dN.json`; `scripts/ablation.sh`; `node scripts/check_isold0.mjs`. r1cs sha256: results/MANIFEST.sha256.
Inputs are deterministic (v2 generator seeds + fixed default action context). Previous design archived: ../../ARCHIVE_pre_v3.md.

## Circuit
`circuits/zkdac_chain_v3.circom` = layout C body (diff vs `t4_contracts/variants/circuits/zkdac_chain_C.circom`: header comment only).
Public inputs (declaration order = snarkjs signal order): issued_root, revoked_root, nullifier, now, ctx_hash, act_req_cap.
ctx_hash = keccak256(abi.encode(chainid, verifier, method, target, params, amount, nonce)) >> 8 is computed by the verifier contract; the circuit treats it as opaque.
digest = Poseidon(ctx_hash, req_cap); nullifier = Poseidon(tag, holder_sk, digest). Everything else (chain, SMT revocation, expiry, attenuation, holder key) is unchanged from v2.

## Constraints (results/constraints_ablation.csv)
D=1..4 (MD=RD=16): 34,336 / 63,121 / 91,906 / 120,691 — exactly v2 − 564 in every (D, MD, RD) configuration (in-circuit Poseidon(7) → Poseidon(2)); per hop +28,785 as in v2.

## Mutations (witness level)
| D | single-field mutations | accepted | semantic cases | unexpected |
|---|---|---|---|---|
| 1 | 67 | now | 15 | none |
| 2 | 125 | now; r_oldKey/r_oldValue [0],[1] | 18 | none |
| 3 | 183 | now; r_oldKey/r_oldValue [0] | 20 | none |
| 4 | 241 | now | 22 | none |
- `now` +1 is another valid statement (expiry still satisfied), not a forgery.
- r_oldKey/r_oldValue are accepted **exactly** where the revocation proof uses the empty-leaf case (isOld0=1: D=2 hops 0,1; D=3 hop 0; check_isold0.mjs) and rejected
  wherever isOld0=0 — SMTVerifier ignores them in the empty-leaf case, so the statement is unchanged (benign). Earlier (v2) this was asserted without this check.
- Rejected: sk alias, nullifier from other secret / public key, ctx_hash changed without nullifier, other chain id, req_cap changed without nullifier, expired, `now` wrap,
  non-boolean path bit, capability overreach at every hop, req_cap not covered, child expiry > parent, revoked cert with stale proof (every hop), forged isOld0 exclusion.
- Documented EXPECT_ACCEPT cases: holder re-proves for another context (legitimate); **req_cap = 0 with a consistent nullifier is accepted by the circuit** —
  binding req_cap to the method is the contract's job (`ZkDacGateC` sets it from `requiredCap[method]`; test_proverChosenReqCapRejected).

## Not changed / still open
RD = 16 completeness gap (T3 A13b) unchanged; v3 proofs/zkeys for D=1,3,4 not generated (D=2 zkey = archived layoutC_d2.zkey).
