import { recoveryUnwrap, recoveryWrap, unwrapSeed, wrapSeed } from "../sdk";
import { base64ToBytes, bytesToBase64, bytesToHex, randomBytes, utf8 } from "../lib/bytes";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PASSKEY_SLOT_PREFIX = "shadowpass/slot/passkey/";
const RECOVERY_SLOT_PREFIX = "shadowpass/slot/recovery/";

export interface BackupSlotClient {
  readonly mode: "mailbox" | "local";
  write(slotId: string, envelope: Uint8Array): Promise<void>;
  list(slotId: string): Promise<Uint8Array[]>;
}

export class HttpBackupSlotClient implements BackupSlotClient {
  readonly mode = "mailbox" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  async write(slotId: string, envelope: Uint8Array): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/box/${slotId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ct: bytesToBase64(envelope) }),
    });
    if (!response.ok) throw new Error(`backup slot write failed: ${response.status}`);
  }

  async list(slotId: string): Promise<Uint8Array[]> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/box/${slotId}`);
    if (!response.ok) throw new Error(`backup slot read failed: ${response.status}`);
    const body = await response.json() as unknown;
    if (!Array.isArray(body)) throw new Error("backup slot returned a non-array response");
    const envelopes: Uint8Array[] = [];
    for (const raw of body) {
      if (!raw || typeof raw !== "object") continue;
      const ct = (raw as { ct?: unknown }).ct;
      if (typeof ct !== "string") continue;
      try {
        envelopes.push(base64ToBytes(ct));
      } catch {
        // Untrusted slot entries are skipped.
      }
    }
    return envelopes;
  }
}

export class MemoryBackupSlotClient implements BackupSlotClient {
  readonly mode = "local" as const;
  private readonly slots = new Map<string, Uint8Array[]>();

  async write(slotId: string, envelope: Uint8Array): Promise<void> {
    const entries = this.slots.get(slotId) ?? [];
    entries.push(Uint8Array.from(envelope));
    this.slots.set(slotId, entries);
  }

  async list(slotId: string): Promise<Uint8Array[]> {
    return (this.slots.get(slotId) ?? []).map((entry) => Uint8Array.from(entry));
  }
}

const localSlots = new MemoryBackupSlotClient();

export function defaultBackupSlotClient(): BackupSlotClient {
  const mailboxUrl = import.meta.env.VITE_MAILBOX_URL?.trim();
  return mailboxUrl ? new HttpBackupSlotClient(mailboxUrl) : localSlots;
}

export function normalizeRecoveryCode(value: string): string {
  const normalized = value.toUpperCase().replace(/[-\s]/g, "").replaceAll("I", "1").replaceAll("L", "1").replaceAll("O", "0");
  if (normalized.length !== 20 || [...normalized].some((character) => !CROCKFORD.includes(character))) {
    throw new Error("Recovery code must contain 20 Crockford Base32 characters");
  }
  return normalized;
}

export function generateRecoveryCode(): string {
  const raw = randomBytes(20);
  const code = Array.from(raw, (byte) => CROCKFORD[byte & 31]).join("");
  return code.match(/.{4}/g)?.join("-") ?? code;
}

async function sha256Hex(prefix: string, value: Uint8Array): Promise<string> {
  const input = new Uint8Array(prefix.length + value.length);
  input.set(utf8(prefix));
  input.set(value, prefix.length);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
}

export function passkeySlotId(credentialId: string): Promise<string> {
  return sha256Hex(PASSKEY_SLOT_PREFIX, utf8(credentialId));
}

export function recoverySlotId(recoveryCode: string): Promise<string> {
  return sha256Hex(RECOVERY_SLOT_PREFIX, utf8(normalizeRecoveryCode(recoveryCode)));
}

export async function writePasskeyBackup(client: BackupSlotClient, credentialId: string, prf: Uint8Array, seed: Uint8Array): Promise<void> {
  await client.write(await passkeySlotId(credentialId), await wrapSeed(prf, seed));
}

export async function writeRecoveryBackup(client: BackupSlotClient, recoveryCode: string, seed: Uint8Array): Promise<void> {
  await client.write(await recoverySlotId(recoveryCode), await recoveryWrap(normalizeRecoveryCode(recoveryCode), seed));
}

export async function restoreSeedFromPasskeySlot(client: BackupSlotClient, credentialId: string, prf: Uint8Array): Promise<Uint8Array | null> {
  for (const envelope of await client.list(await passkeySlotId(credentialId))) {
    try {
      return await unwrapSeed(prf, envelope);
    } catch {
      // A slot is unauthenticated, so invalid envelopes are expected.
    }
  }
  return null;
}

export async function restoreSeedFromRecoverySlot(client: BackupSlotClient, recoveryCode: string): Promise<Uint8Array | null> {
  const normalized = normalizeRecoveryCode(recoveryCode);
  for (const envelope of await client.list(await recoverySlotId(normalized))) {
    try {
      return await recoveryUnwrap(normalized, envelope);
    } catch {
      // A slot is unauthenticated, so invalid envelopes are expected.
    }
  }
  return null;
}
