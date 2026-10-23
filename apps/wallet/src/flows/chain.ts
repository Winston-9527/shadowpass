import {
  ChainState,
  decodeShadowEvent,
  shadowEventTopics,
  type Deployment,
  type Hex,
  type Note,
} from "@shadowpass/sdk";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
  type Address,
  type EIP1193Provider,
  type PublicClient,
} from "viem";
import { assertMemoInLogs, memoHex } from "./memo";
import type { CalldataProof, RelayResult } from "./types";

const registryAbi = parseAbi(["function domain() view returns (uint256)"]);
const tokenAbi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function deposit((uint256[2] a,uint256[2][2] b,uint256[2] c) proof,uint256 cm,uint256 q,bytes memo)",
]);

export interface ExternalDepositInput {
  proof: CalldataProof;
  cm: bigint;
  q: bigint;
  note: Note;
  memo: Uint8Array;
}

export interface ExternalDepositResult {
  transaction: Hex;
  blockNumber: bigint;
  logs: unknown[];
}

export interface WalletGateway {
  sync(): Promise<ChainState>;
  logs(): Promise<unknown[]>;
  relay(action: "join" | "register" | "faucetDeposit" | "issue" | "transferBudget" | "registerState", args: Record<string, unknown>): Promise<RelayResult>;
  registryDomain(): Promise<bigint>;
  externalDeposit(input: ExternalDepositInput): Promise<ExternalDepositResult>;
}

export async function waitForChainState(
  gateway: Pick<WalletGateway, "sync">,
  predicate: (state: ChainState) => boolean,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<ChainState> {
  const attempts = options.attempts ?? 20;
  const delayMs = options.delayMs ?? 250;
  let state = await gateway.sync();
  for (let attempt = 1; attempt < attempts && !predicate(state); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    state = await gateway.sync();
  }
  return state;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export class BrowserWalletGateway implements WalletGateway {
  private readonly publicClient: PublicClient;

  constructor(
    private readonly config: {
      rpcUrl: string;
      facilitatorUrl: string;
      deployment: Deployment;
    },
  ) {
    this.publicClient = createPublicClient({ transport: http(config.rpcUrl) }) as PublicClient;
  }

  sync(): Promise<ChainState> {
    return ChainState.sync(this.publicClient, this.config.deployment);
  }

  async logs(): Promise<unknown[]> {
    const latest = await this.publicClient.getBlockNumber();
    const output: unknown[] = [];
    const range = 2_000n;
    for (let fromBlock = BigInt(this.config.deployment.startBlock); fromBlock <= latest; fromBlock += range) {
      const candidate = fromBlock + range - 1n;
      output.push(...await (this.publicClient as any).getLogs({
        address: [
          this.config.deployment.gate,
          this.config.deployment.registry,
          this.config.deployment.revocations,
          this.config.deployment.group,
        ],
        fromBlock,
        toBlock: candidate < latest ? candidate : latest,
        topics: [shadowEventTopics],
      }));
    }
    return output;
  }

  async registryDomain(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.config.deployment.registry,
      abi: registryAbi,
      functionName: "domain",
    });
  }

  async relay(action: Parameters<WalletGateway["relay"]>[0], args: Record<string, unknown>): Promise<RelayResult> {
    const response = await fetch(`${this.config.facilitatorUrl}/relay/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args }),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof body.error === "string" ? body.error : `relay ${action} failed (${response.status})`);
    }
    if (typeof body.transaction !== "string" || !/^0x[0-9a-f]{64}$/i.test(body.transaction) || !Array.isArray(body.logs)) {
      throw new Error(`relay ${action} returned an invalid receipt`);
    }
    return {
      transaction: body.transaction as Hex,
      blockNumber: String(body.blockNumber ?? "0"),
      logs: body.logs,
    };
  }

  async externalDeposit(input: ExternalDepositInput): Promise<ExternalDepositResult> {
    if (!window.ethereum) throw new Error("MetaMask or another EIP-1193 wallet is required");
    const walletClient = createWalletClient({ transport: custom(window.ethereum) });
    const [account] = await walletClient.requestAddresses();
    if (!account) throw new Error("external wallet did not return an account");
    const chainId = await walletClient.getChainId();
    if (chainId !== this.config.deployment.chainId) {
      await walletClient.switchChain({ id: this.config.deployment.chainId });
    }
    const approveHash = await walletClient.writeContract({
      account,
      address: this.config.deployment.token as Address,
      abi: tokenAbi,
      functionName: "approve",
      args: [this.config.deployment.gate as Address, input.q],
      chain: null,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    const depositHash = await walletClient.writeContract({
      account,
      address: this.config.deployment.token as Address,
      abi: tokenAbi,
      functionName: "deposit",
      args: [input.proof as any, input.cm, input.q, memoHex(input.memo)],
      chain: null,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: depositHash });
    if (receipt.status !== "success") throw new Error("external deposit transaction reverted");
    assertMemoInLogs(receipt.logs, input.note, input.memo);
    return { transaction: depositHash, blockNumber: receipt.blockNumber, logs: receipt.logs };
  }
}

export function noteMemoEvents(logs: unknown[]): Map<string, string> {
  const output = new Map<string, string>();
  for (const raw of logs) {
    const event = decodeShadowEvent(raw);
    if (event?.name === "NoteMemo") output.set(BigInt(event.args.cm as bigint).toString(), String(event.args.memo));
  }
  return output;
}
