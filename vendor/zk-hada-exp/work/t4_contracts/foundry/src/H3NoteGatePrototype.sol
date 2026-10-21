// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {InternalLeanIMT, LeanIMTData} from "zk-kit-lean-imt/InternalLeanIMT.sol";
import {ZkDacRevocations} from "./ZkDacRevocations.sol";

interface INoteVerifier { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[7] calldata) external view returns (bool); }

/// H3 PRE-STUDY PROTOTYPE (work/h3_prestudy/H3-prestudy_20261009), not a protocol contract: one note_transfer step for gas measurement.
/// Checks the note root (current), the revoked root (ZkDacRevocations), the nullifier, verifies the proof, appends both output notes to the on-chain
/// LeanIMT note tree. ctx_hash is taken as an argument here (a real gate computes it from the call, as ZkDacGateV7 does); no business call.
contract H3NoteGatePrototype {
    using InternalLeanIMT for LeanIMTData;
    INoteVerifier public immutable verifier; ZkDacRevocations public immutable revocations; address public immutable operator;
    LeanIMTData internal tree; mapping(uint256 => bool) public spent;
    error NotOperator(); error StaleNoteRoot(); error StaleRevokedRoot(); error NullifierSpent(); error InvalidProof();
    event Transfer(uint256 indexed nullifier, uint256 cm1, uint256 cm2, uint256 qSpent);
    struct Proof { uint[2] a; uint[2][2] b; uint[2] c; }
    constructor(address v, address revs, address op) { verifier = INoteVerifier(v); revocations = ZkDacRevocations(revs); operator = op; }
    function seed(uint256 leaf) external { if (msg.sender != operator) revert NotOperator(); tree._insert(leaf); }   // test genesis only
    function root() external view returns (uint256) { return tree._root(); }
    function transfer(Proof calldata pr, uint256[7] calldata pub) external {
        if (pub[0] != tree._root()) revert StaleNoteRoot();
        if (!revocations.rootAccepted(pub[1])) revert StaleRevokedRoot();
        if (spent[pub[2]]) revert NullifierSpent();
        if (!verifier.verifyProof(pr.a, pr.b, pr.c, pub)) revert InvalidProof();
        spent[pub[2]] = true;
        tree._insert(pub[3]); tree._insert(pub[4]);
        emit Transfer(pub[2], pub[3], pub[4], pub[5]);
    }
}
