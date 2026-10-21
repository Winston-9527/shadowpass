// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ZkDacRegistry} from "../src/ZkDacRegistry.sol";
import {ZkDacGateV7} from "../src/ZkDacGateV7.sol";
import {Groth16VerifierRegister} from "../src/Groth16VerifierRegister.sol";
import {Groth16VerifierV7CD4} from "../src/Groth16VerifierV7CD4.sol";
import {MockTarget} from "./Targets.sol";

/// E3.5 (work/t4_revocation/E3-revocation_20261009/PREREGISTRATION.md): revocation latency = revokedWindow Δ. Real v7 mode C D = 4 proof
/// (fixtures_V7.json actions[3]) made against revoked root R0. At t0 the operator posts a new revoked root R1 (a revocation). The proof against R0
/// must be accepted at t0 + Δ and rejected (StaleRevokedRoot) at t0 + Δ + 1. clockSkew is set to 1e6 s here so that the root window, not the
/// clock check, is the only binding condition (the clock obligation is tested in V5/V6/V7 tests). issuedWindow fixed at 300 s (issued root unchanged).
contract E3WindowTest is Test {
    using stdJson for string;
    string fx; ZkDacRegistry reg; MockTarget target; address ver;
    address constant OP = address(0x0FE1); uint64 NOW; bytes4 METHOD; bytes PARAMS;
    uint256 constant I = 3;   // C_D4

    function setUp() public {
        fx = vm.readFile("test/fixtures_V7.json");
        NOW = uint64(fx.readUint(".now")); METHOD = bytes4(fx.readBytes(".method")); PARAMS = fx.readBytes(".params");
        reg = new ZkDacRegistry(address(new Groth16VerifierRegister()), OP, fx.readUint(".domain"), 300);
        vm.prank(OP); reg.setGroupRoot(fx.readUint(".groupRoot"), true);
        for (uint256 i = 0; i < 2; i++) {
            (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("regs", i); uint256[] memory s = fx.readUintArray(_k("regs", i, "pub"));
            reg.register(ZkDacRegistry.Proof(a, b, c), s[0], s[2], s[3], new uint256[](0));
        }
        ver = address(new Groth16VerifierV7CD4());
        deployCodeTo("Targets.sol:MockTarget", "", fx.readAddress(".target")); target = MockTarget(fx.readAddress(".target"));
        vm.warp(NOW);
    }
    function _k(string memory arr, uint256 i, string memory f) internal pure returns (string memory) { return string.concat(".", arr, "[", vm.toString(i), "].", f); }
    function _p(string memory arr, uint256 i) internal view returns (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) {
        uint256[] memory x = fx.readUintArray(_k(arr, i, "a")); uint256[] memory z = fx.readUintArray(_k(arr, i, "c"));
        uint256[] memory b0 = fx.readUintArray(string.concat(_k(arr, i, "b"), "[0]")); uint256[] memory b1 = fx.readUintArray(string.concat(_k(arr, i, "b"), "[1]"));
        a = [x[0], x[1]]; c = [z[0], z[1]]; b = [[b0[0], b0[1]], [b1[0], b1[1]]];
    }
    function _gate(uint64 delta) internal returns (ZkDacGateV7 g) {
        uint256[] memory s = fx.readUintArray(_k("actions", I, "pub")); uint256[] memory t = fx.readUintArray(_k("actions", I, "tpk"));
        deployCodeTo("ZkDacGateV7.sol:ZkDacGateV7", abi.encode(ver, address(reg), OP, s[0], s[1], uint64(300), delta, uint64(1e6), [t[0], t[1]], s.length - 9), fx.readAddress(".gate"));
        g = ZkDacGateV7(fx.readAddress(".gate")); vm.prank(OP); g.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
    }
    function _exec(ZkDacGateV7 g) internal {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("actions", I); uint256[] memory s = fx.readUintArray(_k("actions", I, "pub"));
        g.execute(ZkDacGateV7.Proof(a, b, c), ZkDacGateV7.Roots(s[0], s[1], s[2]), s[3], uint64(s[4]),
            ZkDacGateV7.Action(address(target), METHOD, 100, fx.readUint(_k("actions", I, "nonce")), PARAMS), fx.readUintArray(_k("actions", I, "ct")));
    }
    // revocation at t0 = NOW: new revoked root; returns the gas of updateRoots
    function _revoke(ZkDacGateV7 g) internal returns (uint256 gasUsed) {
        uint256 newRevoked = uint256(keccak256("E3 new revoked root")) >> 8;
        uint256 ir = g.issuedRoot(); vm.prank(OP); uint256 g0 = gasleft(); g.updateRoots(ir, newRevoked); gasUsed = g0 - gasleft();   // ir read before prank: a view call consumes vm.prank
    }
    function _sweep(uint64 delta) internal {
        ZkDacGateV7 g = _gate(delta); uint256 gu = _revoke(g);
        uint256 snap = vm.snapshotState();
        vm.warp(NOW + delta); _exec(g); assertEq(target.calls(), 1);                                 // old root, inside the window: accepted
        vm.revertToState(snap);
        vm.warp(NOW + delta + 1);
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("actions", I); uint256[] memory s = fx.readUintArray(_k("actions", I, "pub"));
        ZkDacGateV7.Action memory act = ZkDacGateV7.Action(address(target), METHOD, 100, fx.readUint(_k("actions", I, "nonce")), PARAMS);
        uint256[] memory ct = fx.readUintArray(_k("actions", I, "ct"));
        vm.expectRevert(ZkDacGateV7.StaleRevokedRoot.selector);
        g.execute(ZkDacGateV7.Proof(a, b, c), ZkDacGateV7.Roots(s[0], s[1], s[2]), s[3], uint64(s[4]), act, ct);   // one second later: rejected
        console2.log(string.concat("E3.5 delta ", vm.toString(delta), " s: accepted at t0+delta, StaleRevokedRoot at t0+delta+1; updateRoots gas"), gu);
    }
    function test_window_0() public { _sweep(0); }
    function test_window_12() public { _sweep(12); }
    function test_window_60() public { _sweep(60); }
    function test_window_240() public { _sweep(240); }
    function test_window_3600() public { _sweep(3600); }
    // the revoked holder cannot avoid the window by waiting for a second update: the R0 deadline is fixed at its retirement time
    function test_secondUpdate_doesNotExtendOldRoot() public {
        ZkDacGateV7 g = _gate(60); _revoke(g);
        vm.warp(NOW + 30); uint256 ir = g.issuedRoot(); vm.prank(OP); g.updateRoots(ir, uint256(keccak256("E3 second root")) >> 8);
        vm.warp(NOW + 61);
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("actions", I); uint256[] memory s = fx.readUintArray(_k("actions", I, "pub"));
        ZkDacGateV7.Action memory act = ZkDacGateV7.Action(address(target), METHOD, 100, fx.readUint(_k("actions", I, "nonce")), PARAMS);
        uint256[] memory ct = fx.readUintArray(_k("actions", I, "ct"));
        vm.expectRevert(ZkDacGateV7.StaleRevokedRoot.selector);
        g.execute(ZkDacGateV7.Proof(a, b, c), ZkDacGateV7.Roots(s[0], s[1], s[2]), s[3], uint64(s[4]), act, ct);
    }
    // re-posting a previously retired root resets its retirement (the operator can "un-revoke"): recorded as a POLICY observation for #18
    function test_repostOldRoot_reacceptsIt_POLICY() public {
        ZkDacGateV7 g = _gate(0); uint256 r0 = g.revokedRoot(); _revoke(g);
        vm.warp(NOW + 100); uint256 ir = g.issuedRoot(); vm.prank(OP); g.updateRoots(ir, r0);
        _exec(g); assertEq(target.calls(), 1);
    }
}
