// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentTarget} from "./interfaces/IAgentTarget.sol";
import {IShadowGate} from "./interfaces/IShadowGate.sol";
import {IMockVaultQuote} from "./MockVault.sol";

/// Turns an authorized TREASURY_SUPPLY into a fixed-term ERC-4626 position. After maturity anyone may redeem it;
/// the promised note is deposited back through the Gate, excess stays as reserve, and shortfalls never mint a note.
contract TreasuryAdapter is IAgentTarget, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes4 public constant TREASURY_SUPPLY = bytes4(keccak256("shadowpass.TREASURY_SUPPLY"));
    uint256 private constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 private constant MAX_MEMO = 512;
    uint256 private constant ROUNDING_MARGIN = 2;

    struct Position {
        address vault;
        uint256 shares;
        uint256 maturity;
        uint256 returnCm;
        uint256 expectedQ;
        bytes returnMemo;
        bool withdrawn;
    }

    address public immutable gate;
    IERC20 public immutable token;
    mapping(address => bool) public vaultAllowed;
    mapping(uint256 => Position) public positions;
    uint256 public nextPositionId = 1;
    uint256 public reserve;

    error NotGate();
    error UnknownMethod();
    error VaultNotAllowed();
    error UnknownPosition();
    error AlreadyWithdrawn();
    error BeforeMaturity();
    error ZeroAddress();
    error ZeroAmount();
    error ZeroTerm();
    error ZeroExpectedQ();
    error ZeroShares();
    error MissingFunds();
    error BadField();
    error MemoTooLong();
    error ExpectedQTooHigh();

    event VaultAllowed(address indexed vault, bool allowed);
    event PositionOpened(
        uint256 indexed positionId,
        address indexed vault,
        uint256 amount,
        uint256 shares,
        uint256 maturity,
        uint256 returnCm,
        uint256 expectedQ,
        bytes returnMemo
    );
    event TreasuryWithdrawn(uint256 indexed positionId, uint256 assets, uint256 returnedQ, uint256 reserveAdded);
    event Shortfall(uint256 indexed positionId, uint256 expectedQ, uint256 assets);

    constructor(address gate_, IERC20 token_, address owner_) Ownable(owner_) {
        if (gate_ == address(0) || address(token_) == address(0) || owner_ == address(0)) revert ZeroAddress();
        gate = gate_;
        token = token_;
    }

    function setVault(address vault, bool allowed) external onlyOwner {
        vaultAllowed[vault] = allowed;
        emit VaultAllowed(vault, allowed);
    }

    function onAuthorized(bytes4 method, uint256 amount, bytes calldata params) external override nonReentrant {
        if (msg.sender != gate) revert NotGate();
        if (method != TREASURY_SUPPLY) revert UnknownMethod();
        if (amount == 0) revert ZeroAmount();
        uint256 balance = token.balanceOf(address(this));
        if (balance < reserve || balance - reserve < amount) revert MissingFunds();

        (address vault, uint256 term, uint256 returnCm, uint256 expectedQ, bytes memory returnMemo) =
            abi.decode(params, (address, uint256, uint256, uint256, bytes));
        if (!vaultAllowed[vault]) revert VaultNotAllowed();
        if (term == 0) revert ZeroTerm();
        if (expectedQ == 0) revert ZeroExpectedQ();
        if (returnCm >= P || expectedQ >= (1 << 64)) revert BadField();
        if (returnMemo.length > MAX_MEMO) revert MemoTooLong();
        if (expectedQ > _quote(vault, amount, term)) revert ExpectedQTooHigh();

        token.forceApprove(vault, amount);
        uint256 shares = IERC4626(vault).deposit(amount, address(this));
        token.forceApprove(vault, 0);
        if (shares == 0) revert ZeroShares();

        uint256 id = nextPositionId++;
        uint256 maturity = block.timestamp + term;
        positions[id] = Position(vault, shares, maturity, returnCm, expectedQ, returnMemo, false);
        emit PositionOpened(id, vault, amount, shares, maturity, returnCm, expectedQ, returnMemo);
    }

    /// Permissionless after maturity. State is marked first; any downstream revert rolls the whole call back.
    function withdraw(uint256 positionId) external nonReentrant {
        Position storage position = positions[positionId];
        if (position.vault == address(0)) revert UnknownPosition();
        if (position.withdrawn) revert AlreadyWithdrawn();
        if (block.timestamp < position.maturity) revert BeforeMaturity();

        position.withdrawn = true;
        uint256 shares = position.shares;
        uint256 expectedQ = position.expectedQ;
        uint256 returnCm = position.returnCm;
        bytes memory returnMemo = position.returnMemo;
        uint256 assets = IERC4626(position.vault).redeem(shares, address(this), address(this));
        uint256 shareValue = shares == 0 ? 0 : (assets + shares - 1) / shares;
        uint256 tolerance = shareValue + ROUNDING_MARGIN;
        uint256 percentTolerance = expectedQ / 10_000;
        if (percentTolerance > tolerance) tolerance = percentTolerance;

        if (assets >= expectedQ) {
            uint256 reserveAdded = assets - expectedQ;
            reserve += reserveAdded;
            _returnNote(returnCm, expectedQ, returnMemo);
            emit TreasuryWithdrawn(positionId, assets, expectedQ, reserveAdded);
        } else if (expectedQ - assets <= tolerance && expectedQ - assets <= reserve) {
            reserve -= expectedQ - assets;
            _returnNote(returnCm, expectedQ, returnMemo);
            emit TreasuryWithdrawn(positionId, assets, expectedQ, 0);
        } else {
            reserve += assets;
            emit Shortfall(positionId, expectedQ, assets);
        }
    }

    function quote(address vault, uint256 amount, uint256 term) external view returns (uint256 expectedQ) {
        return _quote(vault, amount, term);
    }

    function _quote(address vault, uint256 amount, uint256 term) internal view returns (uint256 expectedQ) {
        if (amount == 0 || term == 0) return 0;
        uint256 shares = IERC4626(vault).previewDeposit(amount);
        uint256 fallbackQ = IERC4626(vault).previewRedeem(shares);
        uint256 quoted = fallbackQ;
        try IMockVaultQuote(vault).previewDepositRedeemAt(amount, term) returns (uint256 futureQ) {
            quoted = futureQ;
        } catch {}
        uint256 shareValue = shares == 0 ? 0 : (quoted + shares - 1) / shares;
        uint256 margin = shareValue + ROUNDING_MARGIN;
        return quoted > margin ? quoted - margin : 0;
    }

    function _returnNote(uint256 returnCm, uint256 expectedQ, bytes memory returnMemo) private {
        token.forceApprove(gate, expectedQ);
        IShadowGate(gate).depositFromAdapter(returnCm, expectedQ, returnMemo);
        token.forceApprove(gate, 0);
    }
}
