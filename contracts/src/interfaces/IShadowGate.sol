// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IShadowGate {
    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    function deposit(Proof calldata proof, uint256 cm, uint256 q, bytes calldata memo) external;

    /// The adapter transfers `q` tokens to the Gate before calling this function.
    function depositFromAdapter(uint256 cm, uint256 q, bytes calldata memo) external;
}
