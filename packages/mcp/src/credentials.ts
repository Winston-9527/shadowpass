import {
  budgetNullifier,
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
const pairingSecretSchema = z.string().regex(/^[0-9a-f]{32}$/);

export interface CredentialEnvelope {
  bundle: CertificateBundle;
  pair?: string;
}

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

function decodeBundleObject(value: unknown): CertificateBundle {
  return decodeBundle(encodeBundle(value as CertificateBundle));
}

function optionalPair(value: unknown): string | undefined {
  return typeof value === "string" && pairingSecretSchema.safeParse(value).success ? value : undefined;
}

export function decodeCredentialValue(value: unknown): CredentialEnvelope {
  if (typeof value === "string") {
    try {
      return { bundle: decodeBundle(value) };
    } catch (bundleError) {
      try {
        return decodeCredentialValue(JSON.parse(value) as unknown);
      } catch {
        throw bundleError;
      }
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("bundle" in record) {
      const inner = record.bundle;
      const bundle = typeof inner === "string" ? decodeBundle(inner) : decodeBundleObject(inner);
      return { bundle, pair: optionalPair(record.pair) };
    }
    if (bundleObjectSchema.safeParse(record).success) {
      return { bundle: decodeBundleObject(record), pair: optionalPair(record.pair) };
    }
  }
  throw new Error("mailbox entry is not a certificate bundle");
}

export function credentialCap(bundle: CertificateBundle): bigint {
  const first = bundle.chain[0];
  if (!first) return 0n;
  return bundle.chain.slice(1).reduce((cap, cert) => cap & BigInt(cert.cap), BigInt(first.cap));
}

export function credentialExpiry(bundle: CertificateBundle): bigint {
  const first = bundle.chain[0];
  if (!first) return 0n;
  return bundle.chain.slice(1).reduce((expiry, cert) => {
    const candidate = BigInt(cert.expiry);
    return candidate < expiry ? candidate : expiry;
  }, BigInt(first.expiry));
}

export function capabilitiesOf(bundle: CertificateBundle): Capability[] {
  const cap = credentialCap(bundle);
  const result: Capability[] = [];
  if ((cap & 1n) !== 0n) result.push("PAY");
  if ((cap & 2n) !== 0n) result.push("TREASURY");
  return result;
}

export interface CredentialValidationOptions {
  store: AgentStore;
  state: ChainStateLike | undefined;
  deploymentName: string;
  chainId: number;
  nowSeconds?: bigint;
}

export function validateCredentialChain(
  bundle: CertificateBundle,
  options: CredentialValidationOptions,
): CredentialValidation {
  const errors: string[] = [];
  const { store, state } = options;
  const first = bundle.chain[0];
  const last = bundle.chain.at(-1);
  if (!first || !last) {
    return { valid: false, errors: ["empty_chain"], capabilities: [], revoked: false, expiry: 0n, stateRegistered: false };
  }

  if (bundle.chainId !== options.chainId) errors.push("chain_id_mismatch");
  if (bundle.deployment !== options.deploymentName) errors.push("deployment_mismatch");
  if (first.hop !== 0) errors.push("chain_hop_mismatch");
  if (bundle.chain.length > 4) errors.push("chain_too_long");
  for (let index = 0; index < bundle.chain.length; index += 1) {
    const cert = bundle.chain[index]!;
    if (cert.hop !== index) errors.push("chain_hop_mismatch");
    if (index > 0) {
      const previous = bundle.chain[index - 1]!;
      if (previous.holder.x !== cert.issuer.x || previous.holder.y !== cert.issuer.y) {
        errors.push("chain_discontinuous");
      }
    }
  }
  if (last.holder.x !== store.holder.Ax.toString() || last.holder.y !== store.holder.Ay.toString()) {
    errors.push("terminal_holder_mismatch");
  }

  let revoked = false;
  if (!state) {
    errors.push("chain_state_unavailable");
  } else {
    if (state.rootTree.indexOf(BigInt(first.hash)) < 0) errors.push("root_not_registered");
    if (bundle.chain.slice(1).some((cert) => state.issued.indexOf(BigInt(cert.hash)) < 0)) {
      errors.push("certificate_not_issued");
    }
    for (const cert of bundle.chain) {
      if (state.revoked.has(truncateKey(BigInt(cert.hash)))) {
        revoked = true;
        errors.push("certificate_revoked");
      }
    }
    const holderKey = keyEntry({ Ax: store.holder.Ax, Ay: store.holder.Ay } as Identity);
    if (state.revoked.has(truncateKey(holderKey))) {
      revoked = true;
      errors.push("holder_revoked");
    }
  }

  const now = options.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
  if (now > credentialExpiry(bundle)) errors.push("credential_expired");
  const stateRoot = state?.roots().state;
  const stateRegistered = state !== undefined && stateRoot !== undefined && state.registeredStateRoots.has(stateRoot.toString());

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    capabilities: capabilitiesOf(bundle),
    revoked,
    expiry: credentialExpiry(bundle),
    stateRegistered,
  };
}

export function validateCredentialBundle(
  bundle: CertificateBundle,
  options: CredentialValidationOptions,
): CredentialValidation {
  const chainValidation = validateCredentialChain(bundle, options);
  const first = bundle.chain[0];
  const last = bundle.chain.at(-1);
  if (!first || !last) return chainValidation;

  const errors = [...chainValidation.errors];
  const note = bundleNote(bundle);
  if (note.own[0] !== options.store.holder.Ax || note.own[1] !== options.store.holder.Ay) {
    errors.push("note_owner_mismatch");
  }
  for (let index = 0; index < 4; index += 1) {
    const expected = index < bundle.chain.length ? BigInt(bundle.chain[index]!.hash) : 0n;
    if (note.lin[index] !== expected) errors.push("note_lineage_mismatch");
  }
  if (options.state) {
    if (options.state.notes.indexOf(noteCm(note)) < 0) errors.push("note_not_registered");
    if (options.state.spentNullifiers.has(budgetNullifier(options.store.holder.sk, note).toString())) {
      errors.push("note_spent");
    }
  }
  const uniqueErrors = [...new Set(errors)];
  return { ...chainValidation, valid: uniqueErrors.length === 0, errors: uniqueErrors };
}

export function isRetryableCredentialError(code: string): boolean {
  return code === "chain_state_unavailable"
    || code === "root_not_registered"
    || code === "certificate_not_issued"
    || code === "note_not_registered";
}

export interface ChainStateLike {
  issued: { indexOf(value: bigint): number };
  rootTree: { indexOf(value: bigint): number };
  notes: { indexOf(value: bigint): number };
  revoked: { has(value: bigint): boolean };
  spentNullifiers: Set<string>;
  registeredStateRoots: Set<string>;
  roots(): { state: bigint };
}

export function capForBundle(bundle: CertificateBundle, capability: Capability): boolean {
  const cap = credentialCap(bundle);
  return capability === "PAY" ? (cap & 1n) !== 0n : (cap & 2n) !== 0n;
}
