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
const executeAbi = [...shadowErrorAbi, ...parseAbi([
  "function execute((uint256[2] a,uint256[2][2] b,uint256[2] c) proof,(uint256 issued,uint256 revoked,uint256 root) roots,uint64 nowTs,(address target,bytes4 method,uint256 amount,uint256 nonce,bytes params) action,uint256[] ct,(uint256 noteRoot,uint256 budgetNf,uint256 cmChange,uint256 qSpent) budget,bytes memoChange)",
] as const)] as any;
const treasuryAbi = [...shadowErrorAbi, ...parseAbi([
  "function withdraw(uint256 positionId)",
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

export class RelayInFlightError extends Error {
  constructor(readonly lockKey: string) {
    super("operation_in_progress");
    this.name = "operation_in_progress";
  }
}

export function relayLockKey(action: RelayAction, args: Record<string, unknown>): string | undefined {
  const actionName = String(action);
  if (actionName === "execute") {
    const budget = args.budget as Record<string, unknown> | undefined;
    return budget?.budgetNf === undefined ? undefined : `budget:${String(budget.budgetNf)}`;
  }
  if (actionName === "treasuryWithdraw") {
    return args.positionId === undefined ? undefined : `position:${String(args.positionId)}`;
  }
  if (action === "registerState") {
    return `state:${String(args.issued)}:${String(args.revoked)}:${String(args.root)}`;
  }
  const key = action === "transferBudget"
    ? args.nullifier
    : action === "faucetDeposit"
      ? args.cm
      : action === "issue"
        ? args.certHash
        : action === "join"
          ? args.commitment
          : action === "register"
            ? args.leaf0
            : action === "revoke"
              ? args.entry
              : undefined;
  return key === undefined ? undefined : `${action}:${String(key)}`;
}

export function createViemWalletRelayClient(options: ViemRelayOptions): WalletRelayClient {
  const account = options.walletClient.account;
  if (!account?.address) throw new Error("wallet_account_missing");
  const sender = createSerializedSender(options.publicClient, options.walletClient);
  const inFlight = new Set<string>();

  const send = async (
    action: RelayAction,
    args: Record<string, unknown>,
    simulate: () => Promise<unknown>,
    write: () => Promise<Hex>,
  ): Promise<RelayResult> => {
    const lockKey = relayLockKey(action, args);
    if (lockKey && inFlight.has(lockKey)) throw new RelayInFlightError(lockKey);
    if (lockKey) inFlight.add(lockKey);
    try {
      const receipt = await sender.write(async () => {
        try {
          await simulate();
        } catch (error) {
          throw new RelayRevertError(revertName(error) ?? "unknown");
        }
        try {
          return await write();
        } catch (error) {
          const name = revertName(error);
          if (name) throw new RelayRevertError(name);
          throw error;
        }
      });
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
    } finally {
      if (lockKey) inFlight.delete(lockKey);
    }
  };

  return {
    async relay(action: RelayAction, args: Record<string, unknown>): Promise<RelayResult> {
      switch (action) {
        case "join":
          return send(
            action,
            args,
            () => options.publicClient.simulateContract({
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
            action,
            args,
            () => options.publicClient.simulateContract({
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
            action,
            args,
            () => options.publicClient.simulateContract({
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
            action,
            args,
            () => options.publicClient.simulateContract({
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
            action,
            args,
            () => options.publicClient.simulateContract({
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
            action,
            args,
            () => options.publicClient.simulateContract({
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
            action,
            args,
            () => options.publicClient.simulateContract({
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
        case "execute": {
          const roots = args.roots as Record<string, unknown>;
          const actionArgs = args.action as Record<string, unknown>;
          const budget = args.budget as Record<string, unknown>;
          const callArgs = [
            args.proof as any,
            {
              issued: BigInt(String(roots.issued)),
              revoked: BigInt(String(roots.revoked)),
              root: BigInt(String(roots.root)),
            },
            BigInt(String(args.nowTs)),
            {
              target: String(actionArgs.target) as Address,
              method: String(actionArgs.method) as Hex,
              amount: BigInt(String(actionArgs.amount)),
              nonce: BigInt(String(actionArgs.nonce)),
              params: String(actionArgs.params) as Hex,
            },
            (args.ct as unknown[]).map((value) => BigInt(String(value))),
            {
              noteRoot: BigInt(String(budget.noteRoot)),
              budgetNf: BigInt(String(budget.budgetNf)),
              cmChange: BigInt(String(budget.cmChange)),
              qSpent: BigInt(String(budget.qSpent)),
            },
            String(args.memoChange) as Hex,
          ] as const;
          return send(
            action,
            args,
            () => options.publicClient.simulateContract({
              account,
              address: options.deployment.gate,
              abi: executeAbi,
              functionName: "execute",
              args: callArgs as any,
            }),
            () => options.walletClient.writeContract({
              account,
              chain: null,
              address: options.deployment.gate,
              abi: executeAbi,
              functionName: "execute",
              args: callArgs as any,
            }),
          );
        }
        case "treasuryWithdraw":
          return send(
            action,
            args,
            () => options.publicClient.simulateContract({
              account,
              address: options.deployment.treasury,
              abi: treasuryAbi,
              functionName: "withdraw",
              args: [BigInt(String(args.positionId))],
            }),
            () => options.walletClient.writeContract({
              account,
              chain: null,
              address: options.deployment.treasury,
              abi: treasuryAbi,
              functionName: "withdraw",
              args: [BigInt(String(args.positionId))],
            }),
          );
      }
    },
  };
}
