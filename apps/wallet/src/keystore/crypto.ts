import { scryptAsync } from "@noble/hashes/scrypt.js";
import {
  bytesToBase64,
  base64ToBytes,
  bytesToBase64Url,
  base64UrlToBytes,
  bytesToHex,
  concatBytes,
  hexToBytes,
  randomBytes,
  toArrayBuffer,
  utf8,
} from "../lib/bytes";

export const PRF_SALT = utf8("shadowpass-v1");
export const RECOVERY_SALT = utf8("shadowpass-recovery-v1");
const RECOVERY_PREFIX = "SP1-";

export interface WrappedSeed {
  v: 1;
  iv: string;
  ciphertext: string;
}

const encoder = new TextEncoder();

async function deriveAesKeyFromPrf(prf: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", toArrayBuffer(prf), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: toArrayBuffer(PRF_SALT), info: toArrayBuffer(utf8("wrap")) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function deriveAesKeyFromRecovery(recoveryCode: string): Promise<CryptoKey> {
  const normalized = normalizeRecoverySecret(recoveryCode);
  const keyBytes = await scryptAsync(normalized, RECOVERY_SALT, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    dkLen: 32,
    maxmem: 64 * 1024 * 1024,
  });
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSeed(seed: Uint8Array, key: CryptoKey): Promise<WrappedSeed> {
  const iv = randomBytes(12);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(seed)),
  );
  return { v: 1, iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function decryptSeed(wrapped: WrappedSeed, key: CryptoKey): Promise<Uint8Array> {
  if (wrapped.v !== 1) throw new Error("Unsupported wrapped seed version");
  const iv = base64ToBytes(wrapped.iv);
  const ciphertext = base64ToBytes(wrapped.ciphertext);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext)));
}

export function generateSeed(): Uint8Array {
  return randomBytes(32);
}

export async function wrapSeed(seed: Uint8Array, prf: Uint8Array): Promise<WrappedSeed> {
  if (prf.length !== 32) throw new Error("PRF output must be 32 bytes");
  return encryptSeed(seed, await deriveAesKeyFromPrf(prf));
}

export async function unwrapSeed(wrapped: WrappedSeed, prf: Uint8Array): Promise<Uint8Array> {
  if (prf.length !== 32) throw new Error("PRF output must be 32 bytes");
  return decryptSeed(wrapped, await deriveAesKeyFromPrf(prf));
}

function normalizeRecoverySecret(value: string): string {
  const normalized = value.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (normalized.length !== 40) throw new Error("Recovery secret must contain 160 bits");
  return normalized;
}

export async function wrapSeedWithRecovery(seed: Uint8Array, recoveryCode: string): Promise<WrappedSeed> {
  return encryptSeed(seed, await deriveAesKeyFromRecovery(recoveryCode));
}

export async function unwrapSeedWithRecovery(wrapped: WrappedSeed, recoveryCode: string): Promise<Uint8Array> {
  return decryptSeed(wrapped, await deriveAesKeyFromRecovery(recoveryCode));
}

export async function createRecoveryBackup(seed: Uint8Array): Promise<string> {
  const secret = randomBytes(20);
  const wrapped = await wrapSeedWithRecovery(seed, bytesToHex(secret));
  const payload = concatBytes(
    Uint8Array.of(1),
    secret,
    base64ToBytes(wrapped.iv),
    base64ToBytes(wrapped.ciphertext),
  );
  return `${RECOVERY_PREFIX}${bytesToBase64Url(payload)}`;
}

export async function recoverSeedFromBackup(recoveryCode: string): Promise<Uint8Array> {
  if (!recoveryCode.startsWith(RECOVERY_PREFIX)) throw new Error("Invalid recovery code");
  const payload = base64UrlToBytes(recoveryCode.slice(RECOVERY_PREFIX.length));
  if (payload[0] !== 1 || payload.length < 81) throw new Error("Unsupported recovery code");
  const secret = payload.slice(1, 21);
  const iv = payload.slice(21, 33);
  const ciphertext = payload.slice(33);
  return unwrapSeedWithRecovery(
    { v: 1, iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) },
    bytesToHex(secret),
  );
}

export async function hkdfSha256(seed: Uint8Array, info: string, length = 32): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", toArrayBuffer(seed), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(encoder.encode("shadowpass/sdk")),
      info: toArrayBuffer(encoder.encode(info)),
    },
    base,
    length * 8,
  );
  return new Uint8Array(bits);
}

export function zeroBytes(value: Uint8Array | undefined): void {
  value?.fill(0);
}

export function parseSeedHex(value: string): Uint8Array {
  return hexToBytes(value);
}
