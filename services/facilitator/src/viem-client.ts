import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  DepositRelayRequest,
  GateClient,
  GateExecuteRequest,
  RegisterRelayRequest,
  TransferBudgetRelayRequest,
  WalletRelayClient,
} from "@shadowpass/x402";

const proofComponents = [
  { name: "a", type: "uint256[2]" },
  { name: "b", type: "uint256[2][2]" },
  { name: "c", type: "uint256[2]" },
] as const;

const gateAbi = [
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
    name: "issue",
    stateMutability: "nonpayable",
    inputs: [{ name: "certHash", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "tuple", components: proofComponents },
      { name: "cm", type: "uint256" },
      { name: "q", type: "uint256" },
      { name: "memo", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transferBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "tuple", components: proofComponents },
      { name: "noteRoot", type: "uint256" },
      { name: "revokedRoot", type: "uint256" },
      { name: "nullifier", type: "uint256" },
      { name: "cm1", type: "uint256" },
      { name: "cm2", type: "uint256" },
      { name: "memo1", type: "bytes" },
      { name: "memo2", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const registryAbi = parseAbi([
  "function register((uint256[2] a,uint256[2][2] b,uint256[2] c) proof,uint256 groupRoot,uint256 nf,uint256 leaf0,uint256[] siblingNodes)",
] as const);

const groupAbi = parseAbi(["function join(uint256 commitment)"] as const);

export interface ViemClientOptions {
  rpcUrl: string;
  privateKey: Hex;
  gate: Address;
  registry?: Address;
  group?: Address;
  confirmations?: number;
}

function clients(options: ViemClientOptions) {
  const account = privateKeyToAccount(options.privateKey);
  const transport = http(options.rpcUrl);
  return {
    account,
    publicClient: createPublicClient({ transport }),
    walletClient: createWalletClient({ account, transport }),
  };
}

export function createViemGateClient(options: ViemClientOptions): GateClient {
  const { account, publicClient, walletClient } = clients(options);
  return {
    async simulateExecute(request: GateExecuteRequest) {
      await publicClient.simulateContract({
        account,
        address: options.gate,
        abi: gateAbi,
        functionName: "execute",
        args: [request.proof, request.roots, BigInt(request.nowTs), request.action, request.ct.map(BigInt), request.budget, request.memoChange] as any,
      });
    },
    async sendExecute(request: GateExecuteRequest) {
      return walletClient.writeContract({
        account,
        chain: null,
        address: options.gate,
        abi: gateAbi,
        functionName: "execute",
        args: [request.proof, request.roots, BigInt(request.nowTs), request.action, request.ct.map(BigInt), request.budget, request.memoChange] as any,
      });
    },
    async waitForConfirmation(transaction: Hex) {
      await publicClient.waitForTransactionReceipt({ hash: transaction, confirmations: options.confirmations ?? 1 });
    },
  };
}

export function createViemWalletRelayClient(options: ViemClientOptions): WalletRelayClient {
  if (!options.registry || !options.group) {
    throw new Error("registry and group addresses are required for wallet relay");
  }
  const { account, publicClient, walletClient } = clients(options);
  const wait = async (hash: Hex) => {
    await publicClient.waitForTransactionReceipt({ hash, confirmations: options.confirmations ?? 1 });
    return hash;
  };
  const send = async (
    address: Address,
    abi: typeof gateAbi | typeof registryAbi | typeof groupAbi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<Hex> => {
    const hash = await walletClient.writeContract({
      account,
      chain: null,
      address,
      abi: abi as any,
      functionName: functionName as never,
      args: args as never,
    });
    return wait(hash);
  };
  return {
    join: (commitment) => send(options.group!, groupAbi, "join", [BigInt(commitment)]),
    issue: (certHash) => send(options.gate, gateAbi, "issue", [BigInt(certHash)]),
    register: (request: RegisterRelayRequest) =>
      send(options.registry!, registryAbi, "register", [
        request.proof,
        BigInt(request.groupRoot),
        BigInt(request.nf),
        BigInt(request.leaf0),
        request.siblingNodes.map(BigInt),
      ]),
    deposit: (request: DepositRelayRequest) =>
      send(options.gate, gateAbi, "deposit", [request.proof, BigInt(request.cm), BigInt(request.q), request.memo]),
    transferBudget: (request: TransferBudgetRelayRequest) =>
      send(options.gate, gateAbi, "transferBudget", [
        request.proof,
        BigInt(request.noteRoot),
        BigInt(request.revokedRoot),
        BigInt(request.nullifier),
        BigInt(request.cm1),
        BigInt(request.cm2),
        request.memo1,
        request.memo2,
      ]),
  };
}
