// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// E8 (WP12) application targets, test-only. Each is called by ZkDacGateV9 through IAgentTarget.onAuthorized(method, amount, params) after the proof,
// the roots, the clock and the budget nullifier have been checked; a revert here rolls back the whole execute (nullifier unspent).

/// A1: reservation / commit / fail for an off-chain tool gateway. params = abi.encode(requestId). The gate is the only caller of onAuthorized;
/// the gateway operator commits or fails a reservation. Off-chain execution is NOT atomic with the reservation (reported as uncertain if neither happens).
contract E8ServiceEscrow {
    address public immutable gate; address public immutable gateway;
    enum St { None, Reserved, Committed, Failed }
    struct Res { St st; bytes4 tool; uint64 amount; bytes32 result; }
    mapping(bytes32 => Res) public res;
    uint256 public reserved; uint256 public committed; uint256 public failed;
    event Reserved(bytes32 indexed id, bytes4 tool, uint256 amount); event Committed(bytes32 indexed id, bytes32 result); event Failed(bytes32 indexed id);
    error NotGate(); error NotGateway(); error BadState();
    constructor(address g, address gw) { gate = g; gateway = gw; }
    function onAuthorized(bytes4 tool, uint256 amount, bytes calldata params) external {
        if (msg.sender != gate) revert NotGate(); bytes32 id = abi.decode(params, (bytes32));
        if (res[id].st != St.None) revert BadState();
        res[id] = Res(St.Reserved, tool, uint64(amount), 0); reserved++; emit Reserved(id, tool, amount);
    }
    function commit(bytes32 id, bytes32 result) external { if (msg.sender != gateway) revert NotGateway(); if (res[id].st != St.Reserved) revert BadState(); res[id].st = St.Committed; res[id].result = result; committed++; emit Committed(id, result); }
    function fail(bytes32 id) external { if (msg.sender != gateway) revert NotGateway(); if (res[id].st != St.Reserved) revert BadState(); res[id].st = St.Failed; failed++; emit Failed(id); }
}

/// A2: minimal test ERC-20 (no value) and a vault that pays or approves on authorization. params = abi.encode(recipient).
contract E8TestToken {
    string public constant name = "E8 Test Token"; uint8 public constant decimals = 0;
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance; uint256 public totalSupply;
    event Transfer(address indexed from, address indexed to, uint256 v); event Approval(address indexed o, address indexed s, uint256 v);
    function mint(address to, uint256 v) external { balanceOf[to] += v; totalSupply += v; emit Transfer(address(0), to, v); }
    function transfer(address to, uint256 v) external returns (bool) { require(balanceOf[msg.sender] >= v, "balance"); balanceOf[msg.sender] -= v; balanceOf[to] += v; emit Transfer(msg.sender, to, v); return true; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; emit Approval(msg.sender, s, v); return true; }
}
contract E8Vault {
    address public immutable gate; E8TestToken public immutable token; bytes4 public immutable PAY; bytes4 public immutable APPROVE;
    uint256 public paid; uint256 public approved;
    error NotGate(); error UnknownMethod();
    constructor(address g, E8TestToken t, bytes4 pay, bytes4 appr) { gate = g; token = t; PAY = pay; APPROVE = appr; }
    function onAuthorized(bytes4 method, uint256 amount, bytes calldata params) external {
        if (msg.sender != gate) revert NotGate(); address to = abi.decode(params, (address));
        if (method == PAY) { require(token.transfer(to, amount), "pay"); paid += amount; }        // reverts if the vault cannot cover it
        else if (method == APPROVE) { token.approve(to, amount); approved += amount; }
        else revert UnknownMethod();
    }
}

/// A3: bounded procurement. params = abi.encode(itemId). One method per category; an item can be bought once. `transient[item]` (set and cleared by the
/// operator) injects a transient error: the call reverts, and a revert rolls back everything, so the flag is cleared off the gate path.
contract E8Procurement {
    address public immutable gate; address public immutable operator;
    mapping(uint256 => bytes4) public boughtIn; mapping(uint256 => uint256) public price; uint256 public spent; uint256 public items; mapping(uint256 => bool) public transient;
    event Bought(uint256 indexed item, bytes4 category, uint256 price);
    error NotGate(); error AlreadyBought(); error Transient();
    constructor(address g, address op) { gate = g; operator = op; }
    function setTransient(uint256 item, bool on) external { require(msg.sender == operator); transient[item] = on; }
    function onAuthorized(bytes4 category, uint256 amount, bytes calldata params) external {
        if (msg.sender != gate) revert NotGate();
        uint256 item = abi.decode(params, (uint256)); if (transient[item]) revert Transient(); if (boughtIn[item] != bytes4(0)) revert AlreadyBought();
        boughtIn[item] = category; price[item] = amount; spent += amount; items++; emit Bought(item, category, amount);
    }
}
