// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAgentTarget} from "./interfaces/IAgentTarget.sol";

/// Pays merchants from the token amount pushed by ShadowGate. Settlement uniqueness is enforced by the Gate nullifier.
contract ShadowPayout is IAgentTarget {
    using SafeERC20 for IERC20;

    bytes4 public constant PAY = bytes4(keccak256("shadowpass.PAY"));

    address public immutable gate;
    IERC20 public immutable token;
    error NotGate();
    error UnknownMethod();
    error ZeroAddress();
    error ZeroPayTo();

    event Paid(bytes32 indexed reqHash, address indexed payTo, uint256 amount);

    constructor(address gate_, IERC20 token_) {
        if (gate_ == address(0) || address(token_) == address(0)) revert ZeroAddress();
        gate = gate_;
        token = token_;
    }

    function onAuthorized(bytes4 method, uint256 amount, bytes calldata params) external override {
        if (msg.sender != gate) revert NotGate();
        if (method != PAY) revert UnknownMethod();

        (address payTo, bytes32 reqHash) = abi.decode(params, (address, bytes32));
        if (payTo == address(0)) revert ZeroPayTo();

        token.safeTransfer(payTo, amount);
        emit Paid(reqHash, payTo, amount);
    }
}
