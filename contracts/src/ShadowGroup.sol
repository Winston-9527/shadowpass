// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InternalLeanIMT, LeanIMTData} from "zk-kit-lean-imt/InternalLeanIMT.sol";

/// Permissionless identity group. Any caller can append a commitment; the registry accepts
/// the current root and roots retired within `rootWindow`.
contract ShadowGroup {
    using InternalLeanIMT for LeanIMTData;

    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    LeanIMTData internal tree;
    uint256 public currentRoot;
    mapping(uint256 => bool) public knownRoot;

    error BadField();

    event Joined(uint256 indexed commitment, uint256 index, uint256 root);

    function join(uint256 commitment) external {
        if (commitment >= P) revert BadField();
        uint256 index = tree.size;
        uint256 nextRoot = tree._insert(commitment);
        knownRoot[nextRoot] = true;
        currentRoot = nextRoot;
        emit Joined(commitment, index, nextRoot);
    }

    function rootAccepted(uint256 root) external view returns (bool) {
        return root != 0 && knownRoot[root];
    }

    function size() external view returns (uint256) {
        return tree.size;
    }
}
