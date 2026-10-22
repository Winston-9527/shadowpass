// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Gate calls this after verifying the proof and transferring `amount` tokens to the target.
interface IAgentTarget {
    function onAuthorized(bytes4 method, uint256 amount, bytes calldata params) external;
}
