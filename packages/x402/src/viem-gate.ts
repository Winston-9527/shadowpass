import {
  encodeAbiParameters,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import type { Deployment } from "@shadowpass/sdk";
import type {
  GateClient,
  PaymentChainView,
  Roots,
  ShadowpassPayload,
  TransactionResult,
} from "./types.js";

export const shadowErrorAbi = parseAbi([
  "error NotAdmin()",
  "error AdapterNotAllowed()",
  "error StaleIssuedRoot()",
  "error StaleRevokedRoot()",
  "error UnregisteredRootRoot()",
  "error BadClock()",
  "error UnknownMethod()",
  "error TargetMismatch()",
  "error InvalidProof()",
  "error BadField()",
  "error BadCiphertextLength()",
  "error StaleNoteRoot()",
  "error BudgetSpent()",
  "error AmountMismatch()",
  "error UnknownState()",
  "error MemoTooLong()",
  "error TokenTransferFailed()",
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error FaucetLimit()",
  "error FaucetAmountTooHigh()",
  "error UnknownGroupRoot()",
  "error AlreadyRegistered()",
  "error LeafRetired()",
  "error NotGate()",
  "error ZeroPayTo()",
  "error UnknownPosition()",
  "error AlreadyWithdrawn()",
  "error BeforeMaturity()",
  "error ZeroTerm()",
  "error ZeroExpectedQ()",
  "error ZeroShares()",
  "error MissingFunds()",
  "error ExpectedQTooHigh()",
] as const);

const proofComponents = [
  { name: "a", type: "uint256[2]" },
  { name: "b", type: "uint256[2][2]" },
  { name: "c", type: "uint256[2]" },
] as const;

const gateAbi = [
  ...shadowErrorAbi,
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "tuple", components: proofComponents },
      {
        name: "roots",
        type: "tuple",
        components: [
          { name: "issued", type: "uint256" },
          { name: "revoked", type: "uint256" },
          { name: "root", type: "uint256" },
        ],
      },
      { name: "nowTs", type: "uint64" },
      {
        name: "action",
        type: "tuple",
        components: [
          { name: "target", type: "address" },
          { name: "method", type: "bytes4" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "params", type: "bytes" },
        ],
      },
      { name: "ct", type: "uint256[]" },
      {
        name: "budget",
        type: "tuple",
        components: [
          { name: "noteRoot", type: "uint256" },
          { name: "budgetNf", type: "uint256" },
          { name: "cmChange", type: "uint256" },
          { name: "qSpent", type: "uint256" },
        ],
      },
      { name: "memoChange", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "stateOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "issuedRootAccepted",
    stateMutability: "view",
    inputs: [{ name: "root", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "clockSkew",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "registerState",
    stateMutability: "nonpayable",
    inputs: [
      { name: "issued", type: "uint256" },
      { name: "revoked", type: "uint256" },
      { name: "root", type: "uint256" },
    ],
    outputs: [{ name: "stateRoot", type: "uint256" }],
  },
] as const;

const registryAbi = parseAbi([
  "function rootAccepted(uint256 candidate) view returns (bool)",
] as const);

const revocationsAbi = parseAbi([
  "function rootAccepted(uint256 candidate) view returns (bool)",
] as const);

export class TransactionRevertedError extends Error {
  constructor(readonly transaction: Hex) {
    super("transaction_reverted");
    this.name = "TransactionRevertedError";
  }
}

export class TransactionPendingError extends Error {
  constructor(readonly transaction: Hex, cause?: unknown) {
    super("transaction_pending", { cause });
    this.name = "transaction_pending";
  }
}

export class TransactionQueueFullError extends Error {
  constructor() {
    super("transaction_queue_full");
    this.name = "transaction_queue_full";
  }
}

const walletQueues = new Map<string, Promise<unknown>>();
const walletQueueSizes = new Map<string, number>();

export interface SerializedTransactionSender {
  write(write: () => Promise<Hex>): Promise<TransactionResult>;
}

export interface SerializedTransactionSenderOptions {
  receiptPollingIntervalMs?: number;
  maxQueueLength?: number;
}

export function createSerializedSender(
  publicClient: PublicClient,
  walletClient: WalletClient,
  options: SerializedTransactionSenderOptions = {},
): SerializedTransactionSender {
  const address = walletClient.account?.address;
  if (!address) throw new Error("wallet_account_missing");
  const key = address.toLowerCase();
  const maxQueueLength = options.maxQueueLength ?? 64;
  const receiptPollingIntervalMs = options.receiptPollingIntervalMs ?? 300;
  if (!Number.isSafeInteger(maxQueueLength) || maxQueueLength < 1) throw new Error("maxQueueLength must be positive");
  if (!Number.isSafeInteger(receiptPollingIntervalMs) || receiptPollingIntervalMs < 250) {
    throw new Error("receiptPollingIntervalMs must be at least 250");
  }
  return {
    async write(write) {
      const queued = walletQueueSizes.get(key) ?? 0;
      if (queued >= maxQueueLength) throw new TransactionQueueFullError();
      walletQueueSizes.set(key, queued + 1);
      const previous = walletQueues.get(key) ?? Promise.resolve();
      const current = previous.catch(() => undefined).then(async () => {
        const transaction = await write();
        let receipt;
        try {
          receipt = await publicClient.waitForTransactionReceipt({
            hash: transaction,
            confirmations: 1,
            pollingInterval: receiptPollingIntervalMs,
          });
        } catch (error) {
          throw new TransactionPendingError(transaction, error);
        }
        if (receipt.status !== "success") throw new TransactionRevertedError(transaction);
        return {
          transaction,
          blockNumber: receipt.blockNumber,
          logs: receipt.logs,
        };
      });
      walletQueues.set(key, current);
      try {
        return await current;
      } finally {
        if (walletQueues.get(key) === current) walletQueues.delete(key);
        const remaining = (walletQueueSizes.get(key) ?? 1) - 1;
        if (remaining > 0) walletQueueSizes.set(key, remaining);
        else walletQueueSizes.delete(key);
      }
    },
  };
}

export interface ViemGateConfig {
  publicClient: PublicClient;
  walletClient: WalletClient;
  deployment: Deployment;
}

export class ViemGateClient implements GateClient, PaymentChainView {
  readonly deployment: Deployment;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly sender: SerializedTransactionSender;
  private readonly account: Address;

  constructor(config: ViemGateConfig) {
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.deployment = config.deployment;
    if (!config.walletClient.account?.address) throw new Error("wallet_account_missing");
    this.account = config.walletClient.account.address;
    this.sender = createSerializedSender(config.publicClient, config.walletClient);
  }

  async blockTimestamp(): Promise<number> {
    return Number((await this.publicClient.getBlock({ blockTag: "latest" })).timestamp);
  }

  async clockSkewSeconds(): Promise<number> {
    return Number(await this.publicClient.readContract({
      address: this.deployment.gate,
      abi: gateAbi,
      functionName: "clockSkew",
    }));
  }

  async isStateRegistered(roots: Roots): Promise<boolean> {
    const key = keccak256(encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [BigInt(roots.issued), BigInt(roots.revoked), BigInt(roots.root)],
    ));
    const stateRoot = await this.publicClient.readContract({
      address: this.deployment.gate,
      abi: gateAbi,
      functionName: "stateOf",
      args: [key],
    });
    return stateRoot !== 0n;
  }

  async rootsAccepted(roots: Roots): Promise<boolean> {
    const [issued, revoked, registeredRoot] = await Promise.all([
      this.publicClient.readContract({
        address: this.deployment.gate,
        abi: gateAbi,
        functionName: "issuedRootAccepted",
        args: [BigInt(roots.issued)],
      }),
      this.publicClient.readContract({
        address: this.deployment.revocations,
        abi: revocationsAbi,
        functionName: "rootAccepted",
        args: [BigInt(roots.revoked)],
      }),
      this.publicClient.readContract({
        address: this.deployment.registry,
        abi: registryAbi,
        functionName: "rootAccepted",
        args: [BigInt(roots.root)],
      }),
    ]);
    return issued && revoked && registeredRoot;
  }

  async simulateExecute(payload: ShadowpassPayload): Promise<void> {
    await this.publicClient.simulateContract({
      account: this.account,
      address: this.deployment.gate,
      abi: gateAbi,
      functionName: "execute",
      args: [
        payload.proof,
        payload.roots,
        BigInt(payload.nowTs),
        payload.action,
        payload.ct.map(BigInt),
        payload.budget,
        payload.memoChange,
      ] as any,
    });
  }

  async sendExecute(payload: ShadowpassPayload): Promise<TransactionResult> {
    return this.sender.write(() =>
      this.walletClient.writeContract({
        account: this.account,
        chain: null,
        address: this.deployment.gate,
        abi: gateAbi,
        functionName: "execute",
        args: [
          payload.proof,
          payload.roots,
          BigInt(payload.nowTs),
          payload.action,
          payload.ct.map(BigInt),
          payload.budget,
          payload.memoChange,
        ] as any,
      })
    );
  }

  async registerState(roots: Roots): Promise<TransactionResult> {
    return this.sender.write(() =>
      this.walletClient.writeContract({
        account: this.account,
        chain: null,
        address: this.deployment.gate,
        abi: gateAbi,
        functionName: "registerState",
        args: [BigInt(roots.issued), BigInt(roots.revoked), BigInt(roots.root)],
      })
    );
  }
}

export function revertName(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    name?: unknown;
    data?: { errorName?: unknown };
    cause?: unknown;
    message?: unknown;
  };
  if (typeof candidate.data?.errorName === "string") return candidate.data.errorName;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const match = message.match(/(?:reverted with|Error:)\s*([A-Za-z_][A-Za-z0-9_]*)\(/);
  if (match?.[1]) return match[1];
  return candidate.cause ? revertName(candidate.cause) : undefined;
}
