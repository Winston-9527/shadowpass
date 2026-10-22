import { scryptAsync } from "@noble/hashes/scrypt";
import { concatBytes, identityFromPrv, randomBytes, viewKey } from "./crypto.js";
import { L } from "./constants.js";
import type { BoxKeyPair, Identity, KeySet, ViewKey } from "./types.js";
import sodium from "libsodium-wrappers";

const encoder = new TextEncoder();
const WRAP_SALT = encoder.encode("shadowpass-v1");
const WRAP_INFO = encoder.encode("wrap");
const RECOVERY_SALT_BYTES = 16;
const IV_BYTES = 12;
const MAGIC = encoder.encode("SPW1");

function asBytes(value: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (typeof value === "string") {
    const normalized = value.startsWith("0x") ? value.slice(2) : value;
    const output = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < output.length; index += 1) {
      output[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
    }
    return output;
  }
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function importHkdfKey(ikm: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
}

async function hkdf(ikm: Uint8Array, info: string, length = 32, salt = new Uint8Array()): Promise<Uint8Array> {
  const key = await importHkdfKey(ikm);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: encoder.encode(info) as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function aesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", keyBytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSeed(keyBytes: Uint8Array, seed: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const key = await aesKey(keyBytes);
  return new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, seed as BufferSource));
}

async function decryptSeed(keyBytes: Uint8Array, ciphertext: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const key = await aesKey(keyBytes);
  return new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource));
}

function parseEnvelope(wrapped: Uint8Array): { mode: number; iv: Uint8Array; salt: Uint8Array; ciphertext: Uint8Array } {
  if (wrapped.length < MAGIC.length + 1 + IV_BYTES + RECOVERY_SALT_BYTES + 16) throw new Error("wrapped seed is truncated");
  for (let index = 0; index < MAGIC.length; index += 1) if (wrapped[index] !== MAGIC[index]) throw new Error("invalid wrapped seed");
  const mode = wrapped[MAGIC.length]!;
  const ivStart = MAGIC.length + 1;
  const saltStart = ivStart + IV_BYTES;
  const ciphertextStart = saltStart + RECOVERY_SALT_BYTES;
  return {
    mode,
    iv: wrapped.slice(ivStart, saltStart),
    salt: wrapped.slice(saltStart, ciphertextStart),
    ciphertext: wrapped.slice(ciphertextStart),
  };
}

function envelope(mode: number, iv: Uint8Array, salt: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return concatBytes(MAGIC, Uint8Array.of(mode), iv, salt, ciphertext);
}

export async function deriveKeys(seed: Uint8Array): Promise<KeySet> {
  const normalizedSeed = asBytes(seed);
  if (normalizedSeed.length !== 32) throw new Error("seed must be 32 bytes");
  const signPrv = await hkdf(normalizedSeed, "shadowpass/sign");
  const stewardPrv = await hkdf(normalizedSeed, "shadowpass/steward");
  const viewBytes = await hkdf(normalizedSeed, "shadowpass/view", 64);
  let vsk = BigInt(`0x${Array.from(viewBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`) % L;
  if (vsk === 0n) {
    const retry = await hkdf(normalizedSeed, "shadowpass/view-retry", 64);
    vsk = BigInt(`0x${Array.from(retry, (byte) => byte.toString(16).padStart(2, "0")).join("")}`) % L;
  }
  if (vsk === 0n) throw new Error("failed to derive non-zero view scalar");
  const boxPrv = await hkdf(normalizedSeed, "shadowpass/box");
  await sodium.ready;
  const box = {
    privateKey: Uint8Array.from(boxPrv),
    publicKey: Uint8Array.from(sodium.crypto_scalarmult_base(boxPrv)),
  } satisfies BoxKeyPair;
  return {
    seed: Uint8Array.from(normalizedSeed),
    sign: identityFromPrv(signPrv),
    steward: identityFromPrv(stewardPrv),
    view: viewKey(vsk),
    box,
  };
}

export async function wrapSeed(prf: Uint8Array, seed: Uint8Array): Promise<Uint8Array> {
  const keyBytes = await hkdf(asBytes(prf), "wrap", 32, WRAP_SALT);
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await encryptSeed(keyBytes, asBytes(seed), iv);
  return envelope(0, iv, new Uint8Array(RECOVERY_SALT_BYTES), ciphertext);
}

export async function unwrapSeed(prf: Uint8Array, wrapped: Uint8Array): Promise<Uint8Array> {
  const parsed = parseEnvelope(asBytes(wrapped));
  if (parsed.mode !== 0) throw new Error("not a PRF-wrapped seed");
  const keyBytes = await hkdf(asBytes(prf), "wrap", 32, WRAP_SALT);
  return decryptSeed(keyBytes, parsed.ciphertext, parsed.iv);
}

export async function recoveryWrap(code: string, seed: Uint8Array): Promise<Uint8Array> {
  const salt = randomBytes(RECOVERY_SALT_BYTES);
  const keyBytes = await scryptAsync(encoder.encode(code), salt, { N: 2 ** 15, r: 8, p: 1, dkLen: 32 });
  const iv = randomBytes(IV_BYTES);
  return envelope(1, iv, salt, await encryptSeed(keyBytes, asBytes(seed), iv));
}

export async function recoveryUnwrap(code: string, wrapped: Uint8Array): Promise<Uint8Array> {
  const parsed = parseEnvelope(asBytes(wrapped));
  if (parsed.mode !== 1) throw new Error("not a recovery-wrapped seed");
  const keyBytes = await scryptAsync(encoder.encode(code), parsed.salt, { N: 2 ** 15, r: 8, p: 1, dkLen: 32 });
  return decryptSeed(keyBytes, parsed.ciphertext, parsed.iv);
}

export function generateSeed(): Uint8Array {
  return randomBytes(32);
}

export { identityFromPrv };

export type { BoxKeyPair, Identity, KeySet, ViewKey };
