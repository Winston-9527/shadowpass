// Off-circuit indexed Merkle tree (issue #24): insert, non-membership witness. Poseidon = circomlibjs (same as the circuit).
import { buildPoseidon } from "circomlibjs";
export const KEY_BITS = 252n;
export const trunc = (x) => BigInt(x) & ((1n << KEY_BITS) - 1n);
let P0; export async function poseidon() { if (!P0) P0 = await buildPoseidon(); return P0; }
export class IMT {
  static async create(depth) { const p = await poseidon(); return new IMT(depth, p); }
  constructor(depth, p) {
    this.depth = depth; this.p = p; this.H = (xs) => p.F.toObject(p(xs.map(BigInt)));
    this.zero = [0n]; for (let l = 0; l < depth; l++) this.zero.push(this.H([this.zero[l], this.zero[l]]));
    this.leaves = [];                 // {value, nextIndex, nextValue}
    this.levels = Array.from({ length: depth + 1 }, () => new Map());
    this._set(0, { value: 0n, nextIndex: 0n, nextValue: 0n });   // sentinel
  }
  leafHash(l) { return this.H([l.value, l.nextIndex, l.nextValue]); }
  _set(i, leaf) {
    this.leaves[i] = leaf; let idx = BigInt(i); this.levels[0].set(idx, this.leafHash(leaf));
    for (let l = 0; l < this.depth; l++) {
      const a = this.levels[l].get(idx & ~1n) ?? this.zero[l], b = this.levels[l].get(idx | 1n) ?? this.zero[l];
      idx >>= 1n; this.levels[l + 1].set(idx, this.H([a, b]));
    }
  }
  get root() { return this.levels[this.depth].get(0n) ?? this.zero[this.depth]; }
  lowIndex(k) {                       // index of the leaf with the largest value < k
    let best = -1; for (let i = 0; i < this.leaves.length; i++) { const v = this.leaves[i].value; if (v < k && (best < 0 || v > this.leaves[best].value)) best = i; }
    return best;
  }
  has(k) { return this.leaves.some((l) => l.value === k); }
  insert(keyFull) {
    const k = trunc(keyFull); if (k === 0n) throw new Error("key 0 reserved for sentinel"); if (this.has(k)) return false;
    if (this.leaves.length >= 2 ** this.depth) throw new Error("tree full");
    const lo = this.lowIndex(k), low = this.leaves[lo], ni = this.leaves.length;
    this._set(ni, { value: k, nextIndex: low.nextIndex, nextValue: low.nextValue });
    this._set(lo, { value: low.value, nextIndex: BigInt(ni), nextValue: k });
    return true;
  }
  path(i) { let idx = BigInt(i); const sib = [], bit = []; for (let l = 0; l < this.depth; l++) { sib.push(this.levels[l].get(idx ^ 1n) ?? this.zero[l]); bit.push(Number(idx & 1n)); idx >>= 1n; } return { sib, bit }; }
  clone() {
    const c = Object.create(Object.getPrototypeOf(this));
    Object.assign(c, this);
    c.leaves = this.leaves.map((leaf) => ({ ...leaf }));
    c.levels = this.levels.map((level) => new Map(level));
    return c;
  }
  nonMemberWitness(keyFull) {
    const k = trunc(keyFull); if (this.has(k)) throw new Error("key is a member: no non-membership witness");
    const lo = this.lowIndex(k), low = this.leaves[lo], { sib, bit } = this.path(lo);
    return { key_full: BigInt(keyFull).toString(), root: this.root.toString(), low_value: low.value.toString(), low_next_index: low.nextIndex.toString(),
             low_next_value: low.nextValue.toString(), sib: sib.map(String), bit: bit.map(String), _lowIndex: lo };
  }
}
