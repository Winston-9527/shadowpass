// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2, Vm} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ShadowGroup} from "../src/ShadowGroup.sol";
import {ShadowRegistry} from "../src/ShadowRegistry.sol";
import {ShadowRevocations} from "../src/ShadowRevocations.sol";
import {ShadowGate} from "../src/ShadowGate.sol";
import {ShadowVerifierD1} from "../src/ShadowVerifierD1.sol";
import {ShadowVerifierD2} from "../src/ShadowVerifierD2.sol";
import {ShadowVerifierD3} from "../src/ShadowVerifierD3.sol";
import {ShadowRegisterVerifier} from "../src/ShadowRegisterVerifier.sol";
import {ShadowRevokeVerifier} from "../src/ShadowRevokeVerifier.sol";
import {ShadowBudgetTransferVerifier} from "../src/ShadowBudgetTransferVerifier.sol";
import {ShadowBudgetMintVerifier} from "../src/ShadowBudgetMintVerifier.sol";
import {MockToken, MockTarget} from "./Mocks.sol";

contract ShadowCoreTest is Test {
    using stdJson for string;

    address constant ADMIN = address(0xA11CE);
    uint64 constant ISSUED_WINDOW = 300;
    uint64 constant CLOCK_SKEW = 60;
    uint64 constant REVOKE_WINDOW = 60;

    string fx;
    ShadowGroup group;
    ShadowRegistry registry;
    ShadowRevocations revocations;
    ShadowGate gate;
    MockToken token;
    MockTarget target;

    function setUp() public {
        fx = vm.readFile("test/fixtures/shadowpass.json");
        vm.chainId(fx.readUint(".chainId"));
        vm.warp(fx.readUint(".now"));

        token = new MockToken();
        token.mint(address(this), 1_000_000);
        deployCodeTo("Mocks.sol:MockTarget", "", fx.readAddress(".target"));
        target = MockTarget(fx.readAddress(".target"));

        group = new ShadowGroup();
        group.join(fx.readUint(".core.group.commitment"));
        registry = new ShadowRegistry(
            address(new ShadowRegisterVerifier()), address(group), fx.readUint(".domain"), ISSUED_WINDOW
        );
        revocations = new ShadowRevocations(
            address(new ShadowRevokeVerifier()),
            fx.readUint(".core.revocations.genesisRoot"),
            fx.readUint(".core.revocations.genesisCount"),
            REVOKE_WINDOW
        );

        address[3] memory verifiers =
            [address(new ShadowVerifierD1()), address(new ShadowVerifierD2()), address(new ShadowVerifierD3())];
        deployCodeTo(
            "ShadowGate.sol:ShadowGate",
            abi.encode(
                verifiers,
                address(registry),
                address(revocations),
                address(token),
                ADMIN,
                CLOCK_SKEW,
                address(new ShadowBudgetTransferVerifier()),
                address(new ShadowBudgetMintVerifier())
            ),
            fx.readAddress(".gate")
        );
        gate = ShadowGate(fx.readAddress(".gate"));
        token.approve(address(gate), type(uint256).max);
        vm.prank(ADMIN);
        gate.setMethod(bytes4(fx.readBytes(".method")), uint32(fx.readUint(".reqCap")), fx.readAddress(".target"), true);
    }

    function _proof(string memory base) internal view returns (ShadowGate.Proof memory p) {
        uint256[] memory a = fx.readUintArray(string.concat(base, ".proof.a"));
        uint256[] memory b0 = fx.readUintArray(string.concat(base, ".proof.b[0]"));
        uint256[] memory b1 = fx.readUintArray(string.concat(base, ".proof.b[1]"));
        uint256[] memory c = fx.readUintArray(string.concat(base, ".proof.c"));
        p.a = [a[0], a[1]];
        p.b = [[b0[0], b0[1]], [b1[0], b1[1]]];
        p.c = [c[0], c[1]];
    }

    function _registerCore() internal {
        ShadowGate.Proof memory p = _proof(".core.register");
        uint256[] memory pub = fx.readUintArray(".core.register.pub");
        _registerCoreParsed(p, pub);
    }

    function _registerCoreParsed(ShadowGate.Proof memory p, uint256[] memory pub) internal {
        ShadowRegistry.Proof memory rp;
        rp.a = p.a;
        rp.b = p.b;
        rp.c = p.c;
        registry.register(rp, pub[0], pub[2], pub[3], new uint256[](0));
    }

    function _issueCore() internal {
        gate.issue(fx.readUint(".core.issue.certHash"));
    }

    function _depositCore() internal {
        ShadowGate.Proof memory p = _proof(".core.deposit1");
        _depositCoreParsed(
            p, fx.readUint(".core.deposit1.cm"), fx.readUint(".core.deposit1.q"), fx.readBytes(".core.deposit1.memo")
        );
    }

    function _depositCore2() internal {
        ShadowGate.Proof memory p = _proof(".core.deposit2");
        _depositCoreParsed(
            p, fx.readUint(".core.deposit2.cm"), fx.readUint(".core.deposit2.q"), fx.readBytes(".core.deposit2.memo")
        );
    }

    function _depositCoreParsed(ShadowGate.Proof memory p, uint256 cm, uint256 q, bytes memory memo) internal {
        gate.deposit(p, cm, q, memo);
    }

    function _registerStateCore() internal {
        uint256[] memory roots = fx.readUintArray(".core.execute.roots");
        gate.registerState(roots[0], roots[1], roots[2]);
    }

    function _prepareExecute() internal {
        _registerCore();
        _issueCore();
        _depositCore();
        _depositCore2();
        _registerStateCore();
    }

    function _depositTransfer() internal {
        ShadowGate.Proof memory p = _proof(".transfer.deposit");
        _depositTransferParsed(
            p,
            fx.readUint(".transfer.deposit.cm"),
            fx.readUint(".transfer.deposit.q"),
            fx.readBytes(".transfer.deposit.memo")
        );
    }

    function _depositTransferParsed(ShadowGate.Proof memory p, uint256 cm, uint256 q, bytes memory memo) internal {
        gate.deposit(p, cm, q, memo);
    }

    function _transferProof() internal view returns (ShadowGate.Proof memory) {
        return _proof(".transfer.transfer");
    }

    function _transfer(uint256[] memory pub, bytes memory memo1, bytes memory memo2) internal {
        _transferParsed(_transferProof(), pub, memo1, memo2);
    }

    function _transferParsed(
        ShadowGate.Proof memory proof,
        uint256[] memory pub,
        bytes memory memo1,
        bytes memory memo2
    ) internal {
        gate.transferBudget(proof, pub[0], pub[1], pub[2], pub[3], pub[4], memo1, memo2);
    }

    function _action() internal view returns (ShadowGate.Action memory a) {
        return _actionAt(".core");
    }

    function _actionAt(string memory prefix) internal view returns (ShadowGate.Action memory a) {
        a.target = fx.readAddress(string.concat(prefix, ".execute.action.target"));
        a.method = bytes4(fx.readBytes(string.concat(prefix, ".execute.action.method")));
        a.amount = fx.readUint(string.concat(prefix, ".execute.action.amount"));
        a.nonce = fx.readUint(string.concat(prefix, ".execute.action.nonce"));
        a.params = fx.readBytes(string.concat(prefix, ".execute.action.params"));
    }

    function _roots() internal view returns (ShadowGate.Roots memory r) {
        uint256[] memory roots = fx.readUintArray(".core.execute.roots");
        r = ShadowGate.Roots(roots[0], roots[1], roots[2]);
    }

    function _budget() internal view returns (ShadowGate.Budget memory b) {
        return _budgetAt(".core");
    }

    function _budgetAt(string memory prefix) internal view returns (ShadowGate.Budget memory b) {
        uint256[] memory budget = fx.readUintArray(string.concat(prefix, ".execute.budget"));
        b = ShadowGate.Budget(budget[0], budget[1], budget[2], budget[3]);
    }

    function _execute(
        ShadowGate.Action memory action,
        ShadowGate.Roots memory roots,
        ShadowGate.Budget memory budget,
        bytes memory memoChange
    ) internal {
        _executeParsed(
            _proof(".core.execute"),
            action,
            roots,
            budget,
            memoChange,
            fx.readUintArray(".core.execute.ct"),
            uint64(fx.readUint(".core.execute.now"))
        );
    }

    function _executeParsed(
        ShadowGate.Proof memory proof,
        ShadowGate.Action memory action,
        ShadowGate.Roots memory roots,
        ShadowGate.Budget memory budget,
        bytes memory memoChange,
        uint256[] memory ct,
        uint64 nowTs
    ) internal {
        gate.execute(proof, roots, nowTs, action, ct, budget, memoChange);
    }

    function _executeCore() internal {
        _execute(_action(), _roots(), _budget(), fx.readBytes(".core.execute.memoChange"));
    }

    function _executeAt(string memory prefix) internal {
        _executeParsed(
            _proof(string.concat(prefix, ".execute")),
            _actionAt(prefix),
            _flowRootsAt(prefix),
            _budgetAt(prefix),
            fx.readBytes(string.concat(prefix, ".execute.memoChange")),
            fx.readUintArray(string.concat(prefix, ".execute.ct")),
            uint64(fx.readUint(string.concat(prefix, ".execute.now")))
        );
    }

    function _flowRootsAt(string memory prefix) internal view returns (ShadowGate.Roots memory r) {
        uint256[] memory roots = fx.readUintArray(string.concat(prefix, ".roots"));
        r = ShadowGate.Roots(roots[0], roots[1], roots[2]);
    }

    function _flowAction() internal view returns (ShadowGate.Action memory a) {
        a.target = fx.readAddress(".transfer.execute.action.target");
        a.method = bytes4(fx.readBytes(".transfer.execute.action.method"));
        a.amount = fx.readUint(".transfer.execute.action.amount");
        a.nonce = fx.readUint(".transfer.execute.action.nonce");
        a.params = fx.readBytes(".transfer.execute.action.params");
    }

    function _flowRoots() internal view returns (ShadowGate.Roots memory r) {
        uint256[] memory roots = fx.readUintArray(".transfer.roots");
        r = ShadowGate.Roots(roots[0], roots[1], roots[2]);
    }

    function _flowBudget() internal view returns (ShadowGate.Budget memory b) {
        uint256[] memory budget = fx.readUintArray(".transfer.execute.budget");
        b = ShadowGate.Budget(budget[0], budget[1], budget[2], budget[3]);
    }

    function _revokeC1() internal {
        ShadowGate.Proof memory p = _proof(".core.revokeC1");
        _revokeC1Parsed(p, fx.readUint(".core.revokeC1.newRoot"), fx.readUint(".core.revokeC1.entry"));
    }

    function _revokeC1Parsed(ShadowGate.Proof memory p, uint256 newRoot, uint256 entry) internal {
        ShadowRevocations.Proof memory rp;
        rp.a = p.a;
        rp.b = p.b;
        rp.c = p.c;
        revocations.revoke(rp, newRoot, entry);
    }

    function _revokeC0() internal {
        ShadowGate.Proof memory p = _proof(".core.revokeC0");
        ShadowRevocations.Proof memory rp;
        rp.a = p.a;
        rp.b = p.b;
        rp.c = p.c;
        revocations.revoke(rp, fx.readUint(".core.revokeC0.newRoot"), fx.readUint(".core.revokeC0.entry"));
    }

    function _hasNoteMemo(Vm.Log[] memory logs, uint256 cm, bytes memory memo) internal pure returns (bool) {
        bytes32 topic = keccak256("NoteMemo(uint256,bytes)");
        bytes32 expectedData = keccak256(abi.encode(memo));
        for (uint256 i = 0; i < logs.length; i++) {
            if (
                logs[i].topics[0] == topic && uint256(logs[i].topics[1]) == cm
                    && keccak256(logs[i].data) == expectedData
            ) {
                return true;
            }
        }
        return false;
    }

    function _hasEvent(Vm.Log[] memory logs, bytes32 topic, uint256 indexedValue) internal pure returns (bool) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == topic && uint256(logs[i].topics[1]) == indexedValue) return true;
        }
        return false;
    }

    function _hasTopic(Vm.Log[] memory logs, bytes32 topic) internal pure returns (bool) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == topic) return true;
        }
        return false;
    }

    function _median(uint256[] memory values) internal pure returns (uint256) {
        for (uint256 i = 1; i < values.length; i++) {
            uint256 current = values[i];
            uint256 j = i;
            while (j > 0 && values[j - 1] > current) {
                values[j] = values[j - 1];
                j--;
            }
            values[j] = current;
        }
        return values[values.length / 2];
    }

    function test_deposit_inserts_note_and_memo() public {
        uint256 cm = fx.readUint(".core.deposit1.cm");
        bytes memory memo = fx.readBytes(".core.deposit1.memo");
        vm.recordLogs();
        _depositCore();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertTrue(_hasNoteMemo(logs, cm, memo));
        assertEq(token.balanceOf(address(gate)), fx.readUint(".core.deposit1.q"));
    }

    function test_register_and_issue_events() public {
        uint256[] memory registerPub = fx.readUintArray(".core.register.pub");
        vm.recordLogs();
        _registerCore();
        assertTrue(
            _hasEvent(vm.getRecordedLogs(), keccak256("Registered(uint256,uint256,uint256,uint256)"), registerPub[2])
        );

        uint256 certHash = fx.readUint(".core.issue.certHash");
        vm.recordLogs();
        _issueCore();
        assertTrue(_hasEvent(vm.getRecordedLogs(), keccak256("Issued(uint256,uint256,uint256)"), certHash));
    }

    function test_empty_issued_tree_accepts_zero_root() public {
        assertTrue(gate.issuedRootAccepted(0));
        gate.issue(123);
        assertFalse(gate.issuedRootAccepted(0));
    }

    function test_registry_replacement_and_retired_leaf() public {
        ShadowGate.Proof memory firstProof = _proof(".core.register");
        uint256[] memory firstPub = fx.readUintArray(".core.register.pub");
        _registerCoreParsed(firstProof, firstPub);

        ShadowGate.Proof memory secondProof = _proof(".core.register2");
        uint256[] memory secondPub = fx.readUintArray(".core.register2.pub");
        vm.recordLogs();
        _registerCoreParsed(secondProof, secondPub);
        assertTrue(
            _hasEvent(vm.getRecordedLogs(), keccak256("Replaced(uint256,uint256,uint256,uint256,uint256)"), firstPub[2])
        );
        assertEq(registry.currentRoot(), secondPub[3]);

        vm.expectRevert(ShadowRegistry.AlreadyRegistered.selector);
        _registerCoreParsed(secondProof, secondPub);

        vm.expectRevert(ShadowRegistry.LeafRetired.selector);
        _registerCoreParsed(firstProof, firstPub);
    }

    function test_transfer_budget_and_memos() public {
        _depositTransfer();
        uint256[] memory pub = fx.readUintArray(".transfer.transfer.pub");
        vm.recordLogs();
        _transfer(pub, fx.readBytes(".transfer.transfer.memo1"), fx.readBytes(".transfer.transfer.memo2"));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertTrue(_hasNoteMemo(logs, pub[3], fx.readBytes(".transfer.transfer.memo1")));
        assertTrue(_hasNoteMemo(logs, pub[4], fx.readBytes(".transfer.transfer.memo2")));
        assertTrue(gate.budgetSpent(pub[2]));
    }

    function test_full_funding_flow_deposit_transfer_execute() public {
        ShadowGate.Proof memory registerProof = _proof(".transfer.register");
        uint256[] memory registerPub = fx.readUintArray(".transfer.register.pub");
        _registerCoreParsed(registerProof, registerPub);
        gate.issue(fx.readUint(".transfer.issue.certHash"));
        _depositTransfer();
        uint256[] memory roots = fx.readUintArray(".transfer.roots");
        gate.registerState(roots[0], roots[1], roots[2]);

        uint256[] memory transferPub = fx.readUintArray(".transfer.transfer.pub");
        _transfer(transferPub, fx.readBytes(".transfer.transfer.memo1"), fx.readBytes(".transfer.transfer.memo2"));
        _executeParsed(
            _proof(".transfer.execute"),
            _flowAction(),
            _flowRoots(),
            _flowBudget(),
            fx.readBytes(".transfer.execute.memoChange"),
            fx.readUintArray(".transfer.execute.ct"),
            uint64(fx.readUint(".transfer.execute.now"))
        );
        assertEq(target.calls(), 1);
        assertEq(token.balanceOf(address(target)), fx.readUint(".transfer.execute.action.amount"));
    }

    function test_d1_execute() public {
        ShadowGate.Proof memory registerProof = _proof(".d1.register");
        uint256[] memory registerPub = fx.readUintArray(".d1.register.pub");
        _registerCoreParsed(registerProof, registerPub);
        uint256[] memory issue = fx.readUintArray(".d1.issue");
        for (uint256 i = 0; i < issue.length; i++) {
            gate.issue(issue[i]);
        }

        ShadowGate.Proof memory depositProof = _proof(".d1.deposit");
        _depositCoreParsed(
            depositProof, fx.readUint(".d1.deposit.cm"), fx.readUint(".d1.deposit.q"), fx.readBytes(".d1.deposit.memo")
        );
        uint256[] memory roots = fx.readUintArray(".d1.roots");
        gate.registerState(roots[0], roots[1], roots[2]);
        _executeAt(".d1");
        assertEq(target.calls(), 1);
    }

    function test_d3_execute() public {
        ShadowGate.Proof memory registerProof = _proof(".d3.register");
        uint256[] memory registerPub = fx.readUintArray(".d3.register.pub");
        _registerCoreParsed(registerProof, registerPub);
        uint256[] memory issue = fx.readUintArray(".d3.issue");
        gate.issue(issue[0]);
        gate.issue(issue[1]);

        ShadowGate.Proof memory depositProof = _proof(".d3.deposit");
        _depositCoreParsed(
            depositProof, fx.readUint(".d3.deposit.cm"), fx.readUint(".d3.deposit.q"), fx.readBytes(".d3.deposit.memo")
        );
        uint256[] memory roots = fx.readUintArray(".d3.roots");
        gate.registerState(roots[0], roots[1], roots[2]);
        _executeAt(".d3");
        assertEq(target.calls(), 1);
    }

    function test_execute_success_and_events() public {
        _prepareExecute();
        bytes memory memoChange = fx.readBytes(".core.execute.memoChange");
        vm.recordLogs();
        _executeCore();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(target.calls(), 1);
        assertEq(target.lastAmount(), fx.readUint(".core.execute.action.amount"));
        assertEq(token.balanceOf(address(target)), fx.readUint(".core.execute.action.amount"));
        assertTrue(_hasNoteMemo(logs, _budget().cmChange, memoChange));
        assertTrue(_hasEvent(logs, keccak256("OwnerCiphertext(uint256,uint256[])"), _budget().budgetNf));
        assertTrue(_hasEvent(logs, keccak256("Executed(uint256,address,bytes4,uint256)"), _budget().budgetNf));
        assertTrue(gate.budgetSpent(_budget().budgetNf));
    }

    function test_bad_clock_rejected() public {
        _prepareExecute();
        vm.warp(fx.readUint(".now") + CLOCK_SKEW + 1);
        vm.expectRevert(ShadowGate.BadClock.selector);
        _executeCore();
    }

    function test_method_target_binding_rejects_wrong_target() public {
        _prepareExecute();
        vm.recordLogs();
        vm.prank(ADMIN);
        gate.setMethod(bytes4(fx.readBytes(".method")), uint32(fx.readUint(".reqCap")), address(0xCAFE), true);
        assertTrue(_hasTopic(vm.getRecordedLogs(), keccak256("MethodSet(bytes4,uint32,address,bool)")));
        vm.expectRevert(ShadowGate.TargetMismatch.selector);
        _executeCore();
    }

    function test_append_only_trees_accept_historical_roots() public {
        _registerCoreParsed(_proof(".core.register"), fx.readUintArray(".core.register.pub"));
        uint256 oldRegistryRoot = registry.currentRoot();
        _registerCoreParsed(_proof(".core.register2"), fx.readUintArray(".core.register2.pub"));

        gate.issue(11);
        uint256 oldIssuedRoot = gate.issuedRoot();
        gate.issue(22);

        _depositCore();
        uint256 oldNoteRoot = gate.noteRoot();
        _depositCore2();

        group.join(111);
        uint256 oldGroupRoot = group.currentRoot();
        group.join(222);
        group.join(333);

        uint256 oldRevokedRoot = revocations.root();
        _revokeC1();

        vm.warp(fx.readUint(".now") + 1_000_000);
        assertTrue(gate.issuedRootAccepted(oldIssuedRoot));
        assertTrue(gate.noteRootAccepted(oldNoteRoot));
        assertTrue(group.rootAccepted(oldGroupRoot));
        assertFalse(registry.rootAccepted(oldRegistryRoot));
        assertFalse(revocations.rootAccepted(oldRevokedRoot));
    }

    function test_treasury_supply_wrong_target_rejected() public {
        bytes4 treasurySupply = bytes4(keccak256("shadowpass.TREASURY_SUPPLY"));
        vm.prank(ADMIN);
        gate.setMethod(treasurySupply, 2, address(target), true);
        ShadowGate.Action memory action = _action();
        action.method = treasurySupply;
        action.target = address(0xBAD);
        vm.expectRevert(ShadowGate.TargetMismatch.selector);
        _execute(action, _roots(), _budget(), fx.readBytes(".core.execute.memoChange"));
    }

    function test_nullifier_replay_rejected() public {
        _prepareExecute();
        _executeCore();
        vm.expectRevert(ShadowGate.BudgetSpent.selector);
        _executeCore();
    }

    function test_capability_mismatch_rejected() public {
        _prepareExecute();
        vm.prank(ADMIN);
        gate.setMethod(
            bytes4(fx.readBytes(".method")), uint32(fx.readUint(".reqCap") + 1), fx.readAddress(".target"), true
        );
        vm.expectRevert(ShadowGate.InvalidProof.selector);
        _executeCore();
    }

    function test_ctx_binding_target_params_method_amount_memo() public {
        _prepareExecute();
        ShadowGate.Action memory action = _action();
        ShadowGate.Roots memory roots = _roots();
        ShadowGate.Budget memory budget = _budget();

        action.target = address(0xCAFE);
        vm.expectRevert(ShadowGate.TargetMismatch.selector);
        _execute(action, roots, budget, fx.readBytes(".core.execute.memoChange"));

        action = _action();
        action.params = hex"1234";
        vm.expectRevert(ShadowGate.InvalidProof.selector);
        _execute(action, roots, budget, fx.readBytes(".core.execute.memoChange"));

        action = _action();
        action.nonce += 1;
        vm.expectRevert(ShadowGate.InvalidProof.selector);
        _execute(action, roots, budget, fx.readBytes(".core.execute.memoChange"));

        action = _action();
        bytes4 otherMethod = 0x23b872dd;
        vm.prank(ADMIN);
        gate.setMethod(otherMethod, uint32(fx.readUint(".reqCap")), fx.readAddress(".target"), true);
        action.method = otherMethod;
        vm.expectRevert(ShadowGate.InvalidProof.selector);
        _execute(action, roots, budget, fx.readBytes(".core.execute.memoChange"));

        action = _action();
        action.amount += 1;
        budget.qSpent += 1;
        vm.expectRevert(ShadowGate.InvalidProof.selector);
        _execute(action, roots, budget, fx.readBytes(".core.execute.memoChange"));

        budget = _budget();
        vm.expectRevert(ShadowGate.InvalidProof.selector);
        _execute(_action(), roots, budget, hex"deadbeef");
    }

    function test_amount_mismatch_rejected() public {
        _prepareExecute();
        ShadowGate.Action memory action = _action();
        action.amount += 1;
        vm.expectRevert(ShadowGate.AmountMismatch.selector);
        _execute(action, _roots(), _budget(), fx.readBytes(".core.execute.memoChange"));
    }

    function test_revocation_agent_window() public {
        _prepareExecute();
        _revokeC1();
        uint256 snapshot = vm.snapshotState();
        vm.warp(fx.readUint(".now") + REVOKE_WINDOW);
        _executeCore();
        vm.revertToState(snapshot);
        vm.warp(fx.readUint(".now") + REVOKE_WINDOW + 1);
        vm.expectRevert(ShadowGate.StaleRevokedRoot.selector);
        _executeCore();
    }

    function test_revocation_cert0_whole_tree() public {
        _prepareExecute();
        _revokeC0();
        uint256 snapshot = vm.snapshotState();
        vm.warp(fx.readUint(".now") + REVOKE_WINDOW);
        _executeCore();
        vm.revertToState(snapshot);
        vm.warp(fx.readUint(".now") + REVOKE_WINDOW + 1);
        vm.expectRevert(ShadowGate.StaleRevokedRoot.selector);
        _executeCore();
    }

    function test_unregistered_state_combination_rejected() public {
        _prepareExecute();
        ShadowGate.Roots memory roots = _roots();
        roots.issued += 1;
        vm.expectRevert(ShadowGate.UnknownState.selector);
        _execute(_action(), roots, _budget(), fx.readBytes(".core.execute.memoChange"));
    }

    function test_adapter_whitelist_and_memo() public {
        address adapter = address(0xADAD);
        vm.expectRevert(ShadowGate.AdapterNotAllowed.selector);
        vm.prank(adapter);
        gate.depositFromAdapter(123, 1, hex"");

        vm.prank(ADMIN);
        gate.setAdapter(adapter, true);
        token.mint(adapter, 10);
        vm.startPrank(adapter);
        token.approve(address(gate), 10);
        vm.recordLogs();
        gate.depositFromAdapter(123, 1, hex"aabb");
        vm.stopPrank();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertTrue(_hasNoteMemo(logs, 123, hex"aabb"));
    }

    function test_memo_too_long_rejected() public {
        ShadowGate.Proof memory p = _proof(".core.deposit1");
        bytes memory memo = new bytes(513);
        vm.expectRevert(ShadowGate.MemoTooLong.selector);
        gate.deposit(p, fx.readUint(".core.deposit1.cm"), fx.readUint(".core.deposit1.q"), memo);
    }

    function test_memo_512_byte_boundary_accepted() public {
        ShadowGate.Proof memory p = _proof(".core.deposit1");
        bytes memory memo = new bytes(512);
        gate.deposit(p, fx.readUint(".core.deposit1.cm"), fx.readUint(".core.deposit1.q"), memo);
    }

    function test_gas_register() public {
        uint256[] memory g = new uint256[](10);
        ShadowGate.Proof memory proof = _proof(".core.register");
        uint256[] memory pub = fx.readUintArray(".core.register.pub");
        for (uint256 i = 0; i < 10; i++) {
            uint256 snapshot = vm.snapshotState();
            uint256 start = gasleft();
            _registerCoreParsed(proof, pub);
            g[i] = start - gasleft();
            vm.revertToState(snapshot);
        }
        console2.log("register median gas", _median(g));
    }

    function test_gas_issue() public {
        uint256[] memory g = new uint256[](10);
        uint256 certHash = fx.readUint(".core.issue.certHash");
        for (uint256 i = 0; i < 10; i++) {
            uint256 snapshot = vm.snapshotState();
            uint256 start = gasleft();
            gate.issue(certHash);
            g[i] = start - gasleft();
            vm.revertToState(snapshot);
        }
        console2.log("issue median gas", _median(g));
    }

    function test_gas_deposit() public {
        uint256[] memory g = new uint256[](10);
        ShadowGate.Proof memory proof = _proof(".core.deposit1");
        uint256 cm = fx.readUint(".core.deposit1.cm");
        uint256 q = fx.readUint(".core.deposit1.q");
        bytes memory memo = fx.readBytes(".core.deposit1.memo");
        for (uint256 i = 0; i < 10; i++) {
            uint256 snapshot = vm.snapshotState();
            uint256 start = gasleft();
            _depositCoreParsed(proof, cm, q, memo);
            g[i] = start - gasleft();
            vm.revertToState(snapshot);
        }
        console2.log("deposit median gas", _median(g));
    }

    function test_gas_transfer_budget() public {
        uint256[] memory g = new uint256[](10);
        _depositTransfer();
        ShadowGate.Proof memory proof = _transferProof();
        uint256[] memory pub = fx.readUintArray(".transfer.transfer.pub");
        bytes memory memo1 = fx.readBytes(".transfer.transfer.memo1");
        bytes memory memo2 = fx.readBytes(".transfer.transfer.memo2");
        for (uint256 i = 0; i < 10; i++) {
            uint256 snapshot = vm.snapshotState();
            uint256 start = gasleft();
            _transferParsed(proof, pub, memo1, memo2);
            g[i] = start - gasleft();
            vm.revertToState(snapshot);
        }
        console2.log("transferBudget median gas", _median(g));
    }

    function test_gas_execute_d2() public {
        uint256[] memory g = new uint256[](10);
        _prepareExecute();
        ShadowGate.Proof memory proof = _proof(".core.execute");
        ShadowGate.Action memory action = _action();
        ShadowGate.Roots memory roots = _roots();
        ShadowGate.Budget memory budget = _budget();
        bytes memory memo = fx.readBytes(".core.execute.memoChange");
        uint256[] memory ct = fx.readUintArray(".core.execute.ct");
        uint64 nowTs = uint64(fx.readUint(".core.execute.now"));
        for (uint256 i = 0; i < 10; i++) {
            uint256 snapshot = vm.snapshotState();
            uint256 start = gasleft();
            _executeParsed(proof, action, roots, budget, memo, ct, nowTs);
            g[i] = start - gasleft();
            vm.revertToState(snapshot);
        }
        console2.log("execute D2 median gas", _median(g));
    }

    function test_gas_revoke() public {
        uint256[] memory g = new uint256[](10);
        ShadowGate.Proof memory proof = _proof(".core.revokeC1");
        uint256 newRoot = fx.readUint(".core.revokeC1.newRoot");
        uint256 entry = fx.readUint(".core.revokeC1.entry");
        for (uint256 i = 0; i < 10; i++) {
            uint256 snapshot = vm.snapshotState();
            uint256 start = gasleft();
            _revokeC1Parsed(proof, newRoot, entry);
            g[i] = start - gasleft();
            vm.revertToState(snapshot);
        }
        console2.log("revoke median gas", _median(g));
    }
}
