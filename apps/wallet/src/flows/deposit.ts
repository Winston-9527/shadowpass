import {
  budgetNullifier,
  createNote,
  encodeNoteMemo,
  mintInput,
  noteCm,
  type KeySet,
  type Note,
} from "@shadowpass/sdk";
import { assertMemoInLogs, memoHex } from "./memo";
import { waitForChainState, type WalletGateway } from "./chain";
import type { ProofService } from "./prove";
import type { ProgressReporter, WalletLedger } from "./types";

export interface DepositOptions {
  ledger: WalletLedger;
  bundle: KeySet;
  amount: bigint;
  method: "faucet" | "external";
  gateway: WalletGateway;
  proofs: ProofService;
  onCheckpoint?(ledger: WalletLedger): Promise<void>;
  progress?: ProgressReporter;
}

export interface DepositResult {
  ledger: WalletLedger;
  note: Note;
  transaction: string;
  timings: { proofMs: number; chainMs: number; totalMs: number };
}

function stripProof(proof: Awaited<ReturnType<ProofService["prove"]>>): { a: string[]; b: string[][]; c: string[] } {
  return { a: [...proof.a], b: proof.b.map((row) => [...row]), c: [...proof.c] };
}

export async function deposit(options: DepositOptions): Promise<DepositResult> {
  const started = performance.now();
  if (!options.ledger.root) throw new Error("onboard the wallet before depositing");
  if (options.amount <= 0n) throw new Error("deposit amount must be positive");
  if (![10_000_000n, 50_000_000n, 100_000_000n].includes(options.amount)) {
    throw new Error("deposit amount must be 10, 50 or 100");
  }
  const note = createNote(options.bundle.steward, options.amount, [BigInt(options.ledger.root.hash)]);
  const memo = await encodeNoteMemo(note, options.bundle.box.publicKey);

  options.progress?.("Generating budget mint proof");
  const proofStarted = performance.now();
  const proof = await options.proofs.prove("budget_mint", mintInput(note));
  const proofMs = performance.now() - proofStarted;
  const cm = proof.publicSignals[0]!;
  const q = proof.publicSignals[1]!;
  const chainStarted = performance.now();
  let transaction: string;
  let logs: unknown[];

  options.progress?.(options.method === "faucet" ? "Claiming test funds" : "Confirming in MetaMask");
  if (options.method === "faucet") {
    const receipt = await options.gateway.relay("faucetDeposit", {
      proof: stripProof(proof),
      cm,
      q,
      memo: memoHex(memo),
    });
    transaction = receipt.transaction;
    logs = receipt.logs;
  } else {
    const receipt = await options.gateway.externalDeposit({ proof, cm: BigInt(cm), q: BigInt(q), note, memo });
    transaction = receipt.transaction;
    logs = receipt.logs;
  }
  assertMemoInLogs(logs, note, memo);
  const state = await waitForChainState(options.gateway, (candidate) => candidate.notes.indexOf(noteCm(note)) >= 0);
  if (state.notes.indexOf(noteCm(note)) < 0) throw new Error("deposited note is not visible on-chain");

  const ledger: WalletLedger = {
    ...options.ledger,
    notes: [
      ...options.ledger.notes.filter((candidate) => candidate.cm !== noteCm(note).toString()),
      {
        note: {
          own: [note.own[0].toString(), note.own[1].toString()],
          q: note.q.toString(),
          lin: note.lin.map(String) as NoteLineage,
          rho: note.rho.toString(),
        },
        cm: noteCm(note).toString(),
        tx: transaction,
        kind: "deposit",
        createdAt: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  await options.onCheckpoint?.(ledger);
  return {
    ledger,
    note,
    transaction,
    timings: { proofMs, chainMs: performance.now() - chainStarted, totalMs: performance.now() - started },
  };
}
type NoteLineage = WalletLedger["notes"][number]["note"]["lin"];

export function stewardNotes(ledger: WalletLedger, state: { notes: { indexOf(value: bigint): number }; spentNullifiers: Set<string> }, stewardSk: bigint): Note[] {
  return ledger.notes
    .filter((entry) => entry.kind === "deposit" || entry.kind === "change")
    .map(toNote)
    .filter((note) => state.notes.indexOf(noteCm(note)) >= 0)
    .filter((note) => !state.spentNullifiers.has(budgetNullifier(stewardSk, note).toString()));
}

function toNote(entry: WalletLedger["notes"][number]): Note {
  return {
    own: [BigInt(entry.note.own[0]), BigInt(entry.note.own[1])],
    q: BigInt(entry.note.q),
    lin: entry.note.lin.map(BigInt) as Note["lin"],
    rho: BigInt(entry.note.rho),
  };
}
