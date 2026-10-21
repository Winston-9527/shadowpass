// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentTarget} from "./ZkDacGate.sol";
import {ZkDacRegistry} from "./ZkDacRegistry.sol";

interface IVerifier7 { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[7] calldata) external view returns (bool); }

/// Action gate for the v5 circuit (issue #17): ZkDacGateC's obligations (roots, clock, nullifier set, keccak ctx_hash, req_cap per method) plus
/// root_root, which must be accepted by the registry. Written as a separate contract (logic copied from ZkDacGateBase/ZkDacGateC) so that the
/// bytecode and gas of the earlier gates stay exactly as measured in PR #19/#20.
/// Public inputs (circuit declaration order): issued_root, revoked_root, root_root, nullifier, now, ctx_hash, req_cap.
contract ZkDacGateV5 {
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    IVerifier7 public immutable verifier;
    ZkDacRegistry public immutable registry;
    address public immutable operator;
    uint64 public immutable issuedWindow;
    uint64 public immutable revokedWindow;
    uint64 public immutable clockSkew;

    uint256 public issuedRoot;
    uint256 public revokedRoot;
    mapping(uint256 => uint64) public issuedRootRetiredAt;
    mapping(uint256 => uint64) public revokedRootRetiredAt;
    mapping(uint256 => bool) public spent;
    mapping(bytes4 => uint32) public requiredCap;
    mapping(bytes4 => bool) public methodEnabled;

    error NotOperator(); error StaleIssuedRoot(); error StaleRevokedRoot(); error UnregisteredRootRoot();
    error BadClock(); error NullifierSpent(); error UnknownMethod(); error InvalidProof(); error BadField();

    event RootsUpdated(uint256 issuedRoot, uint256 revokedRoot);
    event Executed(uint256 indexed nullifier, address indexed target, bytes4 method, uint256 amount);

    struct Proof { uint[2] a; uint[2][2] b; uint[2] c; }
    struct Action { address target; bytes4 method; uint256 amount; uint256 nonce; bytes params; }
    struct Roots { uint256 issued; uint256 revoked; uint256 root; }

    constructor(address v, address reg, address op, uint256 iRoot, uint256 rRoot, uint64 iWin, uint64 rWin, uint64 skew) {
        verifier = IVerifier7(v); registry = ZkDacRegistry(reg); operator = op;
        issuedWindow = iWin; revokedWindow = rWin; clockSkew = skew; issuedRoot = iRoot; revokedRoot = rRoot;
    }
    function setMethod(bytes4 m, uint32 cap, bool on) external { if (msg.sender != operator) revert NotOperator(); requiredCap[m] = cap; methodEnabled[m] = on; }
    function updateRoots(uint256 newIssued, uint256 newRevoked) external {
        if (msg.sender != operator) revert NotOperator();
        if (newIssued != issuedRoot) { issuedRootRetiredAt[issuedRoot] = uint64(block.timestamp); issuedRootRetiredAt[newIssued] = 0; issuedRoot = newIssued; }
        if (newRevoked != revokedRoot) { revokedRootRetiredAt[revokedRoot] = uint64(block.timestamp); revokedRootRetiredAt[newRevoked] = 0; revokedRoot = newRevoked; }
        emit RootsUpdated(newIssued, newRevoked);
    }
    function _rootOk(uint256 root, uint256 current, mapping(uint256 => uint64) storage retired, uint64 window) internal view returns (bool) {
        if (root == current) return true; uint64 t = retired[root]; return t != 0 && block.timestamp <= uint256(t) + window;
    }
    function ctxHash(Action calldata act) public view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(this), act.method, act.target, act.params, act.amount, act.nonce))) >> 8;
    }
    function execute(Proof calldata pr, Roots calldata r, uint256 nullifier, uint64 nowTs, Action calldata act) external {
        if (!methodEnabled[act.method]) revert UnknownMethod();
        if (act.amount >= P || act.nonce >= P || nullifier >= P) revert BadField();
        if (!_rootOk(r.issued, issuedRoot, issuedRootRetiredAt, issuedWindow)) revert StaleIssuedRoot();
        if (!_rootOk(r.revoked, revokedRoot, revokedRootRetiredAt, revokedWindow)) revert StaleRevokedRoot();
        if (!registry.rootAccepted(r.root)) revert UnregisteredRootRoot();
        if (nowTs > block.timestamp || block.timestamp - nowTs > clockSkew) revert BadClock();
        if (spent[nullifier]) revert NullifierSpent();
        if (!verifier.verifyProof(pr.a, pr.b, pr.c, [r.issued, r.revoked, r.root, nullifier, uint256(nowTs), ctxHash(act), uint256(requiredCap[act.method])])) revert InvalidProof();
        spent[nullifier] = true;
        IAgentTarget(act.target).onAuthorized(act.method, act.amount, act.params);
        emit Executed(nullifier, act.target, act.method, act.amount);
    }
}
