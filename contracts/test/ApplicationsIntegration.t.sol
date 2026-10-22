// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockVault} from "../src/MockVault.sol";
import {ShadowBudgetMintVerifier} from "../src/ShadowBudgetMintVerifier.sol";
import {ShadowBudgetTransferVerifier} from "../src/ShadowBudgetTransferVerifier.sol";
import {ShadowGate} from "../src/ShadowGate.sol";
import {ShadowGroup} from "../src/ShadowGroup.sol";
import {ShadowRegisterVerifier} from "../src/ShadowRegisterVerifier.sol";
import {ShadowRegistry} from "../src/ShadowRegistry.sol";
import {ShadowRevocations} from "../src/ShadowRevocations.sol";
import {ShadowRevokeVerifier} from "../src/ShadowRevokeVerifier.sol";
import {ShadowToken} from "../src/ShadowToken.sol";
import {ShadowVerifierD1} from "../src/ShadowVerifierD1.sol";
import {ShadowVerifierD2} from "../src/ShadowVerifierD2.sol";
import {ShadowVerifierD3} from "../src/ShadowVerifierD3.sol";
import {TreasuryAdapter} from "../src/TreasuryAdapter.sol";

contract ApplicationsIntegrationTest is Test {
    using stdJson for string;

    address private constant ADMIN = address(0xA11CE);
    address private constant TOKEN_ADDRESS = address(0x6000000000000000000000000000000000000001);
    uint64 private constant ISSUED_WINDOW = 300;
    uint64 private constant CLOCK_SKEW = 60;
    uint64 private constant REVOKE_WINDOW = 60;

    bytes4 private constant TREASURY_SUPPLY = bytes4(keccak256("shadowpass.TREASURY_SUPPLY"));

    string private fixture;
    ShadowToken private token;
    ShadowGate private gate;
    ShadowGroup private group;
    ShadowRegistry private registry;
    ShadowRevocations private revocations;
    TreasuryAdapter private adapter;
    MockVault private vault;

    function setUp() public {
        fixture = vm.readFile("test/fixtures/shadowpass.json");
        vm.chainId(fixture.readUint(".chainId"));
        vm.warp(fixture.readUint(".now"));

        address gateAddress = fixture.readAddress(".gate");
        address adapterAddress = fixture.readAddress(".treasury.adapter");
        address vaultAddress = fixture.readAddress(".treasury.vault");

        deployCodeTo("ShadowToken.sol:ShadowToken", abi.encode(gateAddress), TOKEN_ADDRESS);
        token = ShadowToken(TOKEN_ADDRESS);

        group = new ShadowGroup();
        group.join(fixture.readUint(".treasury.group.commitment"));
        registry = new ShadowRegistry(
            address(new ShadowRegisterVerifier()), address(group), fixture.readUint(".domain"), ISSUED_WINDOW
        );
        revocations = new ShadowRevocations(
            address(new ShadowRevokeVerifier()),
            fixture.readUint(".treasury.revocations.genesisRoot"),
            fixture.readUint(".treasury.revocations.genesisCount"),
            REVOKE_WINDOW
        );

        deployCodeTo(
            "MockVault.sol:MockVault", abi.encode(IERC20(TOKEN_ADDRESS), "Mock USD Vault", "mvUSD", 0, 1), vaultAddress
        );
        vault = MockVault(vaultAddress);

        deployCodeTo(
            "TreasuryAdapter.sol:TreasuryAdapter", abi.encode(gateAddress, TOKEN_ADDRESS, address(this)), adapterAddress
        );
        adapter = TreasuryAdapter(adapterAddress);
        adapter.setVault(vaultAddress, true);

        address[3] memory verifiers =
            [address(new ShadowVerifierD1()), address(new ShadowVerifierD2()), address(new ShadowVerifierD3())];
        deployCodeTo(
            "ShadowGate.sol:ShadowGate",
            abi.encode(
                verifiers,
                address(registry),
                address(revocations),
                TOKEN_ADDRESS,
                ADMIN,
                CLOCK_SKEW,
                address(new ShadowBudgetTransferVerifier()),
                address(new ShadowBudgetMintVerifier())
            ),
            gateAddress
        );
        gate = ShadowGate(gateAddress);

        vm.prank(ADMIN);
        gate.setMethod(TREASURY_SUPPLY, uint32(fixture.readUint(".treasury.reqCap")), adapterAddress, true);
        vm.prank(ADMIN);
        gate.setAdapter(adapterAddress, true);
    }

    function test_real_gate_treasury_supply_withdraw_and_note_memo() public {
        _register();
        _deposit();
        gate.issue(fixture.readUint(".treasury.issue"));

        uint256[] memory roots = fixture.readUintArray(".treasury.roots");
        gate.registerState(roots[0], roots[1], roots[2]);

        ShadowGate.Action memory action;
        action.target = fixture.readAddress(".treasury.execute.action.target");
        action.method = bytes4(fixture.readBytes(".treasury.execute.action.method"));
        action.amount = fixture.readUint(".treasury.execute.action.amount");
        action.nonce = fixture.readUint(".treasury.execute.action.nonce");
        action.params = fixture.readBytes(".treasury.execute.action.params");

        uint256[] memory budget = fixture.readUintArray(".treasury.execute.budget");
        gate.execute(
            _proof(".treasury.execute"),
            ShadowGate.Roots(roots[0], roots[1], roots[2]),
            uint64(fixture.readUint(".treasury.execute.now")),
            action,
            fixture.readUintArray(".treasury.execute.ct"),
            ShadowGate.Budget(budget[0], budget[1], budget[2], budget[3]),
            fixture.readBytes(".treasury.execute.memoChange")
        );

        uint256 positionId = adapter.nextPositionId() - 1;
        uint256 term = fixture.readUint(".treasury.term");
        uint256 returnCm = fixture.readUint(".treasury.returnCm");
        bytes memory returnMemo = fixture.readBytes(".treasury.returnMemo");
        vm.warp(block.timestamp + term);

        vm.recordLogs();
        adapter.withdraw(positionId);
        assertTrue(_hasNoteMemo(vm.getRecordedLogs(), returnCm, returnMemo));
    }

    function _register() private {
        ShadowGate.Proof memory proof = _proof(".treasury.register");
        uint256[] memory pub = fixture.readUintArray(".treasury.register.pub");
        ShadowRegistry.Proof memory registryProof;
        registryProof.a = proof.a;
        registryProof.b = proof.b;
        registryProof.c = proof.c;
        registry.register(registryProof, pub[0], pub[2], pub[3], new uint256[](0));
    }

    function _deposit() private {
        ShadowGate.Proof memory proof = _proof(".treasury.deposit");
        uint256 q = fixture.readUint(".treasury.deposit.q");
        token.mint(address(this), q);
        token.approve(address(gate), q);
        gate.deposit(proof, fixture.readUint(".treasury.deposit.cm"), q, fixture.readBytes(".treasury.deposit.memo"));
        token.mint(address(gate), fixture.readUint(".treasury.execute.action.amount"));
    }

    function _proof(string memory base) private view returns (ShadowGate.Proof memory proof) {
        uint256[] memory a = fixture.readUintArray(string.concat(base, ".proof.a"));
        uint256[] memory b0 = fixture.readUintArray(string.concat(base, ".proof.b[0]"));
        uint256[] memory b1 = fixture.readUintArray(string.concat(base, ".proof.b[1]"));
        uint256[] memory c = fixture.readUintArray(string.concat(base, ".proof.c"));
        proof.a = [a[0], a[1]];
        proof.b = [[b0[0], b0[1]], [b1[0], b1[1]]];
        proof.c = [c[0], c[1]];
    }

    function _hasNoteMemo(Vm.Log[] memory logs, uint256 cm, bytes memory memo) private pure returns (bool) {
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
}
