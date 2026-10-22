declare module "circomlibjs" {
  export function buildEddsa(): Promise<any>;
  export function buildBabyjub(): Promise<any>;
  export function buildPoseidon(): Promise<any>;
}

declare module "ffjavascript" {
  export const Scalar: {
    fromRprLE(bytes: Uint8Array, offset?: number, length?: number): bigint | unknown;
    shr(value: unknown, bits: number): unknown;
  };
}

declare module "blake-hash" {
  interface BlakeHash {
    update(data: Uint8Array): BlakeHash;
    digest(): Uint8Array;
  }
  export default function createBlakeHash(name: string): BlakeHash;
}

declare module "libsodium-wrappers";
declare module "snarkjs";
declare module "@shadowpass/circuits/world" {
  export const ShadowWorld: any;
  export function identity(prv: Uint8Array): any;
  export function openChain(ct: any, vsk: bigint): any;
}
