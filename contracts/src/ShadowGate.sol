// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Adapted from vendor/zk-hada-exp/work/t4_contracts/foundry/src/ZkDacGateV9.sol.
// Removed TPK/operator state; added on-chain issued tree, permissionless deposits,
// adapter returns, memo binding and the ShadowPass v2 public-input/event ABI.
import {InternalLeanIMT, LeanIMTData} from "zk-kit-lean-imt/InternalLeanIMT.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";
import {ShadowRegistry} from "./ShadowRegistry.sol";
import {ShadowRevocations} from "./ShadowRevocations.sol";
import {IAgentTarget} from "./interfaces/IAgentTarget.sol";

interface IShadowToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);
}

interface IBudgetTransferVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[5] calldata)
        external
        view
        returns (bool);
}

interface IBudgetMintVerifier {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[2] calldata)
        external
        view
        returns (bool);
}

/// ShadowPass action gate. It owns the issued-certificate tree and budget-note tree,
/// verifies depth-specific action proofs, and enforces roots, clock, capabilities,
/// nullifiers and note memos.
contract ShadowGate {
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 internal constant MAX_MEMO = 512;

    using InternalLeanIMT for LeanIMTData;

    mapping(uint256 => address) public verifierFor;
    mapping(uint256 => bytes4) internal selFor;
    ShadowRegistry public immutable registry;
    ShadowRevocations public immutable revocations;
    IShadowToken public immutable token;
    address public immutable admin;
    uint64 public immutable clockSkew;
    IBudgetTransferVerifier public immutable transferVerifier;
    IBudgetMintVerifier public immutable mintVerifier;

    LeanIMTData internal issuedTree;
    LeanIMTData internal notes;
    mapping(bytes32 => uint256) public stateOf;
    mapping(uint256 => bool) public budgetSpent;
    mapping(address => bool) public adapterAllowed;
    mapping(bytes4 => uint32) public requiredCap;
    mapping(bytes4 => address) public methodTarget;
    mapping(bytes4 => bool) public methodEnabled;
    mapping(uint256 => bool) public issuedRootKnown;
    mapping(uint256 => bool) public noteRootKnown;
    uint256 public totalMinted;

    error NotAdmin();
    error AdapterNotAllowed();
    error StaleIssuedRoot();
    error StaleRevokedRoot();
    error UnregisteredRootRoot();
    error BadClock();
    error UnknownMethod();
    error TargetMismatch();
    error InvalidProof();
    error BadField();
    error BadCiphertextLength();
    error StaleNoteRoot();
    error BudgetSpent();
    error AmountMismatch();
    error UnknownState();
    error MemoTooLong();
    error TokenTransferFailed();

    event Issued(uint256 indexed certHash, uint256 index, uint256 root);
    event Executed(uint256 indexed budgetNf, address indexed target, bytes4 method, uint256 amount);
    event OwnerCiphertext(uint256 indexed budgetNf, uint256[] ct);
    event NullifierSpent(uint256 indexed nullifier);
    event NoteInserted(uint256 indexed cm, uint256 index, uint256 root);
    event NoteMemo(uint256 indexed cm, bytes memo);
    event StateRegistered(uint256 issued, uint256 revoked, uint256 root, uint256 stateRoot);
    event AdapterSet(address indexed adapter, bool allowed);

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    struct Action {
        address target;
        bytes4 method;
        uint256 amount;
        uint256 nonce;
        bytes params;
    }

    struct Roots {
        uint256 issued;
        uint256 revoked;
        uint256 root;
    }

    struct Budget {
        uint256 noteRoot;
        uint256 budgetNf;
        uint256 cmChange;
        uint256 qSpent;
    }

    constructor(
        address[3] memory actionVerifiers,
        address registry_,
        address revocations_,
        address token_,
        address admin_,
        uint64 clockSkew_,
        address transferVerifier_,
        address mintVerifier_
    ) {
        for (uint256 d = 1; d <= 3; d++) {
            uint256 nCt = d + 6;
            verifierFor[nCt] = actionVerifiers[d - 1];
            selFor[nCt] = bytes4(
                keccak256(
                    abi.encodePacked("verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[", _dec(nCt + 8), "])")
                )
            );
        }
        registry = ShadowRegistry(registry_);
        revocations = ShadowRevocations(revocations_);
        token = IShadowToken(token_);
        admin = admin_;
        clockSkew = clockSkew_;
        transferVerifier = IBudgetTransferVerifier(transferVerifier_);
        mintVerifier = IBudgetMintVerifier(mintVerifier_);
    }

    function _dec(uint256 value) internal pure returns (string memory) {
        bytes memory out = new bytes(value >= 10 ? 2 : 1);
        if (value >= 10) {
            out[0] = bytes1(uint8(48 + value / 10));
            out[1] = bytes1(uint8(48 + value % 10));
        } else {
            out[0] = bytes1(uint8(48 + value));
        }
        return string(out);
    }

    function setMethod(bytes4 method, uint32 cap, address target, bool enabled) external {
        if (msg.sender != admin) revert NotAdmin();
        requiredCap[method] = cap;
        methodTarget[method] = target;
        methodEnabled[method] = enabled;
    }

    function setAdapter(address adapter, bool allowed) external {
        if (msg.sender != admin) revert NotAdmin();
        adapterAllowed[adapter] = allowed;
        emit AdapterSet(adapter, allowed);
    }

    function issuedRoot() public view returns (uint256) {
        return issuedTree._root();
    }

    function noteRoot() public view returns (uint256) {
        return notes._root();
    }

    function issuedRootAccepted(uint256 root) external view returns (bool) {
        return _issuedRootOk(root);
    }

    function noteRootAccepted(uint256 root) external view returns (bool) {
        return _noteRootOk(root);
    }

    function issue(uint256 certHash) external {
        if (certHash >= P) revert BadField();
        uint256 index = issuedTree.size;
        uint256 nextRoot = issuedTree._insert(certHash);
        issuedRootKnown[nextRoot] = true;
        emit Issued(certHash, index, nextRoot);
    }

    function registerState(uint256 issued, uint256 revoked, uint256 root) public returns (uint256 stateRoot) {
        if (issued >= P || revoked >= P || root >= P) revert BadField();
        bytes32 key = keccak256(abi.encode(issued, revoked, root));
        stateRoot = stateOf[key];
        if (stateRoot == 0) {
            stateRoot = PoseidonT4.hash([issued, revoked, root]);
            stateOf[key] = stateRoot;
            emit StateRegistered(issued, revoked, root, stateRoot);
        }
    }

    function ctxHash(Action calldata action, bytes calldata memoChange) public view returns (uint256) {
        bytes32 digest = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                action.method,
                action.target,
                action.params,
                action.amount,
                action.nonce,
                keccak256(memoChange)
            )
        );
        return uint256(digest) >> 8;
    }

    function deposit(Proof calldata proof, uint256 cm, uint256 q, bytes calldata memo) external {
        if (cm >= P || q >= P) revert BadField();
        if (!mintVerifier.verifyProof(proof.a, proof.b, proof.c, [cm, q])) revert InvalidProof();
        if (!token.transferFrom(msg.sender, address(this), q)) revert TokenTransferFailed();
        totalMinted += q;
        _insertNote(cm, memo);
    }

    function depositFromAdapter(uint256 cm, uint256 q, bytes calldata memo) external {
        if (!adapterAllowed[msg.sender]) revert AdapterNotAllowed();
        if (cm >= P || q >= P) revert BadField();
        if (!token.transferFrom(msg.sender, address(this), q)) revert TokenTransferFailed();
        totalMinted += q;
        _insertNote(cm, memo);
    }

    function transferBudget(
        Proof calldata proof,
        uint256 noteRoot_,
        uint256 revokedRoot,
        uint256 nullifier,
        uint256 cm1,
        uint256 cm2,
        bytes calldata memo1,
        bytes calldata memo2
    ) external {
        if (!revocations.rootAccepted(revokedRoot)) revert StaleRevokedRoot();
        if (cm1 >= P || cm2 >= P || revokedRoot >= P) revert BadField();
        _useBudget(noteRoot_, nullifier);
        if (!transferVerifier.verifyProof(proof.a, proof.b, proof.c, [noteRoot_, revokedRoot, nullifier, cm1, cm2])) {
            revert InvalidProof();
        }
        _insertNote(cm1, memo1);
        _insertNote(cm2, memo2);
    }

    function execute(
        Proof calldata proof,
        Roots calldata roots,
        uint64 nowTs,
        Action calldata action,
        uint256[] calldata ct,
        Budget calldata budget,
        bytes calldata memoChange
    ) external {
        if (verifierFor[ct.length] == address(0)) revert BadCiphertextLength();
        if (!methodEnabled[action.method]) revert UnknownMethod();
        if (action.target != methodTarget[action.method]) revert TargetMismatch();
        if (action.amount >= P || action.nonce >= P) revert BadField();
        if (budget.qSpent != action.amount) revert AmountMismatch();
        uint256 stateRoot = stateOf[keccak256(abi.encode(roots.issued, roots.revoked, roots.root))];
        if (stateRoot == 0) revert UnknownState();
        if (!_issuedRootOk(roots.issued)) revert StaleIssuedRoot();
        if (!revocations.rootAccepted(roots.revoked)) revert StaleRevokedRoot();
        if (!registry.rootAccepted(roots.root)) revert UnregisteredRootRoot();
        if (nowTs > block.timestamp || block.timestamp - nowTs > clockSkew) revert BadClock();
        _useBudget(budget.noteRoot, budget.budgetNf);
        if (!_verify(proof, _publicInputs(stateRoot, nowTs, action, ct, budget, memoChange), ct.length)) {
            revert InvalidProof();
        }
        _insertNote(budget.cmChange, memoChange);
        if (!token.transfer(action.target, action.amount)) revert TokenTransferFailed();
        IAgentTarget(action.target).onAuthorized(action.method, action.amount, action.params);
        emit Executed(budget.budgetNf, action.target, action.method, action.amount);
        emit OwnerCiphertext(budget.budgetNf, ct);
    }

    function _publicInputs(
        uint256 stateRoot,
        uint64 nowTs,
        Action calldata action,
        uint256[] calldata ct,
        Budget calldata budget,
        bytes calldata memoChange
    ) internal view returns (uint256[] memory pub) {
        pub = new uint256[](ct.length + 8);
        pub[0] = stateRoot;
        pub[1] = uint256(nowTs);
        pub[2] = ctxHash(action, memoChange);
        pub[3] = uint256(requiredCap[action.method]);
        for (uint256 i = 0; i < ct.length; i++) {
            pub[4 + i] = ct[i];
        }
        uint256 offset = 4 + ct.length;
        pub[offset] = budget.noteRoot;
        pub[offset + 1] = budget.budgetNf;
        pub[offset + 2] = budget.cmChange;
        pub[offset + 3] = budget.qSpent;
    }

    function _verify(Proof calldata proof, uint256[] memory pub, uint256 nCt) internal view returns (bool ok) {
        (bool success, bytes memory result) =
            verifierFor[nCt].staticcall(abi.encodePacked(selFor[nCt], proof.a, proof.b, proof.c, pub));
        ok = success && result.length == 32 && abi.decode(result, (bool));
    }

    function _insertNote(uint256 cm, bytes calldata memo) internal {
        if (cm >= P) revert BadField();
        if (memo.length > MAX_MEMO) revert MemoTooLong();
        uint256 index = notes.size;
        uint256 nextRoot = notes._insert(cm);
        noteRootKnown[nextRoot] = true;
        emit NoteInserted(cm, index, nextRoot);
        emit NoteMemo(cm, memo);
    }

    function _issuedRootOk(uint256 root) internal view returns (bool) {
        if (issuedTree.size == 0) return root == 0;
        return root != 0 && issuedRootKnown[root];
    }

    function _noteRootOk(uint256 root) internal view returns (bool) {
        return root != 0 && noteRootKnown[root];
    }

    function _useBudget(uint256 noteRoot_, uint256 nullifier) internal {
        if (!_noteRootOk(noteRoot_)) revert StaleNoteRoot();
        if (nullifier >= P) revert BadField();
        if (budgetSpent[nullifier]) revert BudgetSpent();
        budgetSpent[nullifier] = true;
        emit NullifierSpent(nullifier);
    }
}
