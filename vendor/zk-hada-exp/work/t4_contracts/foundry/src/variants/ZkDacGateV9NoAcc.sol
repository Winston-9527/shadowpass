// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentTarget} from "../ZkDacGate.sol";
import {ZkDacRegistry} from "../ZkDacRegistry.sol";
import {ZkDacRevocations} from "../ZkDacRevocations.sol";
import {InternalLeanIMT, LeanIMTData} from "zk-kit-lean-imt/InternalLeanIMT.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";

interface IBudgetTransferVerifier { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[5] calldata) external view returns (bool); }
interface IBudgetMintVerifier { function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[2] calldata) external view returns (bool); }

/// T5c I3 ABLATION (test-only, cost measurement): ZkDacGateV9 with the accountability removed: no TPK, no ciphertext, no Accountability event;
/// the verifier is selected by the depth D (8 public inputs for every D). Nothing else changed. ZkDacGateV9 header follows.
/// #41 (v9): ZkDacGateV8 with fewer public inputs. (1) No action nullifier: replay protection is the budget nullifier (every action consumes a note).
/// (3) The proof's public state_root = Poseidon(issued, revoked, root); registerState() (permissionless) records keccak(roots) -> state_root once per
/// combination; execute() receives the three roots, looks up state_root and checks EACH root with its own rule as before (revocation latency unchanged).
/// (4) Compressed accountability ciphertext (D + 6 words). Public inputs: state_root, now, ctx_hash, req_cap, tpk, ct words, noteRoot, budgetNf, cmChange, qSpent.
/// v8 header follows.
/// #39 (H3 option C): ZkDacGateV7R + a private BUDGET NOTE per action. The v8 action proof also spends a note (owner = terminal holder, lineage = the chain's
/// certificates) from the on-chain LeanIMT note tree; public budget inputs (after v7's): noteRoot, budgetNf, cmChange, qSpent. The gate requires
/// qSpent == act.amount, a note root that is current or retired < noteWindow ago, an unused budget nullifier (shared with transfers), and inserts the change
/// note. transferBudget() splits / delegates notes (budget_transfer proof); mint() (operator = trusted issuer) creates budget. Everything else is V7R.
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
contract ZkDacGateV9NoAcc {
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    mapping(uint256 => address) public verifierFor;          // ablation: keyed by the depth D
    bytes4 internal constant SEL = bytes4(keccak256("verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[8])"));
    ZkDacRegistry public immutable registry;
    address public immutable operator;
    uint64 public immutable issuedWindow;
    ZkDacRevocations public immutable revocations;
    uint64 public immutable clockSkew;
    IBudgetTransferVerifier public immutable transferVerifier;
    IBudgetMintVerifier public immutable mintVerifier;
    uint64 public immutable noteWindow;
    using InternalLeanIMT for LeanIMTData;
    LeanIMTData internal notes;
    mapping(uint256 => uint64) public noteRootRetiredAt;
    mapping(bytes32 => uint256) public stateOf;               // keccak(issued, revoked, root) -> Poseidon(issued, revoked, root)
    mapping(uint256 => bool) public budgetSpent;
    uint256 public totalMinted;

    uint256 public issuedRoot;
    mapping(uint256 => uint64) public issuedRootRetiredAt;
    mapping(uint256 => bool) public spent;
    mapping(bytes4 => uint32) public requiredCap;
    mapping(bytes4 => bool) public methodEnabled;

    error NotOperator(); error StaleIssuedRoot(); error StaleRevokedRoot(); error UnregisteredRootRoot();
    error BadClock(); error NullifierSpent(); error UnknownMethod(); error InvalidProof(); error BadField(); error BadCiphertextLength(); error StaleNoteRoot(); error BudgetSpent(); error AmountMismatch(); error UnknownState();

    event IssuedRootUpdated(uint256 issuedRoot);
    event Executed(uint256 indexed budgetNf, address indexed target, bytes4 method, uint256 amount);
    event StateRegistered(uint256 issued, uint256 revoked, uint256 root, uint256 stateRoot);
    event NoteInserted(uint256 cm, uint256 index, uint256 newRoot);
    event BudgetUsed(uint256 indexed budgetNf, uint256 qSpent);
    event Minted(uint256 cm, uint256 q);

    struct Proof { uint[2] a; uint[2][2] b; uint[2] c; }
    struct Action { address target; bytes4 method; uint256 amount; uint256 nonce; bytes params; }
    struct Roots { uint256 issued; uint256 revoked; uint256 root; }
    struct Budget { uint256 noteRoot; uint256 budgetNf; uint256 cmChange; uint256 qSpent; }
    struct BudgetCfg { address transferVerifier; address mintVerifier; uint64 noteWindow; }

    constructor(address[] memory vs, uint256[] memory nCts, address reg, address revs, address op, uint256 iRoot, uint64 iWin, uint64 skew, BudgetCfg memory bc) {
        for (uint256 i = 0; i < vs.length; i++) verifierFor[nCts[i]] = vs[i];      // ablation: nCts = depths
        transferVerifier = IBudgetTransferVerifier(bc.transferVerifier); mintVerifier = IBudgetMintVerifier(bc.mintVerifier); noteWindow = bc.noteWindow;
        registry = ZkDacRegistry(reg); operator = op;
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
    function _verify(Proof calldata pr, uint256[] memory pub, uint256 nCt) internal view returns (bool ok) {
        (bool s, bytes memory ret) = verifierFor[nCt].staticcall(abi.encodePacked(SEL, pr.a, pr.b, pr.c, pub));
        ok = s && ret.length == 32 && abi.decode(ret, (bool));
    }
    function noteRoot() public view returns (uint256) { return notes._root(); }
    function _insertNote(uint256 cm) internal {
        if (cm >= P) revert BadField();
        uint256 old = notes._root(); if (notes.size > 0) noteRootRetiredAt[old] = uint64(block.timestamp);
        uint256 idx = notes.size; uint256 nr = notes._insert(cm); emit NoteInserted(cm, idx, nr);
    }
    function _noteRootOk(uint256 r) internal view returns (bool) { return _rootOk(r, notes._root(), noteRootRetiredAt, noteWindow); }
    function _useBudget(uint256 noteRoot_, uint256 nf) internal {
        if (!_noteRootOk(noteRoot_)) revert StaleNoteRoot();
        if (nf >= P) revert BadField();
        if (budgetSpent[nf]) revert BudgetSpent();
        budgetSpent[nf] = true;
    }
    /// permissionless, idempotent: records the Poseidon state root of a combination of roots (one on-chain Poseidon per new combination)
    function registerState(uint256 issued, uint256 revoked, uint256 root) public returns (uint256 sr) {
        if (issued >= P || revoked >= P || root >= P) revert BadField();
        bytes32 k = keccak256(abi.encode(issued, revoked, root)); sr = stateOf[k];
        if (sr == 0) { sr = PoseidonT4.hash([issued, revoked, root]); stateOf[k] = sr; emit StateRegistered(issued, revoked, root, sr); }
    }
    function _pub(uint256 sr, uint64 nowTs, Action calldata act, Budget calldata b) internal view returns (uint256[] memory pub) {
        pub = new uint256[](8);
        pub[0] = sr; pub[1] = uint256(nowTs); pub[2] = ctxHash(act); pub[3] = uint256(requiredCap[act.method]);
        pub[4] = b.noteRoot; pub[5] = b.budgetNf; pub[6] = b.cmChange; pub[7] = b.qSpent;
    }
    function execute(Proof calldata pr, Roots calldata r, uint64 nowTs, Action calldata act, uint256 d, Budget calldata b) external {
        if (verifierFor[d] == address(0)) revert BadCiphertextLength();
        if (!methodEnabled[act.method]) revert UnknownMethod();
        if (act.amount >= P || act.nonce >= P) revert BadField();
        if (b.qSpent != act.amount) revert AmountMismatch();
        uint256 sr = stateOf[keccak256(abi.encode(r.issued, r.revoked, r.root))]; if (sr == 0) revert UnknownState();
        if (!_rootOk(r.issued, issuedRoot, issuedRootRetiredAt, issuedWindow)) revert StaleIssuedRoot();
        if (!revocations.rootAccepted(r.revoked)) revert StaleRevokedRoot();
        if (!registry.rootAccepted(r.root)) revert UnregisteredRootRoot();
        if (nowTs > block.timestamp || block.timestamp - nowTs > clockSkew) revert BadClock();
        _useBudget(b.noteRoot, b.budgetNf);
        if (!_verify(pr, _pub(sr, nowTs, act, b), d)) revert InvalidProof();
        _insertNote(b.cmChange);
        IAgentTarget(act.target).onAuthorized(act.method, act.amount, act.params);
        emit Executed(b.budgetNf, act.target, act.method, act.amount);
        emit BudgetUsed(b.budgetNf, b.qSpent);
    }
    /// budget_transfer public inputs: noteRoot, revokedRoot, nf, cm1, cm2 (split to self or delegate to a child certificate)
    function transferBudget(Proof calldata pr, uint256 noteRoot_, uint256 revokedRoot, uint256 nf, uint256 cm1, uint256 cm2) external {
        if (!revocations.rootAccepted(revokedRoot)) revert StaleRevokedRoot();
        _useBudget(noteRoot_, nf);
        if (cm1 >= P || cm2 >= P || revokedRoot >= P) revert BadField();
        if (!transferVerifier.verifyProof(pr.a, pr.b, pr.c, [noteRoot_, revokedRoot, nf, cm1, cm2])) revert InvalidProof();
        _insertNote(cm1); _insertNote(cm2);
    }
    /// operator = trusted issuer of root budgets (funding out of scope); the proof shows cm opens to q (64-bit)
    function mint(Proof calldata pr, uint256 cm, uint256 q) external {
        if (msg.sender != operator) revert NotOperator();
        if (cm >= P || q >= P) revert BadField();
        if (!mintVerifier.verifyProof(pr.a, pr.b, pr.c, [cm, q])) revert InvalidProof();
        totalMinted += q; _insertNote(cm); emit Minted(cm, q);
    }
}
