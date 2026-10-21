// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ZkDacRevocations} from "../src/ZkDacRevocations.sol";
import {Groth16VerifierRevoke} from "../src/Groth16VerifierRevoke.sol";

/// T7c X1c contract level (work/t7_proofs/T7c-proof-mapping_20261013/PLAN.md): proofs that are SATISFIABLE in revoke_transition but must not move
/// ZkDacRevocations, because the contract supplies (current root, count) as public inputs (RV-C1). Fixtures: tests/x1c_contract_fixtures.mjs.
contract T7cRevocationsTest is Test {
    using stdJson for string;
    string fx; ZkDacRevocations revs;
    function setUp() public { fx = vm.readFile("test/t7c_revoke_fixtures.json"); revs = new ZkDacRevocations(address(new Groth16VerifierRevoke()), fx.readUint(".genesisRoot"), fx.readUint(".genesisCount"), 60); }
    function _go(string memory k) internal { uint256[] memory x = fx.readUintArray(string.concat(k, ".a")); uint256[] memory z = fx.readUintArray(string.concat(k, ".c"));
        uint256[] memory b0 = fx.readUintArray(string.concat(k, ".b[0]")); uint256[] memory b1 = fx.readUintArray(string.concat(k, ".b[1]")); uint256[] memory s = fx.readUintArray(string.concat(k, ".pub"));
        revs.revoke(ZkDacRevocations.Proof([x[0], x[1]], [[b0[0], b0[1]], [b1[0], b1[1]]], [z[0], z[1]]), s[1], s[2]); }
    function test_honest_sequence() public { _go(".honest1"); _go(".honest2"); assertEq(revs.count(), fx.readUint(".genesisCount") + 2); console2.log("T7C X1c honest genesis -> R1 -> R2 accepted"); }
    function test_skipSlot_rejected() public { vm.expectRevert(ZkDacRevocations.InvalidProof.selector); _go(".skip"); console2.log("T7C X1c (iii') next_index = count + 1 rejected InvalidProof"); }
    function test_staleOldRoot_rejected() public { _go(".honest1"); vm.expectRevert(ZkDacRevocations.InvalidProof.selector); _go(".stale"); console2.log("T7C X1c (v') stale old_root rejected InvalidProof"); }
}
