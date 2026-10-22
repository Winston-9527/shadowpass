// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IShadowGate} from "./interfaces/IShadowGate.sol";

/// Six-decimal test stablecoin. `faucetDeposit` is testnet-only: it mints, approves the Gate and deposits a note
/// for the caller while enforcing a global daily faucet limit. Per-user limits belong to the facilitator.
contract ShadowToken is ERC20, Ownable, ReentrancyGuard {
    uint256 public constant DAILY_FAUCET_LIMIT = 100 * 10 ** 6;

    address public immutable gate;
    uint256 public faucetDay;
    uint256 public faucetClaimed;

    error ZeroAddress();
    error ZeroAmount();
    error FaucetLimit();

    event Faucet(address indexed account, uint256 amount);

    constructor(address gate_) ERC20("Shadow USD", "spUSD") Ownable(msg.sender) {
        if (gate_ == address(0)) revert ZeroAddress();
        gate = gate_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _mint(to, amount);
    }

    function faucet() external returns (uint256 amount) {
        amount = DAILY_FAUCET_LIMIT;
        _faucet(amount);
        _mint(msg.sender, amount);
        emit Faucet(msg.sender, amount);
    }

    function faucetAmount(uint256 amount) external {
        _faucet(amount);
        _mint(msg.sender, amount);
        emit Faucet(msg.sender, amount);
    }

    function remainingFaucet() external view returns (uint256) {
        uint256 day = block.timestamp / 1 days;
        uint256 claimed = faucetDay == day ? faucetClaimed : 0;
        return DAILY_FAUCET_LIMIT - claimed;
    }

    function faucetDeposit(IShadowGate.Proof calldata proof, uint256 cm, uint256 q, bytes calldata memo)
        external
        nonReentrant
    {
        _faucet(q);
        _mint(address(this), q);
        _approve(address(this), gate, q);
        IShadowGate(gate).deposit(proof, cm, q, memo);
        if (allowance(address(this), gate) != 0) _approve(address(this), gate, 0);
        emit Faucet(msg.sender, q);
    }

    function _faucet(uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        uint256 day = block.timestamp / 1 days;
        uint256 claimed = faucetDay == day ? faucetClaimed : 0;
        if (claimed + amount > DAILY_FAUCET_LIMIT) revert FaucetLimit();
        faucetDay = day;
        faucetClaimed = claimed + amount;
    }
}
