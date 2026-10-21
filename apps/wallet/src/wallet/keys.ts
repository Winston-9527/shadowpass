import { bytesToHex, concatBytes, toArrayBuffer, utf8 } from "../lib/bytes";
import { hkdfSha256 } from "../keystore/crypto";

export interface WalletKeyMaterial {
  secret: Uint8Array;
  publicKey: string;
}

export interface WalletKeyBundle {
  sign: WalletKeyMaterial;
  steward: WalletKeyMaterial;
  view: WalletKeyMaterial;
  box: WalletKeyMaterial;
}

export interface DerivedWalletKeys {
  bundle: WalletKeyBundle;
  source: "sdk" | "provisional";
}

function publicFingerprint(secret: Uint8Array): Promise<string> {
  return crypto.subtle.digest("SHA-256", toArrayBuffer(secret)).then((digest) => bytesToHex(new Uint8Array(digest)));
}

async function provisionalKey(seed: Uint8Array, name: string): Promise<WalletKeyMaterial> {
  const secret = await hkdfSha256(seed, `shadowpass/mock/${name}`);
  return { secret, publicKey: await publicFingerprint(concatBytes(utf8(name), secret)) };
}

async function provisionalBundle(seed: Uint8Array): Promise<WalletKeyBundle> {
  return {
    sign: await provisionalKey(seed, "sign"),
    steward: await provisionalKey(seed, "steward"),
    view: await provisionalKey(seed, "view"),
    box: await provisionalKey(seed, "box"),
  };
}

function materialFromSdk(value: unknown, name: string): WalletKeyMaterial {
  if (!value || typeof value !== "object") throw new Error(`SDK keys.${name} is not available`);
  const record = value as Record<string, unknown>;
  const secretValue = record.secret ?? record.prv ?? record.sk ?? record.vsk;
  if (!(secretValue instanceof Uint8Array) && typeof secretValue !== "bigint" && typeof secretValue !== "string") {
    throw new Error(`SDK keys.${name} has no supported secret`);
  }
  const secret = typeof secretValue === "string"
    ? Uint8Array.from(secretValue.replace(/^0x/, "").match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
    : typeof secretValue === "bigint"
      ? Uint8Array.from({ length: 32 }, (_, index) => Number((secretValue >> BigInt((31 - index) * 8)) & 0xffn))
      : secretValue;
  const publicValue = record.publicKey ?? record.public ?? record.Ax ?? record.vpk;
  return { secret, publicKey: typeof publicValue === "string" ? publicValue : bytesToHex(secret) };
}

function bundleFromSdk(value: unknown): WalletKeyBundle {
  const record = value as Record<string, unknown>;
  return {
    sign: materialFromSdk(record.sign, "sign"),
    steward: materialFromSdk(record.steward, "steward"),
    view: materialFromSdk(record.view, "view"),
    box: materialFromSdk(record.box, "box"),
  };
}

export async function deriveWalletKeys(seed: Uint8Array): Promise<DerivedWalletKeys> {
  const sdk = await import("@shadowpass/sdk");
  const candidate = (sdk as unknown as Record<string, unknown>).deriveKeys;
  if (typeof candidate === "function") {
    const derived = await (candidate as (value: Uint8Array) => Promise<unknown>)(seed);
    return { bundle: bundleFromSdk(derived), source: "sdk" };
  }
  if (import.meta.env.VITE_ALLOW_PROVISIONAL_KEYS === "false") {
    throw new Error("The SDK keys module is not available; set VITE_ALLOW_PROVISIONAL_KEYS only for local development");
  }
  return { bundle: await provisionalBundle(seed), source: "provisional" };
}

export function clearKeyBundle(bundle: WalletKeyBundle | null): void {
  if (!bundle) return;
  for (const material of Object.values(bundle)) material.secret.fill(0);
}
