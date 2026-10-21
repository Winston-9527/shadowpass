// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ZkDacRegistry} from "../src/ZkDacRegistry.sol";
import {ZkDacGateV7} from "../src/ZkDacGateV7.sol";
import {Groth16VerifierRegister} from "../src/Groth16VerifierRegister.sol";
import {Groth16VerifierV7AD2} from "../src/Groth16VerifierV7AD2.sol";
import {Groth16VerifierV7AD4} from "../src/Groth16VerifierV7AD4.sol";
import {Groth16VerifierV7CD2} from "../src/Groth16VerifierV7CD2.sol";
import {Groth16VerifierV7CD4} from "../src/Groth16VerifierV7CD4.sol";
import {MockTarget} from "./Targets.sol";

/// #30, real proofs: v7 action proofs (R6 accountability; mode A = per-key ElGamal, mode C = hybrid) behind ZkDacGateV7.
/// fixtures_V7.json: actions[0..3] = A_D2, A_D4, C_D2, C_D4; two registered humans (D = 2 and D = 4 chains).
contract V7Test is Test {
    using stdJson for string;
    string fx; ZkDacRegistry reg; ZkDacGateV7 gate; MockTarget target; address[4] vers;
    address constant OP = address(0x0FE1); uint64 constant WIN = 300; uint64 NOW; bytes4 METHOD; bytes PARAMS;

    function setUp() public {
        fx = vm.readFile("test/fixtures_V7.json");
        NOW = uint64(fx.readUint(".now")); METHOD = bytes4(fx.readBytes(".method")); PARAMS = fx.readBytes(".params");
        reg = new ZkDacRegistry(address(new Groth16VerifierRegister()), OP, fx.readUint(".domain"), WIN);
        vm.prank(OP); reg.setGroupRoot(fx.readUint(".groupRoot"), true);
        for (uint256 i = 0; i < 2; i++) {
            (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("regs", i); uint256[] memory s = fx.readUintArray(_k("regs", i, "pub"));
            reg.register(ZkDacRegistry.Proof(a, b, c), s[0], s[2], s[3], new uint256[](0));
        }
        assertEq(reg.currentRoot(), fx.readUint(".rootRoot"));
        vers = [address(new Groth16VerifierV7AD2()), address(new Groth16VerifierV7AD4()), address(new Groth16VerifierV7CD2()), address(new Groth16VerifierV7CD4())];
        deployCodeTo("Targets.sol:MockTarget", "", fx.readAddress(".target")); target = MockTarget(fx.readAddress(".target"));
        vm.warp(NOW);
    }
    function _k(string memory arr, uint256 i, string memory f) internal pure returns (string memory) { return string.concat(".", arr, "[", vm.toString(i), "].", f); }
    function _p(string memory arr, uint256 i) internal view returns (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) {
        uint256[] memory x = fx.readUintArray(_k(arr, i, "a")); uint256[] memory z = fx.readUintArray(_k(arr, i, "c"));
        uint256[] memory b0 = fx.readUintArray(string.concat(_k(arr, i, "b"), "[0]")); uint256[] memory b1 = fx.readUintArray(string.concat(_k(arr, i, "b"), "[1]"));
        a = [x[0], x[1]]; c = [z[0], z[1]]; b = [[b0[0], b0[1]], [b1[0], b1[1]]];
    }
    struct ActCall { ZkDacGateV7.Proof pr; ZkDacGateV7.Roots roots; uint256 nf; uint64 t; ZkDacGateV7.Action act; uint256[] ct; }
    function _actCall(uint256 i) internal view returns (ActCall memory x) {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("actions", i); uint256[] memory s = fx.readUintArray(_k("actions", i, "pub"));
        x = ActCall(ZkDacGateV7.Proof(a, b, c), ZkDacGateV7.Roots(s[0], s[1], s[2]), s[3], uint64(s[4]),
            ZkDacGateV7.Action(address(target), METHOD, 100, fx.readUint(_k("actions", i, "nonce")), PARAMS), fx.readUintArray(_k("actions", i, "ct")));
    }
    // deploy the gate for action i at the fixture address (ctx_hash binds the gate address); tpk from the fixture unless overridden
    function _gate(uint256 i, uint256[2] memory tpk) internal {
        uint256[] memory s = fx.readUintArray(_k("actions", i, "pub"));
        deployCodeTo("ZkDacGateV7.sol:ZkDacGateV7", abi.encode(vers[i], address(reg), OP, s[0], s[1], WIN, WIN, uint64(60), tpk, s.length - 9), fx.readAddress(".gate"));
        gate = ZkDacGateV7(fx.readAddress(".gate"));
        vm.prank(OP); gate.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
    }
    function _tpk(uint256 i) internal view returns (uint256[2] memory t) { uint256[] memory x = fx.readUintArray(_k("actions", i, "tpk")); t = [x[0], x[1]]; }
    function _exec(ActCall memory x) internal { gate.execute(x.pr, x.roots, x.nf, x.t, x.act, x.ct); }

    function test_allConfigsExecute() public {
        for (uint256 i = 0; i < 4; i++) { _gate(i, _tpk(i)); _exec(_actCall(i)); }
        assertEq(target.calls(), 4);
    }
    function test_accountabilityEventCarriesCiphertexts() public {
        for (uint256 i = 0; i < 4; i++) {
            _gate(i, _tpk(i)); ActCall memory x = _actCall(i);
            vm.expectEmit(true, false, false, true, address(gate)); emit ZkDacGateV7.Accountability(x.nf, x.ct);
            _exec(x);
        }
    }
    function test_tamperedCiphertext_rejected() public {
        for (uint256 i = 0; i < 4; i++) {
            _gate(i, _tpk(i));
            for (uint256 w = 0; w < 2; w++) {                        // first and last ciphertext word
                ActCall memory x = _actCall(i); uint256 j = w == 0 ? 0 : x.ct.length - 1; x.ct[j] = x.ct[j] + 1;
                vm.expectRevert(ZkDacGateV7.InvalidProof.selector); _exec(x);
            }
        }
    }
    function test_ciphertextSwappedBetweenActions_rejected() public {   // C_D2 proof with A_D2's... lengths differ; use two C_D4 words swapped
        _gate(3, _tpk(3)); ActCall memory x = _actCall(3); (x.ct[4], x.ct[5]) = (x.ct[5], x.ct[4]);
        vm.expectRevert(ZkDacGateV7.InvalidProof.selector); _exec(x);
    }
    function test_wrongCiphertextLength_rejected() public {
        _gate(2, _tpk(2)); ActCall memory x = _actCall(2); uint256[] memory shorter = new uint256[](x.ct.length - 1);
        for (uint256 j = 0; j < shorter.length; j++) shorter[j] = x.ct[j]; x.ct = shorter;
        vm.expectRevert(ZkDacGateV7.BadCiphertextLength.selector); _exec(x);
    }
    function test_otherAuditorKey_rejected() public {                  // gate configured with a different committee key: the proof does not verify
        for (uint256 i = 0; i < 4; i++) { uint256[2] memory t = _tpk(i); t[0] = t[0] + 1; _gate(i, t); ActCall memory x = _actCall(i); vm.expectRevert(ZkDacGateV7.InvalidProof.selector); _exec(x); }
    }
    function test_replay_rejected() public { _gate(3, _tpk(3)); _exec(_actCall(3)); ActCall memory x = _actCall(3); vm.expectRevert(ZkDacGateV7.NullifierSpent.selector); _exec(x); }

    // one config per test so every measurement starts from the same fresh state (same convention as V5Test.test_gas: verifyProof first, then execute #1)
    function _gasOf(uint256 i, string memory nm) internal {
        _gate(i, _tpk(i)); ActCall memory x = _actCall(i);
        uint256[] memory s = fx.readUintArray(_k("actions", i, "pub"));
        bytes memory cd = abi.encodePacked(bytes4(keccak256(abi.encodePacked("verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[", vm.toString(s.length), "])"))), x.pr.a, x.pr.b, x.pr.c, s);
        uint256 g = gasleft(); (bool ok, bytes memory ret) = vers[i].staticcall(cd); uint256 gv = g - gasleft();
        assertTrue(ok && abi.decode(ret, (bool)));
        g = gasleft(); _exec(x); uint256 ge = g - gasleft();
        console2.log(string.concat("v7 ", nm, ": public inputs ", vm.toString(s.length), ", verifyProof"), gv);
        console2.log(string.concat("v7 ", nm, ": execute #1 (excl. intrinsic and calldata)"), ge);
    }
    function test_gas_AD2() public { _gasOf(0, "A D=2"); }
    function test_gas_AD4() public { _gasOf(1, "A D=4"); }
    function test_gas_CD2() public { _gasOf(2, "C D=2"); }
    function test_gas_CD4() public { _gasOf(3, "C D=4"); }
}
