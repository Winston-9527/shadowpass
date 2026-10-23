import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon } from "./crypto.js";

export interface MerkleProof {
  root: bigint;
  leaf: bigint;
  index: number;
  siblings: bigint[];
  depth: number;
}

export interface NonMembershipWitness {
  keyFull: bigint;
  root: bigint;
  lowValue: bigint;
  lowNextIndex: bigint;
  lowNextValue: bigint;
  siblings: bigint[];
  bits: number[];
  lowIndex: number;
}

const hashPair = (left: bigint, right: bigint): bigint => poseidon[2]([left, right]);

export class MerkleTree {
  tree: LeanIMT<bigint>;

  constructor(leaves: bigint[] = []) {
    this.tree = new LeanIMT(hashPair, leaves);
  }

  get root(): bigint {
    return this.size === 0 ? 0n : this.tree.root;
  }

  get depth(): number {
    return this.tree.depth;
  }

  get size(): number {
    return this.tree.size;
  }

  get leaves(): bigint[] {
    return this.tree.leaves;
  }

  insert(leaf: bigint): void {
    this.tree.insert(leaf);
  }

  insertMany(leaves: bigint[]): void {
    this.tree.insertMany(leaves);
  }

  clear(): void {
    this.tree = new LeanIMT(hashPair);
  }

  update(index: number, leaf: bigint): void {
    this.tree.update(index, leaf);
  }

  indexOf(leaf: bigint): number {
    return this.tree.indexOf(leaf);
  }

  proof(leafOrIndex: bigint | number): MerkleProof {
    const index = typeof leafOrIndex === "bigint" ? this.tree.indexOf(leafOrIndex) : leafOrIndex;
    if (index < 0 || index >= this.size) throw new Error("leaf not in tree");
    const proof = this.tree.generateProof(index);
    return {
      root: proof.root,
      leaf: proof.leaf,
      index: proof.index,
      siblings: proof.siblings,
      depth: proof.siblings.length,
    };
  }

  clone(): MerkleTree {
    return MerkleTree.import(this.tree.export());
  }

  copyFrom(other: MerkleTree): void {
    this.tree = LeanIMT.import(hashPair, other.export(), (value) => BigInt(value));
  }

  export(): string {
    return this.tree.export();
  }

  static import(exported: string): MerkleTree {
    const tree = new MerkleTree();
    (tree as { tree: LeanIMT<bigint> }).tree = LeanIMT.import(hashPair, exported, (value) => BigInt(value));
    return tree;
  }

  reset(): void {
    this.clear();
  }
}

export const KEY_BITS = 252n;
export const truncateKey = (value: bigint): bigint => value & ((1n << KEY_BITS) - 1n);

interface IndexedLeaf {
  value: bigint;
  nextIndex: bigint;
  nextValue: bigint;
}

export class IndexedMerkleTree {
  readonly depth: number;
  readonly zero: bigint[];
  leaves: IndexedLeaf[];
  levels: Map<bigint, bigint>[];

  constructor(depth = 20, leaves?: IndexedLeaf[], levels?: Map<bigint, bigint>[]) {
    this.depth = depth;
    this.zero = [0n];
    for (let level = 0; level < depth; level += 1) this.zero.push(hashPair(this.zero[level]!, this.zero[level]!));
    this.leaves = leaves?.map((leaf) => ({ ...leaf })) ?? [];
    this.levels = levels?.map((level) => new Map(level)) ?? Array.from({ length: depth + 1 }, () => new Map());
    if (!leaves) this.setLeaf(0, { value: 0n, nextIndex: 0n, nextValue: 0n });
  }

  leafHash(leaf: IndexedLeaf): bigint {
    return poseidon[3]([leaf.value, leaf.nextIndex, leaf.nextValue]);
  }

  setLeaf(index: number, leaf: IndexedLeaf): void {
    this.leaves[index] = { ...leaf };
    let node = this.leafHash(leaf);
    let levelIndex = BigInt(index);
    this.levels[0]!.set(levelIndex, node);
    for (let level = 0; level < this.depth; level += 1) {
      const left = this.levels[level]!.get(levelIndex & ~1n) ?? this.zero[level]!;
      const right = this.levels[level]!.get(levelIndex | 1n) ?? this.zero[level]!;
      levelIndex >>= 1n;
      node = hashPair(left, right);
      this.levels[level + 1]!.set(levelIndex, node);
    }
  }

  get root(): bigint {
    return this.levels[this.depth]?.get(0n) ?? this.zero[this.depth]!;
  }

  has(value: bigint): boolean {
    return this.leaves.some((leaf) => leaf.value === value);
  }

  lowIndex(value: bigint): number {
    let best = -1;
    for (let index = 0; index < this.leaves.length; index += 1) {
      const candidate = this.leaves[index]!.value;
      if (candidate < value && (best < 0 || candidate > this.leaves[best]!.value)) best = index;
    }
    if (best < 0) throw new Error("no predecessor leaf");
    return best;
  }

  insert(key: bigint): boolean {
    const truncated = truncateKey(key);
    if (truncated === 0n) throw new Error("key zero is reserved");
    if (this.has(truncated)) return false;
    if (this.leaves.length >= 2 ** this.depth) throw new Error("tree full");
    const lowIndex = this.lowIndex(truncated);
    const low = this.leaves[lowIndex]!;
    const nextIndex = this.leaves.length;
    this.setLeaf(nextIndex, { value: truncated, nextIndex: low.nextIndex, nextValue: low.nextValue });
    this.setLeaf(lowIndex, { value: low.value, nextIndex: BigInt(nextIndex), nextValue: truncated });
    return true;
  }

  path(index: number): { siblings: bigint[]; bits: number[] } {
    let current = BigInt(index);
    const siblings: bigint[] = [];
    const bits: number[] = [];
    for (let level = 0; level < this.depth; level += 1) {
      siblings.push(this.levels[level]!.get(current ^ 1n) ?? this.zero[level]!);
      bits.push(Number(current & 1n));
      current >>= 1n;
    }
    return { siblings, bits };
  }

  nonMemberWitness(key: bigint): NonMembershipWitness {
    const truncated = truncateKey(key);
    if (this.has(truncated)) throw new Error("key is a member");
    const lowIndex = this.lowIndex(truncated);
    const low = this.leaves[lowIndex]!;
    const path = this.path(lowIndex);
    return {
      keyFull: key,
      root: this.root,
      lowValue: low.value,
      lowNextIndex: low.nextIndex,
      lowNextValue: low.nextValue,
      siblings: path.siblings,
      bits: path.bits,
      lowIndex,
    };
  }

  clone(): IndexedMerkleTree {
    return new IndexedMerkleTree(this.depth, this.leaves, this.levels);
  }

  copyFrom(other: IndexedMerkleTree): void {
    if (other.depth !== this.depth) throw new Error("indexed tree depth mismatch");
    this.leaves = other.leaves.map((leaf) => ({ ...leaf }));
    this.levels = other.levels.map((level) => new Map(level));
  }

  reset(): void {
    this.leaves = [];
    this.levels = Array.from({ length: this.depth + 1 }, () => new Map());
    this.setLeaf(0, { value: 0n, nextIndex: 0n, nextValue: 0n });
  }
}

export function stateRoot(issuedRoot: bigint, revokedRoot: bigint, rootRoot: bigint): bigint {
  return poseidon[3]([issuedRoot, revokedRoot, rootRoot]);
}
