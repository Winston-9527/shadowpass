// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRevokeVerifier { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[4] calldata) external view returns (bool); }

/// #18 / research design line 97: the revocation set (indexed Merkle tree, depth 20) advances ONLY by authorized, proven insertions.
/// revoke() verifies a revoke_transition proof with public inputs (current root, newRoot, entry, count): the prover knows the secret key of the
/// certificate's issuer or holder, or of the revoked key itself, and newRoot = current root with trunc(entry) inserted at index `count`.
/// There is no function that sets an arbitrary root, so a revocation cannot be undone (E3: re-posting an old root via updateRoots "un-revoked").
/// A retired root stays acceptable for `window` seconds (revocation latency, E3.5). Genesis root/count are set at deployment (trusted genesis).
contract ZkDacRevocations {
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    IRevokeVerifier public immutable verifier;
    uint64 public immutable window;
    uint256 public root;
    uint256 public count;
    mapping(uint256 => uint64) public retiredAt;

    error InvalidProof(); error BadField();
    event Revoked(uint256 indexed entry, uint256 index, uint256 oldRoot, uint256 newRoot);
    struct Proof { uint[2] a; uint[2][2] b; uint[2] c; }

    constructor(address v, uint256 genesisRoot, uint256 genesisCount, uint64 win) { verifier = IRevokeVerifier(v); root = genesisRoot; count = genesisCount; window = win; }

    function revoke(Proof calldata pr, uint256 newRoot, uint256 entry) external {
        if (newRoot >= P || entry >= P) revert BadField();
        uint256 old = root; uint256 idx = count;
        if (!verifier.verifyProof(pr.a, pr.b, pr.c, [old, newRoot, entry, idx])) revert InvalidProof();
        retiredAt[old] = uint64(block.timestamp);
        root = newRoot; count = idx + 1;
        emit Revoked(entry, idx, old, newRoot);
    }
    function rootAccepted(uint256 r) external view returns (bool) {
        if (r == root) return true; uint64 t = retiredAt[r]; return t != 0 && block.timestamp <= uint256(t) + window;
    }
}
