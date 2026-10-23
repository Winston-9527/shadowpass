const { Buffer } = await import("buffer");
globalThis.Buffer = Buffer;

const sdk = await import("@shadowpass/sdk");

export const {
  deriveKeys,
  generateSeed,
  recoveryUnwrap,
  recoveryWrap,
  unwrapSeed,
  wrapSeed,
} = sdk;

export type { BoxKeyPair, Identity, KeySet, Point, ViewKey } from "@shadowpass/sdk";
