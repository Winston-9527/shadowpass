import sodium from "libsodium-wrappers";
import { bytesToHex, hexToBytes } from "./crypto.js";
import type { BoxKeyPair } from "./types.js";

export interface MailboxEntry<T = unknown> {
  id: number;
  ct: string;
  ts?: number;
  decoded: boolean;
  value?: T;
  error?: string;
}

export interface MailboxClientOptions {
  fetch?: typeof fetch;
}

function decodeHexKey(value: Uint8Array | string): Uint8Array {
  const bytes = typeof value === "string" ? hexToBytes(value) : Uint8Array.from(value);
  if (bytes.length !== 32) throw new Error("mailbox public key must be 32 bytes");
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("invalid base64 mailbox ciphertext");
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length < 48 || bytes.length > 16 * 1024) throw new Error("mailbox ciphertext has invalid length");
  return bytes;
}

export class MailboxClient {
  private readonly fetchImpl: typeof fetch;

  constructor(readonly baseUrl: string, options: MailboxClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async send(toPk: Uint8Array | string, message: unknown): Promise<number> {
    await sodium.ready;
    const publicKey = decodeHexKey(toPk);
    const plaintext = typeof message === "string"
      ? new TextEncoder().encode(message)
      : message instanceof Uint8Array
        ? message
        : new TextEncoder().encode(JSON.stringify(message));
    const ciphertext = sodium.crypto_box_seal(plaintext, publicKey);
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/box/${bytesToHex(publicKey).slice(2)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ct: encodeBase64(ciphertext) }),
    });
    if (!response.ok) throw new Error(`mailbox send failed: ${response.status}`);
    const body = await response.json() as { id?: unknown };
    if (!Number.isSafeInteger(body.id) || Number(body.id) < 1) throw new Error("mailbox send returned invalid id");
    return Number(body.id);
  }

  async poll<T = unknown>(keyPair: BoxKeyPair, after = 0): Promise<MailboxEntry<T>[]> {
    await sodium.ready;
    const publicKey = decodeHexKey(keyPair.publicKey);
    const response = await this.fetchImpl(
      `${this.baseUrl.replace(/\/$/, "")}/box/${bytesToHex(publicKey).slice(2)}?after=${encodeURIComponent(String(after))}`,
    );
    if (!response.ok) throw new Error(`mailbox poll failed: ${response.status}`);
    const entries = await response.json() as unknown;
    if (!Array.isArray(entries)) throw new Error("mailbox poll returned non-array response");
    const output: MailboxEntry<T>[] = [];
    for (const raw of entries) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as { id?: unknown; ct?: unknown; ts?: unknown };
      if (!Number.isSafeInteger(entry.id) || typeof entry.ct !== "string") continue;
      const result: MailboxEntry<T> = { id: Number(entry.id), ct: entry.ct, decoded: false };
      if (typeof entry.ts === "number") result.ts = entry.ts;
      try {
        const plaintext = sodium.crypto_box_seal_open(decodeBase64(entry.ct), publicKey, keyPair.privateKey);
        const text = new TextDecoder().decode(plaintext);
        let value: unknown = text;
        try {
          value = JSON.parse(text);
        } catch {
          // Plain text payloads remain strings.
        }
        result.decoded = true;
        result.value = value as T;
      } catch (error) {
        result.error = String(error);
      }
      output.push(result);
    }
    return output;
  }

  async pollAll<T = unknown>(keyPair: BoxKeyPair, after = 0): Promise<MailboxEntry<T>[]> {
    const output: MailboxEntry<T>[] = [];
    let cursor = after;
    for (;;) {
      const batch = await this.poll<T>(keyPair, cursor);
      output.push(...batch);
      if (batch.length < 200) return output;
      const next = batch[batch.length - 1]?.id;
      if (next === undefined || next <= cursor) throw new Error("mailbox pagination did not advance");
      cursor = next;
    }
  }
}
