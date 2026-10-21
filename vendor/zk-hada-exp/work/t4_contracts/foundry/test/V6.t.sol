// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ZkDacRegistry} from "../src/ZkDacRegistry.sol";
import {ZkDacGateV5} from "../src/ZkDacGateV5.sol";
import {Groth16VerifierRegister} from "../src/Groth16VerifierRegister.sol";
import {Groth16VerifierV6D2} from "../src/Groth16VerifierV6D2.sol";
import {MockTarget} from "./Targets.sol";

/// #28: V5Test re-run with the v6 circuit (holder-key revocation) behind the unchanged ZkDacGateV5 (7 public inputs), plus key-revocation tests.
/// Copied from V5.t.sol; v5 header follows.
/// #17 option b, real proofs: registration (Semaphore v4 group) -> on-chain LeanIMT of root certificates -> v5 action proofs.
/// History in the fixture: A registers master M1 (R1) -> B registers (R2) -> A re-registers with master M2, in-place update (R3).
contract V6Test is Test {
    using stdJson for string;
    string fx; ZkDacRegistry reg; ZkDacGateV5 gate; MockTarget target; address regVer; address v5Ver;
    address constant OP = address(0x0FE1); uint64 constant WIN = 300; uint64 NOW; bytes4 METHOD; bytes PARAMS;

    function setUp() public {
        fx = vm.readFile("test/fixtures_V6.json");
        NOW = uint64(fx.readUint(".now")); METHOD = bytes4(fx.readBytes(".method")); PARAMS = fx.readBytes(".params");
        regVer = address(new Groth16VerifierRegister()); v5Ver = address(new Groth16VerifierV6D2());
        reg = new ZkDacRegistry(regVer, OP, fx.readUint(".domain"), WIN);
        vm.prank(OP); reg.setGroupRoot(fx.readUint(".groupRoot"), true);
        deployCodeTo("ZkDacGateV5.sol:ZkDacGateV5", abi.encode(v5Ver, address(reg), OP, uint256(1), uint256(1), WIN, WIN, uint64(60)), fx.readAddress(".gate"));
        gate = ZkDacGateV5(fx.readAddress(".gate"));
        deployCodeTo("Targets.sol:MockTarget", "", fx.readAddress(".target")); target = MockTarget(fx.readAddress(".target"));
        vm.prank(OP); gate.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
        vm.warp(NOW);
    }
    function _k(string memory arr, uint256 i, string memory f) internal pure returns (string memory) { return string.concat(".", arr, "[", vm.toString(i), "].", f); }
    function _p(string memory arr, uint256 i) internal view returns (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) {
        uint256[] memory x = fx.readUintArray(_k(arr, i, "a")); uint256[] memory z = fx.readUintArray(_k(arr, i, "c"));
        uint256[] memory b0 = fx.readUintArray(string.concat(_k(arr, i, "b"), "[0]")); uint256[] memory b1 = fx.readUintArray(string.concat(_k(arr, i, "b"), "[1]"));
        a = [x[0], x[1]]; c = [z[0], z[1]]; b = [[b0[0], b0[1]], [b1[0], b1[1]]];
    }
    function _register(uint256 i) internal { _register(reg, i); }
    function _register(ZkDacRegistry r, uint256 i) internal {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("regs", i); uint256[] memory s = fx.readUintArray(_k("regs", i, "pub"));
        r.register(ZkDacRegistry.Proof(a, b, c), s[0], s[2], s[3], fx.readUintArray(_k("regs", i, "siblings")));
    }
    struct RegCall { ZkDacRegistry.Proof pr; uint256 groupRoot; uint256 nf; uint256 leaf0; uint256[] sib; }
    struct ActCall { ZkDacGateV5.Proof pr; ZkDacGateV5.Roots roots; uint256 nf; uint64 t; ZkDacGateV5.Action act; }
    function _regCall(uint256 i) internal view returns (RegCall memory r) {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("regs", i); uint256[] memory s = fx.readUintArray(_k("regs", i, "pub"));
        r = RegCall(ZkDacRegistry.Proof(a, b, c), s[0], s[2], s[3], fx.readUintArray(_k("regs", i, "siblings")));
    }
    function _actCall(uint256 i) internal view returns (ActCall memory x) {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("actions", i); uint256[] memory s = fx.readUintArray(_k("actions", i, "pub"));
        x = ActCall(ZkDacGateV5.Proof(a, b, c), ZkDacGateV5.Roots(s[0], s[1], s[2]), s[3], uint64(s[4]),
            ZkDacGateV5.Action(address(target), METHOD, fx.readUint(_k("actions", i, "amount")), fx.readUint(_k("actions", i, "nonce")), PARAMS));
    }
    function _setRoots(uint256 i) internal {                          // this proof's own issued/revoked roots become the gate's current ones
        uint256[] memory s = fx.readUintArray(_k("actions", i, "pub")); vm.prank(OP); gate.updateRoots(s[0], s[1]);
    }
    function _exec(ActCall memory x) internal { gate.execute(x.pr, x.roots, x.nf, x.t, x.act); }
    function _act(uint256 i) internal { _setRoots(i); _exec(_actCall(i)); }
    function _actExpect(uint256 i, bytes4 err) internal { _setRoots(i); ActCall memory x = _actCall(i); vm.expectRevert(err); _exec(x); }
    function _leaf(uint256 i) internal view returns (uint256) { return fx.readUint(_k("regs", i, "leaf0")); }

    // ---- registry state matches the off-chain (JS) LeanIMT exactly ----
    function test_onchainRootsMatchJS() public {
        _register(0); assertEq(reg.currentRoot(), fx.readUint(".roots.R1"));
        _register(1); assertEq(reg.currentRoot(), fx.readUint(".roots.R2"));
        _register(2); assertEq(reg.currentRoot(), fx.readUint(".roots.R3"));
        assertFalse(reg.has(_leaf(0))); assertTrue(reg.has(_leaf(2))); assertEq(reg.size(), 2);
        assertTrue(reg.retired(_leaf(0)));
        assertEq(reg.leafOfNullifier(fx.readUint(_k("regs", 0, "nf"))), _leaf(2));
    }
    // ---- R1 / R2 at the action ----
    function test_actAfterRegistration() public { _register(0); _act(0); assertEq(target.calls(), 1); }
    function test_actWithoutRegistration_rejected() public { _actExpect(0, ZkDacGateV5.UnregisteredRootRoot.selector); }
    function test_newMasterActs() public { _register(0); _register(1); _register(2); _act(3); assertEq(target.calls(), 1); }
    function test_otherHumanUnaffected() public { _register(0); _register(1); _act(1); _register(2); assertEq(target.calls(), 1); }
    // ---- replacement: the old master's proofs die once their root leaves the window (lag = WIN), new proofs for the old master are impossible ----
    function test_replacedMaster_oldProofWithinWindow_POLICY() public {
        _register(0); _register(1); _register(2);                    // R2 retired at NOW
        _act(2);                                                      // A_M1 proof vs R2, inside the window: accepted (measured revocation lag)
        assertEq(target.calls(), 1);
    }
    function test_replacedMaster_oldProofAfterWindow_rejected() public {
        _register(0); _register(1); _register(2);
        vm.warp(NOW + WIN + 1);                                       // root check precedes the clock check
        _actExpect(2, ZkDacGateV5.UnregisteredRootRoot.selector);
    }
    // ---- registration abuse ----
    function test_registrationReplay_rejected() public { _register(0); vm.expectRevert(ZkDacRegistry.AlreadyRegistered.selector); _register(0); }
    function test_oldRegistrationReplayAfterReplacement_rejected() public {
        _register(0); _register(1); _register(2);
        vm.expectRevert(ZkDacRegistry.LeafRetired.selector); _register(0);   // anyone can resend A's old public proof: must not roll back to M1
    }
    function test_unknownGroupRoot_rejected() public {
        vm.prank(OP); reg.setGroupRoot(fx.readUint(".groupRoot"), false);
        vm.expectRevert(ZkDacRegistry.UnknownGroupRoot.selector); _register(0);
    }
    function test_registrationForOtherDomain_rejected() public {
        ZkDacRegistry other = new ZkDacRegistry(regVer, OP, fx.readUint(".domain") + 1, WIN);
        vm.prank(OP); other.setGroupRoot(fx.readUint(".groupRoot"), true);
        vm.expectRevert(ZkDacRegistry.InvalidProof.selector); _register(other, 0);
    }
    function test_replacementWithWrongSiblings_rejected() public {
        _register(0); _register(1);
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p("regs", 2); uint256[] memory s = fx.readUintArray(_k("regs", 2, "pub"));
        uint256[] memory bad = fx.readUintArray(_k("regs", 2, "siblings")); bad[0] = bad[0] + 1;
        vm.expectRevert(); reg.register(ZkDacRegistry.Proof(a, b, c), s[0], s[2], s[3], bad);   // InternalLeanIMT: WrongSiblingNodes
        assertEq(reg.currentRoot(), fx.readUint(".roots.R2"));
    }
    function test_actionReplay_rejected() public { _register(0); _act(0); _actExpect(0, ZkDacGateV5.NullifierSpent.selector); }

    // ---- holder-key revocation (#28): operator revokes B's terminal key K_B (revoked root rv0 -> rv1) ----
    function _toKeyRevokedRoot() internal { uint256 i = gate.issuedRoot(); vm.prank(OP); gate.updateRoots(i, fx.readUint(".keyRevocation.rv1")); }
    function test_keyRevoked_oldProofWithinWindow_POLICY() public {
        _register(0); _register(1); _setRoots(1); _toKeyRevokedRoot();     // B's proof was made against rv0, now retired
        _exec(_actCall(1)); assertEq(target.calls(), 1);                  // inside the revoked-root window: accepted (revocation lag = window)
    }
    function test_keyRevoked_oldProofAfterWindow_rejected() public {
        _register(0); _register(1); _setRoots(1); _toKeyRevokedRoot();
        vm.warp(NOW + WIN + 1); ActCall memory x = _actCall(1); vm.expectRevert(ZkDacGateV5.StaleRevokedRoot.selector); _exec(x);
    }
    function test_keyRevoked_othersProveAgainstNewRoot() public {
        _register(0); _register(1); _register(2); _act(4); assertEq(target.calls(), 1);
        assertEq(gate.revokedRoot(), fx.readUint(".keyRevocation.rv1"));
    }

    // ---- gas ----
    function test_gas() public {   // all fixture parsing happens outside the measured windows
        RegCall memory r0 = _regCall(0); RegCall memory r1 = _regCall(1); RegCall memory r2 = _regCall(2); ActCall memory x = _actCall(3);
        uint256 g = gasleft(); reg.register(r0.pr, r0.groupRoot, r0.nf, r0.leaf0, r0.sib); console2.log("register #1 (LeanIMT insert into empty tree)", g - gasleft());
        g = gasleft(); reg.register(r1.pr, r1.groupRoot, r1.nf, r1.leaf0, r1.sib); console2.log("register #2 (LeanIMT insert)", g - gasleft());
        g = gasleft(); reg.register(r2.pr, r2.groupRoot, r2.nf, r2.leaf0, r2.sib); console2.log("re-register (LeanIMT in-place update)", g - gasleft());
        uint256 dom = fx.readUint(".domain");
        g = gasleft(); bool ok = Groth16VerifierRegister(regVer).verifyProof(r2.pr.a, r2.pr.b, r2.pr.c, [r2.groupRoot, dom, r2.nf, r2.leaf0]);
        uint256 gv = g - gasleft(); assertTrue(ok); console2.log("registration verifyProof alone (4 public inputs)", gv);
        _setRoots(3);
        g = gasleft(); ok = Groth16VerifierV6D2(v5Ver).verifyProof(x.pr.a, x.pr.b, x.pr.c, [x.roots.issued, x.roots.revoked, x.roots.root, x.nf, uint256(x.t), gate.ctxHash(x.act), uint256(1)]);
        console2.log("v6 verifyProof (7 public inputs, incl. ctxHash call)", g - gasleft()); assertTrue(ok);
        g = gasleft(); _exec(x); console2.log("v6 execute #1 (excl. intrinsic)", g - gasleft());
    }
}
