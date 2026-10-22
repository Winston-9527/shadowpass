// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Adapted from vendor/zk-hada-exp/work/t4_contracts/foundry/src/ZkDacRevocations.sol.
interface IRevokeVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[4] calldata)
        external
        view
        returns (bool);
}

/// Authorized, monotonic indexed-Merkle-tree revocation. There is no function that can
/// set an arbitrary root, so an old root cannot be replayed to undo a revocation.
contract ShadowRevocations {
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IRevokeVerifier public immutable verifier;
    uint64 public immutable window;
    uint256 public root;
    uint256 public count;
    mapping(uint256 => uint64) public retiredAt;

    error InvalidProof();
    error BadField();

    event Revoked(uint256 indexed entry, uint256 index, uint256 oldRoot, uint256 newRoot);

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    constructor(address verifier_, uint256 genesisRoot, uint256 genesisCount, uint64 window_) {
        if (genesisRoot == 0 || genesisRoot >= P) revert BadField();
        verifier = IRevokeVerifier(verifier_);
        root = genesisRoot;
        count = genesisCount;
        window = window_;
    }

    function revoke(Proof calldata proof, uint256 newRoot, uint256 entry) external {
        if (newRoot >= P || entry >= P) revert BadField();
        uint256 oldRoot = root;
        uint256 index = count;
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, [oldRoot, newRoot, entry, index])) {
            revert InvalidProof();
        }
        retiredAt[oldRoot] = uint64(block.timestamp);
        root = newRoot;
        count = index + 1;
        emit Revoked(entry, index, oldRoot, newRoot);
    }

    function rootAccepted(uint256 candidate) external view returns (bool) {
        if (candidate == 0) return false;
        if (candidate == root) return true;
        uint64 retiredAt_ = retiredAt[candidate];
        return retiredAt_ != 0 && block.timestamp <= uint256(retiredAt_) + window;
    }
}
