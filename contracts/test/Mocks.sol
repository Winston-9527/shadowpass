// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentTarget {
    function onAuthorized(bytes4 method, uint256 amount, bytes calldata params) external;
}

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockTarget is IAgentTarget {
    uint256 public calls;
    uint256 public lastAmount;
    bytes public lastParams;

    function onAuthorized(bytes4, uint256 amount, bytes calldata params) external {
        calls++;
        lastAmount = amount;
        lastParams = params;
    }
}
