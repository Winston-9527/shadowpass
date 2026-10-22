import {
  ChainState,
  decodeBundle,
  encodeBundle,
  keyEntry,
  noteCm,
  truncateKey,
} from "@shadowpass/sdk";
import type { CertificateBundle, Identity, Note } from "@shadowpass/sdk";
import { z } from "zod";
import type { AgentStore } from "./store.js";
import type { Capability, CredentialValidation } from "./types.js";

const bundleObjectSchema = z.object({ v: z.literal(1), chain: z.array(z.unknown()).min(1) });

function bundleNote(bundle: CertificateBundle): Note {
  return {
    own: [BigInt(bundle.note.own[0]), BigInt(bundle.note.own[1])],
    q: BigInt(bundle.note.q),
    lin: [
      BigInt(bundle.note.lin[0]),
      BigInt(bundle.note.lin[1]),
      BigInt(bundle.note.lin[2]),
      BigInt(bundle.note.lin[3]),
    ],
    rho: BigInt(bundle.note.rho),
  };
}

export function decodeCredentialValue(value: unknown): CertificateBundle {
  if (typeof value === "string") {
    try {
      return decodeBundle(value);
    } catch (error) {
      try {
        return decodeBundle(encodeBundle(JSON.parse(value) as CertificateBundle));
      } catch {
        throw error;
      }
    }
  }
  if (value && typeof value === "object" && bundleObjectSchema.safeParse(value).success) {
    return decodeBundle(encodeBundle(value as CertificateBundle));
  }
  throw new Error("mailbox entry is not a certificate bundle");
}

export function capabilitiesOf(bundle: CertificateBundle): Capability[] {
  const cap = BigInt(bundle.chain.at(-1)?.cap ?? "0");
  const result: Capability[] = [];
  if ((cap & 1n) !== 0n) result.push("PAY");
  if ((cap & 2n) !== 0n) result.push("TREASURY");
  return result;
}

export function validateCredentialBundle(
  bundle: CertificateBundle,
  options: {
    store: AgentStore;
    state: ChainState | undefined;
    deploymentName: string;
    chainId: number;
    nowSeconds?: bigint;
  },
): CredentialValidation {
  const errors: string[] = [];
  const { store, state } = options;
  const first = bundle.chain[0];
  const last = bundle.chain.at(-1);
  if (!first || !last) return { valid: false, errors: ["certificate chain is empty"], capabilities: [], revoked: false, expiry: 0n, stateRegistered: false };

  if (bundle.chainId !== options.chainId) errors.push(`chainId mismatch: bundle=${bundle.chainId}, deployment=${options.chainId}`);
  if (bundle.deployment !== options.deploymentName) errors.push(`deployment mismatch: bundle=${bundle.deployment}, local=${options.deploymentName}`);
  if (first.hop !== 0) errors.push("certificate chain must start at hop 0");
  for (let index = 0; index < bundle.chain.length; index += 1) {
    const cert = bundle.chain[index]!;
    if (cert.hop !== index) errors.push(`certificate hop mismatch at ${index}`);
    if (index > 0) {
      const previous = bundle.chain[index - 1]!;
      if (previous.holder.x !== cert.issuer.x || previous.holder.y !== cert.issuer.y) {
        errors.push(`certificate chain is not contiguous at hop ${index}`);
      }
    }
  }
  if (last.holder.x !== store.holder.Ax.toString() || last.holder.y !== store.holder.Ay.toString()) {
    errors.push("bundle terminal holder is not this agent");
  }

  const note = bundleNote(bundle);
  if (note.own[0] !== store.holder.Ax || note.own[1] !== store.holder.Ay) {
    errors.push("note owner is not this agent");
  }
  for (let index = 0; index < 4; index += 1) {
    const expected = index < bundle.chain.length ? BigInt(bundle.chain[index]!.hash) : 0n;
    if (note.lin[index] !== expected) errors.push(`note lineage mismatch at ${index}`);
  }

  let revoked = false;
  if (!state) {
    errors.push("chain state is unavailable");
  } else {
    if (state.rootTree.indexOf(BigInt(first.hash)) < 0) errors.push("root certificate is not registered");
    for (const cert of bundle.chain.slice(1)) {
      if (state.issued.indexOf(BigInt(cert.hash)) < 0) errors.push(`certificate at hop ${cert.hop} is not issued`);
    }
    for (const cert of bundle.chain) {
      const revokedEntry = truncateKey(BigInt(cert.hash));
      if (state.revoked.has(revokedEntry)) {
        revoked = true;
        errors.push(`certificate at hop ${cert.hop} is revoked`);
      }
    }
    const holderKey = keyEntry({ Ax: store.holder.Ax, Ay: store.holder.Ay } as Identity);
    if (state.revoked.has(truncateKey(holderKey))) {
      revoked = true;
      errors.push("agent holder key is revoked");
    }
    if (state.notes.indexOf(noteCm(note)) < 0) errors.push("note is not in the on-chain note tree");
  }

  const now = options.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
  if (now > BigInt(last.expiry)) errors.push("certificate chain is expired");
  const stateRoot = state?.roots().state;
  const stateRegistered = state !== undefined && stateRoot !== undefined && state.registeredStateRoots.has(stateRoot.toString());

  return {
    valid: errors.length === 0,
    errors,
    capabilities: capabilitiesOf(bundle),
    revoked,
    expiry: BigInt(last.expiry),
    stateRegistered,
  };
}

export function capForBundle(bundle: CertificateBundle, capability: Capability): boolean {
  const cap = BigInt(bundle.chain.at(-1)?.cap ?? "0");
  return capability === "PAY" ? (cap & 1n) !== 0n : (cap & 2n) !== 0n;
}
