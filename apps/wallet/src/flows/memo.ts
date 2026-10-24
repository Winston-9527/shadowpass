import { decodeShadowEvent, noteCm, type Note } from "@shadowpass/sdk";
import { bytesToHex } from "../lib/bytes";

export function memoHex(memo: Uint8Array): `0x${string}` {
  return `0x${bytesToHex(memo)}`;
}

export function assertMemoInLogs(logs: unknown[], note: Note, expectedMemo: Uint8Array): void {
  const cm = noteCm(note).toString();
  const expected = memoHex(expectedMemo).toLowerCase();
  for (const raw of logs) {
    const event = decodeShadowEvent(raw);
    if (event?.name !== "NoteMemo" || BigInt(event.args.cm as bigint).toString() !== cm) continue;
    if (String(event.args.memo).toLowerCase() === expected) return;
    throw new Error(`note memo mismatch for ${cm}`);
  }
  throw new Error(`transaction did not emit a memo for note ${cm}`);
}
