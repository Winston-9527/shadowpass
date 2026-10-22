// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InternalLeanIMT, LeanIMTData} from "zk-kit-lean-imt/InternalLeanIMT.sol";

/// Permissionless identity group. Any caller can append a commitment; the registry accepts
/// the current root and roots retired within `rootWindow`.
contract ShadowGroup {
    using InternalLeanIMT for LeanIMTData;

    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    LeanIMTData internal tree;
    uint64 public immutable rootWindow;
    uint256 public currentRoot;
    mapping(uint256 => uint64) public rootRetiredAt;

    error BadField();

    event Joined(uint256 indexed commitment, uint256 index, uint256 root);

    constructor(uint64 window) {
        rootWindow = window;
    }

    function join(uint256 commitment) external {
        if (commitment >= P) revert BadField();
        uint256 index = tree.size;
        uint256 nextRoot = tree._insert(commitment);
        if (currentRoot != 0) rootRetiredAt[currentRoot] = uint64(block.timestamp);
        rootRetiredAt[nextRoot] = 0;
        currentRoot = nextRoot;
        emit Joined(commitment, index, nextRoot);
    }

    function rootAccepted(uint256 root) external view returns (bool) {
        if (root == 0) return false;
        if (root == currentRoot) return true;
        uint64 retiredAt = rootRetiredAt[root];
        return retiredAt != 0 && block.timestamp <= uint256(retiredAt) + rootWindow;
    }

    function size() external view returns (uint256) {
        return tree.size;
    }
}
