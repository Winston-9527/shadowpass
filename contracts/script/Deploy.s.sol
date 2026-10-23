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

/// Deploys the complete ShadowPass contract set to Anvil or Base Sepolia.
/// Usage: forge script contracts/script/Deploy.s.sol:Deploy --rpc-url ... --broadcast
contract Deploy is Script {
    uint256 private constant ANVIL_CHAIN_ID = 31337;
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84532;
    bytes4 private constant PAY = bytes4(keccak256("shadowpass.PAY"));
    bytes4 private constant TREASURY_SUPPLY = bytes4(keccak256("shadowpass.TREASURY_SUPPLY"));
    uint64 private constant WINDOW = 10;
    uint64 private constant CLOCK_SKEW = 60;
    uint256 private constant DEMO_VAULT_FUNDING = 1_000_000 * 10 ** 6;
    uint256 private constant DEMO_ANNUAL_RATE_BPS = 500;
    uint256 private constant DEMO_YIELD_ACCELERATION = 73;

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

    error UnsupportedChain(uint256 chainId);

    function run() external {
        _validateChain(block.chainid);

        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(deployerPk);
        uint256 domain = vm.envOr("SHADOWPASS_DOMAIN", uint256(7));

        Deployment memory d = _deploy(deployerPk, deployer, domain);
        require(ShadowToken(d.token).gate() == d.gate, "token gate mismatch");
    }

    function _validateChain(uint256 chainId) internal pure {
        if (chainId != ANVIL_CHAIN_ID && chainId != BASE_SEPOLIA_CHAIN_ID) {
            revert UnsupportedChain(chainId);
        }
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

        // The vault is prefunded, so accelerate proportionally to give the new 20 spUSD deposit about 1% over 24 hours.
        d.vault = address(new MockVault(IERC20(d.token), "Mock USD Vault", "mvUSD", DEMO_ANNUAL_RATE_BPS, DEMO_YIELD_ACCELERATION));
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
}
