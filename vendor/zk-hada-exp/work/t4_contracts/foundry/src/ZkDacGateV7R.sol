// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentTarget} from "./ZkDacGate.sol";
import {ZkDacRegistry} from "./ZkDacRegistry.sol";
import {ZkDacRevocations} from "./ZkDacRevocations.sol";

/// #18: ZkDacGateV7 with the revoked-root check delegated to ZkDacRevocations (authorized, monotonic revocation; no operator-set revoked root).
/// Everything else is copied unchanged from ZkDacGateV7 (header follows).
/// Action gate for the v7 circuit (issue #30, R6 accountability): ZkDacGateV5 + the auditor committee key TPK (fixed at deployment) and the
/// accountability ciphertexts as extra public inputs; the ciphertexts are also emitted so auditors can read them from logs. One contract serves
/// every mode / depth: the number of public inputs is fixed at deployment and the verifier is called through a precomputed selector
/// verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[nPub]). Public inputs: the 7 of v5, tpk.x, tpk.y, then the ciphertext words.
/// Logic copied from ZkDacGateV5 (v5 header follows) so the v5 gate's bytecode and gas stay as measured.
/// Action gate for the v5 circuit (issue #17): ZkDacGateC's obligations (roots, clock, nullifier set, keccak ctx_hash, req_cap per method) plus
/// root_root, which must be accepted by the registry. Written as a separate contract (logic copied from ZkDacGateBase/ZkDacGateC) so that the
/// bytecode and gas of the earlier gates stay exactly as measured in PR #19/#20.
/// Public inputs (circuit declaration order): issued_root, revoked_root, root_root, nullifier, now, ctx_hash, req_cap.
contract ZkDacGateV7R {
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    address public immutable verifier;
    uint256 public immutable tpkX;
    uint256 public immutable tpkY;
    uint256 public immutable nPub;
    bytes4 internal immutable verifySel;
    ZkDacRegistry public immutable registry;
    address public immutable operator;
    uint64 public immutable issuedWindow;
    ZkDacRevocations public immutable revocations;
    uint64 public immutable clockSkew;

    uint256 public issuedRoot;
    mapping(uint256 => uint64) public issuedRootRetiredAt;
    mapping(uint256 => bool) public spent;
    mapping(bytes4 => uint32) public requiredCap;
    mapping(bytes4 => bool) public methodEnabled;

    error NotOperator(); error StaleIssuedRoot(); error StaleRevokedRoot(); error UnregisteredRootRoot();
    error BadClock(); error NullifierSpent(); error UnknownMethod(); error InvalidProof(); error BadField(); error BadCiphertextLength();

    event IssuedRootUpdated(uint256 issuedRoot);
    event Executed(uint256 indexed nullifier, address indexed target, bytes4 method, uint256 amount);
    event Accountability(uint256 indexed nullifier, uint256[] ct);

    struct Proof { uint[2] a; uint[2][2] b; uint[2] c; }
    struct Action { address target; bytes4 method; uint256 amount; uint256 nonce; bytes params; }
    struct Roots { uint256 issued; uint256 revoked; uint256 root; }

    constructor(address v, address reg, address revs, address op, uint256 iRoot, uint64 iWin, uint64 skew, uint256[2] memory tpk, uint256 nCt) {
        tpkX = tpk[0]; tpkY = tpk[1]; nPub = 9 + nCt;
        verifySel = bytes4(keccak256(abi.encodePacked("verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[", _dec(9 + nCt), "])")));
        verifier = v; registry = ZkDacRegistry(reg); operator = op;
        issuedWindow = iWin; clockSkew = skew; issuedRoot = iRoot; revocations = ZkDacRevocations(revs);
    }
    function _dec(uint256 x) internal pure returns (string memory) { bytes memory b = new bytes(x >= 10 ? 2 : 1); if (x >= 10) { b[0] = bytes1(uint8(48 + x / 10)); b[1] = bytes1(uint8(48 + x % 10)); } else b[0] = bytes1(uint8(48 + x)); return string(b); }
    function setMethod(bytes4 m, uint32 cap, bool on) external { if (msg.sender != operator) revert NotOperator(); requiredCap[m] = cap; methodEnabled[m] = on; }
    function updateIssuedRoot(uint256 newIssued) external {
        if (msg.sender != operator) revert NotOperator();
        if (newIssued != issuedRoot) { issuedRootRetiredAt[issuedRoot] = uint64(block.timestamp); issuedRootRetiredAt[newIssued] = 0; issuedRoot = newIssued; }
        emit IssuedRootUpdated(newIssued);
    }
    function _rootOk(uint256 root, uint256 current, mapping(uint256 => uint64) storage retired, uint64 window) internal view returns (bool) {
        if (root == current) return true; uint64 t = retired[root]; return t != 0 && block.timestamp <= uint256(t) + window;
    }
    function ctxHash(Action calldata act) public view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(this), act.method, act.target, act.params, act.amount, act.nonce))) >> 8;
    }
    function _verify(Proof calldata pr, uint256[] memory pub) internal view returns (bool ok) {
        (bool s, bytes memory ret) = verifier.staticcall(abi.encodePacked(verifySel, pr.a, pr.b, pr.c, pub));
        ok = s && ret.length == 32 && abi.decode(ret, (bool));
    }
    function execute(Proof calldata pr, Roots calldata r, uint256 nullifier, uint64 nowTs, Action calldata act, uint256[] calldata ct) external {
        if (ct.length + 9 != nPub) revert BadCiphertextLength();
        if (!methodEnabled[act.method]) revert UnknownMethod();
        if (act.amount >= P || act.nonce >= P || nullifier >= P) revert BadField();
        if (!_rootOk(r.issued, issuedRoot, issuedRootRetiredAt, issuedWindow)) revert StaleIssuedRoot();
        if (!revocations.rootAccepted(r.revoked)) revert StaleRevokedRoot();
        if (!registry.rootAccepted(r.root)) revert UnregisteredRootRoot();
        if (nowTs > block.timestamp || block.timestamp - nowTs > clockSkew) revert BadClock();
        if (spent[nullifier]) revert NullifierSpent();
        uint256[] memory pub = new uint256[](nPub);
        pub[0] = r.issued; pub[1] = r.revoked; pub[2] = r.root; pub[3] = nullifier; pub[4] = uint256(nowTs); pub[5] = ctxHash(act);
        pub[6] = uint256(requiredCap[act.method]); pub[7] = tpkX; pub[8] = tpkY;
        for (uint256 i = 0; i < ct.length; i++) pub[9 + i] = ct[i];      // the verifier rejects words >= field order
        if (!_verify(pr, pub)) revert InvalidProof();
        spent[nullifier] = true;
        IAgentTarget(act.target).onAuthorized(act.method, act.amount, act.params);
        emit Executed(nullifier, act.target, act.method, act.amount);
        emit Accountability(nullifier, ct);
    }
}
