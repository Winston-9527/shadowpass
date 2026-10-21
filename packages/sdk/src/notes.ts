import sodium from "libsodium-wrappers";
import { TAG_BNF } from "./constants.js";
import {
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  concatBytes,
  hexToBytes,
  poseidon,
  randomScalar,
} from "./crypto.js";
import { decodeShadowEvent } from "./events.js";
import type { Identity, Note } from "./types.js";

export const NOTE_MEMO_VERSION = 1;
export const NOTE_MEMO_PLAINTEXT_BYTES = 233;

function bytes(value: Uint8Array | string): Uint8Array {
  return typeof value === "string" ? hexToBytes(value) : Uint8Array.from(value);
}

export function noteCm(note: Note): bigint {
  return poseidon[8]([note.own[0], note.own[1], note.q, ...note.lin, note.rho]);
}

export function budgetNullifier(holderSk: bigint, noteOrCm: Note | bigint): bigint {
  return poseidon[3]([TAG_BNF, holderSk, typeof noteOrCm === "bigint" ? noteOrCm : noteCm(noteOrCm)]);
}

export function encodeNotePlaintext(note: Note): Uint8Array {
  if (note.q < 0n || note.q >= 1n << 64n) throw new Error("note amount does not fit uint64");
  return concatBytes(
    Uint8Array.of(NOTE_MEMO_VERSION),
    bigIntToBytes(note.own[0]),
    bigIntToBytes(note.own[1]),
    bigIntToBytes(note.q, 8),
    bigIntToBytes(note.lin[0]),
    bigIntToBytes(note.lin[1]),
    bigIntToBytes(note.lin[2]),
    bigIntToBytes(note.lin[3]),
    bigIntToBytes(note.rho),
  );
}

export function decodeNotePlaintext(plaintext: Uint8Array): Note | null {
  if (plaintext.length !== NOTE_MEMO_PLAINTEXT_BYTES || plaintext[0] !== NOTE_MEMO_VERSION) return null;
  let offset = 1;
  const read = (length: number): bigint => {
    const value = bytesToBigInt(plaintext.slice(offset, offset + length));
    offset += length;
    return value;
  };
  const note: Note = {
    own: [read(32), read(32)],
    q: read(8),
    lin: [read(32), read(32), read(32), read(32)],
    rho: read(32),
  };
  return note;
}

export async function encodeNoteMemo(note: Note, recipientBoxPk: Uint8Array | string): Promise<Uint8Array> {
  await sodium.ready;
  return Uint8Array.from(sodium.crypto_box_seal(encodeNotePlaintext(note), bytes(recipientBoxPk)));
}

export async function decodeNoteMemo(memo: Uint8Array | string, boxSk: Uint8Array | string): Promise<Note | null> {
  await sodium.ready;
  try {
    const secret = bytes(boxSk);
    const publicKey = sodium.crypto_scalarmult_base(secret);
    const plaintext = sodium.crypto_box_seal_open(bytes(memo), publicKey, secret);
    return decodeNotePlaintext(plaintext);
  } catch {
    return null;
  }
}

export function createNote(owner: Pick<Identity, "Ax" | "Ay">, q: bigint, lineage: bigint[] = []): Note {
  const lin = [0n, 0n, 0n, 0n] as Note["lin"];
  for (let index = 0; index < Math.min(4, lineage.length); index += 1) lin[index] = lineage[index]!;
  return { own: [owner.Ax, owner.Ay], q, lin, rho: randomScalar() };
}

export interface ScanNotesOptions {
  boxSk: Uint8Array | string;
  holderSks: Array<bigint | Pick<Identity, "sk">>;
}

export function scanNotes(state: any, logs: any[], options: ScanNotesOptions): Promise<Note[]> {
  return (async () => {
    const memos = new Map<string, Uint8Array>();
    const inserted = new Set<string>();
    for (const raw of logs) {
      const event = decodeShadowEvent(raw);
      if (!event) continue;
      if (event.name === "NoteMemo") memos.set(BigInt(event.args.cm as any).toString(), bytes(event.args.memo as string));
      if (event.name === "NoteInserted") inserted.add(BigInt(event.args.cm as any).toString());
    }
    const spent: Set<string> = state?.spentNullifiers ?? new Set<string>();
    const holderSecrets = options.holderSks.map((value) => (typeof value === "bigint" ? value : value.sk));
    const notes: Note[] = [];
    for (const [cm, memo] of memos) {
      const note = await decodeNoteMemo(memo, options.boxSk);
      if (!note || noteCm(note).toString() !== cm) continue;
      if (!inserted.has(cm)) continue;
      if (holderSecrets.some((secret) => spent.has(budgetNullifier(secret, note).toString()))) continue;
      notes.push(note);
    }
    return notes;
  })();
}

export function memoHex(memo: Uint8Array): string {
  return bytesToHex(memo);
}
