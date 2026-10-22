import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { bytesToHex } from "../src/crypto.js";
import { shadowEvents } from "../src/events.js";
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

function noteLogs(cm: bigint, memo: Uint8Array) {
  return [
    {
      topics: encodeEventTopics({ abi: shadowEvents, eventName: "NoteInserted", args: { cm } }),
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [0n, 0n]),
      blockNumber: 1n,
      logIndex: 0,
    },
    {
      topics: encodeEventTopics({ abi: shadowEvents, eventName: "NoteMemo", args: { cm } }),
      data: encodeAbiParameters([{ type: "bytes" }], [bytesToHex(memo)]),
      blockNumber: 1n,
      logIndex: 1,
    },
  ];
}

describe("note memos", () => {
  it("encodes the frozen 233-byte plaintext and seals to 281 bytes", async () => {
    const keys = await deriveKeys(seed);
    expect(encodeNotePlaintext(note)).toHaveLength(233);
    const memo = await encodeNoteMemo(note, keys.box.publicKey);
    expect(memo).toHaveLength(281);
    expect(await decodeNoteMemo(memo, keys.box.privateKey)).toEqual(note);
  });

  it("positively scans a raw viem NoteMemo event", async () => {
    const keys = await deriveKeys(seed);
    const memo = await encodeNoteMemo(note, keys.box.publicKey);
    const state = { spentNullifiers: new Set<string>(), memos: new Map([[noteCm(note).toString(), memo]]) };
    expect(await scanNotes(state, noteLogs(noteCm(note), memo).slice(0, 1), { boxSk: keys.box.privateKey, holderSks: [keys.steward.sk] })).toEqual([note]);
  });

  it("drops a memo that decrypts but does not open to the event cm", async () => {
    const keys = await deriveKeys(seed);
    const memo = await encodeNoteMemo({ ...note, q: 999n }, keys.box.publicKey);
    const state = { spentNullifiers: new Set<string>(), memos: new Map<string, Uint8Array>() };
    expect(await scanNotes(state, noteLogs(noteCm(note), memo), { boxSk: keys.box.privateKey, holderSks: [keys.steward.sk] })).toEqual([]);
  });

  it("cannot open another recipient's memo and excludes spent notes", async () => {
    const owner = await deriveKeys(seed);
    const other = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => 200 - index));
    const memo = await encodeNoteMemo(note, owner.box.publicKey);
    expect(await decodeNoteMemo(memo, other.box.privateKey)).toBeNull();

    const state = {
      spentNullifiers: new Set([budgetNullifier(owner.steward.sk, note).toString()]),
      memos: new Map<string, Uint8Array>(),
    };
    expect(await scanNotes(state, noteLogs(noteCm(note), memo), { boxSk: owner.box.privateKey, holderSks: [owner.steward.sk] })).toEqual([]);
  });
});
