import {
  revokeCertInput,
  truncateKey,
  type KeySet,
} from "@shadowpass/sdk";
import { deserializeCert } from "./cert";
import { waitForChainState, type WalletGateway } from "./chain";
import type { ProofService } from "./prove";
import type { CardRecord, ProgressReporter, WalletLedger } from "./types";

export interface RevocationResult {
  ledger: WalletLedger;
  entry: bigint;
  previousRoot: bigint;
  newRoot: bigint;
  transaction: `0x${string}`;
  timings: { proofMs: number; chainMs: number; totalMs: number };
}

export interface RevokeOptions {
  ledger: WalletLedger;
  bundle: KeySet;
  gateway: WalletGateway;
  proofs: ProofService;
  progress?: ProgressReporter;
}

async function revoke(
  options: RevokeOptions,
  certificate: WalletLedger["root"],
  writer: KeySet["sign"] | KeySet["steward"],
  ownW?: KeySet["view"]["w"],
): Promise<RevocationResult> {
  if (!certificate) throw new Error("wallet certificate is not ready");
  const started = performance.now();
  const state = await options.gateway.sync();
  const cert = deserializeCert(certificate);
  if (state.revoked.has(truncateKey(cert.hash))) throw new Error("certificate is already revoked");

  const proofStarted = performance.now();
  options.progress?.("Generating revocation proof");
  const witness = revokeCertInput(cert, writer, 0, state, ownW);
  const proof = await options.proofs.prove("main_revoke", witness.input);
  const proofMs = performance.now() - proofStarted;

  options.progress?.("Submitting on-chain revocation");
  const chainStarted = performance.now();
  const receipt = await options.gateway.relay("revoke", {
    proof: { a: proof.a, b: proof.b, c: proof.c },
    newRoot: witness.newRoot.toString(),
    entry: cert.hash.toString(),
  });
  const nextState = await waitForChainState(
    options.gateway,
    (candidate) => candidate.revoked.has(truncateKey(cert.hash)),
    { attempts: 40, delayMs: 250 },
  );
  if (!nextState.revoked.has(truncateKey(cert.hash))) throw new Error("revocation is not visible on-chain");

  return {
    ledger: options.ledger,
    entry: cert.hash,
    previousRoot: state.revoked.root,
    newRoot: witness.newRoot,
    transaction: receipt.transaction,
    timings: { proofMs, chainMs: performance.now() - chainStarted, totalMs: performance.now() - started },
  };
}

export function revokeAgent(options: RevokeOptions & { card: CardRecord }): Promise<RevocationResult> {
  return revoke(options, options.card.cert, options.bundle.steward);
}

export function revokeTree(options: RevokeOptions): Promise<RevocationResult> {
  return revoke(options, options.ledger.root, options.bundle.sign, options.bundle.view.w);
}
