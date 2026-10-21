// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// T7c R1b (work/t7_proofs/T7c-proof-mapping_20261013/PLAN.md) helpers, deployed on anvil by refine/diff.mjs:
/// a verifier stand-in that accepts any proof (mock runs only; the 50 real runs use the real verifiers), and a target that sums executed amounts.
contract T7cAcceptAll { fallback(bytes calldata) external returns (bytes memory) { return abi.encode(true); } }
contract T7cSumTarget {
    uint256 public total; uint256 public calls;
    function onAuthorized(bytes4, uint256 amount, bytes calldata) external { total += amount; calls++; }
}
