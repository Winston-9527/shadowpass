// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPoseidon { function hash(uint256[] calldata) external view returns (uint256); }
interface IAgentTarget { function onAuthorized(bytes4 method, uint256 amount, bytes calldata params) external; }
interface IVerifier4 { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[4] calldata) external view returns (bool); }
interface IVerifier5 { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[5] calldata) external view returns (bool); }
interface IVerifier6 { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[6] calldata) external view returns (bool); }
interface IVerifier11 { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[11] calldata) external view returns (bool); }

/// Verifier-side obligations that the ZK-DAC circuit cannot enforce on its own (issue #18):
///  (1) root freshness: issued/revoked roots must be current or retired less than `*Window` seconds ago;
///  (2) clock: block.timestamp - clockSkew <= now <= block.timestamp;
///  (3) replay: each nullifier is accepted once (set before the external call);
///  plus context binding by the contract, not the prover: chain id, this address, required capability per method,
///  and keccak(target, params) so a relayer cannot redirect a proof.
/// Concrete gates differ only in how the public inputs are assembled (_proofOk); see ZkDacGate / ZkDacGateA / ZkDacGateB.
abstract contract ZkDacGateBase {
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

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

    error NotOperator();
    error StaleIssuedRoot();
    error StaleRevokedRoot();
    error BadClock();
    error NullifierSpent();
    error UnknownMethod();
    error InvalidProof();
    error BadField();

    event RootsUpdated(uint256 issuedRoot, uint256 revokedRoot);
    event Executed(uint256 indexed nullifier, address indexed target, bytes4 method, uint256 amount);

    struct Proof { uint[2] a; uint[2][2] b; uint[2] c; }
    struct Action { address target; bytes4 method; uint256 amount; uint256 nonce; bytes params; }

    constructor(address op, uint256 iRoot, uint256 rRoot, uint64 iWin, uint64 rWin, uint64 skew) {
        operator = op; issuedWindow = iWin; revokedWindow = rWin; clockSkew = skew; issuedRoot = iRoot; revokedRoot = rRoot;
    }

    function setMethod(bytes4 m, uint32 cap, bool on) external {
        if (msg.sender != operator) revert NotOperator();
        requiredCap[m] = cap; methodEnabled[m] = on;
    }

    /// Registry operator publishes new roots (trust assumption: roots are computed honestly off-chain).
    function updateRoots(uint256 newIssued, uint256 newRevoked) external {
        if (msg.sender != operator) revert NotOperator();
        if (newIssued != issuedRoot) { issuedRootRetiredAt[issuedRoot] = uint64(block.timestamp); issuedRootRetiredAt[newIssued] = 0; issuedRoot = newIssued; }
        if (newRevoked != revokedRoot) { revokedRootRetiredAt[revokedRoot] = uint64(block.timestamp); revokedRootRetiredAt[newRevoked] = 0; revokedRoot = newRevoked; }
        emit RootsUpdated(newIssued, newRevoked);
    }

    function _rootOk(uint256 root, uint256 current, mapping(uint256 => uint64) storage retired, uint64 window) internal view returns (bool) {
        if (root == current) return true;
        uint64 t = retired[root];
        return t != 0 && block.timestamp <= uint256(t) + window;
    }

    /// The 7 action-context field elements, in circuit order: chain_id, verifier, method, params_hash, amount, req_cap, nonce.
    function _ctx(Action calldata act) internal view returns (uint256[7] memory f) {
        f = [block.chainid, uint256(uint160(address(this))), uint256(uint32(act.method)),
             uint256(keccak256(abi.encode(act.target, act.params))) % P, act.amount, uint256(requiredCap[act.method]), act.nonce];
    }

    function _proofOk(Proof calldata pr, uint256 iRoot, uint256 rRoot, uint256 nullifier, uint64 nowTs, Action calldata act) internal view virtual returns (bool);

    function execute(Proof calldata pr, uint256 iRoot, uint256 rRoot, uint256 nullifier, uint64 nowTs, Action calldata act) external {
        if (!methodEnabled[act.method]) revert UnknownMethod();
        if (act.amount >= P || act.nonce >= P || nullifier >= P) revert BadField();
        if (!_rootOk(iRoot, issuedRoot, issuedRootRetiredAt, issuedWindow)) revert StaleIssuedRoot();
        if (!_rootOk(rRoot, revokedRoot, revokedRootRetiredAt, revokedWindow)) revert StaleRevokedRoot();
        if (nowTs > block.timestamp || block.timestamp - nowTs > clockSkew) revert BadClock();
        if (spent[nullifier]) revert NullifierSpent();
        if (!_proofOk(pr, iRoot, rRoot, nullifier, nowTs, act)) revert InvalidProof();
        spent[nullifier] = true;                                   // effects before interaction (reentrancy)
        IAgentTarget(act.target).onAuthorized(act.method, act.amount, act.params); // revert bubbles: tx rolls back, nullifier unspent
        emit Executed(nullifier, act.target, act.method, act.amount);
    }
}

/// v2 as in PR #14: 5 public inputs (issued_root, revoked_root, action_digest, nullifier, now); on-chain Poseidon(7).
contract ZkDacGate is ZkDacGateBase {
    IVerifier5 public immutable verifier; IPoseidon public immutable poseidon;
    constructor(address v, address p, address op, uint256 iRoot, uint256 rRoot, uint64 iWin, uint64 rWin, uint64 skew)
        ZkDacGateBase(op, iRoot, rRoot, iWin, rWin, skew) { verifier = IVerifier5(v); poseidon = IPoseidon(p); }
    function actionDigest(Action calldata act) public view returns (uint256) {
        uint256[7] memory f = _ctx(act); uint256[] memory x = new uint256[](7);
        for (uint256 i = 0; i < 7; i++) x[i] = f[i];
        return poseidon.hash(x);
    }
    function _proofOk(Proof calldata pr, uint256 iRoot, uint256 rRoot, uint256 nullifier, uint64 nowTs, Action calldata act) internal view override returns (bool) {
        return verifier.verifyProof(pr.a, pr.b, pr.c, [iRoot, rRoot, actionDigest(act), nullifier, uint256(nowTs)]);
    }
}

/// Variant A: `now` folded into the digest, 4 public inputs as in the paper; on-chain Poseidon(8).
contract ZkDacGateA is ZkDacGateBase {
    IVerifier4 public immutable verifier; IPoseidon public immutable poseidon;
    constructor(address v, address p, address op, uint256 iRoot, uint256 rRoot, uint64 iWin, uint64 rWin, uint64 skew)
        ZkDacGateBase(op, iRoot, rRoot, iWin, rWin, skew) { verifier = IVerifier4(v); poseidon = IPoseidon(p); }
    function actionDigest(Action calldata act, uint64 nowTs) public view returns (uint256) {
        uint256[7] memory f = _ctx(act); uint256[] memory x = new uint256[](8);
        for (uint256 i = 0; i < 7; i++) x[i] = f[i];
        x[7] = nowTs;
        return poseidon.hash(x);
    }
    function _proofOk(Proof calldata pr, uint256 iRoot, uint256 rRoot, uint256 nullifier, uint64 nowTs, Action calldata act) internal view override returns (bool) {
        return verifier.verifyProof(pr.a, pr.b, pr.c, [iRoot, rRoot, actionDigest(act, nowTs), nullifier]);
    }
}

/// Variant B: no on-chain hashing; `now` and the 7 context fields are public inputs (11 total).
contract ZkDacGateB is ZkDacGateBase {
    IVerifier11 public immutable verifier;
    constructor(address v, address op, uint256 iRoot, uint256 rRoot, uint64 iWin, uint64 rWin, uint64 skew)
        ZkDacGateBase(op, iRoot, rRoot, iWin, rWin, skew) { verifier = IVerifier11(v); }
    function _proofOk(Proof calldata pr, uint256 iRoot, uint256 rRoot, uint256 nullifier, uint64 nowTs, Action calldata act) internal view override returns (bool) {
        uint256[7] memory f = _ctx(act);
        return verifier.verifyProof(pr.a, pr.b, pr.c, [iRoot, rRoot, nullifier, uint256(nowTs), f[0], f[1], f[2], f[3], f[4], f[5], f[6]]);
    }
}

/// Variant C: the contract keccak-hashes the context the circuit never opens (Semaphore-style `keccak >> 8`);
/// public inputs: issued_root, revoked_root, nullifier, now, ctx_hash, req_cap (6 total); no Poseidon on-chain.
contract ZkDacGateC is ZkDacGateBase {
    IVerifier6 public immutable verifier;
    constructor(address v, address op, uint256 iRoot, uint256 rRoot, uint64 iWin, uint64 rWin, uint64 skew)
        ZkDacGateBase(op, iRoot, rRoot, iWin, rWin, skew) { verifier = IVerifier6(v); }
    function ctxHash(Action calldata act) public view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(this), act.method, act.target, act.params, act.amount, act.nonce))) >> 8;
    }
    function _proofOk(Proof calldata pr, uint256 iRoot, uint256 rRoot, uint256 nullifier, uint64 nowTs, Action calldata act) internal view override returns (bool) {
        return verifier.verifyProof(pr.a, pr.b, pr.c, [iRoot, rRoot, nullifier, uint256(nowTs), ctxHash(act), uint256(requiredCap[act.method])]);
    }
}
