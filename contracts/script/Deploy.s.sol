// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ShadowGate} from "../src/ShadowGate.sol";
import {ShadowGroup} from "../src/ShadowGroup.sol";
import {ShadowPayout} from "../src/ShadowPayout.sol";
import {ShadowRegistry} from "../src/ShadowRegistry.sol";
import {ShadowRevocations} from "../src/ShadowRevocations.sol";
import {ShadowToken} from "../src/ShadowToken.sol";
import {TreasuryAdapter} from "../src/TreasuryAdapter.sol";
import {MockVault} from "../src/MockVault.sol";
import {ShadowVerifierD1} from "../src/ShadowVerifierD1.sol";
import {ShadowVerifierD2} from "../src/ShadowVerifierD2.sol";
import {ShadowVerifierD3} from "../src/ShadowVerifierD3.sol";
import {ShadowRegisterVerifier} from "../src/ShadowRegisterVerifier.sol";
import {ShadowRevokeVerifier} from "../src/ShadowRevokeVerifier.sol";
import {ShadowBudgetTransferVerifier} from "../src/ShadowBudgetTransferVerifier.sol";
import {ShadowBudgetMintVerifier} from "../src/ShadowBudgetMintVerifier.sol";

/// Deploys the complete ShadowPass contract set and writes deployments/<network>.json.
/// Usage: forge script contracts/script/Deploy.s.sol:Deploy --rpc-url ... --broadcast
contract Deploy is Script {
    bytes4 private constant PAY = bytes4(keccak256("shadowpass.PAY"));
    bytes4 private constant TREASURY_SUPPLY = bytes4(keccak256("shadowpass.TREASURY_SUPPLY"));
    uint64 private constant WINDOW = 10;
    uint64 private constant CLOCK_SKEW = 60;
    uint256 private constant DEMO_VAULT_FUNDING = 1_000_000 * 10 ** 6;

    struct Deployment {
        address gate;
        address registry;
        address revocations;
        address group;
        address payout;
        address treasury;
        address vault;
        address token;
        address d1;
        address d2;
        address d3;
        address registerVerifier;
        address revokeVerifier;
        address transferVerifier;
        address mintVerifier;
    }

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(deployerPk);
        string memory network = vm.envOr("SHADOWPASS_NETWORK", string("anvil"));
        uint256 domain = vm.envOr("SHADOWPASS_DOMAIN", uint256(7));

        Deployment memory d = _deploy(deployerPk, deployer, domain);
        _writeDeployment(network, d);
    }

    function _deploy(uint256 deployerPk, address deployer, uint256 domain) internal returns (Deployment memory d) {
        vm.startBroadcast(deployerPk);

        d.d1 = address(new ShadowVerifierD1());
        d.d2 = address(new ShadowVerifierD2());
        d.d3 = address(new ShadowVerifierD3());
        d.registerVerifier = address(new ShadowRegisterVerifier());
        d.revokeVerifier = address(new ShadowRevokeVerifier());
        d.transferVerifier = address(new ShadowBudgetTransferVerifier());
        d.mintVerifier = address(new ShadowBudgetMintVerifier());

        d.group = address(new ShadowGroup());
        d.registry = address(new ShadowRegistry(d.registerVerifier, d.group, domain, WINDOW));
        d.revocations = address(new ShadowRevocations(d.revokeVerifier, _genesisRevocationRoot(), 1, WINDOW));

        // ShadowToken.gate and ShadowGate.token are immutable, so deploy the pair
        // back-to-back and use the predicted token/gate addresses.
        address predictedToken = vm.computeCreateAddress(deployer, vm.getNonce(deployer));
        address predictedGate = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        d.token = address(new ShadowToken(predictedGate));
        require(d.token == predictedToken, "token address prediction failed");

        address[3] memory actionVerifiers = [d.d1, d.d2, d.d3];
        d.gate = address(
            new ShadowGate(
                actionVerifiers,
                d.registry,
                d.revocations,
                d.token,
                deployer,
                CLOCK_SKEW,
                d.transferVerifier,
                d.mintVerifier
            )
        );
        require(d.gate == predictedGate, "gate address prediction failed");

        d.vault = address(new MockVault(IERC20(d.token), "Mock USD Vault", "mvUSD", 500, 100_000));
        d.payout = address(new ShadowPayout(d.gate, IERC20(d.token)));
        d.treasury = address(new TreasuryAdapter(d.gate, IERC20(d.token), deployer));

        // Fund the demo vault with real tokens so accelerated yield can be redeemed.
        ShadowToken(d.token).mint(d.vault, DEMO_VAULT_FUNDING);
        TreasuryAdapter(d.treasury).setVault(d.vault, true);
        ShadowGate(d.gate).setAdapter(d.treasury, true);
        ShadowGate(d.gate).setMethod(PAY, 1, d.payout, true);
        ShadowGate(d.gate).setMethod(TREASURY_SUPPLY, 2, d.treasury, true);

        vm.stopBroadcast();
    }

    function _genesisRevocationRoot() internal pure returns (uint256 root) {
        root = PoseidonT4.hash([uint256(0), uint256(0), uint256(0)]);
        uint256 zero = 0;
        for (uint256 i = 0; i < 20; i++) {
            root = PoseidonT3.hash([root, zero]);
            zero = PoseidonT3.hash([zero, zero]);
        }
    }

    function _writeDeployment(string memory network, Deployment memory d) internal {
        string memory facilitator = vm.envOr("SHADOWPASS_FACILITATOR", string(""));
        string memory mailbox = vm.envOr("SHADOWPASS_MAILBOX", string(""));
        string memory json =
            string.concat(_coreJson(d), _assetJson(d), _verifierJson(d), _tailJson(facilitator, mailbox));
        vm.writeFile(string.concat("../deployments/", network, ".json"), json);
    }

    function _coreJson(Deployment memory d) internal view returns (string memory) {
        return string.concat(
            "{\n",
            '  "chainId": ',
            vm.toString(block.chainid),
            ",\n",
            '  "gate": "',
            vm.toString(d.gate),
            '",\n',
            '  "registry": "',
            vm.toString(d.registry),
            '",\n',
            '  "revocations": "',
            vm.toString(d.revocations),
            '",\n',
            '  "group": "',
            vm.toString(d.group),
            '",\n',
            '  "payout": "',
            vm.toString(d.payout),
            '",\n'
        );
    }

    function _assetJson(Deployment memory d) internal view returns (string memory) {
        return string.concat(
            '  "treasury": "',
            vm.toString(d.treasury),
            '",\n',
            '  "vault": "',
            vm.toString(d.vault),
            '",\n',
            '  "token": "',
            vm.toString(d.token),
            '",\n'
        );
    }

    function _verifierJson(Deployment memory d) internal view returns (string memory) {
        return string.concat(
            '  "verifiers": {\n',
            '    "d1": "',
            vm.toString(d.d1),
            '",\n',
            '    "d2": "',
            vm.toString(d.d2),
            '",\n',
            '    "d3": "',
            vm.toString(d.d3),
            '",\n',
            '    "reg": "',
            vm.toString(d.registerVerifier),
            '",\n',
            '    "revoke": "',
            vm.toString(d.revokeVerifier),
            '",\n',
            '    "transfer": "',
            vm.toString(d.transferVerifier),
            '",\n',
            '    "mint": "',
            vm.toString(d.mintVerifier),
            '"\n',
            "  },\n"
        );
    }

    function _tailJson(string memory facilitator, string memory mailbox) internal view returns (string memory) {
        return string.concat(
            '  "startBlock": ',
            vm.toString(vm.getBlockNumber()),
            ",\n",
            '  "facilitator": "',
            facilitator,
            '",\n',
            '  "mailbox": "',
            mailbox,
            '"\n',
            "}\n"
        );
    }
}
