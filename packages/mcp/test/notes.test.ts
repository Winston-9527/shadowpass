import { ChainState, createNote, encodeNoteMemo } from "@shadowpass/sdk";
import { describe, expect, it } from "vitest";
import { reconcileNotes } from "../src/notes.js";
import { createFixture, deployment } from "./fixtures.js";

describe("note recovery", () => {
  it("recovers an inserted, unspent note from its encrypted on-chain memo", async () => {
    const fixture = await createFixture();
    const result = await reconcileNotes(fixture.store, fixture.state);
    expect(result).toMatchObject({ recovered: 1, added: 1, warnings: [] });
    expect(await fixture.store.notes()).toEqual([fixture.bundle.note]);
  });

  it("warns when a locally stored note cannot be recovered from the on-chain memo", async () => {
    const fixture = await createFixture();
    await fixture.store.addNote(fixture.bundle.note);
    const wrongNote = createNote(fixture.store.holder, 42n, [999n]);
    const wrongMemo = await encodeNoteMemo(wrongNote, fixture.store.boxPublicKey);
    const logs = fixture.logs.map((log) => log.eventName === "NoteMemo"
      ? { ...log, args: { ...log.args, memo: `0x${Buffer.from(wrongMemo).toString("hex")}` } }
      : log);
    const state = ChainState.fromLogs(deployment, logs);
    const result = await reconcileNotes(fixture.store, state);
    expect(result.warnings).toEqual(["local_note_memo_mismatch"]);
  });
});
