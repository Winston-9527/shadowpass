import {
  ChainState,
  decodeShadowEvent,
  shadowEventTopics,
  type ChainLogClient,
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

const registryAbi = parseAbi([
  "function domain() view returns (uint256)",
  "function leafOfNullifier(uint256 nf) view returns (uint256)",
]);
const revocationsAbi = parseAbi(["function window() view returns (uint64)"]);
const tokenAbi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
]);
const gateAbi = parseAbi([
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

type ExternalDepositWrite = {
  account: Address;
  address: Address;
  abi: typeof tokenAbi | typeof gateAbi;
  functionName: "approve" | "deposit";
  args: readonly unknown[];
  chain: null;
};

export interface SubmitExternalDepositOptions {
  account: Address;
  deployment: Deployment;
  input: ExternalDepositInput;
  writeContract(parameters: ExternalDepositWrite): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<{ status: string; blockNumber: bigint; logs: unknown[] }>;
}

export interface WalletSyncSnapshot {
  state: ChainState;
  logs: unknown[];
}

export class IncrementalShadowLogSync {
  private state?: ChainState;
  private cachedLogs: unknown[] = [];
  private pollPromise?: Promise<WalletSyncSnapshot>;

  constructor(
    private readonly client: Pick<ChainLogClient, "getLogs" | "getBlockNumber">,
    private readonly deployment: Deployment,
  ) {}

  poll(): Promise<WalletSyncSnapshot> {
    if (this.pollPromise) return this.pollPromise;
    const promise = this.pollOnce();
    this.pollPromise = promise;
    void promise.then(
      () => { if (this.pollPromise === promise) this.pollPromise = undefined; },
      () => { if (this.pollPromise === promise) this.pollPromise = undefined; },
    );
    return promise;
  }

  private async pollOnce(): Promise<WalletSyncSnapshot> {
    if (!this.client.getBlockNumber) throw new Error("chain log client must expose getBlockNumber");
    const latest = await this.client.getBlockNumber();
    // Rebuild only from a lost cursor or rollback; normal polls replay just the new block range.
    if (!this.state || latest < this.state.lastBlock) {
      const logs = await this.fetchLogs(BigInt(this.deployment.startBlock), latest);
      const state = ChainState.fromLogs(this.deployment, logs, { startBlock: this.deployment.startBlock });
      state.lastBlock = latest;
      this.state = state;
      this.cachedLogs = logs;
      return { state, logs: this.cachedLogs };
    }

    const fromBlock = this.state.lastBlock + 1n;
    if (fromBlock <= latest) {
      const logs = await this.fetchLogs(fromBlock, latest);
      try {
        this.state.replay(logs);
      } catch (error) {
        this.state = undefined;
        this.cachedLogs = [];
        throw error;
      }
      this.state.lastBlock = latest;
      this.cachedLogs.push(...logs);
    }
    return { state: this.state, logs: this.cachedLogs };
  }

  private async fetchLogs(fromBlock: bigint, latest: bigint): Promise<unknown[]> {
    const output: unknown[] = [];
    const range = 2_000n;
    for (let start = fromBlock; start <= latest; start += range) {
      const candidate = start + range - 1n;
      output.push(...await this.client.getLogs({
        address: [this.deployment.gate, this.deployment.registry, this.deployment.revocations, this.deployment.group],
        fromBlock: start,
        toBlock: candidate < latest ? candidate : latest,
        topics: [shadowEventTopics],
      }));
    }
    return output;
  }
}

export interface WalletGateway {
  poll(): Promise<WalletSyncSnapshot>;
  sync(): Promise<ChainState>;
  logs(): Promise<unknown[]>;
  blockTimestamps(blockNumbers: readonly bigint[]): Promise<Map<string, number>>;
  relay(action: "join" | "register" | "faucetDeposit" | "issue" | "transferBudget" | "registerState" | "revoke", args: Record<string, unknown>): Promise<RelayResult>;
  registryDomain(): Promise<bigint>;
  registryLeaf(nf: bigint): Promise<bigint>;
  revocationWindow(): Promise<bigint>;
  externalDeposit(input: ExternalDepositInput): Promise<ExternalDepositResult>;
}

export async function submitExternalDeposit(options: SubmitExternalDepositOptions): Promise<ExternalDepositResult> {
  const approveHash = await options.writeContract({
    account: options.account,
    address: options.deployment.token,
    abi: tokenAbi,
    functionName: "approve",
    args: [options.deployment.gate, options.input.q],
    chain: null,
  });
  await options.waitForReceipt(approveHash);
  const depositHash = await options.writeContract({
    account: options.account,
    address: options.deployment.gate,
    abi: gateAbi,
    functionName: "deposit",
    args: [options.input.proof, options.input.cm, options.input.q, memoHex(options.input.memo)],
    chain: null,
  });
  const receipt = await options.waitForReceipt(depositHash);
  if (receipt.status !== "success") throw new Error("external deposit transaction reverted");
  assertMemoInLogs(receipt.logs, options.input.note, options.input.memo);
  return { transaction: depositHash, blockNumber: receipt.blockNumber, logs: receipt.logs };
}

export async function waitForChainState(
  gateway: Pick<WalletGateway, "sync">,
  predicate: (state: ChainState) => boolean,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<ChainState> {
  const attempts = options.attempts ?? 80;
  const delayMs = options.delayMs ?? 750;
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
  private readonly blockTimeCache = new Map<string, number>();
  private readonly chainSync: IncrementalShadowLogSync;

  constructor(
    private readonly config: {
      rpcUrl: string;
      facilitatorUrl: string;
      deployment: Deployment;
    },
  ) {
    this.publicClient = createPublicClient({ transport: http(config.rpcUrl) }) as PublicClient;
    this.chainSync = new IncrementalShadowLogSync(this.publicClient, config.deployment);
  }

  poll(): Promise<WalletSyncSnapshot> {
    return this.chainSync.poll();
  }

  async sync(): Promise<ChainState> {
    return (await this.poll()).state;
  }

  async logs(): Promise<unknown[]> {
    return (await this.poll()).logs;
  }

  async blockTimestamps(blockNumbers: readonly bigint[]): Promise<Map<string, number>> {
    const output = new Map<string, number>();
    const missing = [...new Set(blockNumbers.map(String))]
      .filter((key) => !this.blockTimeCache.has(key));
    await Promise.all(missing.map(async (key) => {
      const block = await this.publicClient.getBlock({ blockNumber: BigInt(key) });
      this.blockTimeCache.set(key, Number(block.timestamp) * 1_000);
    }));
    for (const key of blockNumbers.map(String)) {
      const value = this.blockTimeCache.get(key);
      if (value !== undefined) output.set(key, value);
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

  async registryLeaf(nf: bigint): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.config.deployment.registry,
      abi: registryAbi,
      functionName: "leafOfNullifier",
      args: [nf],
    });
  }

  async revocationWindow(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.config.deployment.revocations,
      abi: revocationsAbi,
      functionName: "window",
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
    return submitExternalDeposit({
      account: account as Address,
      deployment: this.config.deployment,
      input,
      writeContract: (parameters) => walletClient.writeContract(parameters as any),
      waitForReceipt: (hash) => this.publicClient.waitForTransactionReceipt({ hash }),
    });
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
