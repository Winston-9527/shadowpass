import type { Address, Hex } from "viem";
import { decodeShadowEvent, isKnownShadowEventLog, shadowEventTopics } from "./events.js";
import { IndexedMerkleTree, MerkleTree, stateRoot } from "./trees.js";
import type { Deployment } from "./types.js";

export interface ChainLogClient {
  getLogs(args: {
    address: Address[];
    fromBlock: bigint;
    toBlock?: bigint;
    topics?: readonly (Hex | readonly Hex[] | null)[];
  }): Promise<any[]>;
  getBlockNumber?(): Promise<bigint>;
}

export interface ChainStateOptions {
  startBlock?: bigint | number;
  toBlock?: bigint | number;
  maxBlockRange?: bigint | number;
  reorgWindow?: number;
}

function asBigInt(value: unknown, name: string): bigint {
  if (value === undefined || value === null) throw new Error(`missing event argument: ${name}`);
  try {
    return BigInt(value as any);
  } catch {
    throw new Error(`invalid event argument: ${name}`);
  }
}

function asBytes(value: unknown, name: string): Uint8Array {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (typeof value !== "string" || !/^0x[0-9a-f]*$/i.test(value) || value.length % 2 !== 0) {
    throw new Error(`invalid event bytes: ${name}`);
  }
  const normalized = value.slice(2);
  const output = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
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
  readonly registeredStateRoots = new Set<string>();
  lastBlock = 0n;

  private client?: ChainLogClient;
  private deployment?: Deployment;
  private startBlock = 0n;
  private toBlock?: bigint;
  private maxBlockRange = 2_000n;
  private reorgWindow = 12;
  private updatePromise?: Promise<void>;

  static async sync(client: ChainLogClient, deployment: Deployment, options: ChainStateOptions = {}): Promise<ChainState> {
    const state = new ChainState();
    state.client = client;
    state.deployment = deployment;
    state.startBlock = BigInt(options.startBlock ?? deployment.startBlock);
    state.toBlock = options.toBlock === undefined ? undefined : BigInt(options.toBlock);
    state.maxBlockRange = BigInt(options.maxBlockRange ?? 2_000);
    state.reorgWindow = options.reorgWindow ?? 12;
    if (state.maxBlockRange <= 0n) throw new Error("maxBlockRange must be positive");
    if (state.reorgWindow < 0) throw new Error("reorgWindow must be non-negative");
    state.lastBlock = state.startBlock - 1n;
    await state.update();
    return state;
  }

  static fromLogs(deployment: Deployment, logs: any[], options: ChainStateOptions = {}): ChainState {
    const state = new ChainState();
    state.deployment = deployment;
    state.startBlock = BigInt(options.startBlock ?? deployment.startBlock);
    state.maxBlockRange = BigInt(options.maxBlockRange ?? 2_000);
    state.reorgWindow = options.reorgWindow ?? 12;
    state.replay(logs);
    return state;
  }

  update(): Promise<void> {
    if (this.updatePromise) return this.updatePromise;
    const promise = this.runUpdate();
    this.updatePromise = promise;
    promise.then(
      () => { if (this.updatePromise === promise) this.updatePromise = undefined; },
      () => { if (this.updatePromise === promise) this.updatePromise = undefined; },
    );
    return promise;
  }

  private async runUpdate(): Promise<void> {
    if (!this.client || !this.deployment) throw new Error("ChainState.update requires sync(client, deployment)");
    const latest = this.toBlock ?? (this.client.getBlockNumber ? await this.client.getBlockNumber() : undefined);
    if (latest === undefined) throw new Error("toBlock or getBlockNumber is required");
    const staged = new ChainState();
    staged.client = this.client;
    staged.deployment = this.deployment;
    staged.startBlock = this.startBlock;
    staged.toBlock = this.toBlock;
    staged.maxBlockRange = this.maxBlockRange;
    staged.reorgWindow = this.reorgWindow;
    // Replaying the full range on every update is stronger than the required 12-block reorg rewind.
    for (let fromBlock = this.startBlock; fromBlock <= latest; fromBlock += this.maxBlockRange) {
      const candidate = fromBlock + this.maxBlockRange - 1n;
      const toBlock = candidate < latest ? candidate : latest;
      const logs = await this.client.getLogs({
        address: [
          this.deployment.gate,
          this.deployment.registry,
          this.deployment.revocations,
          this.deployment.group,
        ],
        fromBlock,
        toBlock,
        topics: [shadowEventTopics],
      });
      staged.replay(logs);
    }
    staged.lastBlock = latest;
    this.replaceFrom(staged);
  }

  replay(logs: any[]): void {
    const ordered = [...logs].sort((left, right) => {
      const leftBlock = asBigInt(left.blockNumber ?? 0, "blockNumber");
      const rightBlock = asBigInt(right.blockNumber ?? 0, "blockNumber");
      if (leftBlock !== rightBlock) return leftBlock > rightBlock ? 1 : -1;
      return Number((left.logIndex ?? left.index ?? 0) - (right.logIndex ?? right.index ?? 0));
    });
    for (const log of ordered) {
      if (!isKnownShadowEventLog(log)) continue;
      const event = decodeShadowEvent(log, true);
      if (!event) throw new Error("event decoder returned no event in strict mode");
      const args = event.args;
      switch (event.name) {
        case "Issued": {
          const index = Number(asBigInt(args.index, "Issued.index"));
          const expectedIndex = this.issued.size;
          this.issued.insert(asBigInt(args.certHash, "Issued.certHash"));
          if (index !== expectedIndex) throw new Error(`Issued index mismatch: expected ${expectedIndex}, got ${index}`);
          this.assertRoot("issued", args.root, this.issued.root);
          break;
        }
        case "Registered": {
          const index = Number(asBigInt(args.index, "Registered.index"));
          const expectedIndex = this.rootTree.size;
          this.rootTree.insert(asBigInt(args.leaf0, "Registered.leaf0"));
          if (index !== expectedIndex) throw new Error(`Registered index mismatch: expected ${expectedIndex}, got ${index}`);
          this.assertRoot("root", args.root, this.rootTree.root);
          break;
        }
        case "Replaced": {
          const index = Number(asBigInt(args.index, "Replaced.index"));
          const oldLeaf = asBigInt(args.oldLeaf0, "Replaced.oldLeaf0");
          const newLeaf = asBigInt(args.newLeaf0, "Replaced.newLeaf0");
          if (this.rootTree.leaves[index] !== oldLeaf) throw new Error(`Replaced old leaf mismatch at ${index}`);
          this.rootTree.update(index, newLeaf);
          this.assertRoot("root", args.root, this.rootTree.root);
          break;
        }
        case "Revoked": {
          const index = Number(asBigInt(args.index, "Revoked.index"));
          const expectedIndex = this.revoked.leaves.length;
          const oldRoot = asBigInt(args.oldRoot, "Revoked.oldRoot");
          if (index !== expectedIndex) throw new Error(`Revoked index mismatch: expected ${expectedIndex}, got ${index}`);
          if (oldRoot !== this.revoked.root) throw new Error("Revoked oldRoot mismatch");
          this.revoked.insert(asBigInt(args.entry, "Revoked.entry"));
          this.assertRoot("revoked", args.newRoot, this.revoked.root);
          break;
        }
        case "Joined": {
          const index = Number(asBigInt(args.index, "Joined.index"));
          const expectedIndex = this.group.size;
          if (index !== expectedIndex) throw new Error(`Joined index mismatch: expected ${expectedIndex}, got ${index}`);
          this.group.insert(asBigInt(args.commitment, "Joined.commitment"));
          this.assertRoot("group", args.root, this.group.root);
          break;
        }
        case "NoteInserted": {
          const index = Number(asBigInt(args.index, "NoteInserted.index"));
          const expectedIndex = this.notes.size;
          this.notes.insert(asBigInt(args.cm, "NoteInserted.cm"));
          if (index !== expectedIndex) throw new Error(`NoteInserted index mismatch: expected ${expectedIndex}, got ${index}`);
          this.assertRoot("note", args.root, this.notes.root);
          break;
        }
        case "NoteMemo":
          this.memos.set(asBigInt(args.cm, "NoteMemo.cm").toString(), asBytes(args.memo, "NoteMemo.memo"));
          break;
        case "StateRegistered": {
          const issued = asBigInt(args.issued, "StateRegistered.issued");
          const revoked = asBigInt(args.revoked, "StateRegistered.revoked");
          const root = asBigInt(args.root, "StateRegistered.root");
          const registered = asBigInt(args.stateRoot, "StateRegistered.stateRoot");
          if (stateRoot(issued, revoked, root) !== registered) throw new Error("StateRegistered stateRoot mismatch");
          this.registeredStateRoots.add(registered.toString());
          break;
        }
        case "Executed":
          this.spentNullifiers.add(asBigInt(args.budgetNf, "Executed.budgetNf").toString());
          break;
        case "NullifierSpent":
          this.spentNullifiers.add(asBigInt(args.nullifier, "NullifierSpent.nullifier").toString());
          break;
        case "OwnerCiphertext":
          break;
      }
      if (log.blockNumber !== undefined) this.lastBlock = asBigInt(log.blockNumber, "blockNumber");
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

  private reset(): void {
    this.issued.reset();
    this.rootTree.reset();
    this.notes.reset();
    this.group.reset();
    this.revoked.reset();
    this.memos.clear();
    this.spentNullifiers.clear();
    this.registeredStateRoots.clear();
    this.lastBlock = this.startBlock - 1n;
  }

  private replaceFrom(other: ChainState): void {
    this.issued.copyFrom(other.issued);
    this.rootTree.copyFrom(other.rootTree);
    this.notes.copyFrom(other.notes);
    this.group.copyFrom(other.group);
    this.revoked.copyFrom(other.revoked);
    this.memos.clear();
    for (const [key, value] of other.memos) this.memos.set(key, Uint8Array.from(value));
    this.spentNullifiers.clear();
    for (const value of other.spentNullifiers) this.spentNullifiers.add(value);
    this.registeredStateRoots.clear();
    for (const value of other.registeredStateRoots) this.registeredStateRoots.add(value);
    this.lastBlock = other.lastBlock;
  }

  private assertRoot(name: string, eventRoot: unknown, localRoot: bigint): void {
    if (eventRoot === undefined) throw new Error(`${name} event is missing root`);
    if (asBigInt(eventRoot, `${name}.root`) !== localRoot) throw new Error(`${name} root mismatch after event replay`);
  }
}
