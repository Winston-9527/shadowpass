// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ZkDacGate, ZkDacGateBase} from "../src/ZkDacGate.sol";
import {PoseidonOpt} from "../src/PoseidonOpt.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {MockTarget} from "./Targets.sol";

contract ZkDacGateTest is Test {
    using stdJson for string;
    string fx; ZkDacGate gate; PoseidonOpt pos; Groth16Verifier ver; MockTarget target;
    address constant OP = address(0x0FE1);
    uint64 constant WIN = 300; uint64 constant SKEW = 60;
    uint256 issued; uint256 R0; uint256 R1; uint256 R2; uint64 NOW; bytes4 METHOD; bytes PARAMS;

    function _deployData(bytes memory runtime) internal returns (address a) {
        // init code: PUSH2 len DUP1 PUSH1 0x0c PUSH1 0 CODECOPY PUSH1 0 RETURN || runtime
        bytes memory init = abi.encodePacked(hex"61", uint16(runtime.length), hex"80600c6000396000f3", runtime);
        assembly { a := create(0, add(init, 0x20), mload(init)) }
        require(a != address(0) && a.code.length == runtime.length, "data deploy");
    }

    function setUp() public {
        fx = vm.readFile("test/fixtures_v2.json");
        issued = fx.readUint(".issuedRoot"); R0 = fx.readUint(".R0"); R1 = fx.readUint(".R1"); R2 = fx.readUint(".R2");
        NOW = uint64(fx.readUint(".now")); METHOD = bytes4(fx.readBytes(".method")); PARAMS = fx.readBytes(".params");
        address d1 = _deployData(fx.readBytes(".poseidonData.d1"));
        address d2 = _deployData(fx.readBytes(".poseidonData.d2"));
        pos = new PoseidonOpt(fx.readUint(".poseidonData.t"), fx.readUint(".poseidonData.nrp"), d1, d2, fx.readUint(".poseidonData.len1"), fx.readUint(".poseidonData.len2"));
        ver = new Groth16Verifier();
        deployCodeTo("ZkDacGate.sol:ZkDacGate", abi.encode(address(ver), address(pos), OP, issued, R0, WIN, WIN, SKEW), fx.readAddress(".gate"));
        gate = ZkDacGate(fx.readAddress(".gate"));
        deployCodeTo("Targets.sol:MockTarget", "", fx.readAddress(".target"));
        target = MockTarget(fx.readAddress(".target"));
        vm.prank(OP); gate.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
        vm.warp(NOW);
    }

    // ---- fixture helpers ----
    function _k(uint256 i, string memory f) internal pure returns (string memory) { return string.concat(".proofs[", vm.toString(i), "].", f); }
    function _proof(uint256 i) internal view returns (ZkDacGateBase.Proof memory p) {
        uint256[] memory a = fx.readUintArray(_k(i, "a")); uint256[] memory c = fx.readUintArray(_k(i, "c"));
        p.a = [a[0], a[1]]; p.c = [c[0], c[1]];
        uint256[] memory b0 = fx.readUintArray(string.concat(_k(i, "b"), "[0]")); uint256[] memory b1 = fx.readUintArray(string.concat(_k(i, "b"), "[1]"));
        p.b = [[b0[0], b0[1]], [b1[0], b1[1]]];
    }
    function _pub(uint256 i) internal view returns (uint256[] memory) { return fx.readUintArray(_k(i, "pub")); }
    function _act(uint256 i) internal view returns (ZkDacGateBase.Action memory) {
        return ZkDacGateBase.Action(address(target), METHOD, fx.readUint(_k(i, "amount")), fx.readUint(_k(i, "nonce")), PARAMS);
    }
    function _exec(uint256 i) internal { uint256[] memory s = _pub(i); gate.execute(_proof(i), s[0], s[1], s[3], uint64(s[4]), _act(i)); }
    function _execExpect(uint256 i, bytes4 err) internal { vm.expectRevert(err); _exec(i); }

    // ---- consistency ----
    function test_onchainPoseidonMatchesCircuitDigest() public view {
        for (uint256 i = 0; i < 4; i++) {
            if (i == 2) continue; // proof 2 was made with attacker-chosen req_cap=0
            assertEq(gate.actionDigest(_act(i)), _pub(i)[2], "Poseidon(7) on-chain != circuit action_digest");
        }
    }
    function test_validProofExecutes() public { _exec(0); assertEq(target.calls(), 1); assertTrue(gate.spent(_pub(0)[3])); }

    // ---- replay (A10) ----
    function test_replayRejected() public { _exec(0); _execExpect(0, ZkDacGateBase.NullifierSpent.selector); }
    function test_distinctNonceIsDistinctNullifier() public { _exec(0); _exec(1); assertEq(target.calls(), 2); }
    function test_reentrantReplayRejected() public {
        uint256[] memory s = _pub(0);
        target.setReenter(abi.encodeCall(gate.execute, (_proof(0), s[0], s[1], s[3], uint64(s[4]), _act(0))));
        _exec(0);
        assertEq(target.calls(), 1); assertFalse(target.reenterOk());
        assertEq(bytes4(target.reenterResult()), ZkDacGateBase.NullifierSpent.selector);
    }
    function test_businessRevertRollsBackNullifier() public {
        target.setFail(true); vm.expectRevert(bytes("business failure")); _exec(0);
        assertFalse(gate.spent(_pub(0)[3]));                 // rolled back -> retry possible
        target.setFail(false); _exec(0); assertEq(target.calls(), 1);
    }

    // ---- context binding ----
    function test_proverChosenReqCapRejected() public { _execExpect(2, ZkDacGateBase.InvalidProof.selector); }
    function test_otherChainRejected() public { vm.chainId(1); _execExpect(0, ZkDacGateBase.InvalidProof.selector); }
    function test_targetSubstitutionRejected() public {
        MockTarget other = new MockTarget(); uint256[] memory s = _pub(0); ZkDacGateBase.Action memory a = _act(0); a.target = address(other);
        vm.expectRevert(ZkDacGateBase.InvalidProof.selector); gate.execute(_proof(0), s[0], s[1], s[3], uint64(s[4]), a);
    }
    function test_amountSubstitutionRejected() public {
        uint256[] memory s = _pub(0); ZkDacGateBase.Action memory a = _act(0); a.amount = 1e18;
        vm.expectRevert(ZkDacGateBase.InvalidProof.selector); gate.execute(_proof(0), s[0], s[1], s[3], uint64(s[4]), a);
    }
    function test_disabledMethodRejected() public { vm.prank(OP); gate.setMethod(METHOD, 1, false); _execExpect(0, ZkDacGateBase.UnknownMethod.selector); }

    // ---- clock (A14) ----
    function test_clockWithinSkewAccepted() public { vm.warp(NOW + SKEW); _exec(0); }
    function test_clockTooOldRejected() public { vm.warp(NOW + SKEW + 1); _execExpect(0, ZkDacGateBase.BadClock.selector); }
    function test_clockInFutureRejected() public { vm.warp(NOW - 1); _execExpect(0, ZkDacGateBase.BadClock.selector); }

    // ---- root freshness / revocation lag (A12c) ----
    function test_unknownRootRejected() public {
        uint256[] memory s = _pub(0);
        vm.expectRevert(ZkDacGateBase.StaleRevokedRoot.selector); gate.execute(_proof(0), s[0], R2, s[3], uint64(s[4]), _act(0));
    }
    function test_strictWindowZeroRejectsImmediately() public {
        deployCodeTo("ZkDacGate.sol:ZkDacGate", abi.encode(address(ver), address(pos), OP, issued, R0, uint64(0), uint64(0), SKEW), fx.readAddress(".gate"));
        vm.prank(OP); gate.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
        vm.prank(OP); gate.updateRoots(issued, R2);
        vm.warp(NOW + 1);                                    // one second later the pre-revocation root is dead
        _execExpect(0, ZkDacGateBase.StaleRevokedRoot.selector);
    }
    function test_onlyOperatorUpdatesRoots() public { vm.expectRevert(ZkDacGateBase.NotOperator.selector); gate.updateRoots(issued, R1); }
    function test_revocationTakesEffectAfterWindow() public {
        // unrelated revocation: R0 -> R1. Old proofs stay valid for WIN, new proofs against R1 work.
        vm.prank(OP); gate.updateRoots(issued, R1);
        _exec(0);                                            // proof vs R0, inside window
        _exec(3);                                            // proof vs R1
        // this chain's cert1 revoked: R1 -> R2 at t = NOW
        vm.prank(OP); gate.updateRoots(issued, R2);
        // proof 1 (vs R0, retired at NOW) still accepted inside the window: this is the measured revocation lag
        _exec(1);
        assertEq(target.calls(), 3);
    }
    function test_staleRootRejectedAfterWindow() public {
        // proofs carry now=NOW, so after the window the clock check would also fire; isolate the root check with a large-skew gate
        ZkDacGate g2 = _gateWithSkew(type(uint64).max / 2);
        vm.prank(OP); g2.updateRoots(issued, R2);            // this chain's cert1 revoked at t = NOW
        uint256[] memory s = _pub(0);
        vm.warp(NOW + WIN);                                  // last second of the window: still accepted (revocation lag = WIN)
        g2.execute(_proof(0), s[0], s[1], s[3], uint64(s[4]), _act(0));
        vm.warp(NOW + WIN + 1);                              // after the window: rejected
        s = _pub(1);
        vm.expectRevert(ZkDacGateBase.StaleRevokedRoot.selector); g2.execute(_proof(1), s[0], s[1], s[3], uint64(s[4]), _act(1));
    }
    function _gateWithSkew(uint64 skew) internal returns (ZkDacGate g) {
        // same address is required (verifier address is inside the digest) -> redeploy at the fixture address
        deployCodeTo("ZkDacGate.sol:ZkDacGate", abi.encode(address(ver), address(pos), OP, issued, R0, WIN, WIN, skew), fx.readAddress(".gate"));
        g = ZkDacGate(fx.readAddress(".gate"));
        vm.prank(OP); g.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
    }

    // ---- gas breakdown (E7) ----
    function test_gasBreakdown() public {
        uint256[] memory s = _pub(0); ZkDacGateBase.Proof memory p = _proof(0); ZkDacGateBase.Action memory a = _act(0);
        uint256 g0 = gasleft(); bool ok = ver.verifyProof(p.a, p.b, p.c, [s[0], s[1], s[2], s[3], s[4]]); uint256 gVer = g0 - gasleft(); assertTrue(ok);
        g0 = gasleft(); uint256 d = gate.actionDigest(a); uint256 gDig = g0 - gasleft(); assertEq(d, s[2]);
        g0 = gasleft(); gate.execute(p, s[0], s[1], s[3], uint64(s[4]), a); uint256 gAll = g0 - gasleft();
        bytes memory cd = abi.encodeCall(gate.execute, (p, s[0], s[1], s[3], uint64(s[4]), a));
        uint256 z; for (uint256 i = 0; i < cd.length; i++) if (cd[i] == 0) z++;
        uint256 gCalldata = 21000 + 4 * z + 16 * (cd.length - z);
        console2.log("verifyProof (first call in tx, cold account, 5 public inputs)", gVer);
        console2.log("actionDigest Poseidon(7) on-chain (incl. call into gate)", gDig);
        console2.log("execute total (excl. intrinsic/calldata)", gAll);
        console2.log("calldata bytes", cd.length);
        console2.log("intrinsic + calldata gas (EIP-2028)", gCalldata);
    }
}
