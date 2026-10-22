// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ShadowVerifierD2} from "../src/ShadowVerifierD2.sol";

/// Gas of the D=2 Groth16 verifier on the current real fixture proof.
contract VerifierGasTest is Test {
    using stdJson for string;

    string fx;

    function setUp() public {
        fx = vm.readFile("test/fixtures/shadowpass.json");
    }

    function test_d2_verify_gas() public {
        ShadowVerifierD2 verifier = new ShadowVerifierD2();
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[16] memory pub) = _proof();
        uint256 start = gasleft();
        bool ok = verifier.verifyProof(a, b, c, pub);
        uint256 used = start - gasleft();
        assertTrue(ok);
        console2.log("ShadowVerifierD2.verifyProof gas", used);
        pub[0] += 1;
        assertFalse(verifier.verifyProof(a, b, c, pub));
    }

    function _proof()
        internal
        view
        returns (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[16] memory pub)
    {
        uint256[] memory av = fx.readUintArray(".core.execute.proof.a");
        uint256[] memory b0 = fx.readUintArray(".core.execute.proof.b[0]");
        uint256[] memory b1 = fx.readUintArray(".core.execute.proof.b[1]");
        uint256[] memory cv = fx.readUintArray(".core.execute.proof.c");
        uint256[] memory pv = fx.readUintArray(".core.execute.pub");
        a = [av[0], av[1]];
        b = [[b0[0], b0[1]], [b1[0], b1[1]]];
        c = [cv[0], cv[1]];
        for (uint256 i = 0; i < 16; i++) {
            pub[i] = pv[i];
        }
    }
}
