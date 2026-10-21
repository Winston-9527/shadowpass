// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ZkDacRegistry} from "../src/ZkDacRegistry.sol";
import {ZkDacGateV9} from "../src/ZkDacGateV9.sol";
import {ZkDacRevocations} from "../src/ZkDacRevocations.sol";
import {Groth16VerifierRegister} from "../src/Groth16VerifierRegister.sol";
import {Groth16VerifierV91CD1} from "../src/Groth16VerifierV91CD1.sol";
import {Groth16VerifierV91CD2} from "../src/Groth16VerifierV91CD2.sol";
import {Groth16VerifierV91CD3} from "../src/Groth16VerifierV91CD3.sol";
import {Groth16VerifierV91CD4} from "../src/Groth16VerifierV91CD4.sol";
import {Groth16VerifierBudgetTransfer} from "../src/Groth16VerifierBudgetTransfer.sol";
import {Groth16VerifierBudgetMint} from "../src/Groth16VerifierBudgetMint.sol";
import {Groth16VerifierRevoke} from "../src/Groth16VerifierRevoke.sol";
import {MockTarget} from "./Targets.sol";

/// E7c suite H (work/t4_contracts/E7c-v91-gate_20261013/PREREGISTRATION.md): V9.t.sol ported to v9.1 (verifiers V91CD*, fixtures_V91.json; nothing else changed). Original:
/// #41 (work/t2_circuit_fix/zkdac_v9/PREREGISTRATION.md): v9 gate — the v8 history (V8.t.sol) on v9 proofs (fixtures_V9.json, gen_fixtures_v9.mjs),
/// plus replay without an action nullifier, unregistered state combination, registerState. Original v8 header:
/// #39 (work/t2_circuit_fix/zkdac_v8/PREREGISTRATION.md G-B1..G-B7): v8 gate with budget notes, real proofs (fixtures_V8.json, gen_fixtures_v8.mjs).
/// Steps S0..S9 replay an ordered budget history: mint 100 to M; M -> S1 40; S1 spends 10; S1 re-spends the same note (BudgetSpent); M -> S2 20;
/// S1 spends 10 (proof on a retired note root); S2 spends 20; S1 -> S11 10; S11 -> S111 10; S111 spends 10 (D = 4). R-A / R-T: S1 action / transfer
/// proofs on the pre-revocation revoked root.
contract V91Test is Test {
    using stdJson for string;
    string fx; ZkDacRegistry reg; ZkDacRevocations revs; ZkDacGateV9 gate; MockTarget target;
    address constant OP = address(0x0FE1); uint64 constant NWIN = 300; uint64 constant RWIN = 60; uint64 NOW; bytes4 METHOD; bytes PARAMS;

    function setUp() public {
        fx = vm.readFile("test/fixtures_V91.json");
        NOW = uint64(fx.readUint(".now")); METHOD = bytes4(fx.readBytes(".method")); PARAMS = fx.readBytes(".params");
        reg = new ZkDacRegistry(address(new Groth16VerifierRegister()), OP, fx.readUint(".domain"), 300);
        vm.prank(OP); reg.setGroupRoot(fx.readUint(".groupRoot"), true);
        { (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(".reg"); uint256[] memory s = fx.readUintArray(".reg.pub");
          reg.register(ZkDacRegistry.Proof(a, b, c), s[0], s[2], s[3], new uint256[](0)); }
        assertEq(reg.currentRoot(), fx.readUint(".rootRoot"));
        revs = new ZkDacRevocations(address(new Groth16VerifierRevoke()), fx.readUint(".revGenesisRoot"), fx.readUint(".revGenesisCount"), RWIN);
        address[] memory vs = new address[](4); uint256[] memory n = new uint256[](4);
        vs[0] = address(new Groth16VerifierV91CD1()); vs[1] = address(new Groth16VerifierV91CD2()); vs[2] = address(new Groth16VerifierV91CD3()); vs[3] = address(new Groth16VerifierV91CD4());
        for (uint256 d = 1; d <= 4; d++) n[d - 1] = d + 6;
        uint256[] memory t = fx.readUintArray(".tpk");
        ZkDacGateV9.BudgetCfg memory bc = ZkDacGateV9.BudgetCfg(address(new Groth16VerifierBudgetTransfer()), address(new Groth16VerifierBudgetMint()), NWIN);
        deployCodeTo("ZkDacGateV9.sol:ZkDacGateV9", abi.encode(vs, n, address(reg), address(revs), OP, fx.readUint(".issuedRoot"), uint64(300), uint64(1e6), [t[0], t[1]], bc), fx.readAddress(".gate"));
        gate = ZkDacGateV9(fx.readAddress(".gate")); vm.prank(OP); gate.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
        gate.registerState(fx.readUint(".issuedRoot"), fx.readUint(".revGenesisRoot"), fx.readUint(".rootRoot"));
        deployCodeTo("Targets.sol:MockTarget", "", fx.readAddress(".target")); target = MockTarget(fx.readAddress(".target"));
        vm.warp(NOW);
    }
    function _p(string memory k) internal view returns (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) {
        uint256[] memory x = fx.readUintArray(string.concat(k, ".a")); uint256[] memory z = fx.readUintArray(string.concat(k, ".c"));
        uint256[] memory b0 = fx.readUintArray(string.concat(k, ".b[0]")); uint256[] memory b1 = fx.readUintArray(string.concat(k, ".b[1]"));
        a = [x[0], x[1]]; c = [z[0], z[1]]; b = [[b0[0], b0[1]], [b1[0], b1[1]]];
    }
    function _k(uint256 i) internal pure returns (string memory) { return string.concat(".steps[", vm.toString(i), "]"); }
    struct X { ZkDacGateV9.Proof pr; ZkDacGateV9.Roots r; uint64 t; ZkDacGateV9.Action act; uint256[] ct; ZkDacGateV9.Budget b; }
    function _x(uint256 i) internal view returns (X memory x) {
        string memory k = _k(i); (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(k); uint256[] memory s = fx.readUintArray(string.concat(k, ".pub")); uint256 m = s.length;
        uint256[] memory rt = fx.readUintArray(string.concat(k, ".roots"));
        x = X(ZkDacGateV9.Proof(a, b, c), ZkDacGateV9.Roots(rt[0], rt[1], rt[2]), uint64(s[1]),
              ZkDacGateV9.Action(address(target), METHOD, fx.readUint(string.concat(k, ".amount")), fx.readUint(string.concat(k, ".nonce")), PARAMS),
              fx.readUintArray(string.concat(k, ".ct")), ZkDacGateV9.Budget(s[m - 4], s[m - 3], s[m - 2], s[m - 1]));
    }
    function _exec(X memory x) internal { gate.execute(x.pr, x.r, x.t, x.act, x.ct, x.b); }
    function _step(uint256 i) internal {
        string memory k = _k(i); string memory kind = fx.readString(string.concat(k, ".kind"));
        if (keccak256(bytes(kind)) == keccak256("mint")) { (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(k); vm.prank(OP); gate.mint(ZkDacGateV9.Proof(a, b, c), fx.readUint(string.concat(k, ".cm")), fx.readUint(string.concat(k, ".q"))); return; }
        bool bad = keccak256(bytes(fx.readString(string.concat(k, ".expect")))) == keccak256("BudgetSpent");
        if (keccak256(bytes(kind)) == keccak256("transfer")) { (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(k); uint256[] memory s = fx.readUintArray(string.concat(k, ".pub"));
            if (bad) vm.expectRevert(ZkDacGateV9.BudgetSpent.selector); gate.transferBudget(ZkDacGateV9.Proof(a, b, c), s[0], s[1], s[2], s[3], s[4]); return; }
        X memory x = _x(i); if (bad) vm.expectRevert(ZkDacGateV9.BudgetSpent.selector); _exec(x);
    }
    function _run(uint256 upto) internal { for (uint256 i = 0; i <= upto; i++) _step(i); }

    // G-B1, G-B3, G-B6, G-B4 (accept inside the window): the whole history
    function test_sequence() public {
        _run(9);
        assertEq(gate.totalMinted(), 100); assertEq(target.calls(), 4); assertEq(target.lastAmount(), 10);
    }
    function test_GB2_amountMismatch() public { _run(8); X memory x = _x(9); x.act.amount = 11; vm.expectRevert(ZkDacGateV9.AmountMismatch.selector); _exec(x); }
    function test_GB4_noteRootAfterWindow() public { _run(4); vm.warp(NOW + NWIN + 1); X memory x = _x(5); vm.expectRevert(ZkDacGateV9.StaleNoteRoot.selector); _exec(x); }
    function test_GB5_mintNonOperator() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(_k(0)); uint256 cm = fx.readUint(".steps[0].cm"); uint256 q = fx.readUint(".steps[0].q");
        vm.expectRevert(ZkDacGateV9.NotOperator.selector); gate.mint(ZkDacGateV9.Proof(a, b, c), cm, q);
    }
    function test_mintWrongAmount() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(_k(0)); uint256 cm = fx.readUint(".steps[0].cm");
        vm.prank(OP); vm.expectRevert(ZkDacGateV9.InvalidProof.selector); gate.mint(ZkDacGateV9.Proof(a, b, c), cm, 1000);
    }
    // a note is consumed once, by an action OR a transfer (shared nullifier space)
    function test_actionThenTransferOfSameNote() public { _run(9); _exec(_x(10)); (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(_k(11)); uint256[] memory s = fx.readUintArray(".steps[11].pub");
        vm.expectRevert(ZkDacGateV9.BudgetSpent.selector); gate.transferBudget(ZkDacGateV9.Proof(a, b, c), s[0], s[1], s[2], s[3], s[4]); }
    // G-B7: issuer M revokes S1's certificate; S1's budget is frozen for actions and transfers after the window
    function _revoke() internal { (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(".revoke"); revs.revoke(ZkDacRevocations.Proof(a, b, c), fx.readUint(".revoke.newRoot"), fx.readUint(".revoke.entry")); }
    function test_GB7_revocationFreezesBudget() public {
        _run(9); _revoke();
        uint256 snap = vm.snapshotState(); vm.warp(NOW + RWIN); _exec(_x(10)); assertEq(target.calls(), 5); vm.revertToState(snap);   // inside Δ: accepted
        vm.warp(NOW + RWIN + 1);
        X memory x = _x(10); vm.expectRevert(ZkDacGateV9.StaleRevokedRoot.selector); _exec(x);
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(_k(11)); uint256[] memory s = fx.readUintArray(".steps[11].pub");
        vm.expectRevert(ZkDacGateV9.StaleRevokedRoot.selector); gate.transferBudget(ZkDacGateV9.Proof(a, b, c), s[0], s[1], s[2], s[3], s[4]);
    }
    // gas, each measured on the state reached by the history (fixture parsing outside the measured window)
    function test_gas() public {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(_k(0)); uint256 cm = fx.readUint(".steps[0].cm"); uint256 q = fx.readUint(".steps[0].q");
        ZkDacGateV9.Proof memory pm = ZkDacGateV9.Proof(a, b, c);
        vm.prank(OP); uint256 g0 = gasleft(); gate.mint(pm, cm, q); console2.log("v9 mint (excl. intrinsic and calldata)", g0 - gasleft());
        (a, b, c) = _p(_k(1)); uint256[] memory s = fx.readUintArray(".steps[1].pub"); ZkDacGateV9.Proof memory pt = ZkDacGateV9.Proof(a, b, c);
        g0 = gasleft(); gate.transferBudget(pt, s[0], s[1], s[2], s[3], s[4]); console2.log("v9 transferBudget (2 note inserts)", g0 - gasleft());
        X memory x = _x(2); g0 = gasleft(); _exec(x); console2.log("v9 execute D=2 budgeted (excl. intrinsic and calldata)", g0 - gasleft());
        _step(3); _step(4); _step(5); _step(6); _step(7); _step(8);
        x = _x(9); g0 = gasleft(); _exec(x); console2.log("v9 execute D=4 budgeted (excl. intrinsic and calldata)", g0 - gasleft());
    }
    // v9: an executed proof cannot be replayed (no action nullifier; the budget nullifier is spent)
    function test_v9_replayOfExecutedProof() public { _run(2); X memory x = _x(2); vm.expectRevert(ZkDacGateV9.BudgetSpent.selector); _exec(x); }
    function test_v9_unregisteredStateCombination() public { _run(1); X memory x = _x(2); x.r.issued = x.r.issued + 1; vm.expectRevert(ZkDacGateV9.UnknownState.selector); _exec(x); }
    function test_v9_registerStateMatchesCircuit_permissionless_idempotent() public {
        uint256[] memory s = fx.readUintArray(".steps[2].pub"); uint256[] memory rt = fx.readUintArray(".steps[2].roots");
        vm.prank(address(0xBEEF)); assertEq(gate.registerState(rt[0], rt[1], rt[2]), s[0]);
        uint256 g0 = gasleft(); assertEq(gate.registerState(rt[0], rt[1], rt[2]), s[0]); console2.log("v9 registerState, already registered", g0 - gasleft());
        g0 = gasleft(); gate.registerState(rt[0] + 1, rt[1], rt[2]); console2.log("v9 registerState, new combination (on-chain PoseidonT4)", g0 - gasleft());
    }
}
