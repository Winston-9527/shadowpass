import { budgetNullifier, noteCm, scanNotes } from "@shadowpass/sdk";
import type { CertificateBundle, ChainState, Note } from "@shadowpass/sdk";
import type { AgentStore } from "./store.js";

export function noteFromStored(note: CertificateBundle["note"]): Note {
  return {
    own: [BigInt(note.own[0]), BigInt(note.own[1])],
    q: BigInt(note.q),
    lin: [BigInt(note.lin[0]), BigInt(note.lin[1]), BigInt(note.lin[2]), BigInt(note.lin[3])],
    rho: BigInt(note.rho),
  };
}

export function noteToStored(note: Note): CertificateBundle["note"] {
  return {
    own: [note.own[0].toString(), note.own[1].toString()],
    q: note.q.toString(),
    lin: note.lin.map(String) as CertificateBundle["note"]["lin"],
    rho: note.rho.toString(),
  };
}

export function lineageMatches(note: Note, bundle: CertificateBundle): boolean {
  for (let index = 0; index < 4; index += 1) {
    const expected = index < bundle.chain.length ? BigInt(bundle.chain[index]!.hash) : 0n;
    if (note.lin[index] !== expected) return false;
  }
  return true;
}

export interface NoteReconciliation {
  recovered: number;
  added: number;
  warnings: string[];
}

export async function reconcileNotes(store: AgentStore, state: ChainState): Promise<NoteReconciliation> {
  const recovered = await scanNotes(state, [], {
    boxSk: store.boxPrivateKey,
    holderSks: [store.holder.sk],
  });
  const recoveredCm = new Set(recovered.map((note) => noteCm(note).toString()));
  const local = await store.notes();
  const localCm = new Set(local.map((note) => noteCm(noteFromStored(note)).toString()));
  let added = 0;
  for (const note of recovered) {
    const cm = noteCm(note).toString();
    if (localCm.has(cm)) continue;
    await store.addNote(noteToStored(note));
    added += 1;
  }

  const warnings: string[] = [];
  for (const raw of local) {
    const note = noteFromStored(raw);
    const cm = noteCm(note).toString();
    if (state.notes.indexOf(noteCm(note)) < 0) continue;
    if (state.spentNullifiers.has(budgetNullifier(store.holder.sk, note).toString())) continue;
    if (state.memos.has(cm) && !recoveredCm.has(cm)) warnings.push("local_note_memo_mismatch");
  }
  return { recovered: recovered.length, added, warnings: [...new Set(warnings)] };
}
