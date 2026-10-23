import {
  actionInput,
  budgetNullifier,
  ctxHash,
  encodeNoteMemo,
  L,
  loadArtifacts,
  memoHex,
  noteCm,
  prove as sdkProve,
  reqHash,
  toCalldata,
  truncateKey,
  verify as sdkVerify,
} from "@shadowpass/sdk";
import type {
  Action,
  ArtifactSet,
  Cert,
  CertificateBundle,
  ChainState,
  CircuitName,
  Deployment,
  Hex,
  Identity,
  Note,
  Point,
  WitnessInput,
} from "@shadowpass/sdk";
import {
  PAY_METHOD,
  SHADOWPASS_SCHEME,
  assembleShadowpassPayload,
  type ShadowpassPaymentBuilder,
  type ShadowpassPayload,
} from "@shadowpass/x402";
import { encodeAbiParameters } from "viem";
import type { AgentStore } from "./store.js";

type PaymentRequirements = Parameters<ShadowpassPaymentBuilder["buildPayment"]>[0];

export interface PaymentProofResult {
  proof: any;
  publicSignals: string[];
  artifacts: unknown;
}

export interface PaymentProver {
  prove(circuit: CircuitName, input: WitnessInput): Promise<PaymentProofResult>;
  verify(result: PaymentProofResult): Promise<boolean>;
}

class SdkPaymentProver implements PaymentProver {
  private readonly artifacts = new Map<CircuitName, Promise<ArtifactSet>>();

  async prove(circuit: CircuitName, input: WitnessInput): Promise<PaymentProofResult> {
    let artifacts = this.artifacts.get(circuit);
    if (!artifacts) {
      artifacts = loadArtifacts({ circuit });
      this.artifacts.set(circuit, artifacts);
    }
    let loaded: ArtifactSet;
    try {
      loaded = await artifacts;
    } catch (error) {
      if (this.artifacts.get(circuit) === artifacts) this.artifacts.delete(circuit);
      throw error;
    }
    const result = await sdkProve(circuit, input, loaded);
    return { ...result, artifacts: loaded };
  }

  verify(result: PaymentProofResult): Promise<boolean> {
    return sdkVerify(result.artifacts as ArtifactSet, result.proof, result.publicSignals);
  }
}

export interface ShadowpassPaymentBuilderOptions {
  store: AgentStore;
  deployment: Deployment;
  state: ChainState;
  blockTimestamp: () => Promise<bigint | number | string>;
  maxAmount?: bigint;
  prover?: PaymentProver;
  randomScalar?: (bound: bigint) => bigint;
}

export interface BuiltShadowpassPayment {
  payload: ShadowpassPayload;
  note: Note;
  budgetNf: bigint;
}

export class PaymentBuilderError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PaymentBuilderError";
  }
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function bigIntToBytes(value: bigint): Uint8Array {
  const output = new Uint8Array(32);
  let current = value;
  for (let index = output.length - 1; index >= 0; index -= 1) {
    output[index] = Number(current & 0xffn);
    current >>= 8n;
  }
  if (current !== 0n) throw new PaymentBuilderError("internal_scalar_overflow");
  return output;
}

function randomScalarBelow(bound: bigint): bigint {
  if (bound <= 0n) throw new PaymentBuilderError("internal_random_bound");
  for (;;) {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    const value = bytesToBigInt(bytes) % bound;
    if (value !== 0n) return value;
  }
}

function noteFromStored(note: CertificateBundle["note"]): Note {
  return {
    own: [BigInt(note.own[0]), BigInt(note.own[1])],
    q: BigInt(note.q),
    lin: [BigInt(note.lin[0]), BigInt(note.lin[1]), BigInt(note.lin[2]), BigInt(note.lin[3])],
    rho: BigInt(note.rho),
  };
}

function certFromBundle(cert: CertificateBundle["chain"][number]): Cert {
  return {
    hop: cert.hop,
    issuer: { Ax: BigInt(cert.issuer.x), Ay: BigInt(cert.issuer.y) } as Identity,
    holder: { Ax: BigInt(cert.holder.x), Ay: BigInt(cert.holder.y) } as Identity,
    cap: BigInt(cert.cap),
    expiry: BigInt(cert.expiry),
    sig: { S: BigInt(cert.sig.S), R8x: BigInt(cert.sig.R8x), R8y: BigInt(cert.sig.R8y) },
    vpk: cert.vpk ? { x: BigInt(cert.vpk.x), y: BigInt(cert.vpk.y) } : undefined,
    ownW: cert.ownW ? { x: BigInt(cert.ownW.x), y: BigInt(cert.ownW.y) } : undefined,
    hash: BigInt(cert.hash),
  };
}

function lineageMatches(note: Note, bundle: CertificateBundle): boolean {
  for (let index = 0; index < 4; index += 1) {
    const expected = index < bundle.chain.length ? BigInt(bundle.chain[index]!.hash) : 0n;
    if (note.lin[index] !== expected) return false;
  }
  return true;
}

export class ShadowpassAgentPaymentBuilder implements ShadowpassPaymentBuilder {
  private readonly prover: PaymentProver;
  private readonly randomScalar: (bound: bigint) => bigint;
  private lastPayment?: BuiltShadowpassPayment;

  constructor(private readonly options: ShadowpassPaymentBuilderOptions) {
    this.prover = options.prover ?? new SdkPaymentProver();
    this.randomScalar = options.randomScalar ?? randomScalarBelow;
  }

  get lastBuiltPayment(): BuiltShadowpassPayment | undefined {
    return this.lastPayment;
  }

  async buildPayment(requirements: PaymentRequirements, resourceUrl: string): Promise<ShadowpassPayload> {
    this.lastPayment = undefined;
    const amount = this.validateRequirements(requirements, resourceUrl);
    const bundle = await this.options.store.loadBundle();
    if (!bundle) throw new PaymentBuilderError("not_paired");
    if (bundle.chain.length > 3) throw new PaymentBuilderError("unsupported_chain_depth");

    const note = await this.selectNote(bundle, amount);
    const chain = bundle.chain.map(certFromBundle);
    const requestHash = reqHash({
      network: requirements.network,
      asset: requirements.asset as Hex,
      amount,
      payTo: requirements.payTo as Hex,
      resource: resourceUrl,
    });
    const nonce = this.randomScalar(1n << 248n);
    const action: Action = {
      target: requirements.extra!.payout as Hex,
      method: requirements.extra!.method as Hex,
      amount,
      nonce,
      params: encodeAbiParameters(
        [{ type: "address" }, { type: "bytes32" }],
        [requirements.payTo as Hex, requestHash],
      ),
    };

    const encryptionR = this.randomScalar(L);
    const encryptionK = this.randomScalar(L);
    const changeRho = this.randomScalar(L);
    const expectedChange: Note = {
      own: [note.own[0], note.own[1]],
      q: note.q - amount,
      lin: [note.lin[0], note.lin[1], note.lin[2], note.lin[3]],
      rho: changeRho,
    };
    const memoChange = memoHex(await encodeNoteMemo(expectedChange, this.options.store.boxPublicKey)) as Hex;
    const contextHash = ctxHash({
      chainId: this.options.deployment.chainId,
      gate: this.options.deployment.gate,
      action,
      memoChange,
    });
    const now = BigInt(await this.options.blockTimestamp());
    const randomValues = [encryptionR, encryptionK, changeRho].map((value) => bigIntToBytes(value));
    let randomIndex = 0;
    const witness = actionInput({
      chain,
      holderSk: this.options.store.holder.sk,
      note,
      qSpent: amount,
      ctxHash: contextHash,
      reqCap: 1n,
      now,
      state: this.options.state,
      random: (length) => {
        if (length !== 32 || randomIndex >= randomValues.length) {
          throw new PaymentBuilderError("internal_random_source");
        }
        const value = randomValues[randomIndex]!;
        randomIndex += 1;
        return Uint8Array.from(value);
      },
    });
    if (randomIndex !== 3) throw new PaymentBuilderError("internal_random_source");
    if (noteCm(witness.change) !== noteCm(expectedChange)) throw new PaymentBuilderError("internal_change_mismatch");

    const circuit = `main_d${chain.length}` as CircuitName;
    const started = performance.now();
    let proofResult: PaymentProofResult;
    try {
      proofResult = await this.prover.prove(circuit, witness.input);
    } catch {
      throw new PaymentBuilderError("proof_failed");
    }
    let verified = false;
    try {
      verified = await this.prover.verify(proofResult);
    } catch {
      verified = false;
    }
    if (!verified) throw new PaymentBuilderError("proof_verification_failed");
    const proofMs = performance.now() - started;
    const calldata = toCalldata(proofResult.proof, proofResult.publicSignals);
    const proof = { a: calldata.a, b: calldata.b, c: calldata.c };
    const roots = this.options.state.roots();
    const noteRoot = this.options.state.notes.proof(noteCm(note)).root;
    const budgetNf = budgetNullifier(this.options.store.holder.sk, note);
    const payload = assembleShadowpassPayload({
      requirements,
      resourceUrl,
      proof,
      roots: {
        issued: roots.issued.toString(),
        revoked: roots.revoked.toString(),
        root: roots.root.toString(),
      },
      nowTs: now,
      nonce,
      ct: ownerCiphertextCalldata(witness.ct).map(String),
      budget: {
        noteRoot: noteRoot.toString(),
        budgetNf: budgetNf.toString(),
        cmChange: noteCm(witness.change).toString(),
        qSpent: amount.toString(),
      },
      memoChange,
    });
    payload.timings = { proofMs };
    this.lastPayment = { payload, note, budgetNf };
    return payload;
  }

  private validateRequirements(requirements: PaymentRequirements, resourceUrl: string): bigint {
    if (requirements.scheme !== SHADOWPASS_SCHEME) throw new PaymentBuilderError("payment_scheme_mismatch");
    if (requirements.network !== `eip155:${this.options.deployment.chainId}`) {
      throw new PaymentBuilderError("payment_network_mismatch");
    }
    if (!sameAddress(requirements.asset, this.options.deployment.token)) {
      throw new PaymentBuilderError("payment_asset_mismatch");
    }
    if (
      typeof requirements.extra?.gate !== "string"
      || !sameAddress(requirements.extra.gate, this.options.deployment.gate)
      || typeof requirements.extra?.payout !== "string"
      || !sameAddress(requirements.extra.payout, this.options.deployment.payout)
      || requirements.extra?.method !== PAY_METHOD
    ) {
      throw new PaymentBuilderError("payment_requirements_mismatch");
    }
    let amount: bigint;
    try {
      amount = BigInt(requirements.amount);
    } catch {
      throw new PaymentBuilderError("invalid_payment_amount");
    }
    if (amount <= 0n) throw new PaymentBuilderError("invalid_payment_amount");
    if (this.options.maxAmount !== undefined && amount > this.options.maxAmount) {
      throw new PaymentBuilderError("spend_limit");
    }
    try {
      const parsed = new URL(resourceUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new PaymentBuilderError("invalid_resource_url");
      }
    } catch {
      throw new PaymentBuilderError("invalid_resource_url");
    }
    return amount;
  }

  private async selectNote(bundle: CertificateBundle, amount: bigint): Promise<Note> {
    const state = this.options.state;
    const candidates: Note[] = [];
    for (const raw of await this.options.store.notes()) {
      const note = noteFromStored(raw);
      if (note.own[0] !== this.options.store.holder.Ax || note.own[1] !== this.options.store.holder.Ay) continue;
      if (!lineageMatches(note, bundle)) continue;
      if (note.q < amount) continue;
      if (state.notes.indexOf(noteCm(note)) < 0) continue;
      if (state.spentNullifiers.has(budgetNullifier(this.options.store.holder.sk, note).toString())) continue;
      if (note.lin.some((entry) => entry !== 0n && state.revoked.has(truncateKey(entry)))) continue;
      candidates.push(note);
    }
    candidates.sort((left, right) => left.q < right.q ? -1 : left.q > right.q ? 1 : 0);
    const note = candidates[0];
    if (!note) throw new PaymentBuilderError("insufficient_budget");
    return note;
  }
}

function ownerCiphertextCalldata(ct: { c1: Point; c2: Point; e: bigint[]; esign: bigint }): bigint[] {
  return [ct.c1.x, ct.c1.y, ct.c2.x, ct.c2.y, ...ct.e, ct.esign];
}
