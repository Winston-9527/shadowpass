// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {PoseidonT6} from "poseidon-solidity/PoseidonT6.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

/// #30 option B: cost of recomputing a Poseidon commitment to the accountability ciphertexts on-chain (sponge: h = T6(h, x[4i..4i+3]),
/// h0 = 0, zero padding). n = 14 field elements (mode C, D = 4), n = 20 (mode A, D = 4). Measures only the hashing.
contract AccCommitGasTest is Test {
    function _commit(uint256[] memory x) internal pure returns (uint256 h) {
        for (uint256 i = 0; i < x.length; i += 4) {
            uint256[5] memory in5;
            in5[0] = h;
            for (uint256 k = 0; k < 4; k++) in5[k + 1] = i + k < x.length ? x[i + k] : 0;
            h = PoseidonT6.hash(in5);
        }
    }
    function _run(uint256 n) internal view {
        uint256[] memory x = new uint256[](n); for (uint256 i = 0; i < n; i++) x[i] = uint256(keccak256(abi.encode(i))) % 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        uint256 g = gasleft(); uint256 h = _commit(x); g = g - gasleft();
        console2.log(string.concat("poseidon sponge commit, n = ", vm.toString(n), " elements, T6 calls = ", vm.toString((n + 3) / 4)), g);
        require(h != 0);
    }
    function test_gas_commit() public view {
        _run(14); _run(20);
        uint256[5] memory a; uint256 g = gasleft(); PoseidonT6.hash(a); console2.log("single PoseidonT6", g - gasleft());
        uint256[2] memory b; g = gasleft(); PoseidonT3.hash(b); console2.log("single PoseidonT3", g - gasleft());
    }
}
