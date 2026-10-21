// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InternalLeanIMT, LeanIMTData} from "zk-kit-lean-imt/InternalLeanIMT.sol";   // @zk-kit/lean-imt.sol 2.0.1 (remapped: forge drops the "/" after a ".sol" package name)

interface IRegisterVerifier { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[4] calldata) external view returns (bool); }

/// Master-agent registry (issue #17, option b). Enforces R1 (one master per human per domain) and R2 (master legitimacy) on-chain:
///  - a registration proof shows: Semaphore v4 identity in an accepted group, nf = Poseidon("zkdr", s, domain), leaf0 = the v4/v5 hop-0 certificate hash;
///  - nf -> current leaf0: the first registration inserts leaf0 into the registered-root LeanIMT; a re-registration with the same nf replaces the old
///    leaf0 IN PLACE (the old master and its whole sub-tree lose their root certificate once the old root leaves the acceptance window);
///  - action gates accept a root_root only if it is current or was retired less than `rootWindow` seconds ago.
/// Trust: the operator decides which Semaphore group roots are accepted (the personhood source), nothing else.
contract ZkDacRegistry {
    using InternalLeanIMT for LeanIMTData;

    IRegisterVerifier public immutable verifier;
    address public immutable operator;
    uint256 public immutable domain;
    uint64 public immutable rootWindow;

    LeanIMTData internal tree;
    uint256 public currentRoot;                              // 0 while empty: never accepted
    mapping(uint256 => uint64) public rootRetiredAt;
    mapping(uint256 => bool) public groupRootAccepted;
    mapping(uint256 => uint256) public leafOfNullifier;      // nf -> current registered leaf0 (0 = none)
    mapping(uint256 => bool) public retired;                // leaf0 values replaced by a re-registration: can never come back.
    // Without this, anyone could replay a human's OLD (public) registration proof after a replacement and roll the master back.

    error NotOperator();
    error UnknownGroupRoot();
    error InvalidProof();
    error AlreadyRegistered();
    error LeafRetired();

    event GroupRoot(uint256 indexed root, bool accepted);
    event Registered(uint256 indexed nf, uint256 leaf0, uint256 root);
    event Replaced(uint256 indexed nf, uint256 oldLeaf0, uint256 newLeaf0, uint256 root);

    struct Proof { uint[2] a; uint[2][2] b; uint[2] c; }

    constructor(address v, address op, uint256 dom, uint64 window) { verifier = IRegisterVerifier(v); operator = op; domain = dom; rootWindow = window; }

    function setGroupRoot(uint256 root, bool accepted) external {
        if (msg.sender != operator) revert NotOperator();
        groupRootAccepted[root] = accepted; emit GroupRoot(root, accepted);
    }

    /// siblingNodes: LeanIMT proof siblings of the OLD leaf (only for a re-registration; checked against the current root by InternalLeanIMT._update)
    function register(Proof calldata pr, uint256 groupRoot, uint256 nf, uint256 leaf0, uint256[] calldata siblingNodes) external {
        if (!groupRootAccepted[groupRoot]) revert UnknownGroupRoot();
        uint256 old = leafOfNullifier[nf];
        if (old == leaf0) revert AlreadyRegistered();
        if (retired[leaf0]) revert LeafRetired();
        if (!verifier.verifyProof(pr.a, pr.b, pr.c, [groupRoot, domain, nf, leaf0])) revert InvalidProof();
        if (old == 0) tree._insert(leaf0); else { tree._update(old, leaf0, siblingNodes); retired[old] = true; }
        leafOfNullifier[nf] = leaf0;
        uint256 root = tree._root();
        if (currentRoot != 0) rootRetiredAt[currentRoot] = uint64(block.timestamp);
        rootRetiredAt[root] = 0; currentRoot = root;
        if (old == 0) emit Registered(nf, leaf0, root); else emit Replaced(nf, old, leaf0, root);
    }

    function rootAccepted(uint256 root) external view returns (bool) {
        if (root == 0) return false;
        if (root == currentRoot) return true;
        uint64 t = rootRetiredAt[root];
        return t != 0 && block.timestamp <= uint256(t) + rootWindow;
    }
    function size() external view returns (uint256) { return tree.size; }
    function has(uint256 leaf) external view returns (bool) { return tree._has(leaf); }
}
