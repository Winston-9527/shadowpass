import {
  groupCommitment,
  issueRoot,
  registerInput,
  verifyBundleCert,
  type Cert,
  type KeySet,
} from "@shadowpass/sdk";
import { serializeCert } from "./cert";
import { waitForChainState, type WalletGateway } from "./chain";
import type { ProofService } from "./prove";
import type { ProgressReporter, WalletLedger } from "./types";

const DAY_SECONDS = 24n * 60n * 60n;
export const ROOT_VALIDITY_SECONDS = 31n * DAY_SECONDS;

/** Stable within a UTC day so retrying onboarding after a lost tab derives the same cert0. */
export function rootExpiryFor(now: bigint): bigint {
  return (now / DAY_SECONDS) * DAY_SECONDS + ROOT_VALIDITY_SECONDS;
}

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

  const domain = await options.gateway.registryDomain();
  const provisionalRoot = issueRoot(
    options.bundle.sign,
    options.bundle.steward,
    3n,
    rootExpiryFor(now),
    options.bundle.view.vpk,
    options.bundle.view.w,
  );
  const nf = BigInt(registerInput({ human: options.bundle.sign, cert0: provisionalRoot, domain, state }).nf_domain as string);
  const registeredLeaf = await options.gateway.registryLeaf(nf);
  const storedRoot = ledger.root && validRoot(ledger.root, options.bundle) ? rootToCert(ledger.root, options.bundle) : null;
  const cert0 = registeredLeaf !== 0n
    ? (storedRoot?.hash === registeredLeaf ? storedRoot : recoverRegisteredRoot(options.bundle, registeredLeaf, now))
    : provisionalRoot;
  if (!cert0) throw new Error("wallet already has a registered root certificate that cannot be recovered; root rotation is not supported");
  if (cert0.expiry <= now) {
    throw new Error("wallet root certificate has expired; this MVP root is valid for 31 days and cannot be rotated yet");
  }
  const root = serializeCert(cert0);
  const proofStarted = performance.now();
  let registrationTx = ledger.registrationTx;
  let chainMs = 0;

  if (state.rootTree.indexOf(cert0.hash) < 0) {
    if (registeredLeaf !== 0n) {
      state = await waitForChainState(options.gateway, (candidate) => candidate.rootTree.indexOf(cert0.hash) >= 0);
      if (state.rootTree.indexOf(cert0.hash) < 0) throw new Error("registered root certificate is not visible on-chain");
      ledger = {
        ...ledger,
        root,
        rootRegistered: true,
        onboardedAt: ledger.onboardedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await options.onCheckpoint?.(ledger);
      return {
        ledger,
        timings: { joinMs, proofMs: 0, chainMs: 0, totalMs: performance.now() - totalStarted },
      };
    }
    if (ledger.root?.hash !== root.hash) registrationTx = undefined;
    ledger = {
      ...ledger,
      root,
      registrationTx,
      rootRegistered: false,
      updatedAt: new Date().toISOString(),
    };
    await options.onCheckpoint?.(ledger);
    options.progress?.("Generating registration proof");
    const input = registerInput({ human: options.bundle.sign, cert0, domain, state });
    const proof = await options.proofs.prove("main_reg", input);
    const proofMs = performance.now() - proofStarted;
    const oldLeaf = await options.gateway.registryLeaf(BigInt(proof.publicSignals[2]!));
    if (oldLeaf !== 0n && oldLeaf !== cert0.hash) {
      throw new Error("wallet was registered concurrently; retry to recover the existing root certificate");
    }
    options.progress?.("Registering root certificate");
    const chainStarted = performance.now();
    const receipt = await options.gateway.relay("register", {
      proof: { a: proof.a, b: proof.b, c: proof.c },
      groupRoot: proof.publicSignals[0]!,
      nf: proof.publicSignals[2]!,
      leaf0: proof.publicSignals[3]!,
      siblingNodes: [],
    });
    registrationTx = receipt.transaction;
    state = await waitForChainState(options.gateway, (candidate) => candidate.rootTree.indexOf(cert0.hash) >= 0);
    if (state.rootTree.indexOf(cert0.hash) < 0) throw new Error("root certificate is not registered on-chain");
    chainMs = performance.now() - chainStarted;
    ledger = {
      ...ledger,
      root,
      registrationTx,
      rootRegistered: true,
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
    rootRegistered: true,
    onboardedAt: ledger.onboardedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await options.onCheckpoint?.(ledger);
  return {
    ledger,
    timings: { joinMs, proofMs: 0, chainMs: 0, totalMs: performance.now() - totalStarted },
  };
}

function validRoot(root: WalletLedger["root"], bundle: KeySet): root is NonNullable<WalletLedger["root"]> {
  if (!root || root.hop !== 0 || !verifyBundleCert(root)) return false;
  return root.issuer.x === bundle.sign.Ax.toString()
    && root.issuer.y === bundle.sign.Ay.toString()
    && root.holder.x === bundle.steward.Ax.toString()
    && root.holder.y === bundle.steward.Ay.toString()
    && root.vpk?.x === bundle.view.vpk.x.toString()
    && root.vpk.y === bundle.view.vpk.y.toString();
}

function rootToCert(root: NonNullable<WalletLedger["root"]>, bundle: KeySet): Cert {
  return {
    hop: 0,
    issuer: bundle.sign,
    holder: bundle.steward,
    cap: BigInt(root.cap),
    expiry: BigInt(root.expiry),
    sig: { S: BigInt(root.sig.S), R8x: BigInt(root.sig.R8x), R8y: BigInt(root.sig.R8y) },
    vpk: root.vpk ? { x: BigInt(root.vpk.x), y: BigInt(root.vpk.y) } : undefined,
    ownW: root.ownW ? { x: BigInt(root.ownW.x), y: BigInt(root.ownW.y) } : undefined,
    hash: BigInt(root.hash),
  };
}

function recoverRegisteredRoot(bundle: KeySet, registeredLeaf: bigint, now: bigint): Cert | null {
  const maxAge = ROOT_VALIDITY_SECONDS / DAY_SECONDS + 1n;
  for (let offset = 0n; offset <= maxAge; offset += 1n) {
    const candidate = issueRoot(
      bundle.sign,
      bundle.steward,
      3n,
      rootExpiryFor(now - offset * DAY_SECONDS),
      bundle.view.vpk,
      bundle.view.w,
    );
    if (candidate.hash === registeredLeaf) return candidate;
  }
  return null;
}
