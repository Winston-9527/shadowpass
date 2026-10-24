import {
  createNote,
  decodeNoteMemo,
  encodeNoteMemo,
  memoHex,
  noteCm,
  type ChainState,
  type Deployment,
  type Hex,
  type Note,
} from "@shadowpass/sdk";
import { createPublicClient, decodeEventLog, encodeAbiParameters, http, keccak256, parseAbi, toHex } from "viem";
import { z } from "zod";
import { SerialTaskQueue } from "./execution.js";
import { noteToStored } from "./notes.js";
import {
  PaymentBuilderError,
  ShadowpassAgentPaymentBuilder,
  type BuiltShadowpassPayment,
  type PaymentProver,
  type ShadowpassActionRequest,
} from "./payment-builder.js";
import type { AgentStore } from "./store.js";
import {
  McpToolError,
  type McpServices,
  type StoredTreasuryPosition,
  type TreasurySupplyRequest,
  type TreasurySupplyResult,
  type TreasuryWithdrawResult,
} from "./types.js";

export const TREASURY_SUPPLY_METHOD = keccak256(toHex("shadowpass.TREASURY_SUPPLY")).slice(0, 10) as Hex;
const MAX_UINT64 = 1n << 64n;

const treasuryAbi = parseAbi([
  "event PositionOpened(uint256 indexed positionId,address indexed vault,uint256 amount,uint256 shares,uint256 maturity,uint256 returnCm,uint256 expectedQ,bytes returnMemo)",
  "function quote(address vault,uint256 amount,uint256 term) view returns (uint256 expectedQ)",
  "function positions(uint256 positionId) view returns (address vault,uint256 shares,uint256 maturity,uint256 returnCm,uint256 expectedQ,bytes returnMemo,bool withdrawn)",
]);

const gateAbi = parseAbi([
  "event NoteInserted(uint256 indexed cm,uint256 index,uint256 root)",
  "event NoteMemo(uint256 indexed cm,bytes memo)",
]);

const relayResultSchema = z.object({
  transaction: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  blockNumber: z.string().regex(/^(0|[1-9][0-9]*)$/),
  logs: z.array(z.record(z.string(), z.unknown())),
});

export type RelayAction = "execute" | "treasuryWithdraw";

export interface TreasuryRelay {
  relay(action: RelayAction, args: Record<string, unknown>): Promise<z.infer<typeof relayResultSchema>>;
}

export interface OnChainTreasuryPosition {
  vault: string;
  shares: bigint;
  maturity: bigint;
  returnCm: bigint;
  expectedQ: bigint;
  returnMemo: Hex;
  withdrawn: boolean;
}

export interface TreasuryChain {
  latestTimestamp(): Promise<bigint>;
  quote(vault: string, amount: bigint, term: bigint): Promise<bigint>;
  position(positionId: bigint): Promise<OnChainTreasuryPosition | undefined>;
  positionLogs(): Promise<unknown[]>;
  transactionLogs(tx: string): Promise<unknown[]>;
}

type TreasuryBuilder = {
  buildAction(request: ShadowpassActionRequest): Promise<unknown>;
  readonly lastBuiltPayment?: BuiltShadowpassPayment;
};

export interface TreasuryServiceOptions {
  store: AgentStore;
  deployment: Deployment;
  state: () => ChainState | undefined;
  maxPayment: bigint;
  rpcUrl?: string;
  chain?: TreasuryChain;
  relay?: TreasuryRelay;
  fetch?: typeof globalThis.fetch;
  prover?: PaymentProver;
  queue?: SerialTaskQueue;
  builderFactory?: (maxAmount: bigint) => TreasuryBuilder;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function asBigInt(value: unknown, name: string): bigint {
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    throw new McpToolError("treasury_invalid_response", `${name} is not an integer`);
  }
}

function mapRelayError(error: string): string {
  if (error === "rate_limited") return "treasury_rate_limited";
  if (error === "invalid_request") return "treasury_request_invalid";
  if (!error.startsWith("simulation_failed:")) return "treasury_relay_failed";
  const revert = error.slice("simulation_failed:".length);
  const codes: Readonly<Record<string, string>> = {
    VaultNotAllowed: "treasury_vault_not_allowed",
    UnknownPosition: "treasury_position_not_found",
    AlreadyWithdrawn: "treasury_already_withdrawn",
    BeforeMaturity: "treasury_not_matured",
    ExpectedQTooHigh: "treasury_quote_changed",
    BadField: "treasury_invalid_quote",
    UnknownMethod: "treasury_invalid_method",
  };
  return codes[revert] ?? "treasury_transaction_rejected";
}

class HttpTreasuryRelay implements TreasuryRelay {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof globalThis.fetch,
  ) {}

  async relay(action: RelayAction, args: Record<string, unknown>): Promise<z.infer<typeof relayResultSchema>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/relay/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ args }),
      });
    } catch {
      throw new McpToolError("treasury_backend_unavailable", "treasury_backend_unavailable");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new McpToolError("treasury_invalid_response", "treasury_invalid_response");
    }
    if (!response.ok) {
      const error = typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).error === "string"
        ? String((body as Record<string, unknown>).error)
        : "relay_failed";
      const code = mapRelayError(error);
      throw new McpToolError(code, code);
    }
    const parsed = relayResultSchema.safeParse(body);
    if (!parsed.success) throw new McpToolError("treasury_invalid_response", "treasury_invalid_response");
    return parsed.data;
  }
}

class ViemTreasuryChain implements TreasuryChain {
  private readonly client;

  constructor(
    rpcUrl: string,
    private readonly deployment: Deployment,
  ) {
    this.client = createPublicClient({ transport: http(rpcUrl) });
  }

  async latestTimestamp(): Promise<bigint> {
    return (await this.client.getBlock({ blockTag: "latest" })).timestamp;
  }

  async quote(vault: string, amount: bigint, term: bigint): Promise<bigint> {
    return this.client.readContract({
      address: this.deployment.treasury,
      abi: treasuryAbi,
      functionName: "quote",
      args: [vault as Hex, amount, term],
    });
  }

  async position(positionId: bigint): Promise<OnChainTreasuryPosition | undefined> {
    const result = await this.client.readContract({
      address: this.deployment.treasury,
      abi: treasuryAbi,
      functionName: "positions",
      args: [positionId],
    }) as readonly [string, bigint, bigint, bigint, bigint, Hex, boolean];
    if (sameAddress(result[0], "0x0000000000000000000000000000000000000000")) return undefined;
    return {
      vault: result[0],
      shares: result[1],
      maturity: result[2],
      returnCm: result[3],
      expectedQ: result[4],
      returnMemo: result[5],
      withdrawn: result[6],
    };
  }

  async positionLogs(): Promise<unknown[]> {
    return this.client.getContractEvents({
      address: this.deployment.treasury,
      abi: treasuryAbi,
      eventName: "PositionOpened",
      fromBlock: BigInt(this.deployment.startBlock),
      toBlock: "latest",
    });
  }

  async transactionLogs(tx: string): Promise<unknown[]> {
    const receipt = await this.client.getTransactionReceipt({ hash: tx as Hex });
    return [...receipt.logs];
  }
}

function builderError(error: unknown): McpToolError {
  if (error instanceof McpToolError) return error;
  if (error instanceof PaymentBuilderError) {
    if (error.code === "invalid_payment_amount") return new McpToolError("invalid_amount", "invalid_amount");
    return new McpToolError(error.code, error.code);
  }
  return new McpToolError("treasury_proof_failed", "treasury_proof_failed");
}

function uniqueLogs(...groups: unknown[][]): unknown[] {
  const seen = new Set<string>();
  const output: unknown[] = [];
  for (const log of groups.flat()) {
    if (!log || typeof log !== "object") continue;
    const value = log as Record<string, unknown>;
    const key = `${String(value.transactionHash ?? "")}:${String(value.logIndex ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(log);
  }
  return output;
}

function decodePositionOpened(log: unknown): { positionId: bigint; vault: string; amount: bigint; maturity: bigint; returnCm: bigint; expectedQ: bigint; returnMemo: Hex } | undefined {
  const raw = log as { topics?: unknown; data?: unknown };
  if (!Array.isArray(raw.topics) || typeof raw.data !== "string") return undefined;
  try {
    const decoded = decodeEventLog({ abi: treasuryAbi, eventName: "PositionOpened", topics: raw.topics as [Hex, ...Hex[]], data: raw.data as Hex });
    const args = decoded.args as unknown as Record<string, unknown>;
    return {
      positionId: asBigInt(args.positionId, "positionId"),
      vault: String(args.vault),
      amount: asBigInt(args.amount, "amount"),
      maturity: asBigInt(args.maturity, "maturity"),
      returnCm: asBigInt(args.returnCm, "returnCm"),
      expectedQ: asBigInt(args.expectedQ, "expectedQ"),
      returnMemo: String(args.returnMemo) as Hex,
    };
  } catch {
    return undefined;
  }
}

async function recoverReturnedNote(
  store: AgentStore,
  logs: unknown[],
  position: StoredTreasuryPosition,
): Promise<Note | undefined> {
  const inserted = new Set<string>();
  let recovered: Note | undefined;
  for (const log of logs) {
    const raw = log as { topics?: unknown; data?: unknown };
    if (!Array.isArray(raw.topics) || typeof raw.data !== "string") continue;
    for (const eventName of ["NoteInserted", "NoteMemo"] as const) {
      try {
        const decoded = decodeEventLog({ abi: gateAbi, eventName, topics: raw.topics as [Hex, ...Hex[]], data: raw.data as Hex });
        const args = decoded.args as unknown as Record<string, unknown>;
        const cm = asBigInt(args.cm, "cm").toString();
        if (eventName === "NoteInserted") inserted.add(cm);
        if (eventName === "NoteMemo" && cm === position.returnCm) {
          const note = await decodeNoteMemo(String(args.memo) as Hex, store.boxPrivateKey);
          if (note && noteCm(note).toString() === position.returnCm) recovered = note;
        }
      } catch {
        // Other logs in the receipt are unrelated to note recovery.
      }
    }
  }
  return recovered && inserted.has(position.returnCm) ? recovered : undefined;
}

export class ShadowpassTreasuryService implements NonNullable<McpServices["treasury"]> {
  private readonly queue: SerialTaskQueue;
  private readonly chain: TreasuryChain | undefined;
  private readonly relay: TreasuryRelay | undefined;
  private readonly builderFactory: (maxAmount: bigint) => TreasuryBuilder;

  constructor(private readonly options: TreasuryServiceOptions) {
    if (options.maxPayment <= 0n) throw new Error("maxPayment must be positive");
    this.queue = options.queue ?? new SerialTaskQueue();
    const rpcUrl = options.rpcUrl ?? process.env.SHADOWPASS_RPC_URL ?? process.env.ANVIL_RPC_URL;
    this.chain = options.chain ?? (rpcUrl ? new ViemTreasuryChain(rpcUrl, options.deployment) : undefined);
    const facilitator = process.env.SHADOWPASS_FACILITATOR ?? options.deployment.facilitator;
    this.relay = options.relay ?? (facilitator
      ? new HttpTreasuryRelay(facilitator, options.fetch ?? globalThis.fetch.bind(globalThis))
      : undefined);
    this.builderFactory = options.builderFactory ?? ((maxAmount) => {
      const state = options.state();
      if (!state) throw new McpToolError("chain_state_unavailable", "chain_state_unavailable");
      return new ShadowpassAgentPaymentBuilder({
        store: options.store,
        deployment: options.deployment,
        state,
        blockTimestamp: async () => {
          try {
            return await this.requireChain().latestTimestamp();
          } catch {
            throw new PaymentBuilderError("rpc_unavailable");
          }
        },
        maxAmount,
        prover: options.prover,
      });
    });
  }

  supply(request: TreasurySupplyRequest): Promise<TreasurySupplyResult> {
    return this.queue.run(() => this.supplyOnce(request));
  }

  withdraw(positionId: bigint): Promise<TreasuryWithdrawResult> {
    return this.queue.run(() => this.withdrawOnce(positionId));
  }

  status(): Promise<Record<string, unknown>> {
    return this.queue.run(() => this.statusOnce());
  }

  private requireChain(): TreasuryChain {
    if (!this.chain) throw new McpToolError("rpc_unavailable", "rpc_unavailable");
    return this.chain;
  }

  private requireRelay(): TreasuryRelay {
    if (!this.relay) throw new McpToolError("treasury_backend_unavailable", "treasury_backend_unavailable");
    return this.relay;
  }

  private async supplyOnce(request: TreasurySupplyRequest): Promise<TreasurySupplyResult> {
    if (!sameAddress(request.vault, this.options.deployment.vault)) {
      throw new McpToolError("treasury_vault_not_allowed", "treasury_vault_not_allowed");
    }
    if (request.amount <= 0n) throw new McpToolError("invalid_amount", "invalid_amount");
    if (request.amount > this.options.maxPayment) throw new McpToolError("spend_limit", "spend_limit");
    if (request.termSeconds <= 0n) throw new McpToolError("invalid_term", "invalid_term");
    const chain = this.requireChain();
    const relay = this.requireRelay();
    const state = this.options.state();
    if (!state) throw new McpToolError("chain_state_unavailable", "chain_state_unavailable");
    const bundle = await this.options.store.loadBundle();
    if (!bundle) throw new McpToolError("not_paired", "not_paired");

    let expectedQ: bigint;
    try {
      expectedQ = await chain.quote(request.vault, request.amount, request.termSeconds);
    } catch {
      throw new McpToolError("treasury_quote_unavailable", "treasury_quote_unavailable");
    }
    if (expectedQ <= 0n || expectedQ >= MAX_UINT64) {
      throw new McpToolError("treasury_invalid_quote", "treasury_invalid_quote");
    }
    const returnNote = createNote(this.options.store.holder, expectedQ, bundle.chain.map((cert) => BigInt(cert.hash)));
    const returnCm = noteCm(returnNote);
    const returnMemo = memoHex(await encodeNoteMemo(returnNote, this.options.store.boxPublicKey)) as Hex;
    const params = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
      [request.vault as Hex, request.termSeconds, returnCm, expectedQ, returnMemo],
    );

    let builder: TreasuryBuilder;
    try {
      builder = this.builderFactory(request.amount);
      await builder.buildAction({
        target: this.options.deployment.treasury,
        method: TREASURY_SUPPLY_METHOD,
        amount: request.amount,
        params,
        reqCap: 2n,
      });
    } catch (error) {
      throw builderError(error);
    }
    const built = builder.lastBuiltPayment;
    if (!built) throw new McpToolError("treasury_proof_failed", "treasury_proof_failed");
    const payload = built.payload;
    const result = await relay.relay("execute", {
      proof: payload.proof,
      roots: payload.roots,
      nowTs: payload.nowTs,
      action: payload.action,
      ct: payload.ct,
      budget: payload.budget,
      memoChange: payload.memoChange,
    });
    const warnings: string[] = [];
    try {
      state.replay(result.logs);
    } catch {
      warnings.push("chain_state_replay_failed");
    }
    state.spentNullifiers.add(built.budgetNf.toString());
    try {
      await this.options.store.addNote(noteToStored(built.change));
    } catch {
      warnings.push("local_change_save_failed");
    }
    let logs: unknown[] = result.logs;
    if (!logs.some((log) => decodePositionOpened(log))) {
      try {
        logs = uniqueLogs(logs, await chain.transactionLogs(result.transaction));
      } catch {
        throw new McpToolError("treasury_receipt_unavailable", "treasury_receipt_unavailable");
      }
    }
    const opened = logs.map(decodePositionOpened).find((event) => event !== undefined);
    if (
      !opened
      || !sameAddress(opened.vault, request.vault)
      || opened.amount !== request.amount
      || opened.expectedQ !== expectedQ
      || opened.returnCm !== returnCm
      || opened.returnMemo.toLowerCase() !== returnMemo.toLowerCase()
    ) {
      throw new McpToolError("treasury_position_mismatch", "treasury_position_mismatch");
    }
    const position: StoredTreasuryPosition = {
      positionId: opened.positionId.toString(),
      vault: request.vault,
      amount: request.amount.toString(),
      expectedQ: expectedQ.toString(),
      maturity: opened.maturity.toString(),
      returnCm: returnCm.toString(),
      returnMemo,
      returnNote: noteToStored(returnNote),
      openTx: result.transaction,
      openedAt: new Date().toISOString(),
      withdrawn: false,
    };
    await this.options.store.upsertTreasuryPosition(position);
    return {
      positionId: position.positionId,
      tx: result.transaction,
      budgetNf: built.budgetNf.toString(),
      expectedQ: position.expectedQ,
      returnCm: position.returnCm,
      maturity: position.maturity,
      resource: `treasury:${request.vault}`,
      timings: payload.timings,
      ...(warnings.length ? { warnings } : {}),
    };
  }

  private async withdrawOnce(positionId: bigint): Promise<TreasuryWithdrawResult> {
    if (positionId <= 0n) throw new McpToolError("invalid_position_id", "invalid_position_id");
    const chain = this.requireChain();
    const relay = this.requireRelay();
    const position = (await this.options.store.treasuryPositions())
      .find((candidate) => candidate.positionId === positionId.toString());
    if (!position) throw new McpToolError("treasury_position_not_found", "treasury_position_not_found");
    let onchain: OnChainTreasuryPosition | undefined;
    try {
      onchain = await chain.position(positionId);
    } catch {
      throw new McpToolError("treasury_state_unavailable", "treasury_state_unavailable");
    }
    if (!onchain) throw new McpToolError("treasury_position_not_found", "treasury_position_not_found");
    if (onchain.withdrawn || position.withdrawn) throw new McpToolError("treasury_already_withdrawn", "treasury_already_withdrawn");
    let now: bigint;
    try {
      now = await chain.latestTimestamp();
    } catch {
      throw new McpToolError("treasury_state_unavailable", "treasury_state_unavailable");
    }
    if (now < onchain.maturity) throw new McpToolError("treasury_not_matured", "treasury_not_matured");

    const result = await relay.relay("treasuryWithdraw", { positionId: position.positionId });
    const warnings: string[] = [];
    let logs: unknown[] = result.logs;
    let recoveredNote = await recoverReturnedNote(this.options.store, logs, position);
    if (!recoveredNote) {
      try {
        logs = uniqueLogs(logs, await chain.transactionLogs(result.transaction));
        recoveredNote = await recoverReturnedNote(this.options.store, logs, position);
      } catch {
        warnings.push("treasury_receipt_unavailable");
      }
    }
    if (recoveredNote) {
      try {
        await this.options.store.addNote(noteToStored(recoveredNote));
      } catch {
        warnings.push("local_return_note_save_failed");
      }
      try {
        this.options.state()?.replay(logs);
      } catch {
        warnings.push("chain_state_replay_failed");
      }
    } else {
      warnings.push("treasury_return_note_missing");
    }
    await this.options.store.upsertTreasuryPosition({ ...position, withdrawn: true, withdrawTx: result.transaction });
    return {
      positionId: position.positionId,
      tx: result.transaction,
      expectedQ: position.expectedQ,
      returnCm: position.returnCm,
      recovered: recoveredNote !== undefined,
      ...(warnings.length ? { warnings } : {}),
    };
  }

  private async statusOnce(): Promise<Record<string, unknown>> {
    const chain = this.requireChain();
    const local = await this.options.store.treasuryPositions();
    const positions = new Map(local.map((position) => [position.positionId, position]));
    let logs: unknown[];
    try {
      logs = await chain.positionLogs();
    } catch {
      throw new McpToolError("treasury_state_unavailable", "treasury_state_unavailable");
    }
    for (const log of logs) {
      const opened = decodePositionOpened(log);
      if (!opened || positions.has(opened.positionId.toString())) continue;
      const note = await decodeNoteMemo(opened.returnMemo, this.options.store.boxPrivateKey);
      if (!note || noteCm(note).toString() !== opened.returnCm.toString()) continue;
      if (note.own[0] !== this.options.store.holder.Ax || note.own[1] !== this.options.store.holder.Ay) continue;
      const recovered: StoredTreasuryPosition = {
        positionId: opened.positionId.toString(),
        vault: opened.vault,
        amount: opened.amount.toString(),
        expectedQ: opened.expectedQ.toString(),
        maturity: opened.maturity.toString(),
        returnCm: opened.returnCm.toString(),
        returnMemo: opened.returnMemo,
        returnNote: noteToStored(note),
        openTx: "",
        openedAt: new Date().toISOString(),
        withdrawn: false,
      };
      await this.options.store.upsertTreasuryPosition(recovered);
      positions.set(recovered.positionId, recovered);
    }
    const output: Array<Record<string, unknown>> = [];
    for (const position of positions.values()) {
      let onchain: OnChainTreasuryPosition | undefined;
      try {
        onchain = await chain.position(BigInt(position.positionId));
      } catch {
        throw new McpToolError("treasury_state_unavailable", "treasury_state_unavailable");
      }
      const withdrawn = onchain?.withdrawn ?? position.withdrawn;
      if (onchain?.withdrawn && !position.withdrawn) {
        await this.options.store.upsertTreasuryPosition({ ...position, withdrawn: true });
      }
      output.push({
        positionId: position.positionId,
        vault: onchain?.vault ?? position.vault,
        amount: position.amount,
        expectedQ: (onchain?.expectedQ ?? BigInt(position.expectedQ)).toString(),
        maturity: (onchain?.maturity ?? BigInt(position.maturity)).toString(),
        returnCm: (onchain?.returnCm ?? BigInt(position.returnCm)).toString(),
        withdrawn,
        openTx: position.openTx || undefined,
        withdrawTx: position.withdrawTx,
      });
    }
    return { positions: output };
  }
}

export function createShadowpassTreasuryService(
  options: TreasuryServiceOptions,
): NonNullable<McpServices["treasury"]> {
  return new ShadowpassTreasuryService(options);
}
