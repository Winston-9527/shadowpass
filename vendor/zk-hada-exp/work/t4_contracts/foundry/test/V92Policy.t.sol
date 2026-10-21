// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {V92Test} from "./V92.t.sol";
import {ZkDacGateV9} from "../src/ZkDacGateV9.sol";
import {ZkDacRegistry} from "../src/ZkDacRegistry.sol";
import {ZkDacRevocations} from "../src/ZkDacRevocations.sol";
import {Groth16VerifierV92CD1} from "../src/Groth16VerifierV92CD1.sol";
import {Groth16VerifierV92CD2} from "../src/Groth16VerifierV92CD2.sol";
import {Groth16VerifierV92CD3} from "../src/Groth16VerifierV92CD3.sol";
import {Groth16VerifierV92CD4} from "../src/Groth16VerifierV92CD4.sol";
import {Groth16VerifierBudgetTransfer} from "../src/Groth16VerifierBudgetTransfer.sol";
import {Groth16VerifierBudgetMint} from "../src/Groth16VerifierBudgetMint.sol";
import {stdJson} from "forge-std/StdJson.sol";

// E7d: V91Policy.t.sol with V92 verifiers; V9Policy.t.sol ported to v9.1 (verifiers V91CD*, base V91Test; nothing else changed). Original:
// POLICY rows of T3 v9 exercised on ZkDacGateV9 with real fixtures_V9 proofs. Written by the external audit (#55, run in its scratch worktree) and
// added here unchanged except for the contract name, as the v9 closure evidence (POLICY_CLOSURE_V9.md). The v9.1 gate is the same contract.
contract V92PolicyTest is V92Test {
    using stdJson for string;
    function _gate(address at, uint64 skew, uint256[2] memory tpk) internal returns (ZkDacGateV9 g) {
        address[] memory vs = new address[](4); uint256[] memory n = new uint256[](4);
        vs[0] = address(new Groth16VerifierV92CD1()); vs[1] = address(new Groth16VerifierV92CD2()); vs[2] = address(new Groth16VerifierV92CD3()); vs[3] = address(new Groth16VerifierV92CD4());
        for (uint256 d = 1; d <= 4; d++) n[d - 1] = d + 6;
        ZkDacGateV9.BudgetCfg memory bc = ZkDacGateV9.BudgetCfg(address(new Groth16VerifierBudgetTransfer()), address(new Groth16VerifierBudgetMint()), NWIN);
        deployCodeTo("ZkDacGateV9.sol:ZkDacGateV9", abi.encode(vs, n, address(reg), address(revs), OP, fx.readUint(".issuedRoot"), uint64(300), skew, tpk, bc), at);
        g = ZkDacGateV9(at); vm.prank(OP); g.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
        g.registerState(fx.readUint(".issuedRoot"), fx.readUint(".revGenesisRoot"), fx.readUint(".rootRoot"));
    }
    function _tpk() internal view returns (uint256[2] memory t) { uint256[] memory a = fx.readUintArray(".tpk"); t = [a[0], a[1]]; }
    function _mintTransfer(ZkDacGateV9 g) internal {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(_k(0)); vm.prank(OP); g.mint(ZkDacGateV9.Proof(a, b, c), fx.readUint(".steps[0].cm"), fx.readUint(".steps[0].q"));
        (a, b, c) = _p(_k(1)); uint256[] memory s = fx.readUintArray(".steps[1].pub"); g.transferBudget(ZkDacGateV9.Proof(a, b, c), s[0], s[1], s[2], s[3], s[4]);
    }
    function _ex(ZkDacGateV9 g, X memory x, bytes4 sel) internal { vm.expectRevert(sel); g.execute(x.pr, x.r, x.t, x.act, x.ct, x.b); }
    // A11a x7
    function test_A11a_chainId() public { _run(1); vm.chainId(1); _ex(gate, _x(2), ZkDacGateV9.InvalidProof.selector); }
    function test_A11a_gateAddress() public { ZkDacGateV9 g2 = _gate(address(0xBEEF), 1e6, _tpk()); _mintTransfer(g2); _ex(g2, _x(2), ZkDacGateV9.InvalidProof.selector); }
    function test_A11a_gateAddress_control() public { ZkDacGateV9 g2 = _gate(fx.readAddress(".gate"), 1e6, _tpk()); _mintTransfer(g2); X memory x = _x(2); g2.execute(x.pr, x.r, x.t, x.act, x.ct, x.b); }
    function test_A11a_method() public { _run(1); bytes4 m2 = 0x23b872dd; vm.prank(OP); gate.setMethod(m2, uint32(fx.readUint(".reqCap")), true); X memory x = _x(2); x.act.method = m2; _ex(gate, x, ZkDacGateV9.InvalidProof.selector); }
    function test_A11a_amountOnly() public { _run(1); X memory x = _x(2); x.act.amount += 1; _ex(gate, x, ZkDacGateV9.AmountMismatch.selector); }
    function test_A11a_amountAndQ() public { _run(1); X memory x = _x(2); x.act.amount += 1; x.b.qSpent += 1; _ex(gate, x, ZkDacGateV9.InvalidProof.selector); }
    function test_A11a_params() public { _run(1); X memory x = _x(2); x.act.params = hex"1234abce"; _ex(gate, x, ZkDacGateV9.InvalidProof.selector); }
    function test_A11a_nonce() public { _run(1); X memory x = _x(2); x.act.nonce += 1; _ex(gate, x, ZkDacGateV9.InvalidProof.selector); }
    function test_A11a_target() public { _run(1); address t2 = address(0xCAFE); deployCodeTo("Targets.sol:MockTarget", "", t2); X memory x = _x(2); x.act.target = t2; _ex(gate, x, ZkDacGateV9.InvalidProof.selector); }
    // A11-req
    function test_A11req() public { _run(1); vm.prank(OP); gate.setMethod(METHOD, uint32(fx.readUint(".reqCap")) ^ 1, true); _ex(gate, _x(2), ZkDacGateV9.InvalidProof.selector); }
    // A14 with the V9.t.sol config (skew 1e6, NOW = 1000): now = 0 passes the clock check and fails only at the verifier
    function test_A14_now0_V9config() public { _run(1); X memory x = _x(2); x.t = 0; _ex(gate, x, ZkDacGateV9.InvalidProof.selector); }
    // A14 proper: proof's own now, realistic skew
    function test_A14_skew60_tooOld() public { ZkDacGateV9 g = _gate(fx.readAddress(".gate"), 60, _tpk()); _mintTransfer(g); vm.warp(NOW + 61); _ex(g, _x(2), ZkDacGateV9.BadClock.selector); }
    function test_A14_skew60_future() public { ZkDacGateV9 g = _gate(fx.readAddress(".gate"), 60, _tpk()); _mintTransfer(g); vm.warp(NOW - 1); _ex(g, _x(2), ZkDacGateV9.BadClock.selector); }
    function test_A14_skew60_edge_ok() public { ZkDacGateV9 g = _gate(fx.readAddress(".gate"), 60, _tpk()); _mintTransfer(g); vm.warp(NOW + 60); X memory x = _x(2); g.execute(x.pr, x.r, x.t, x.act, x.ct, x.b); }
    // A17c' wiring on V9 (registry mocked: root retired beyond window)
    function test_A17c_registryRejects() public { _run(1); X memory x = _x(2); vm.mockCall(address(reg), abi.encodeCall(ZkDacRegistry.rootAccepted, (x.r.root)), abi.encode(false)); _ex(gate, x, ZkDacGateV9.UnregisteredRootRoot.selector); }
    // A22h: gate with another TPK
    function test_A22h_otherTpk() public { uint256[2] memory t = _tpk(); ZkDacGateV9 g = _gate(fx.readAddress(".gate"), 1e6, [t[1], t[0]]); _mintTransfer(g); _ex(g, _x(2), ZkDacGateV9.InvalidProof.selector); }
    // A22i probe: identity TPK accepted at deployment (no on-chain check)
    function test_A22i_identityTpkDeploys() public { ZkDacGateV9 g = _gate(address(0xD00D), 1e6, [uint256(0), uint256(1)]); assertEq(g.tpkX(), 0); }
    // stale issued root
    function test_staleIssuedRoot() public { _run(1); vm.prank(OP); gate.updateIssuedRoot(12345); vm.warp(NOW + 301); _ex(gate, _x(2), ZkDacGateV9.StaleIssuedRoot.selector); }
    // reentrant replay from the business callback
    function test_reentrantReplay() public { _run(1); X memory x = _x(2); target.setReenter(abi.encodeCall(gate.execute, (x.pr, x.r, x.t, x.act, x.ct, x.b))); gate.execute(x.pr, x.r, x.t, x.act, x.ct, x.b);
        assertEq(target.calls(), 1); assertFalse(target.reenterOk()); assertEq(bytes4(target.reenterResult()), ZkDacGateV9.BudgetSpent.selector); }
    // A10' with an INVALID proof: BudgetSpent is checked before the verifier, so the selector alone does not show the proof was valid
    function test_A10_selectorBeforeVerify() public { _run(2); X memory x = _x(3); x.pr.a[0] = 1; _ex(gate, x, ZkDacGateV9.BudgetSpent.selector); }
    // business revert: budget not consumed
    function test_businessRevertRollsBack() public { _run(1); X memory x = _x(2); target.setFail(true); vm.expectRevert(bytes("business failure")); gate.execute(x.pr, x.r, x.t, x.act, x.ct, x.b);
        assertFalse(gate.budgetSpent(x.b.budgetNf)); target.setFail(false); gate.execute(x.pr, x.r, x.t, x.act, x.ct, x.b); }
    // front-run: anyone can submit a pending proof (msg.sender not bound) - executes the same action
    function test_frontRunnerCanSubmit() public { _run(1); X memory x = _x(2); vm.prank(address(0xBAD)); gate.execute(x.pr, x.r, x.t, x.act, x.ct, x.b); assertEq(target.calls(), 1); }
    // added by party B (not from the audit): A21c / A12c wiring - the revocation registry no longer accepts the proof's revoked root (any later
    // revocation, related or not, after the window) -> StaleRevokedRoot; the gate only sees root freshness, not which entry changed
    function test_A21c_revokedRootRetired() public { _run(1); X memory x = _x(2); vm.mockCall(address(revs), abi.encodeCall(ZkDacRevocations.rootAccepted, (x.r.revoked)), abi.encode(false)); _ex(gate, x, ZkDacGateV9.StaleRevokedRoot.selector); }
}
