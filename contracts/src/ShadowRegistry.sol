// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Adapted from vendor/zk-hada-exp/work/t4_contracts/foundry/src/ZkDacRegistry.sol.
import {InternalLeanIMT, LeanIMTData} from "zk-kit-lean-imt/InternalLeanIMT.sol";
import {ShadowGroup} from "./ShadowGroup.sol";

interface IRegisterVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[4] calldata)
        external
        view
        returns (bool);
}

/// One root certificate per human and domain. Re-registration replaces the leaf in place;
/// replaced leaves are permanently retired to prevent replaying old public proofs.
contract ShadowRegistry {
    using InternalLeanIMT for LeanIMTData;

    IRegisterVerifier public immutable verifier;
    ShadowGroup public immutable group;
    uint256 public immutable domain;
    uint64 public immutable rootWindow;

    LeanIMTData internal tree;
    uint256 public currentRoot;
    mapping(uint256 => uint64) public rootRetiredAt;
    mapping(uint256 => uint256) public leafOfNullifier;
    mapping(uint256 => bool) public retired;

    error UnknownGroupRoot();
    error InvalidProof();
    error AlreadyRegistered();
    error LeafRetired();

    event Registered(uint256 indexed nf, uint256 leaf0, uint256 index, uint256 root);
    event Replaced(uint256 indexed nf, uint256 oldLeaf0, uint256 newLeaf0, uint256 index, uint256 root);

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    constructor(address verifier_, address group_, uint256 domain_, uint64 rootWindow_) {
        verifier = IRegisterVerifier(verifier_);
        group = ShadowGroup(group_);
        domain = domain_;
        rootWindow = rootWindow_;
    }

    function register(
        Proof calldata proof,
        uint256 groupRoot,
        uint256 nf,
        uint256 leaf0,
        uint256[] calldata siblingNodes
    ) external {
        if (!group.rootAccepted(groupRoot)) revert UnknownGroupRoot();
        uint256 oldLeaf = leafOfNullifier[nf];
        if (oldLeaf == leaf0) revert AlreadyRegistered();
        if (retired[leaf0]) revert LeafRetired();
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, [groupRoot, domain, nf, leaf0])) {
            revert InvalidProof();
        }

        uint256 index;
        if (oldLeaf == 0) {
            index = tree.size;
            tree._insert(leaf0);
        } else {
            index = tree._indexOf(oldLeaf);
            tree._update(oldLeaf, leaf0, siblingNodes);
            retired[oldLeaf] = true;
        }
        leafOfNullifier[nf] = leaf0;

        uint256 nextRoot = tree._root();
        if (currentRoot != 0) rootRetiredAt[currentRoot] = uint64(block.timestamp);
        rootRetiredAt[nextRoot] = 0;
        currentRoot = nextRoot;

        if (oldLeaf == 0) emit Registered(nf, leaf0, index, nextRoot);
        else emit Replaced(nf, oldLeaf, leaf0, index, nextRoot);
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

    function has(uint256 leaf) external view returns (bool) {
        return tree._has(leaf);
    }
}
