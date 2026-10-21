// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ZkDacRegistry} from "../src/ZkDacRegistry.sol";
import {ZkDacGateV7R} from "../src/ZkDacGateV7R.sol";
import {ZkDacRevocations} from "../src/ZkDacRevocations.sol";
import {Groth16VerifierRegister} from "../src/Groth16VerifierRegister.sol";
import {Groth16VerifierV7CD4} from "../src/Groth16VerifierV7CD4.sol";
import {Groth16VerifierRevoke} from "../src/Groth16VerifierRevoke.sol";
import {MockTarget} from "./Targets.sol";

/// #18 Part 2 (work/t4_obligations/E7-obligations_20261009/PREREGISTRATION.md): authorized, monotonic revocation.
/// fixtures_revoke.json: real revoke_transition proofs on the revocation tree of fixtures_V7.json actions[3] (C_D4) — genesis = that action's revoked_root.
contract RevokeV7RTest is Test {
    using stdJson for string;
    string fx; string rv; ZkDacRegistry reg; MockTarget target; address ver; address rver;
    address constant OP = address(0x0FE1); uint64 constant WIN = 60; uint64 NOW; bytes4 METHOD; bytes PARAMS; uint256 constant I = 3;

    function setUp() public {
        fx = vm.readFile("test/fixtures_V7.json"); rv = vm.readFile("test/fixtures_revoke.json");
        NOW = uint64(fx.readUint(".now")); METHOD = bytes4(fx.readBytes(".method")); PARAMS = fx.readBytes(".params");
        reg = new ZkDacRegistry(address(new Groth16VerifierRegister()), OP, fx.readUint(".domain"), 300);
        vm.prank(OP); reg.setGroupRoot(fx.readUint(".groupRoot"), true);
        for (uint256 i = 0; i < 2; i++) {
            (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(fx, string.concat(".regs[", vm.toString(i), "]")); uint256[] memory s = fx.readUintArray(string.concat(".regs[", vm.toString(i), "].pub"));
            reg.register(ZkDacRegistry.Proof(a, b, c), s[0], s[2], s[3], new uint256[](0));
        }
        ver = address(new Groth16VerifierV7CD4()); rver = address(new Groth16VerifierRevoke());
        deployCodeTo("Targets.sol:MockTarget", "", fx.readAddress(".target")); target = MockTarget(fx.readAddress(".target"));
        vm.warp(NOW);
    }
    function _p(string memory j, string memory k) internal pure returns (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) {
        uint256[] memory x = j.readUintArray(string.concat(k, ".a")); uint256[] memory z = j.readUintArray(string.concat(k, ".c"));
        uint256[] memory b0 = j.readUintArray(string.concat(k, ".b[0]")); uint256[] memory b1 = j.readUintArray(string.concat(k, ".b[1]"));
        a = [x[0], x[1]]; c = [z[0], z[1]]; b = [[b0[0], b0[1]], [b1[0], b1[1]]];
    }
    function _revs() internal returns (ZkDacRevocations) { return new ZkDacRevocations(rver, rv.readUint(".genesisRoot"), rv.readUint(".genesisCount"), WIN); }
    function _revoke(ZkDacRevocations r, string memory t) internal {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(rv, string.concat(".", t));
        r.revoke(ZkDacRevocations.Proof(a, b, c), rv.readUint(string.concat(".", t, ".newRoot")), rv.readUint(string.concat(".", t, ".entry")));
    }
    function _expectRevokeRevert(ZkDacRevocations r, string memory t, bytes4 sel) internal {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(rv, string.concat(".", t));
        uint256 nr = rv.readUint(string.concat(".", t, ".newRoot")); uint256 e = rv.readUint(string.concat(".", t, ".entry"));
        vm.expectRevert(sel); r.revoke(ZkDacRevocations.Proof(a, b, c), nr, e);
    }

    // V1 / V3 / V2 in sequence; V11: on-chain root after each step == off-chain replay (fixture newRoot computed by replaying the entries)
    function test_authorizedSequence() public {
        ZkDacRevocations r = _revs(); uint256 c0 = r.count();
        vm.expectEmit(true, false, false, true, address(r)); emit ZkDacRevocations.Revoked(rv.readUint(".T1.entry"), c0, rv.readUint(".genesisRoot"), rv.readUint(".T1.newRoot"));
        _revoke(r, "T1"); assertEq(r.root(), rv.readUint(".T1.newRoot")); assertEq(r.count(), c0 + 1);
        _revoke(r, "T2"); assertEq(r.root(), rv.readUint(".T2.newRoot"));
        _revoke(r, "T3"); assertEq(r.root(), rv.readUint(".T3.newRoot")); assertEq(r.count(), c0 + 3);
        assertTrue(rv.readBool(".replayMatches"));
    }
    // V7: an applied transition cannot be replayed
    function test_replay_rejected() public { ZkDacRevocations r = _revs(); _revoke(r, "T1"); _expectRevokeRevert(r, "T1", ZkDacRevocations.InvalidProof.selector); }
    // V8: two revocations prepared against the same root: the second fails, the rebuilt one succeeds
    function test_concurrent() public {
        ZkDacRevocations r = _revs(); _revoke(r, "T1"); _expectRevokeRevert(r, "T2stale", ZkDacRevocations.InvalidProof.selector);
        _revoke(r, "T2"); assertEq(r.root(), rv.readUint(".T2.newRoot"));
    }
    // V6 (contract part): the contract supplies next_index = count, so a proof for another empty slot fails
    function test_nextIndexMustBeCount() public { ZkDacRevocations r = _revs(); _expectRevokeRevert(r, "Tgap", ZkDacRevocations.InvalidProof.selector); }
    function test_tamperedNewRoot_rejected() public {
        ZkDacRevocations r = _revs(); (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(rv, ".T1");
        uint256 nr = rv.readUint(".T1.newRoot") + 1; uint256 e = rv.readUint(".T1.entry");
        vm.expectRevert(ZkDacRevocations.InvalidProof.selector); r.revoke(ZkDacRevocations.Proof(a, b, c), nr, e);
    }
    function test_otherEntry_rejected() public {
        ZkDacRevocations r = _revs(); (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(rv, ".T1");
        uint256 nr = rv.readUint(".T1.newRoot"); uint256 e = rv.readUint(".T3.entry");
        vm.expectRevert(ZkDacRevocations.InvalidProof.selector); r.revoke(ZkDacRevocations.Proof(a, b, c), nr, e);
    }
    function test_fieldOverflow_rejected() public {
        ZkDacRevocations r = _revs(); (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(rv, ".T1");
        uint256 P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        uint256 nr = rv.readUint(".T1.newRoot") + P; uint256 e = rv.readUint(".T1.entry");
        vm.expectRevert(ZkDacRevocations.BadField.selector); r.revoke(ZkDacRevocations.Proof(a, b, c), nr, e);
    }
    // V9: no arbitrary root setter (the only state-changing function is revoke); the genesis root expires after the window
    function test_noRootSetter_and_oldRootExpires() public {
        ZkDacRevocations r = _revs(); uint256 g = r.root();
        (bool ok,) = address(r).call(abi.encodeWithSignature("updateRoots(uint256,uint256)", uint256(0), g)); assertFalse(ok);
        (ok,) = address(r).call(abi.encodeWithSignature("setRoot(uint256)", g)); assertFalse(ok);
        _revoke(r, "T1"); assertTrue(r.rootAccepted(g));
        vm.warp(NOW + WIN); assertTrue(r.rootAccepted(g)); vm.warp(NOW + WIN + 1); assertFalse(r.rootAccepted(g));
        assertTrue(r.rootAccepted(r.root()));
    }
    // V10: gate integration with the real v7 C D=4 action proof whose own certificate (hop 2) is revoked by its issuer
    function _gate(ZkDacRevocations r) internal returns (ZkDacGateV7R g) {
        uint256[] memory s = fx.readUintArray(".actions[3].pub"); uint256[] memory t = fx.readUintArray(".actions[3].tpk");
        deployCodeTo("ZkDacGateV7R.sol:ZkDacGateV7R", abi.encode(ver, address(reg), address(r), OP, s[0], uint64(300), uint64(1e6), [t[0], t[1]], s.length - 9), fx.readAddress(".gate"));
        g = ZkDacGateV7R(fx.readAddress(".gate")); vm.prank(OP); g.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
    }
    function _exec(ZkDacGateV7R g) internal {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(fx, ".actions[3]"); uint256[] memory s = fx.readUintArray(".actions[3].pub");
        g.execute(ZkDacGateV7R.Proof(a, b, c), ZkDacGateV7R.Roots(s[0], s[1], s[2]), s[3], uint64(s[4]),
            ZkDacGateV7R.Action(address(target), METHOD, 100, fx.readUint(".actions[3].nonce"), PARAMS), fx.readUintArray(".actions[3].ct"));
    }
    function test_gate_executesBeforeRevocation() public { ZkDacGateV7R g = _gate(_revs()); _exec(g); assertEq(target.calls(), 1); }
    function test_gate_revokedByIssuer_windowThenRejected() public {
        ZkDacRevocations r = _revs(); ZkDacGateV7R g = _gate(r); _revoke(r, "T1");
        uint256 snap = vm.snapshotState(); vm.warp(NOW + WIN); _exec(g); assertEq(target.calls(), 1); vm.revertToState(snap);
        vm.warp(NOW + WIN + 1);
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(fx, ".actions[3]"); uint256[] memory s = fx.readUintArray(".actions[3].pub");
        ZkDacGateV7R.Action memory act = ZkDacGateV7R.Action(address(target), METHOD, 100, fx.readUint(".actions[3].nonce"), PARAMS); uint256[] memory ct = fx.readUintArray(".actions[3].ct");
        vm.expectRevert(ZkDacGateV7R.StaleRevokedRoot.selector);
        g.execute(ZkDacGateV7R.Proof(a, b, c), ZkDacGateV7R.Roots(s[0], s[1], s[2]), s[3], uint64(s[4]), act, ct);
    }
    function test_gas_revoke() public {
        ZkDacRevocations r = _revs(); (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(rv, ".T1");
        uint256[] memory pub = rv.readUintArray(".T1.pub");
        uint256 g0 = gasleft(); bool ok = Groth16VerifierRevoke(rver).verifyProof(a, b, c, [pub[0], pub[1], pub[2], pub[3]]); uint256 gv = g0 - gasleft(); assertTrue(ok);
        uint256 nr = rv.readUint(".T1.newRoot"); uint256 e = rv.readUint(".T1.entry");
        g0 = gasleft(); r.revoke(ZkDacRevocations.Proof(a, b, c), nr, e); uint256 gr = g0 - gasleft();
        console2.log("revoke_transition verifyProof (4 public inputs)", gv);
        console2.log("ZkDacRevocations.revoke #1 (excl. intrinsic and calldata)", gr);
    }
    struct X { ZkDacGateV7R.Proof pr; ZkDacGateV7R.Roots rts; uint256 nf; uint64 t; ZkDacGateV7R.Action act; uint256[] ct; }
    function _x() internal view returns (X memory x) {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(fx, ".actions[3]"); uint256[] memory s = fx.readUintArray(".actions[3].pub");
        x = X(ZkDacGateV7R.Proof(a, b, c), ZkDacGateV7R.Roots(s[0], s[1], s[2]), s[3], uint64(s[4]),
              ZkDacGateV7R.Action(address(target), METHOD, 100, fx.readUint(".actions[3].nonce"), PARAMS), fx.readUintArray(".actions[3].ct"));
    }
    function test_gas_gateExecute() public {
        ZkDacGateV7R gt = _gate(_revs()); X memory x = _x();
        uint256 g0 = gasleft(); gt.execute(x.pr, x.rts, x.nf, x.t, x.act, x.ct);
        console2.log("ZkDacGateV7R.execute #1 C_D4 (excl. intrinsic and calldata)", g0 - gasleft());
    }
}
