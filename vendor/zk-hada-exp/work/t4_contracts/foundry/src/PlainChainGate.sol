// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentTarget} from "./ZkDacGate.sol";

/// T6 B0 (work/t6_baselines/T6-baselines_20261010/PREREGISTRATION.md): PLAINTEXT lower bound with the same policy as ZK-DAC v9, no privacy.
/// - certificate chain of D ECDSA signatures; cert i = (hop, issuer, holder, cap, expiry, allot, parent hash), signed by its issuer;
///   cert 0's issuer must be a registered root (the operator registers roots: stands in for the Semaphore registry);
/// - per hop: chain linkage, cap attenuation (cap_i ⊆ cap_{i-1}), expiry non-increasing and not passed;
/// - per-hop revocation: a certificate can be revoked by its issuer; a key can be revoked by itself; both checked for every hop and the holder;
/// - context: the holder signs ctxHash (computed by the gate) and the gate keeps a used-ctx set (replay); req_cap per method ⊆ the holder's cap;
/// - budget: atomic per-edge ledger. Spending q adds q to used[h_i] for EVERY certificate on the chain and requires used[h_i] <= allot_i, so the total
///   spent under any edge never exceeds its allotment, whatever the issuer signs for siblings (conservation, the plaintext analogue of budget notes);
/// - accountability: none needed — the lineage is public in calldata and in the event.
contract PlainChainGate {
    struct Cert { address issuer; address holder; uint32 cap; uint64 expiry; uint128 allot; }
    struct Action { address target; bytes4 method; uint256 amount; uint256 nonce; bytes params; }
    address public immutable operator;
    mapping(address => bool) public rootRegistered;
    mapping(bytes32 => bool) public certRevoked;
    mapping(address => bool) public keyRevoked;
    mapping(bytes32 => uint256) public used;
    mapping(bytes32 => bool) public ctxUsed;
    mapping(bytes4 => uint32) public requiredCap;
    error NotOperator(); error NotRoot(); error BadSig(); error BrokenChain(); error CapNotAttenuated(); error Expired(); error Revoked();
    error Replay(); error CapTooLow(); error OverBudget(); error NotIssuer(); error Empty();
    event Executed(bytes32 indexed ctx, bytes32[] lineage, uint256 amount);

    constructor(address op) { operator = op; }
    function setRoot(address r, bool on) external { if (msg.sender != operator) revert NotOperator(); rootRegistered[r] = on; }
    function setMethod(bytes4 m, uint32 cap) external { if (msg.sender != operator) revert NotOperator(); requiredCap[m] = cap; }
    function certHash(uint256 hop, Cert calldata c, bytes32 parent) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), hop, c.issuer, c.holder, c.cap, c.expiry, c.allot, parent));
    }
    function revokeCert(uint256 hop, Cert calldata c, bytes32 parent) external { if (msg.sender != c.issuer) revert NotIssuer(); certRevoked[certHash(hop, c, parent)] = true; }
    function revokeKey() external { keyRevoked[msg.sender] = true; }
    function ctxHash(Action calldata a) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), a.method, a.target, a.params, a.amount, a.nonce));
    }
    function _rec(bytes32 h, bytes calldata s) internal pure returns (address) {
        if (s.length != 65) revert BadSig();
        bytes32 r; bytes32 v_s; uint8 v;
        assembly { r := calldataload(s.offset) v_s := calldataload(add(s.offset, 32)) v := byte(0, calldataload(add(s.offset, 64))) }
        bytes32 eh = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
        address a = ecrecover(eh, v, r, v_s); if (a == address(0)) revert BadSig(); return a;
    }
    function execute(Cert[] calldata chain, bytes[] calldata sigs, Action calldata act, bytes calldata holderSig) external {
        uint256 D = chain.length; if (D == 0 || sigs.length != D) revert Empty();
        if (!rootRegistered[chain[0].issuer]) revert NotRoot();
        bytes32[] memory h = new bytes32[](D); bytes32 parent = bytes32(0);
        for (uint256 i = 0; i < D; i++) {
            Cert calldata c = chain[i];
            if (i > 0) { Cert calldata p = chain[i - 1];
                if (c.issuer != p.holder) revert BrokenChain();
                if (c.cap & ~p.cap != 0) revert CapNotAttenuated();
                if (c.expiry > p.expiry) revert Expired(); }
            if (block.timestamp > c.expiry) revert Expired();
            h[i] = certHash(i, c, parent);
            if (_rec(h[i], sigs[i]) != c.issuer) revert BadSig();
            if (certRevoked[h[i]] || keyRevoked[c.issuer] || keyRevoked[c.holder]) revert Revoked();
            parent = h[i];
        }
        Cert calldata last = chain[D - 1];
        uint32 req = requiredCap[act.method]; if (req == 0 || req & ~last.cap != 0) revert CapTooLow();
        bytes32 ctx = ctxHash(act); if (ctxUsed[ctx]) revert Replay(); ctxUsed[ctx] = true;
        if (_rec(ctx, holderSig) != last.holder) revert BadSig();
        for (uint256 i = 0; i < D; i++) { uint256 u = used[h[i]] + act.amount; if (u > chain[i].allot) revert OverBudget(); used[h[i]] = u; }
        IAgentTarget(act.target).onAuthorized(act.method, act.amount, act.params);
        emit Executed(ctx, h, act.amount);
    }
}
