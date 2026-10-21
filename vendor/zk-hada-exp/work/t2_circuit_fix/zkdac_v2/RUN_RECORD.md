# Run record: T2 circuit v2 (issue #4)
- Date 2026-10-06. Env: macOS arm64, node 24.14.1, circom 2.2.3, snarkjs 0.7.6, circomlib 2.0.5, circomlibjs 0.1.7. `npm ci` then:
  `circom circuits/main_dN.circom --r1cs --wasm -l node_modules -o build/dN` (N=1..4); `node scripts/mutate.mjs N > results/mutations_dN.json`; `scripts/ablation.sh`.
- Inputs are deterministic (seeded by `zkdac-v2-D-seed`); keys are derived from the seed, not secure randomness. Test material only.

## Changes vs committed RQ108 circuit (46,593)
| Issue #1 item | v2 |
|---|---|
| switches `*_enabled` private, unconstrained | removed; `enabled <== 1` everywhere |
| padding / truncation | none: separate circuit per depth D=1..4, no padding slots |
| nullifier secret free | terminal holder secret scalar s: `BabyPbk(s) == holder key`, `s < subgroup order` (no alias), nullifier = Poseidon(tag, s, action_digest) |
| action = 32-bit mask | action_digest = Poseidon(chain_id, verifier, method, params_hash, amount, req_cap, nonce), recomputed in-circuit; req_cap must be subset of terminal cap |
| cert hash omitted issuer/hop | cert = Poseidon(hop, issuer pk, holder pk, cap, expiry) |
| revocation depth-2 'non-membership' with unclear semantics | circomlib SMTVerifier exclusion proof (fnc=1), key = cert hash, depth RD |
| issued tree depth 2 | depth MD (default 16) |
| no freshness | public `now`; `now <= expiry_i` for each cert; expiry non-increasing along chain |
Public inputs are now 5 (adds `now`), not 4.

## Constraints (results/constraints_ablation.csv)
D=1..4 at MD=RD=16: 34,900 / 63,685 / 92,470 / 121,255 (+28,785 per hop; 6,115 fixed). D=4: (2,2)=62,231; (8,8)=87,527; (20,20)=138,119; (32,32)=188,711. **v2 at D=4 costs 2.6x the committed 46,593.** The paper's cost story must change.

## Mutation results (witness-level: 'accepted' = witness generation succeeded)
Per depth, every scalar input mutated individually (+1 mod p; path bits flipped) plus 13-20 targeted semantic attacks (results/mutations_d*.json).
- Only accepted mutations: `now` +1 (a different valid statement, not a forgery); `r_oldKey/r_oldValue` when `isOld0=1` (unused by the verifier in the empty-leaf case, statement unchanged: benign); the explicit boundary case `now == expiry` (intended accept).
- Rejected: switch-style attacks (no switches exist), sk alias (s+l), nullifier with other secret / pubkey-derived, stale action fields, wrong chain_id, expired, non-boolean path bit, capability overreach at every hop, req_cap not covered, child expiry > parent, revoked cert i with stale non-membership proof (i=0..D-1), forged exclusion via isOld0.

## Limits (do not overclaim)
- Witness satisfiability only; no proofs/zkeys generated for v2 (needs ptau 2^17; heavy -> `ssh 201`). Mutation 'rejected' means the witness generator aborts, the same weak criterion as the historical test.
- No independent oracle yet: 'semantic' expectations are mine. Differential testing is T3 (#5), which should try to find false accepts the above misses (e.g. root-key anchoring, splice of two registered chains, SMT depth overflow, cross-circuit-depth replay).
- Root anchoring: cert 0 is only tied to the registry by membership of a leaf that contains the issuer key. Whether the registry admits only legitimate roots is a protocol assumption, not checked here.
- R1 (human uniqueness/domain nullifier) and R6 (ElGamal accountability) are NOT in this circuit. Paper claims about them remain unsupported by this artifact.
- Nullifier is per-action, so it gives replay protection per action_digest, not 'one master per human per domain'.
