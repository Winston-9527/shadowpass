import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Deployment } from "@shadowpass/sdk";
import {
  createSerializedSender,
  revertName,
  shadowErrorAbi,
  type RelayAction,
  type RelayResult,
  type WalletRelayClient,
} from "@shadowpass/x402";

const groupAbi = [...shadowErrorAbi, ...parseAbi(["function join(uint256 commitment)"] as const)] as const;
const registryAbi = [...shadowErrorAbi, ...parseAbi([
  "function register((uint256[2] a,uint256[2][2] b,uint256[2] c) proof,uint256 groupRoot,uint256 nf,uint256 leaf0,uint256[] siblingNodes)",
] as const)] as const;
const tokenAbi = [...shadowErrorAbi, ...parseAbi([
  "function faucetDeposit((uint256[2] a,uint256[2][2] b,uint256[2] c) proof,uint256 cm,uint256 q,bytes memo)",
] as const)] as const;
const gateAbi = [...shadowErrorAbi, ...parseAbi([
  "function issue(uint256 certHash)",
  "function transferBudget((uint256[2] a,uint256[2][2] b,uint256[2] c) proof,uint256 noteRoot,uint256 revokedRoot,uint256 nullifier,uint256 cm1,uint256 cm2,bytes memo1,bytes memo2)",
  "function registerState(uint256 issued,uint256 revoked,uint256 root) returns (uint256)",
] as const)] as const;
const revocationsAbi = [...shadowErrorAbi, ...parseAbi([
  "function revoke((uint256[2] a,uint256[2][2] b,uint256[2] c) proof,uint256 newRoot,uint256 entry)",
] as const)] as const;

export interface ViemAccounts {
  publicClient: PublicClient;
  walletClient: WalletClient;
  address: Address;
}

export function createViemAccounts(rpcUrl: string, privateKey: Hex): ViemAccounts {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  return {
    publicClient: createPublicClient({ transport }),
    walletClient: createWalletClient({ account, transport }),
    address: account.address,
  };
}

export interface ViemRelayOptions {
  publicClient: PublicClient;
  walletClient: WalletClient;
  deployment: Deployment;
}

export class RelayRevertError extends Error {
  constructor(readonly revertName: string) {
    super(`simulation_failed:${revertName}`);
    this.name = "RelayRevertError";
  }
}

export function createViemWalletRelayClient(options: ViemRelayOptions): WalletRelayClient {
  const account = options.walletClient.account?.address;
  if (!account) throw new Error("wallet_account_missing");
  const sender = createSerializedSender(options.publicClient, options.walletClient);

  const send = async (
    simulation: Promise<unknown>,
    write: () => Promise<Hex>,
  ): Promise<RelayResult> => {
    try {
      await simulation;
    } catch (error) {
      throw new RelayRevertError(revertName(error) ?? "unknown");
    }
    const receipt = await sender.write(write);
    return {
      transaction: receipt.transaction,
      blockNumber: receipt.blockNumber.toString(),
      logs: receipt.logs.map((log: any) => ({
        address: String(log.address),
        topics: Array.isArray(log.topics) ? log.topics.map(String) : [],
        data: String(log.data),
        logIndex: String(log.logIndex),
        transactionHash: String(log.transactionHash),
        blockNumber: String(log.blockNumber),
      })),
    };
  };

  return {
    async relay(action: RelayAction, args: Record<string, unknown>): Promise<RelayResult> {
      switch (action) {
        case "join":
          return send(
            options.publicClient.simulateContract({
              account,
              address: options.deployment.group,
              abi: groupAbi,
              functionName: "join",
              args: [BigInt(String(args.commitment))],
            }),
            () => options.walletClient.writeContract({
              account,
              chain: null,
              address: options.deployment.group,
              abi: groupAbi,
              functionName: "join",
              args: [BigInt(String(args.commitment))],
            }),
          );
        case "register":
          return send(
            options.publicClient.simulateContract({
              account,
              address: options.deployment.registry,
              abi: registryAbi,
              functionName: "register",
              args: [
                args.proof as any,
                BigInt(String(args.groupRoot)),
                BigInt(String(args.nf)),
                BigInt(String(args.leaf0)),
                (args.siblingNodes as unknown[]).map((value) => BigInt(String(value))),
              ],
            }),
            () => options.walletClient.writeContract({
              account,
              chain: null,
              address: options.deployment.registry,
              abi: registryAbi,
              functionName: "register",
              args: [
                args.proof as any,
                BigInt(String(args.groupRoot)),
                BigInt(String(args.nf)),
                BigInt(String(args.leaf0)),
                (args.siblingNodes as unknown[]).map((value) => BigInt(String(value))),
              ],
            }),
          );
        case "faucetDeposit":
          return send(
            options.publicClient.simulateContract({
              account,
              address: options.deployment.token,
              abi: tokenAbi,
              functionName: "faucetDeposit",
              args: [args.proof as any, BigInt(String(args.cm)), BigInt(String(args.q)), String(args.memo) as Hex],
            }),
            () => options.walletClient.writeContract({
              account,
              chain: null,
              address: options.deployment.token,
              abi: tokenAbi,
              functionName: "faucetDeposit",
              args: [args.proof as any, BigInt(String(args.cm)), BigInt(String(args.q)), String(args.memo) as Hex],
            }),
          );
        case "issue":
          return send(
            options.publicClient.simulateContract({
              account,
              address: options.deployment.gate,
              abi: gateAbi,
              functionName: "issue",
              args: [BigInt(String(args.certHash))],
            }),
            () => options.walletClient.writeContract({
              account,
              chain: null,
              address: options.deployment.gate,
              abi: gateAbi,
              functionName: "issue",
              args: [BigInt(String(args.certHash))],
            }),
          );
        case "transferBudget":
          return send(
            options.publicClient.simulateContract({
              account,
              address: options.deployment.gate,
              abi: gateAbi,
              functionName: "transferBudget",
              args: [
                args.proof as any,
                BigInt(String(args.noteRoot)),
                BigInt(String(args.revokedRoot)),
                BigInt(String(args.nullifier)),
                BigInt(String(args.cm1)),
                BigInt(String(args.cm2)),
                String(args.memo1) as Hex,
                String(args.memo2) as Hex,
              ],
            }),
            () => options.walletClient.writeContract({
              account,
              chain: null,
              address: options.deployment.gate,
              abi: gateAbi,
              functionName: "transferBudget",
              args: [
                args.proof as any,
                BigInt(String(args.noteRoot)),
                BigInt(String(args.revokedRoot)),
                BigInt(String(args.nullifier)),
                BigInt(String(args.cm1)),
                BigInt(String(args.cm2)),
                String(args.memo1) as Hex,
                String(args.memo2) as Hex,
              ],
            }),
          );
        case "revoke":
          return send(
            options.publicClient.simulateContract({
              account,
              address: options.deployment.revocations,
              abi: revocationsAbi,
              functionName: "revoke",
              args: [args.proof as any, BigInt(String(args.newRoot)), BigInt(String(args.entry))],
            }),
            () => options.walletClient.writeContract({
              account,
              chain: null,
              address: options.deployment.revocations,
              abi: revocationsAbi,
              functionName: "revoke",
              args: [args.proof as any, BigInt(String(args.newRoot)), BigInt(String(args.entry))],
            }),
          );
        case "registerState":
          return send(
            options.publicClient.simulateContract({
              account,
              address: options.deployment.gate,
              abi: gateAbi,
              functionName: "registerState",
              args: [BigInt(String(args.issued)), BigInt(String(args.revoked)), BigInt(String(args.root))],
            }),
            () => options.walletClient.writeContract({
              account,
              chain: null,
              address: options.deployment.gate,
              abi: gateAbi,
              functionName: "registerState",
              args: [BigInt(String(args.issued)), BigInt(String(args.revoked)), BigInt(String(args.root))],
            }),
          );
      }
    },
  };
}
