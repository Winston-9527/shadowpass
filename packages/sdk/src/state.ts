import { decodeShadowEvent } from "./events.js";
import { IndexedMerkleTree, MerkleTree, stateRoot } from "./trees.js";
import type { Deployment } from "./types.js";

export interface ChainLogClient {
  getLogs(args: {
    address: string[];
    fromBlock: bigint;
    toBlock?: bigint;
  }): Promise<any[]>;
  getBlockNumber?(): Promise<bigint>;
}

export interface ChainStateOptions {
  startBlock?: bigint | number;
  toBlock?: bigint | number;
}

function asBigInt(value: unknown): bigint {
  return BigInt(value as any);
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (typeof value !== "string") throw new Error("event bytes must be hex");
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  const output = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < output.length; index += 1) output[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  return output;
}

export class ChainState {
  readonly issued = new MerkleTree();
  readonly rootTree = new MerkleTree();
  readonly notes = new MerkleTree();
  readonly group = new MerkleTree();
  readonly revoked = new IndexedMerkleTree();
  readonly memos = new Map<string, Uint8Array>();
  readonly spentNullifiers = new Set<string>();
  lastBlock = 0n;

  private client?: ChainLogClient;
  private deployment?: Deployment;
  private startBlock = 0n;
  private toBlock?: bigint;

  static async sync(client: ChainLogClient, deployment: Deployment, options: ChainStateOptions = {}): Promise<ChainState> {
    const state = new ChainState();
    state.client = client;
    state.deployment = deployment;
    state.startBlock = BigInt(options.startBlock ?? deployment.startBlock);
    state.toBlock = options.toBlock === undefined ? undefined : BigInt(options.toBlock);
    state.lastBlock = state.startBlock - 1n;
    await state.update();
    return state;
  }

  static fromLogs(deployment: Deployment, logs: any[], options: ChainStateOptions = {}): ChainState {
    const state = new ChainState();
    state.deployment = deployment;
    state.startBlock = BigInt(options.startBlock ?? deployment.startBlock);
    state.replay(logs);
    return state;
  }

  async update(): Promise<void> {
    if (!this.client || !this.deployment) throw new Error("ChainState.update requires sync(client, deployment)");
    const fromBlock = this.lastBlock + 1n;
    const toBlock = this.toBlock ?? (this.client.getBlockNumber ? await this.client.getBlockNumber() : undefined);
    const logs = await this.client.getLogs({
      address: [
        this.deployment.gate,
        this.deployment.registry,
        this.deployment.revocations,
        this.deployment.group,
      ],
      fromBlock,
      ...(toBlock === undefined ? {} : { toBlock }),
    });
    this.replay(logs);
    if (toBlock !== undefined) this.lastBlock = toBlock;
  }

  replay(logs: any[]): void {
    const ordered = [...logs].sort((left, right) => {
      const block = asBigInt(left.blockNumber ?? 0) - asBigInt(right.blockNumber ?? 0);
      if (block !== 0n) return block > 0n ? 1 : -1;
      return Number((left.logIndex ?? left.index ?? 0) - (right.logIndex ?? right.index ?? 0));
    });
    for (const log of ordered) {
      const event = decodeShadowEvent(log);
      if (!event) continue;
      const args = event.args;
      switch (event.name) {
        case "Issued": {
          const index = Number(asBigInt(args.index));
          this.issued.insert(asBigInt(args.certHash));
          if (index !== this.issued.size - 1) throw new Error("Issued event index does not match issued tree");
          this.assertRoot("issued", args.newRoot, this.issued.root);
          break;
        }
        case "Registered": {
          this.rootTree.insert(asBigInt(args.leaf0));
          this.assertRoot("root", args.root, this.rootTree.root);
          break;
        }
        case "Replaced": {
          const leaf = asBigInt(args.leaf0);
          if (args.index !== undefined) {
            this.rootTree.update(Number(asBigInt(args.index)), leaf);
          } else {
            this.rootTree.insert(leaf);
          }
          this.assertRoot("root", args.root, this.rootTree.root);
          break;
        }
        case "Revoked": {
          this.revoked.insert(asBigInt(args.entry));
          this.assertRoot("revoked", args.newRoot, this.revoked.root);
          break;
        }
        case "Joined": {
          this.group.insert(asBigInt(args.commitment));
          this.assertRoot("group", args.root, this.group.root);
          break;
        }
        case "NoteInserted": {
          const cm = asBigInt(args.cm);
          this.notes.insert(cm);
          this.assertRoot("note", args.newRoot, this.notes.root);
          break;
        }
        case "NoteMemo":
          this.memos.set(asBigInt(args.cm).toString(), asBytes(args.memo));
          break;
        case "Executed":
          this.spentNullifiers.add(asBigInt(args.budgetNf).toString());
          break;
        case "BudgetSpent":
          this.spentNullifiers.add(asBigInt(args.nullifier).toString());
          break;
        case "OwnerCiphertext":
          break;
      }
      if (log.blockNumber !== undefined) this.lastBlock = asBigInt(log.blockNumber);
    }
  }

  roots(): {
    issued: bigint;
    revoked: bigint;
    root: bigint;
    note: bigint;
    group: bigint;
    state: bigint;
  } {
    return {
      issued: this.issued.root,
      revoked: this.revoked.root,
      root: this.rootTree.root,
      note: this.notes.root,
      group: this.group.root,
      state: stateRoot(this.issued.root, this.revoked.root, this.rootTree.root),
    };
  }

  private assertRoot(name: string, eventRoot: unknown, localRoot: bigint): void {
    if (eventRoot !== undefined && asBigInt(eventRoot) !== localRoot) {
      throw new Error(`${name} root mismatch after event replay`);
    }
  }
}
