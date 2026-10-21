import sodium from "libsodium-wrappers";
import { bytesToHex, hexToBytes } from "./crypto.js";
import type { BoxKeyPair } from "./types.js";

export interface MailboxEntry<T = unknown> {
  id: number;
  ct: string;
  ts?: number;
  value: T;
}

function asBytes(value: Uint8Array | string): Uint8Array {
  return typeof value === "string" ? hexToBytes(value) : Uint8Array.from(value);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class MailboxClient {
  constructor(readonly baseUrl: string) {}

  async send(toPk: Uint8Array | string, message: unknown, from?: string): Promise<number> {
    await sodium.ready;
    const plaintext = typeof message === "string"
      ? new TextEncoder().encode(message)
      : message instanceof Uint8Array
        ? message
        : new TextEncoder().encode(JSON.stringify(message));
    const ciphertext = sodium.crypto_box_seal(plaintext, asBytes(toPk));
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/box/${encodeURIComponent(bytesToHex(asBytes(toPk)).slice(2))}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ct: encodeBase64(ciphertext), ...(from ? { from } : {}) }),
    });
    if (!response.ok) throw new Error(`mailbox send failed: ${response.status}`);
    const body = (await response.json()) as { id: number };
    return body.id;
  }

  async poll<T = unknown>(keyPair: BoxKeyPair, after = 0): Promise<MailboxEntry<T>[]> {
    await sodium.ready;
    const recipient = bytesToHex(keyPair.publicKey).slice(2);
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/box/${encodeURIComponent(recipient)}?after=${after}`);
    if (!response.ok) throw new Error(`mailbox poll failed: ${response.status}`);
    const entries = (await response.json()) as Array<{ id: number; ct: string; ts?: number }>;
    const output: MailboxEntry<T>[] = [];
    for (const entry of entries) {
      const plaintext = sodium.crypto_box_seal_open(decodeBase64(entry.ct), keyPair.publicKey, keyPair.privateKey);
      const text = new TextDecoder().decode(plaintext);
      let value: unknown = text;
      try {
        value = JSON.parse(text);
      } catch {
        // Binary or plain text payloads remain strings.
      }
      output.push({ ...entry, value: value as T });
    }
    return output;
  }
}
