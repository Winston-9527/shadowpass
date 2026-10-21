// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ZkDacRegistry} from "../src/ZkDacRegistry.sol";
import {ZkDacGateV7} from "../src/ZkDacGateV7.sol";
import {Groth16VerifierRegister} from "../src/Groth16VerifierRegister.sol";
import {Groth16VerifierV7CD4} from "../src/Groth16VerifierV7CD4.sol";
import {MockTarget} from "./Targets.sol";

/// #18 Part 1 (work/t4_obligations/E7-obligations_20261009/PREREGISTRATION.md G1–G6): contract obligations on the MAIN gate (v7 mode C, D = 4)
/// with the real proof fixtures_V7.json actions[3]. Ports of the v2/v3 gate tests (ZkDacGate.t.sol, Variants.t.sol) to ZkDacGateV7.
contract ObligationsV7Test is Test {
    using stdJson for string;
    string fx; ZkDacRegistry reg; MockTarget target; address ver; ZkDacGateV7 gate;
    address constant OP = address(0x0FE1); uint64 constant WIN = 300; uint64 constant SKEW = 60; uint64 NOW; bytes4 METHOD; bytes PARAMS;
    struct X { ZkDacGateV7.Proof pr; ZkDacGateV7.Roots r; uint256 nf; uint64 t; ZkDacGateV7.Action act; uint256[] ct; }

    function setUp() public {
        fx = vm.readFile("test/fixtures_V7.json");
        NOW = uint64(fx.readUint(".now")); METHOD = bytes4(fx.readBytes(".method")); PARAMS = fx.readBytes(".params");
        reg = new ZkDacRegistry(address(new Groth16VerifierRegister()), OP, fx.readUint(".domain"), WIN);
        vm.prank(OP); reg.setGroupRoot(fx.readUint(".groupRoot"), true);
        for (uint256 i = 0; i < 2; i++) {
            string memory k = string.concat(".regs[", vm.toString(i), "]");
            (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(k); uint256[] memory s = fx.readUintArray(string.concat(k, ".pub"));
            reg.register(ZkDacRegistry.Proof(a, b, c), s[0], s[2], s[3], new uint256[](0));
        }
        ver = address(new Groth16VerifierV7CD4());
        deployCodeTo("Targets.sol:MockTarget", "", fx.readAddress(".target")); target = MockTarget(fx.readAddress(".target"));
        vm.warp(NOW);
        gate = _gateAt(fx.readAddress(".gate"));
    }
    function _p(string memory k) internal view returns (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) {
        uint256[] memory x = fx.readUintArray(string.concat(k, ".a")); uint256[] memory z = fx.readUintArray(string.concat(k, ".c"));
        uint256[] memory b0 = fx.readUintArray(string.concat(k, ".b[0]")); uint256[] memory b1 = fx.readUintArray(string.concat(k, ".b[1]"));
        a = [x[0], x[1]]; c = [z[0], z[1]]; b = [[b0[0], b0[1]], [b1[0], b1[1]]];
    }
    function _gateAt(address at) internal returns (ZkDacGateV7 g) {
        uint256[] memory s = fx.readUintArray(".actions[3].pub"); uint256[] memory t = fx.readUintArray(".actions[3].tpk");
        deployCodeTo("ZkDacGateV7.sol:ZkDacGateV7", abi.encode(ver, address(reg), OP, s[0], s[1], WIN, WIN, SKEW, [t[0], t[1]], s.length - 9), at);
        g = ZkDacGateV7(at); vm.prank(OP); g.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
    }
    function _x() internal view returns (X memory x) {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(".actions[3]"); uint256[] memory s = fx.readUintArray(".actions[3].pub");
        x = X(ZkDacGateV7.Proof(a, b, c), ZkDacGateV7.Roots(s[0], s[1], s[2]), s[3], uint64(s[4]),
              ZkDacGateV7.Action(address(target), METHOD, 100, fx.readUint(".actions[3].nonce"), PARAMS), fx.readUintArray(".actions[3].ct"));
    }
    function _exec(ZkDacGateV7 g, X memory x) internal { g.execute(x.pr, x.r, x.nf, x.t, x.act, x.ct); }
    function _expect(ZkDacGateV7 g, X memory x, bytes4 sel) internal { vm.expectRevert(sel); g.execute(x.pr, x.r, x.nf, x.t, x.act, x.ct); }

    // ---- G1 clock (A14): proof's now = NOW ----
    function test_G1_clockEqualsBlockTime() public { _exec(gate, _x()); assertEq(target.calls(), 1); }
    function test_G1_clockAtSkewEdge() public { vm.warp(NOW + SKEW); _exec(gate, _x()); assertEq(target.calls(), 1); }
    function test_G1_clockTooOld() public { vm.warp(NOW + SKEW + 1); _expect(gate, _x(), ZkDacGateV7.BadClock.selector); }
    function test_G1_clockInFuture() public { vm.warp(NOW - 1); _expect(gate, _x(), ZkDacGateV7.BadClock.selector); }
    // ---- G2 business revert: atomic, nullifier not consumed, retry works once ----
    function test_G2_businessRevertRollsBack() public {
        X memory x = _x(); target.setFail(true); vm.expectRevert(bytes("business failure")); _exec(gate, x);
        assertFalse(gate.spent(x.nf)); target.setFail(false); _exec(gate, x); assertEq(target.calls(), 1); assertTrue(gate.spent(x.nf));
        _expect(gate, x, ZkDacGateV7.NullifierSpent.selector);
    }
    // ---- G3 re-entrant replay from the business callback ----
    function test_G3_reentrantReplayRejected() public {
        X memory x = _x(); target.setReenter(abi.encodeCall(gate.execute, (x.pr, x.r, x.nf, x.t, x.act, x.ct)));
        _exec(gate, x); assertEq(target.calls(), 1); assertFalse(target.reenterOk());
        assertEq(bytes4(target.reenterResult()), ZkDacGateV7.NullifierSpent.selector);
    }
    // ---- G4 A11a: same proof, different execution context ----
    function test_G4_otherChainId() public { vm.chainId(1); _expect(gate, _x(), ZkDacGateV7.InvalidProof.selector); }
    function test_G4_otherGateAddress() public { ZkDacGateV7 g2 = _gateAt(address(0xBEEF)); _expect(g2, _x(), ZkDacGateV7.InvalidProof.selector); }
    function test_G4_otherMethodSameCap() public {
        bytes4 m2 = 0x23b872dd; vm.prank(OP); gate.setMethod(m2, uint32(fx.readUint(".reqCap")), true);
        X memory x = _x(); x.act.method = m2; _expect(gate, x, ZkDacGateV7.InvalidProof.selector);
    }
    function test_G4_otherAmount() public { X memory x = _x(); x.act.amount = 101; _expect(gate, x, ZkDacGateV7.InvalidProof.selector); }
    function test_G4_otherParams() public { X memory x = _x(); x.act.params = hex"1234abce"; _expect(gate, x, ZkDacGateV7.InvalidProof.selector); }
    function test_G4_otherNonce() public { X memory x = _x(); x.act.nonce += 1; _expect(gate, x, ZkDacGateV7.InvalidProof.selector); }
    function test_G4_otherTarget() public {
        address t2 = address(0xCAFE); deployCodeTo("Targets.sol:MockTarget", "", t2);
        X memory x = _x(); x.act.target = t2; _expect(gate, x, ZkDacGateV7.InvalidProof.selector);
    }
    // ---- G5 A11-req: the contract, not the prover, supplies req_cap ----
    function test_G5_requiredCapFromContract() public {
        vm.prank(OP); gate.setMethod(METHOD, uint32(fx.readUint(".reqCap")) ^ 1, true); _expect(gate, _x(), ZkDacGateV7.InvalidProof.selector);
    }
    // ---- G6 disabled method ----
    function test_G6_disabledMethod() public { vm.prank(OP); gate.setMethod(METHOD, uint32(fx.readUint(".reqCap")), false); _expect(gate, _x(), ZkDacGateV7.UnknownMethod.selector); }
}
