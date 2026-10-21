// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";

/// T7c X2b (work/t7_proofs/T7c-proof-mapping_20261013/PLAN.md): the on-chain Poseidon (PoseidonT3 in InternalLeanIMT, PoseidonT4 in
/// ZkDacGateV9.registerState) agrees with circomlibjs on the inputs written by tests/x2_poseidon.mjs (t7c_poseidon_kat.json).
contract T7cPoseidonKatTest is Test {
    using stdJson for string;
    function test_kat() public {
        string memory j = vm.readFile("test/t7c_poseidon_kat.json");
        uint256 n = j.readUint(".n"); uint256 ok2; uint256 ok3;
        uint256[] memory o2 = j.readUintArray(".o2"); uint256[] memory o3 = j.readUintArray(".o3");
        uint256[] memory a = j.readUintArray(".k2"); uint256[] memory b = j.readUintArray(".k3");     // flat: [x0, y0, x1, y1, ...]
        for (uint256 i = 0; i < n; i++) {
            if (PoseidonT3.hash([a[2 * i], a[2 * i + 1]]) == o2[i]) ok2++;
            if (PoseidonT4.hash([b[3 * i], b[3 * i + 1], b[3 * i + 2]]) == o3[i]) ok3++;
        }
        console2.log("T7C X2b PoseidonT3 agree", ok2, "of", n); console2.log("T7C X2b PoseidonT4 agree", ok3, "of", n);
        assertEq(ok2, n); assertEq(ok3, n);
    }
}
