import {
  groupCommitment,
  issueRoot,
  registerInput,
  type KeySet,
} from "@shadowpass/sdk";
import { serializeCert } from "./cert";
import { waitForChainState, type WalletGateway } from "./chain";
import type { ProofService } from "./prove";
import type { ProgressReporter, WalletLedger } from "./types";

export interface OnboardOptions {
  ledger: WalletLedger;
  bundle: KeySet;
  gateway: WalletGateway;
  proofs: ProofService;
  onCheckpoint?(ledger: WalletLedger): Promise<void>;
  progress?: ProgressReporter;
  nowSeconds?: bigint;
}

export interface OnboardResult {
  ledger: WalletLedger;
  timings: { joinMs: number; proofMs: number; chainMs: number; totalMs: number };
}

export async function onboard(options: OnboardOptions): Promise<OnboardResult> {
  const totalStarted = performance.now();
  const now = options.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
  let ledger = structuredClone(options.ledger);
  const commitment = groupCommitment(options.bundle.sign);
  let state = await options.gateway.sync();

  let joinMs = 0;
  if (state.group.indexOf(commitment) < 0) {
    const started = performance.now();
    options.progress?.("Joining the privacy group");
    await options.gateway.relay("join", { commitment: commitment.toString() });
    state = await waitForChainState(options.gateway, (candidate) => candidate.group.indexOf(commitment) >= 0);
    if (state.group.indexOf(commitment) < 0) throw new Error("group membership is not visible after relay");
    joinMs = performance.now() - started;
  }

  const cert0 = issueRoot(
    options.bundle.sign,
    options.bundle.steward,
    3n,
    now + 7n * 24n * 60n * 60n,
    options.bundle.view.vpk,
    options.bundle.view.w,
  );
  const root = serializeCert(cert0);
  const proofStarted = performance.now();
  let registrationTx = ledger.registrationTx;
  let chainMs = 0;

  if (state.rootTree.indexOf(cert0.hash) < 0) {
    options.progress?.("Generating registration proof");
    const domain = await options.gateway.registryDomain();
    const input = registerInput({ human: options.bundle.sign, cert0, domain, state });
    const proof = await options.proofs.prove("main_reg", input);
    const proofMs = performance.now() - proofStarted;
    const siblings = input.siblings;
    if (!Array.isArray(siblings)) throw new Error("registration witness is missing group siblings");
    options.progress?.("Registering root certificate");
    const chainStarted = performance.now();
    const receipt = await options.gateway.relay("register", {
      proof: { a: proof.a, b: proof.b, c: proof.c },
      groupRoot: proof.publicSignals[0]!,
      nf: proof.publicSignals[2]!,
      leaf0: proof.publicSignals[3]!,
      siblingNodes: siblings.map(String),
    });
    registrationTx = receipt.transaction;
    state = await waitForChainState(options.gateway, (candidate) => candidate.rootTree.indexOf(cert0.hash) >= 0);
    if (state.rootTree.indexOf(cert0.hash) < 0) throw new Error("root certificate is not registered on-chain");
    chainMs = performance.now() - chainStarted;
    ledger = {
      ...ledger,
      root,
      registrationTx,
      onboardedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await options.onCheckpoint?.(ledger);
    return {
      ledger,
      timings: { joinMs, proofMs, chainMs, totalMs: performance.now() - totalStarted },
    };
  }

  ledger = {
    ...ledger,
    root,
    registrationTx,
    onboardedAt: ledger.onboardedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await options.onCheckpoint?.(ledger);
  return {
    ledger,
    timings: { joinMs, proofMs: 0, chainMs: 0, totalMs: performance.now() - totalStarted },
  };
}
