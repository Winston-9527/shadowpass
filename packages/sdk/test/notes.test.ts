import { describe, expect, it } from "vitest";
import { deriveKeys } from "../src/keys.js";
import {
  budgetNullifier,
  decodeNoteMemo,
  encodeNoteMemo,
  encodeNotePlaintext,
  noteCm,
  scanNotes,
} from "../src/notes.js";
import type { Note } from "../src/types.js";

const seed = Uint8Array.from({ length: 32 }, (_, index) => index + 10);
const note: Note = {
  own: [11n, 12n],
  q: 123_456n,
  lin: [13n, 14n, 0n, 0n],
  rho: 15n,
};

describe("note memos", () => {
  it("encodes the frozen 233-byte plaintext and seals to 281 bytes", async () => {
    const keys = await deriveKeys(seed);
    expect(encodeNotePlaintext(note)).toHaveLength(233);
    const memo = await encodeNoteMemo(note, keys.box.publicKey);
    expect(memo).toHaveLength(281);
    expect(await decodeNoteMemo(memo, keys.box.privateKey)).toEqual(note);
  });

  it("drops a memo that decrypts but does not open to the event cm", async () => {
    const keys = await deriveKeys(seed);
    const other = { ...note, q: 999n };
    const memo = await encodeNoteMemo(other, keys.box.publicKey);
    const state = { spentNullifiers: new Set<string>() };
    const logs = [
      { eventName: "NoteInserted", args: { cm: noteCm(note).toString(), index: "0", newRoot: "0" }, blockNumber: 1n, logIndex: 0 },
      { eventName: "NoteMemo", args: { cm: noteCm(note).toString(), memo }, blockNumber: 1n, logIndex: 1 },
    ];
    expect(await scanNotes(state, logs, { boxSk: keys.box.privateKey, holderSks: [keys.steward.sk] })).toEqual([]);
  });

  it("cannot open another recipient's memo and excludes spent notes", async () => {
    const owner = await deriveKeys(seed);
    const other = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => 200 - index));
    const memo = await encodeNoteMemo(note, owner.box.publicKey);
    expect(await decodeNoteMemo(memo, other.box.privateKey)).toBeNull();

    const cm = noteCm(note).toString();
    const state = { spentNullifiers: new Set([budgetNullifier(owner.steward.sk, note).toString()]) };
    const logs = [
      { eventName: "NoteInserted", args: { cm, index: "0", newRoot: "0" }, blockNumber: 1n, logIndex: 0 },
      { eventName: "NoteMemo", args: { cm, memo }, blockNumber: 1n, logIndex: 1 },
    ];
    expect(await scanNotes(state, logs, { boxSk: owner.box.privateKey, holderSks: [owner.steward.sk] })).toEqual([]);
  });
});
