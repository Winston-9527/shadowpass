// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IMockVaultQuote {
    function previewDepositAt(uint256 assets, uint256 term) external view returns (uint256 assetsAtMaturity);
}

/// ERC-4626 vault with deterministic accelerated yield for short demos. Yield must be funded with real tokens
/// before withdrawals; the accounting remains 1 share = a proportional claim on totalAssets().
contract MockVault is ERC4626, IMockVaultQuote {
    uint256 private constant BPS = 10_000;
    uint256 private constant YEAR = 365 days;

    uint256 public immutable annualRateBps;
    uint256 public immutable acceleration;
    uint256 public principal;
    uint256 public lastAccrual;

    error InsufficientPrincipal();

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        uint256 annualRateBps_,
        uint256 acceleration_
    ) ERC20(name_, symbol_) ERC4626(asset_) {
        annualRateBps = annualRateBps_;
        acceleration = acceleration_;
        lastAccrual = block.timestamp;
    }

    function totalAssets() public view override returns (uint256) {
        return principal + _pendingAccrual();
    }

    function previewDepositAt(uint256 assets, uint256 term) external view returns (uint256 assetsAtMaturity) {
        uint256 current = totalAssets();
        uint256 principalAfter = current + assets;
        if (principalAfter == 0 || term == 0) return assets;

        uint256 grown = principalAfter + _yield(principalAfter, term);
        return Math.mulDiv(grown, assets, principalAfter);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _accrue();
        principal += assets;
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _accrue();
        if (assets > principal) revert InsufficientPrincipal();
        principal -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _accrue() private {
        principal += _pendingAccrual();
        lastAccrual = block.timestamp;
    }

    function _pendingAccrual() private view returns (uint256) {
        uint256 elapsed = block.timestamp - lastAccrual;
        if (elapsed == 0 || principal == 0 || annualRateBps == 0 || acceleration == 0) return 0;
        return Math.mulDiv(Math.mulDiv(principal, annualRateBps * acceleration, BPS), elapsed, YEAR);
    }

    function _yield(uint256 assets, uint256 term) private view returns (uint256) {
        if (assets == 0 || annualRateBps == 0 || acceleration == 0) return 0;
        return Math.mulDiv(Math.mulDiv(assets, annualRateBps * acceleration, BPS), term, YEAR);
    }
}
