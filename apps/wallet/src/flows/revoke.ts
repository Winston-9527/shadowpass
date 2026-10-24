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
  const cert = deserializeCert(certificate);
  const chainStarted = performance.now();
  let previousRoot = 0n;
  let newRoot = 0n;
  let proofMs = 0;
  let receipt: Awaited<ReturnType<WalletGateway["relay"]>> | undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const state = await options.gateway.sync();
    if (state.revoked.has(truncateKey(cert.hash))) throw new Error("certificate is already revoked");
    previousRoot = state.revoked.root;

    const proofStarted = performance.now();
    options.progress?.(attempt === 1 ? "Generating revocation proof" : "Revocation root changed; regenerating proof");
    const witness = revokeCertInput(cert, writer, 0, state, ownW);
    const proof = await options.proofs.prove("main_revoke", witness.input);
    proofMs += performance.now() - proofStarted;
    newRoot = witness.newRoot;

    options.progress?.("Submitting on-chain revocation");
    try {
      receipt = await options.gateway.relay("revoke", {
        proof: { a: proof.a, b: proof.b, c: proof.c },
        newRoot: witness.newRoot.toString(),
        entry: cert.hash.toString(),
      });
      break;
    } catch (error) {
      const retryable = /simulation_failed:(StaleRevokedRoot|InvalidProof|UnknownState|StaleIssuedRoot)/.test(String(error));
      if (!retryable || attempt === 3) throw error;
    }
  }
  if (!receipt) throw new Error("revocation transaction was not submitted");

  const nextState = await waitForChainState(
    options.gateway,
    (candidate) => candidate.revoked.has(truncateKey(cert.hash)),
    { attempts: 40, delayMs: 250 },
  );
  if (!nextState.revoked.has(truncateKey(cert.hash))) throw new Error("revocation is not visible on-chain");

  return {
    ledger: options.ledger,
    entry: cert.hash,
    previousRoot,
    newRoot,
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
