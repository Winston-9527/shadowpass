// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAgentTarget} from "../src/interfaces/IAgentTarget.sol";
import {IShadowGate} from "../src/interfaces/IShadowGate.sol";
import {MockVault} from "../src/MockVault.sol";
import {ShadowPayout} from "../src/ShadowPayout.sol";
import {ShadowToken} from "../src/ShadowToken.sol";
import {TreasuryAdapter} from "../src/TreasuryAdapter.sol";

library MethodIds {
    bytes4 internal constant PAY = bytes4(keccak256("shadowpass.PAY"));
    bytes4 internal constant TREASURY_SUPPLY = bytes4(keccak256("shadowpass.TREASURY_SUPPLY"));
}

contract MockShadowGate is IShadowGate {
    ShadowToken public immutable token;

    uint256 public deposits;
    uint256 public lastDepositCm;
    uint256 public lastDepositQ;
    bytes public lastDepositMemo;

    uint256 public adapterDeposits;
    uint256 public lastAdapterCm;
    uint256 public lastAdapterQ;
    bytes public lastAdapterMemo;

    constructor(ShadowToken token_) {
        token = token_;
    }

    function executeTarget(address target, bytes4 method, uint256 amount, bytes calldata params) external {
        token.transfer(target, amount);
        IAgentTarget(target).onAuthorized(method, amount, params);
    }

    function deposit(Proof calldata proof, uint256 cm, uint256 q, bytes calldata memo) external {
        proof;
        token.transferFrom(msg.sender, address(this), q);
        deposits++;
        lastDepositCm = cm;
        lastDepositQ = q;
        lastDepositMemo = memo;
    }

    function depositFromAdapter(uint256 cm, uint256 q, bytes calldata memo) external {
        adapterDeposits++;
        lastAdapterCm = cm;
        lastAdapterQ = q;
        lastAdapterMemo = memo;
    }
}

contract ApplicationsTest is Test {
    uint256 private constant DAY = 1 days;
    uint256 private constant TERM = 3 minutes;
    uint256 private constant ACCELERATION = 100_000;

    ShadowToken private token;
    MockShadowGate private gate;
    ShadowPayout private payout;
    TreasuryAdapter private adapter;
    MockVault private vault;

    function setUp() public {
        address gateAddress = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        token = new ShadowToken(gateAddress);
        gate = new MockShadowGate(token);
        assertEq(address(gate), gateAddress);

        payout = new ShadowPayout(address(gate), IERC20(address(token)));
        adapter = new TreasuryAdapter(address(gate), IERC20(address(token)), address(this));
        vault = new MockVault(IERC20(address(token)), "Mock USD Vault", "mvUSD", 500, ACCELERATION);
        adapter.setVault(address(vault), true);

        token.mint(address(gate), 1_000_000 * 10 ** 6);
        token.mint(address(vault), 100_000 * 10 ** 6);
    }

    function test_payout_pays_once() public {
        address merchant = address(0xBEEF);
        bytes32 reqHash = keccak256("report-1");
        uint256 amount = 10 * 10 ** 6;
        bytes memory params = abi.encode(merchant, reqHash);

        vm.expectEmit(true, true, false, true, address(payout));
        emit ShadowPayout.Paid(reqHash, merchant, amount);
        gate.executeTarget(address(payout), MethodIds.PAY, amount, params);

        assertEq(token.balanceOf(merchant), amount);
        assertTrue(payout.paid(reqHash));

        vm.expectRevert(ShadowPayout.RequestAlreadyPaid.selector);
        gate.executeTarget(address(payout), MethodIds.PAY, amount, params);
    }

    function test_payout_only_gate() public {
        vm.expectRevert(ShadowPayout.NotGate.selector);
        payout.onAuthorized(MethodIds.PAY, 1, abi.encode(address(0xBEEF), bytes32(uint256(1))));
    }

    function test_payout_rejects_unknown_method() public {
        vm.expectRevert(ShadowPayout.UnknownMethod.selector);
        gate.executeTarget(address(payout), bytes4("nope"), 1, abi.encode(address(0xBEEF), bytes32(uint256(1))));
    }

    function test_treasury_supply_and_withdraw_returns_promised_note() public {
        uint256 amount = 10 * 10 ** 6;
        uint256 expectedQ = adapter.quote(address(vault), amount, TERM);
        uint256 returnCm = 0x1234;
        bytes memory returnMemo = hex"010203";
        assertGt(expectedQ, amount);

        uint256 positionId = _supply(amount, expectedQ, returnCm, returnMemo);
        (
            address positionVault,
            uint256 shares,
            uint256 maturity,
            uint256 storedCm,
            uint256 storedQ,
            bytes memory storedMemo,
            bool withdrawn
        ) = adapter.positions(positionId);
        assertEq(positionVault, address(vault));
        assertGt(shares, 0);
        assertEq(maturity, block.timestamp + TERM);
        assertEq(storedCm, returnCm);
        assertEq(storedQ, expectedQ);
        assertEq(storedMemo, returnMemo);
        assertFalse(withdrawn);

        vm.expectRevert(TreasuryAdapter.BeforeMaturity.selector);
        vm.prank(address(0xB0B));
        adapter.withdraw(positionId);

        vm.warp(maturity + 1);
        uint256 assets = vault.previewRedeem(shares);
        assertGe(assets, expectedQ);
        uint256 gateBefore = token.balanceOf(address(gate));

        vm.prank(address(0xB0B));
        adapter.withdraw(positionId);

        assertEq(token.balanceOf(address(gate)) - gateBefore, expectedQ);
        assertEq(gate.lastAdapterCm(), returnCm);
        assertEq(gate.lastAdapterQ(), expectedQ);
        assertEq(gate.lastAdapterMemo(), returnMemo);
        assertEq(adapter.reserve(), assets - expectedQ);

        vm.prank(address(0xB0B));
        vm.expectRevert(TreasuryAdapter.AlreadyWithdrawn.selector);
        adapter.withdraw(positionId);
    }

    function test_treasury_rejects_early_withdrawal_and_non_whitelisted_vault() public {
        uint256 amount = 1 * 10 ** 6;
        uint256 positionId = _supply(amount, amount, 1, hex"01");
        vm.expectRevert(TreasuryAdapter.BeforeMaturity.selector);
        adapter.withdraw(positionId);

        MockVault other = new MockVault(IERC20(address(token)), "Other", "oth", 0, 1);
        bytes memory params = abi.encode(address(other), TERM, uint256(2), amount, hex"02");
        vm.expectRevert(TreasuryAdapter.VaultNotAllowed.selector);
        gate.executeTarget(address(adapter), MethodIds.TREASURY_SUPPLY, amount, params);

        params = abi.encode(address(vault), TERM, uint256(2), uint256(0), hex"02");
        vm.expectRevert(TreasuryAdapter.ZeroExpectedQ.selector);
        gate.executeTarget(address(adapter), MethodIds.TREASURY_SUPPLY, amount, params);
    }

    function test_treasury_shortfall_keeps_funds_in_reserve() public {
        MockVault noYield = new MockVault(IERC20(address(token)), "No Yield", "zero", 0, 0);
        adapter.setVault(address(noYield), true);
        uint256 amount = 5 * 10 ** 6;
        uint256 expectedQ = amount + 1;
        bytes memory params = abi.encode(address(noYield), TERM, uint256(7), expectedQ, hex"07");
        gate.executeTarget(address(adapter), MethodIds.TREASURY_SUPPLY, amount, params);
        uint256 positionId = adapter.nextPositionId() - 1;

        vm.warp(block.timestamp + TERM + 1);
        vm.expectEmit(true, false, false, true, address(adapter));
        emit TreasuryAdapter.Shortfall(positionId, expectedQ, amount);
        adapter.withdraw(positionId);

        assertEq(adapter.reserve(), amount);
        assertEq(gate.adapterDeposits(), 0);
    }

    function test_treasury_only_gate() public {
        bytes memory params = abi.encode(address(vault), TERM, uint256(1), uint256(1), hex"");
        vm.expectRevert(TreasuryAdapter.NotGate.selector);
        adapter.onAuthorized(MethodIds.TREASURY_SUPPLY, 1, params);
    }

    function test_faucet_daily_limit_resets() public {
        address user = address(0xA11CE);
        vm.prank(user);
        token.faucet(70 * 10 ** 6);
        vm.prank(user);
        token.faucet(30 * 10 ** 6);
        assertEq(token.remainingFaucet(user), 0);

        vm.prank(user);
        vm.expectRevert(ShadowToken.FaucetLimit.selector);
        token.faucet(1);

        vm.warp(block.timestamp + DAY);
        vm.prank(user);
        token.faucet(1 * 10 ** 6);
        assertEq(token.remainingFaucet(user), 99 * 10 ** 6);
    }

    function test_faucet_deposit_passes_exact_memo_and_limit() public {
        address user = address(0xA11CE);
        IShadowGate.Proof memory proof;
        uint256 cm = 0xCAFE;
        uint256 q = ShadowToken(token).DAILY_FAUCET_LIMIT();
        bytes memory memo = hex"deadbeef";

        vm.prank(user);
        token.faucetDeposit(proof, cm, q, memo);

        assertEq(gate.deposits(), 1);
        assertEq(gate.lastDepositCm(), cm);
        assertEq(gate.lastDepositQ(), q);
        assertEq(gate.lastDepositMemo(), memo);
        assertEq(token.allowance(address(token), address(gate)), 0);
        assertEq(token.remainingFaucet(user), 0);

        vm.prank(user);
        vm.expectRevert(ShadowToken.FaucetLimit.selector);
        token.faucetDeposit(proof, cm + 1, 1, memo);

        vm.warp(block.timestamp + DAY);
        vm.prank(user);
        token.faucetDeposit(proof, cm + 2, 1, memo);
        assertEq(gate.deposits(), 2);
    }

    function _supply(uint256 amount, uint256 expectedQ, uint256 returnCm, bytes memory returnMemo)
        private
        returns (uint256 positionId)
    {
        bytes memory params = abi.encode(address(vault), TERM, returnCm, expectedQ, returnMemo);
        uint256 beforeId = adapter.nextPositionId();
        gate.executeTarget(address(adapter), MethodIds.TREASURY_SUPPLY, amount, params);
        positionId = beforeId;
    }
}
