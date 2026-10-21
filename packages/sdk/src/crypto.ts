import createBlakeHash from "blake-hash";
import { Buffer } from "buffer";
import { buildBabyjub, buildEddsa } from "circomlibjs";
import { Scalar } from "ffjavascript";
import { poseidon2, poseidon3, poseidon7, poseidon8, poseidon9 } from "poseidon-lite";
import { L, P } from "./constants.js";
import type { Identity, Point, ViewKey } from "./types.js";

(globalThis as any).Buffer ??= Buffer;
(globalThis as any).process ??= { env: {} };

export const eddsa = await buildEddsa();
export const babyJub = await buildBabyjub();
export const F = babyJub.F;

export const mod = (x: bigint): bigint => ((x % P) + P) % P;

export const toPoint = (value: any): Point => ({
  x: BigInt(F.toObject(value[0])),
  y: BigInt(F.toObject(value[1])),
});

const fieldPoint = (point: Point): any => [F.e(point.x), F.e(point.y)];

export const mul = (point: Point, scalar: bigint): Point =>
  toPoint(babyJub.mulPointEscalar(fieldPoint(point), scalar));

export const add = (left: Point, right: Point): Point =>
  toPoint(babyJub.addPoint(fieldPoint(left), fieldPoint(right)));

export const BASE8: Point = toPoint(babyJub.Base8);
export const GENERATOR: Point = toPoint(babyJub.Generator);

export const poseidon = {
  2: (values: readonly bigint[]): bigint => BigInt(poseidon2([...values])),
  3: (values: readonly bigint[]): bigint => BigInt(poseidon3([...values])),
  7: (values: readonly bigint[]): bigint => BigInt(poseidon7([...values])),
  8: (values: readonly bigint[]): bigint => BigInt(poseidon8([...values])),
  9: (values: readonly bigint[]): bigint => BigInt(poseidon9([...values])),
};

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function randomScalar(bound: bigint = L): bigint {
  for (;;) {
    const value = bytesToBigInt(randomBytes(32)) % bound;
    if (value !== 0n) return value;
  }
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

export function bigIntToBytes(value: bigint, length = 32): Uint8Array {
  if (value < 0n) throw new Error("negative integer");
  const output = new Uint8Array(length);
  let current = value;
  for (let index = length - 1; index >= 0; index -= 1) {
    output[index] = Number(current & 0xffn);
    current >>= 8n;
  }
  if (current !== 0n) throw new Error(`integer does not fit in ${length} bytes`);
  return output;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(normalized)) throw new Error("invalid hex");
  const output = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function identityFromPrv(prv: Uint8Array): Identity {
  const publicKey = eddsa.prv2pub(prv);
  const hash = eddsa.pruneBuffer(createBlakeHash("blake512").update(Buffer.from(prv)).digest());
  const sk = BigInt(Scalar.shr(Scalar.fromRprLE(hash, 0, 32), 3) as any) % L;
  return {
    prv: Uint8Array.from(prv),
    Ax: BigInt(F.toObject(publicKey[0])),
    Ay: BigInt(F.toObject(publicKey[1])),
    sk,
  };
}

export function viewKey(vsk: bigint): ViewKey {
  if (vsk <= 0n || vsk >= L) throw new Error("view scalar out of range");
  const w = mul(GENERATOR, vsk);
  return { vsk, w, vpk: mul(BASE8, vsk) };
}

export function sign(identity: Identity, message: bigint): { S: bigint; R8x: bigint; R8y: bigint } {
  const signature = eddsa.signPoseidon(identity.prv, F.e(message));
  return {
    S: BigInt(signature.S),
    R8x: BigInt(F.toObject(signature.R8[0])),
    R8y: BigInt(F.toObject(signature.R8[1])),
  };
}
