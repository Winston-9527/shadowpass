// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Poseidon over BN254 for width T (T-1 inputs), circomlib-compatible; port of circomlibjs/src/poseidon_opt.js.
/// Round constants (C: 8T+NRP, S: NRP*(2T-1), M: TxT, P: TxT words) exceed the 24 KB code limit for T >= 8,
/// so they live in two data-only contracts (runtime = 0x00 || words) and are EXTCODECOPY'd into memory per call.
/// (circomlibjs' own EVM generator fails for T >= 8 with a stack-depth assertion.)
contract PoseidonOpt {
    uint256 internal constant Q = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public immutable T;
    uint256 public immutable NRP;
    address public immutable data1;
    address public immutable data2;
    uint256 public immutable len1;
    uint256 public immutable len2;

    error BadArity();

    constructor(uint256 t, uint256 nrp, address d1, address d2, uint256 l1, uint256 l2) {
        T = t; NRP = nrp; data1 = d1; data2 = d2; len1 = l1; len2 = l2;
    }

    function hash(uint256[] calldata inp) external view returns (uint256 out) {
        uint256 t = T; uint256 nrp = NRP;
        if (inp.length + 1 != t) revert BadArity();
        uint256 K;
        { address d1 = data1; address d2 = data2; uint256 l1 = len1; uint256 l2 = len2;
          assembly { K := mload(0x40) extcodecopy(d1, K, 1, l1) extcodecopy(d2, add(K, l1), 1, l2) } }
        assembly {
            function pow5(a) -> r { let a2 := mulmod(a, a, Q) r := mulmod(mulmod(a2, a2, Q), a, Q) }
            function w(base, i) -> v { v := mload(add(base, shl(5, i))) }
            // layout (words from K): C[8t+nrp] | S[nrp(2t-1)] | M[t*t] | P[t*t] | state[t] | tmp[t]
            function sOff(K_, t_, nrp_) -> o { o := add(K_, shl(5, add(mul(8, t_), nrp_))) }
            function mOff(K_, t_, nrp_) -> o { o := add(sOff(K_, t_, nrp_), shl(5, mul(nrp_, sub(mul(2, t_), 1)))) }
            function pOff(K_, t_, nrp_) -> o { o := add(mOff(K_, t_, nrp_), shl(5, mul(t_, t_))) }
            function mix(st_, m_, t_) {                    // st[i] = sum_j m[j][i] * st[j]; tmp follows state
                let tm_ := add(st_, shl(5, t_))
                for { let i := 0 } lt(i, t_) { i := add(i, 1) } {
                    let acc := 0
                    for { let j := 0 } lt(j, t_) { j := add(j, 1) } {
                        acc := addmod(acc, mulmod(w(m_, add(mul(j, t_), i)), w(st_, j), Q), Q)
                    }
                    mstore(add(tm_, shl(5, i)), acc)
                }
                for { let i := 0 } lt(i, t_) { i := add(i, 1) } { mstore(add(st_, shl(5, i)), w(tm_, i)) }
            }
            function sboxAdd(st_, c_, off, t_) {           // st = pow5(st) + C[off + i]
                for { let i := 0 } lt(i, t_) { i := add(i, 1) } {
                    let p := add(st_, shl(5, i))
                    mstore(p, addmod(pow5(mload(p)), w(c_, add(off, i)), Q))
                }
            }
            function partialRound(st_, cO_, sO_, t_, r) {
                let s0 := addmod(pow5(mload(st_)), w(cO_, add(mul(5, t_), r)), Q)
                mstore(st_, s0)
                let base := add(sO_, shl(5, mul(sub(mul(2, t_), 1), r)))
                let acc := 0
                for { let j := 0 } lt(j, t_) { j := add(j, 1) } { acc := addmod(acc, mulmod(w(base, j), w(st_, j), Q), Q) }
                for { let k := 1 } lt(k, t_) { k := add(k, 1) } {
                    let p := add(st_, shl(5, k))
                    mstore(p, addmod(mload(p), mulmod(s0, w(base, add(sub(t_, 1), k)), Q), Q))
                }
                mstore(st_, acc)
            }
            function perm(K_, t_, nrp_, inOff) -> res {
                let st_ := add(pOff(K_, t_, nrp_), shl(5, mul(t_, t_)))
                mstore(st_, w(K_, 0))
                for { let i := 1 } lt(i, t_) { i := add(i, 1) } {
                    mstore(add(st_, shl(5, i)), addmod(calldataload(add(inOff, shl(5, sub(i, 1)))), w(K_, i), Q))
                }
                for { let r := 0 } lt(r, 3) { r := add(r, 1) } { sboxAdd(st_, K_, mul(add(r, 1), t_), t_) mix(st_, mOff(K_, t_, nrp_), t_) }
                sboxAdd(st_, K_, mul(4, t_), t_)
                mix(st_, pOff(K_, t_, nrp_), t_)
                for { let r := 0 } lt(r, nrp_) { r := add(r, 1) } { partialRound(st_, K_, sOff(K_, t_, nrp_), t_, r) }
                for { let r := 0 } lt(r, 3) { r := add(r, 1) } { sboxAdd(st_, K_, add(add(mul(5, t_), nrp_), mul(r, t_)), t_) mix(st_, mOff(K_, t_, nrp_), t_) }
                for { let i := 0 } lt(i, t_) { i := add(i, 1) } { let p := add(st_, shl(5, i)) mstore(p, pow5(mload(p))) }
                mix(st_, mOff(K_, t_, nrp_), t_)
                res := mload(st_)
                mstore(0x40, add(st_, shl(5, mul(2, t_))))
            }
            out := perm(K, t, nrp, inp.offset)
        }
    }
}
