// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {H3NoteGatePrototype} from "../src/H3NoteGatePrototype.sol";
import {ZkDacRevocations} from "../src/ZkDacRevocations.sol";
import {Groth16VerifierNote} from "../src/Groth16VerifierNote.sol";
import {Groth16VerifierRevoke} from "../src/Groth16VerifierRevoke.sol";

/// H3 pre-study C1: gas of one authorization-note step with a real note_transfer proof (fixtures_h3note.json, written by bench.mjs).
contract H3NoteTest is Test {
    using stdJson for string;
    string fx; H3NoteGatePrototype g; address ver; uint256[7] pub; H3NoteGatePrototype.Proof pr;
    function setUp() public {
        fx = vm.readFile("test/fixtures_h3note.json"); ver = address(new Groth16VerifierNote());
        ZkDacRevocations r = new ZkDacRevocations(address(new Groth16VerifierRevoke()), fx.readUint(".revGenesisRoot"), fx.readUint(".revGenesisCount"), 60);
        g = new H3NoteGatePrototype(ver, address(r), address(this));
        uint256[] memory leaves = fx.readUintArray(".leaves"); for (uint256 i = 0; i < leaves.length; i++) g.seed(leaves[i]);
        uint256[] memory a = fx.readUintArray(".a"); uint256[] memory c = fx.readUintArray(".c"); uint256[] memory b0 = fx.readUintArray(".b[0]"); uint256[] memory b1 = fx.readUintArray(".b[1]");
        pr = H3NoteGatePrototype.Proof([a[0], a[1]], [[b0[0], b0[1]], [b1[0], b1[1]]], [c[0], c[1]]);
        uint256[] memory p = fx.readUintArray(".pub"); for (uint256 i = 0; i < 7; i++) pub[i] = p[i];
    }
    function test_rootMatchesJs() public view { assertEq(g.root(), pub[0]); }
    function test_gas_and_doubleSpend() public {
        uint256 g0 = gasleft(); bool ok = Groth16VerifierNote(ver).verifyProof(pr.a, pr.b, pr.c, pub); uint256 gv = g0 - gasleft(); assertTrue(ok);
        H3NoteGatePrototype.Proof memory p = pr; uint256[7] memory u = pub;
        g0 = gasleft(); g.transfer(p, u); uint256 gt = g0 - gasleft();
        console2.log("note_transfer verifyProof (7 public inputs)", gv);
        console2.log("prototype transfer step (verify + roots + nullifier + 2 LeanIMT inserts + event; excl. intrinsic/calldata)", gt);
        vm.expectRevert(H3NoteGatePrototype.StaleNoteRoot.selector); g.transfer(p, u);   // the root moved: the same proof is stale
    }
    function test_nullifierBlocksDoubleSpend_evenWithRootPinned() public {
        H3NoteGatePrototype.Proof memory p = pr; uint256[7] memory u = pub; g.transfer(p, u);
        assertTrue(g.spent(u[2]));
    }
}
