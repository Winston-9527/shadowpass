// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ZkDacRegistry} from "../src/ZkDacRegistry.sol";
import {ZkDacGateV9} from "../src/ZkDacGateV9.sol";
import {ZkDacRevocations} from "../src/ZkDacRevocations.sol";
import {Groth16VerifierRegister} from "../src/Groth16VerifierRegister.sol";
import {Groth16VerifierV92CD1} from "../src/Groth16VerifierV92CD1.sol";
import {Groth16VerifierV92CD2} from "../src/Groth16VerifierV92CD2.sol";
import {Groth16VerifierV92CD3} from "../src/Groth16VerifierV92CD3.sol";
import {Groth16VerifierV92CD4} from "../src/Groth16VerifierV92CD4.sol";
import {Groth16VerifierV91CD1} from "../src/Groth16VerifierV91CD1.sol";
import {Groth16VerifierV91CD2} from "../src/Groth16VerifierV91CD2.sol";
import {Groth16VerifierV91CD3} from "../src/Groth16VerifierV91CD3.sol";
import {Groth16VerifierV91CD4} from "../src/Groth16VerifierV91CD4.sol";
import {Groth16VerifierV9CD1} from "../src/Groth16VerifierV9CD1.sol";
import {Groth16VerifierV9CD2} from "../src/Groth16VerifierV9CD2.sol";
import {Groth16VerifierV9CD3} from "../src/Groth16VerifierV9CD3.sol";
import {Groth16VerifierV9CD4} from "../src/Groth16VerifierV9CD4.sol";
import {Groth16VerifierBudgetTransfer} from "../src/Groth16VerifierBudgetTransfer.sol";
import {Groth16VerifierBudgetMint} from "../src/Groth16VerifierBudgetMint.sol";
import {Groth16VerifierRevoke} from "../src/Groth16VerifierRevoke.sol";
import {MockTarget} from "./Targets.sol";

/// E7d (zkdac_v9_2/PREREGISTRATION.md check 7): V91Batch.t.sol with V92 verifiers, plus F-2 tests. Original header:
/// E7c suites B and G7 (work/t4_contracts/E7c-v91-gate_20261013/PREREGISTRATION.md): independent v9.1 actions (fixtures_V92_batch.json,
/// gen_batch_v91.mjs; real proofs) on ZkDacGateV9 with the v9.1 verifiers. Each instance has its own registered root and its own minted note; every
/// execute proof is made on the note root after all mints. Lines starting with "E7C" are parsed by analyze_e7c.py. One small JSON file per item
/// (test/fixtures_V92_batch/): reading the whole fixture per item copies it into EVM memory every time (MemoryOOG at N = 30, found in the local smoke run).
abstract contract V92BatchSetup is Test {
    using stdJson for string;
    string fx; ZkDacRegistry reg; ZkDacRevocations revs; ZkDacGateV9 gate; MockTarget target;
    address constant OP = address(0x0FE1); uint64 constant NWIN = 300; uint64 constant IWIN = 300; uint64 NOW; bytes4 METHOD; bytes PARAMS; uint256 NPD;
    struct X { ZkDacGateV9.Proof pr; ZkDacGateV9.Roots r; uint64 t; ZkDacGateV9.Action act; uint256[] ct; ZkDacGateV9.Budget b; }

    function _skew() internal pure virtual returns (uint64) { return 1e6; }
    function _rwin() internal pure virtual returns (uint64) { return 60; }
    function _v9() internal pure virtual returns (bool) { return false; }
    function _v91() internal pure virtual returns (bool) { return false; }
    function _gateTpk() internal view virtual returns (uint256[2] memory t) { uint256[] memory a = fx.readUintArray(".tpk"); t = [a[0], a[1]]; }

    function setUp() public virtual {
        fx = _rd("meta");
        NOW = uint64(fx.readUint(".now")); METHOD = bytes4(fx.readBytes(".method")); PARAMS = fx.readBytes(".params"); NPD = fx.readUint(".nPerD");
        reg = new ZkDacRegistry(address(new Groth16VerifierRegister()), OP, fx.readUint(".domain"), 300);
        vm.prank(OP); reg.setGroupRoot(fx.readUint(".groupRoot"), true);
        uint256 nr = fx.readUint(".regsLength");
        for (uint256 i = 0; i < nr; i++) { string memory j = _rd(string.concat("reg_", vm.toString(i))); (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(j, "");
            uint256[] memory s = j.readUintArray(".pub"); reg.register(ZkDacRegistry.Proof(a, b, c), s[0], s[2], s[3], new uint256[](0)); }
        assertEq(reg.currentRoot(), fx.readUint(".rootRoot"));
        revs = new ZkDacRevocations(address(new Groth16VerifierRevoke()), fx.readUint(".revGenesisRoot"), fx.readUint(".revGenesisCount"), _rwin());
        deployCodeTo("Targets.sol:MockTarget", "", fx.readAddress(".target")); target = MockTarget(fx.readAddress(".target"));
        gate = _gate(fx.readAddress(".gate"), _gateTpk());
        vm.warp(NOW);
    }
    function _gate(address at, uint256[2] memory tpk) internal returns (ZkDacGateV9 g) {
        address[] memory vs = new address[](4); uint256[] memory n = new uint256[](4);
        if (_v91()) { vs[0] = address(new Groth16VerifierV91CD1()); vs[1] = address(new Groth16VerifierV91CD2()); vs[2] = address(new Groth16VerifierV91CD3()); vs[3] = address(new Groth16VerifierV91CD4()); }
        else if (_v9()) { vs[0] = address(new Groth16VerifierV9CD1()); vs[1] = address(new Groth16VerifierV9CD2()); vs[2] = address(new Groth16VerifierV9CD3()); vs[3] = address(new Groth16VerifierV9CD4()); }
        else { vs[0] = address(new Groth16VerifierV92CD1()); vs[1] = address(new Groth16VerifierV92CD2()); vs[2] = address(new Groth16VerifierV92CD3()); vs[3] = address(new Groth16VerifierV92CD4()); }
        for (uint256 d = 1; d <= 4; d++) n[d - 1] = d + 6;
        ZkDacGateV9.BudgetCfg memory bc = ZkDacGateV9.BudgetCfg(address(new Groth16VerifierBudgetTransfer()), address(new Groth16VerifierBudgetMint()), NWIN);
        deployCodeTo("ZkDacGateV9.sol:ZkDacGateV9", abi.encode(vs, n, address(reg), address(revs), OP, fx.readUint(".issuedRoot"), IWIN, _skew(), tpk, bc), at);
        g = ZkDacGateV9(at); vm.prank(OP); g.setMethod(METHOD, uint32(fx.readUint(".reqCap")), true);
        g.registerState(fx.readUint(".issuedRoot"), fx.readUint(".revGenesisRoot"), fx.readUint(".rootRoot"));
        uint256 nm = fx.readUint(".mintsLength");
        for (uint256 i = 0; i < nm; i++) { string memory j = _rd(string.concat("mint_", vm.toString(i))); (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(j, "");
            vm.prank(OP); g.mint(ZkDacGateV9.Proof(a, b, c), j.readUint(".cm"), j.readUint(".q")); }
        assertEq(g.noteRoot(), fx.readUint(".noteRootAfterMints"));
    }
    function _rd(string memory name) internal view returns (string memory) { return vm.readFile(string.concat("test/fixtures_V92_batch/", name, ".json")); }
    function _p(string memory j, string memory k) internal pure returns (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) {
        uint256[] memory x = j.readUintArray(string.concat(k, ".a")); uint256[] memory z = j.readUintArray(string.concat(k, ".c"));
        uint256[] memory b0 = j.readUintArray(string.concat(k, ".b[0]")); uint256[] memory b1 = j.readUintArray(string.concat(k, ".b[1]"));
        a = [x[0], x[1]]; c = [z[0], z[1]]; b = [[b0[0], b0[1]], [b1[0], b1[1]]];
    }
    function _xj(string memory j) internal view returns (X memory x) {
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(j, ""); uint256[] memory s = j.readUintArray(".pub"); uint256 m = s.length;
        uint256[] memory rt = j.readUintArray(".roots");
        x = X(ZkDacGateV9.Proof(a, b, c), ZkDacGateV9.Roots(rt[0], rt[1], rt[2]), uint64(s[1]),
              ZkDacGateV9.Action(address(target), METHOD, j.readUint(".amount"), j.readUint(".nonce"), PARAMS),
              j.readUintArray(".ct"), ZkDacGateV9.Budget(s[m - 4], s[m - 3], s[m - 2], s[m - 1]));
    }
    function _x(uint256 D, uint256 i) internal view returns (X memory) { return _xj(_rd(string.concat("act_", vm.toString((D - 1) * NPD + i)))); }
    function _exec(ZkDacGateV9 g, X memory x) internal { g.execute(x.pr, x.r, x.t, x.act, x.ct, x.b); }
    function _rev(ZkDacGateV9 g, X memory x, bytes4 sel) internal { vm.expectRevert(sel); g.execute(x.pr, x.r, x.t, x.act, x.ct, x.b); }
    function _nw() internal view returns (uint256) { uint256 n = NPD < 10 ? NPD : 10; return n; }
    function _log(string memory c, uint256 D, uint256 i, string memory r) internal pure { console2.log(string.concat("E7C ", c, " D=", vm.toString(D), " i=", vm.toString(i), " ", r)); }
}

contract V92BatchTest is V92BatchSetup {
    using stdJson for string;
    event Accountability(uint256 indexed budgetNf, uint256[] ct);
    // B1 success: target called once with the amount, nullifier spent, one note inserted, Accountability(nf, ct) = the proof's ciphertext words
    function _b1(uint256 D) internal {
        for (uint256 i = 0; i < NPD; i++) { X memory x = _x(D, i); uint256 calls = target.calls(); uint256 root0 = gate.noteRoot();
            vm.expectEmit(true, false, false, true, address(gate)); emit Accountability(x.b.budgetNf, x.ct);
            uint256 g0 = gasleft(); _exec(gate, x); uint256 used = g0 - gasleft();
            assertEq(target.calls(), calls + 1); assertEq(target.lastAmount(), x.act.amount); assertTrue(gate.budgetSpent(x.b.budgetNf)); assertTrue(gate.noteRoot() != root0);
            _log("B1", D, i, string.concat("accepted gas=", vm.toString(used))); }
    }
    function test_B1_D1() public { _b1(1); } function test_B1_D2() public { _b1(2); } function test_B1_D3() public { _b1(3); } function test_B1_D4() public { _b1(4); }
    // B2 rollback: business revert -> nothing consumed or inserted; the same proof is accepted afterwards
    function _b2(uint256 D) internal {
        for (uint256 i = 0; i < NPD; i++) { uint256 snap = vm.snapshotState(); X memory x = _x(D, i); uint256 root0 = gate.noteRoot(); uint256 calls = target.calls();
            target.setFail(true); vm.expectRevert(bytes("business failure")); _exec(gate, x);
            assertFalse(gate.budgetSpent(x.b.budgetNf)); assertEq(gate.noteRoot(), root0); assertEq(target.calls(), calls);
            target.setFail(false); _exec(gate, x); assertTrue(gate.budgetSpent(x.b.budgetNf)); _log("B2", D, i, "rolled back, then accepted"); vm.revertToState(snap); }
    }
    function test_B2_D1() public { _b2(1); } function test_B2_D2() public { _b2(2); } function test_B2_D3() public { _b2(3); } function test_B2_D4() public { _b2(4); }
    // B3 substitution with the original proof
    function _b3(uint256 D) internal {
        address t2 = address(0xCAFE); deployCodeTo("Targets.sol:MockTarget", "", t2); bytes4 m2 = 0x23b872dd; vm.prank(OP); gate.setMethod(m2, uint32(fx.readUint(".reqCap")), true);
        ZkDacGateV9 g2 = _gate(address(0xBEEF), _gateTpk());
        for (uint256 i = 0; i < NPD; i++) { X memory x; uint256 n = 0;
            x = _x(D, i); x.act.target = t2; _rev(gate, x, ZkDacGateV9.InvalidProof.selector); n++;
            x = _x(D, i); x.act.method = m2; _rev(gate, x, ZkDacGateV9.InvalidProof.selector); n++;
            x = _x(D, i); x.act.params = hex"1234abce"; _rev(gate, x, ZkDacGateV9.InvalidProof.selector); n++;
            x = _x(D, i); x.act.nonce += 1; _rev(gate, x, ZkDacGateV9.InvalidProof.selector); n++;
            x = _x(D, i); x.act.amount += 1; x.b.qSpent += 1; _rev(gate, x, ZkDacGateV9.InvalidProof.selector); n++;
            x = _x(D, i); x.ct[0] += 1; _rev(gate, x, ZkDacGateV9.InvalidProof.selector); n++;                    // c1x
            x = _x(D, i); x.ct[2] += 1; _rev(gate, x, ZkDacGateV9.InvalidProof.selector); n++;                    // c2x
            x = _x(D, i); x.ct[4] += 1; _rev(gate, x, ZkDacGateV9.InvalidProof.selector); n++;                    // e[0]
            x = _x(D, i); x.ct[x.ct.length - 1] += 1; _rev(gate, x, ZkDacGateV9.InvalidProof.selector); n++;      // esign
            x = _x(D, i); vm.chainId(1); _rev(gate, x, ZkDacGateV9.InvalidProof.selector); vm.chainId(31337); n++;
            x = _x(D, i); _rev(g2, x, ZkDacGateV9.InvalidProof.selector); n++;                                    // same state, other gate address
            x = _x(D, i); x.act.amount += 1; _rev(gate, x, ZkDacGateV9.AmountMismatch.selector); n++;             // B3'
            _log("B3", D, i, string.concat("rejected ", vm.toString(n), "/12")); }
    }
    function test_B3_D1() public { _b3(1); } function test_B3_D2() public { _b3(2); } function test_B3_D3() public { _b3(3); } function test_B3_D4() public { _b3(4); }
    // B4 replay after success
    function _b4(uint256 D) internal { for (uint256 i = 0; i < NPD; i++) { X memory x = _x(D, i); _exec(gate, x); _rev(gate, x, ZkDacGateV9.BudgetSpent.selector); _log("B4", D, i, "replay rejected BudgetSpent"); } }
    function test_B4_D1() public { _b4(1); } function test_B4_D2() public { _b4(2); } function test_B4_D3() public { _b4(3); } function test_B4_D4() public { _b4(4); }
    // B5 note window: the post-mint root is retired by one unrelated execute (D = 4, last instance) at NOW
    function test_B5_noteWindow() public {
        _exec(gate, _x(4, NPD - 1));
        for (uint256 D = 1; D <= 4; D++) for (uint256 i = 0; i < _nw(); i++) { if (D == 4 && i == NPD - 1) continue; X memory x = _x(D, i);
            uint256 snap = vm.snapshotState(); vm.warp(NOW + NWIN); _exec(gate, x); vm.revertToState(snap);
            snap = vm.snapshotState(); vm.warp(NOW + NWIN + 1); _rev(gate, x, ZkDacGateV9.StaleNoteRoot.selector); vm.revertToState(snap);
            _log("B5note", D, i, "accept at window, StaleNoteRoot at window+1"); }
    }
    // B5 issued window
    function test_B5_issuedWindow() public {
        vm.prank(OP); gate.updateIssuedRoot(12345);
        for (uint256 D = 1; D <= 4; D++) for (uint256 i = 0; i < _nw(); i++) { X memory x = _x(D, i);
            uint256 snap = vm.snapshotState(); vm.warp(NOW + IWIN); _exec(gate, x); vm.revertToState(snap);
            snap = vm.snapshotState(); vm.warp(NOW + IWIN + 1); _rev(gate, x, ZkDacGateV9.StaleIssuedRoot.selector); vm.revertToState(snap);
            _log("B5issued", D, i, "accept at window, StaleIssuedRoot at window+1"); }
    }
    // B6 another sender submits the pending proof (executor not bound; disclosed POLICY row)
    function test_B6_frontRun() public {
        for (uint256 D = 1; D <= 4; D++) for (uint256 i = 0; i < NPD; i++) { X memory x = _x(D, i); uint256 calls = target.calls(); vm.prank(address(0xBAD)); _exec(gate, x);
            assertEq(target.calls(), calls + 1); _log("B6", D, i, "accepted from another sender"); }
    }
    // G7 on the v9.1 gate: v9 proofs of off-curve instances
    function test_G7_v91GateRejects() public {
        uint256 no = fx.readUint(".offcurveLength");
        for (uint256 r = 0; r < no; r++) { string memory j = _rd(string.concat("off_", vm.toString(r))); if (!j.readBool(".hasProof")) continue;
            X memory x = _xj(j); _rev(gate, x, ZkDacGateV9.InvalidProof.selector); _log("G7v91", 4, j.readUint(".j"), "v9 off-curve proof rejected InvalidProof"); }
    }
}
// B5 clock skew 60 s
contract V92BatchSkew60Test is V92BatchSetup {
    using stdJson for string;
    function _skew() internal pure override returns (uint64) { return 60; }
    function test_B5_clock() public {
        for (uint256 D = 1; D <= 4; D++) for (uint256 i = 0; i < _nw(); i++) { X memory x = _x(D, i);
            uint256 snap = vm.snapshotState(); vm.warp(NOW + 60); _exec(gate, x); vm.revertToState(snap);
            snap = vm.snapshotState(); vm.warp(NOW + 61); _rev(gate, x, ZkDacGateV9.BadClock.selector); vm.revertToState(snap);
            snap = vm.snapshotState(); vm.warp(NOW - 1); _rev(gate, x, ZkDacGateV9.BadClock.selector); vm.revertToState(snap);
            _log("B5clock", D, i, "accept at NOW+60, BadClock at NOW+61 and NOW-1"); }
    }
}
// B5 revocation window Δ after a real revocation transaction
abstract contract V92BatchRwin is V92BatchSetup {
    using stdJson for string;
    function _revoke() internal { (uint[2] memory a, uint[2][2] memory b, uint[2] memory c) = _p(fx, ".revoke"); revs.revoke(ZkDacRevocations.Proof(a, b, c), fx.readUint(".revoke.newRoot"), fx.readUint(".revoke.entry")); }
    function _run() internal {
        _revoke(); uint64 w = _rwin();
        for (uint256 D = 1; D <= 4; D++) for (uint256 i = 0; i < _nw(); i++) { X memory x = _x(D, i);
            uint256 snap = vm.snapshotState(); vm.warp(NOW + w); _exec(gate, x); vm.revertToState(snap);
            snap = vm.snapshotState(); vm.warp(NOW + w + 1); _rev(gate, x, ZkDacGateV9.StaleRevokedRoot.selector); vm.revertToState(snap);
            _log(string.concat("B5rev", vm.toString(w)), D, i, "accept at window, StaleRevokedRoot at window+1"); }
    }
}
contract V92BatchRwin0Test is V92BatchRwin { function _rwin() internal pure override returns (uint64) { return 0; } function test_B5_revocationWindow() public { _run(); } }
contract V92BatchRwin12Test is V92BatchRwin { function _rwin() internal pure override returns (uint64) { return 12; } function test_B5_revocationWindow() public { _run(); } }
contract V92BatchRwin60Test is V92BatchRwin { function _rwin() internal pure override returns (uint64) { return 60; } function test_B5_revocationWindow() public { _run(); } }
contract V92BatchRwin240Test is V92BatchRwin { function _rwin() internal pure override returns (uint64) { return 240; } function test_B5_revocationWindow() public { _run(); } }
// B3: the same gate address and state with another valid TPK
contract V92BatchOtherTpkTest is V92BatchSetup {
    using stdJson for string;
    function _gateTpk() internal view override returns (uint256[2] memory t) { uint256[] memory a = fx.readUintArray(".otherTpk"); t = [a[0], a[1]]; }
    function test_B3_otherTpk() public {
        for (uint256 D = 1; D <= 4; D++) for (uint256 i = 0; i < NPD; i++) { _rev(gate, _x(D, i), ZkDacGateV9.InvalidProof.selector); _log("B3tpk", D, i, "rejected InvalidProof"); }
    }
}
// G7 on a gate with the v9 verifiers and identical state: the off-curve v9 proofs are accepted (on-chain consequence of #53 on v9);
// control: v9.1 batch proofs are rejected there (different keys)
contract V92BatchV9GateTest is V92BatchSetup {
    using stdJson for string;
    function _v9() internal pure override returns (bool) { return true; }
    function test_G7_v9GateAccepts() public {
        uint256 no = fx.readUint(".offcurveLength");
        for (uint256 r = 0; r < no; r++) { string memory j = _rd(string.concat("off_", vm.toString(r))); if (!j.readBool(".hasProof")) continue;
            X memory x = _xj(j); uint256 calls = target.calls(); _exec(gate, x); assertEq(target.calls(), calls + 1); _log("G7v9", 4, j.readUint(".j"), "v9 off-curve proof ACCEPTED by the v9 gate"); }
    }
    function test_G7_control_v91ProofsOnV9Gate() public {
        for (uint256 D = 1; D <= 4; D++) { _rev(gate, _x(D, 0), ZkDacGateV9.InvalidProof.selector); _log("G7ctl", D, 0, "v9.1 proof rejected by the v9 gate"); }
    }
}

// F-2 (identity holder, holder_sk = 0): v9.1 proofs of registered/issued chains whose holder is O. v9.2 cannot produce a witness for them.
contract V92BatchF2Test is V92BatchSetup {
    using stdJson for string;
    function test_F2_v92GateRejects() public {
        uint256 nf = fx.readUint(".f2Length"); uint256 seen;
        for (uint256 r = 0; r < nf; r++) { string memory j = _rd(string.concat("f2_", vm.toString(r))); if (!j.readBool(".hasProof")) continue; seen++;
            _rev(gate, _xj(j), ZkDacGateV9.InvalidProof.selector); _log("F2v92", j.readUint(".D"), r, "v9.1 identity-holder proof rejected by the v9.2 gate"); }
        assertGt(seen, 0);
    }
}
contract V92BatchF2V91GateTest is V92BatchSetup {
    using stdJson for string;
    function _v91() internal pure override returns (bool) { return true; }
    function test_F2_v91GateAccepts() public {
        uint256 nf = fx.readUint(".f2Length"); uint256 seen;
        for (uint256 r = 0; r < nf; r++) { string memory j = _rd(string.concat("f2_", vm.toString(r))); if (!j.readBool(".hasProof")) continue; seen++;
            X memory x = _xj(j); uint256 calls = target.calls(); _exec(gate, x); assertEq(target.calls(), calls + 1);
            _log("F2v91", j.readUint(".D"), r, "identity-holder proof ACCEPTED by a v9.1 gate (anyone can act as O)"); }
        assertGt(seen, 0);
    }
}
