import { MD, NT, RD, RT, TAG_BNF, TAG_REG } from "./constants.js";
import { keyEntry } from "./certs.js";
import { bytesToHex, poseidon, randomBytes, randomScalar } from "./crypto.js";
import { noteCm } from "./notes.js";
import { encryptChain } from "./owner.js";
import type { ChainState } from "./state.js";
import { stateRoot, truncateKey } from "./trees.js";
import type { Cert, Identity, Note, OwnerCiphertext, Point, WitnessInput } from "./types.js";

type RandomSource = (length: number) => Uint8Array;

function serialize(value: unknown): any {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return value.toString();
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serialize(child)]));
  }
  return value;
}

function pointArray(point: Point): [bigint, bigint] {
  return [point.x, point.y];
}

function pad(values: bigint[], length: number): bigint[] {
  const output = values.slice(0, length);
  while (output.length < length) output.push(0n);
  return output;
}

export interface ActionWitnessOptions {
  chain: Cert[];
  holderSk: bigint;
  note: Note;
  qSpent: bigint;
  ctxHash: bigint | string;
  reqCap: bigint;
  now: bigint;
  state: ChainState;
  ownW?: Point;
  encryptTo?: Point;
  random?: RandomSource;
}

export function actionInput(options: ActionWitnessOptions): { input: WitnessInput; change: Note; ct: OwnerCiphertext } {
  const { chain, holderSk, note, qSpent, ctxHash, reqCap, now, state } = options;
  const random = options.random ?? randomBytes;
  const depth = chain.length;
  const root = chain[0]!;
  if (!root.vpk) throw new Error("root certificate does not contain a view public key");
  const entities = [root.issuer, ...chain.map((cert) => cert.holder)];
  const ciphertext = encryptChain(entities.map((identity) => ({ x: identity.Ax, y: identity.Ay })), options.encryptTo ?? root.vpk, random);
  const rootProof = state.rootTree.proof(root.hash);
  const noteProof = state.notes.proof(noteCm(note));
  const issuedProofs = chain.map((cert) => (cert.hop === 0 ? null : state.issued.proof(cert.hash)));
  const revokedWitnesses = chain.map((cert) => state.revoked.nonMemberWitness(cert.hash));
  const keyWitnesses = depth > 1
    ? entities.slice(2).map((identity) => state.revoked.nonMemberWitness(keyEntry(identity)))
    : null;
  const zeroWitness = {
    lowValue: 0n,
    lowNextIndex: 0n,
    lowNextValue: 0n,
    siblings: Array(RD).fill(0n),
    bits: Array(RD).fill(0),
  };
  const changeQ = note.q - qSpent;
  if (changeQ < 0n) throw new Error("spend exceeds note amount");
  const change: Note = { own: [...note.own], q: changeQ, lin: [...note.lin], rho: scalarFrom(random(32)) };
  const ownW = options.ownW ?? root.ownW;
  if (!ownW) throw new Error("root certificate is missing own_w");
  const issuedRoot = state.issued.root;
  const revokedRoot = state.revoked.root;
  const rootRoot = rootProof.root;
  const input = {
    state_root: stateRoot(issuedRoot, revokedRoot, rootRoot),
    now,
    issued_root: issuedRoot,
    revoked_root: revokedRoot,
    root_root: rootRoot,
    ent_Ax: entities.map((identity) => identity.Ax),
    ent_Ay: entities.map((identity) => identity.Ay),
    sig_S: chain.map((cert) => cert.sig.S),
    sig_R8x: chain.map((cert) => cert.sig.R8x),
    sig_R8y: chain.map((cert) => cert.sig.R8y),
    cap: chain.map((cert) => cert.cap),
    expiry: chain.map((cert) => cert.expiry),
    m_depth: issuedProofs.map((proof) => proof?.depth ?? 0),
    m_index: issuedProofs.map((proof) => proof?.index ?? 0),
    m_sib: issuedProofs.map((proof) => pad(proof?.siblings ?? [], MD)),
    r_low_value: revokedWitnesses.map((witness) => witness.lowValue),
    r_low_next_index: revokedWitnesses.map((witness) => witness.lowNextIndex),
    r_low_next_value: revokedWitnesses.map((witness) => witness.lowNextValue),
    r_sib: revokedWitnesses.map((witness) => witness.siblings),
    r_bit: revokedWitnesses.map((witness) => witness.bits),
    rt_depth: rootProof.depth,
    rt_index: rootProof.index,
    rt_sib: pad(rootProof.siblings, RT),
    k_low_value: keyWitnesses ? keyWitnesses.map((witness) => witness.lowValue) : [0n],
    k_low_next_index: keyWitnesses ? keyWitnesses.map((witness) => witness.lowNextIndex) : [0n],
    k_low_next_value: keyWitnesses ? keyWitnesses.map((witness) => witness.lowNextValue) : [0n],
    k_sib: keyWitnesses ? keyWitnesses.map((witness) => witness.siblings) : [zeroWitness.siblings],
    k_bit: keyWitnesses ? keyWitnesses.map((witness) => witness.bits) : [zeroWitness.bits],
    holder_sk: holderSk,
    ctx_hash: BigInt(ctxHash),
    act_req_cap: reqCap,
    own_w: pointArray(ownW),
    own_r: ciphertext.r,
    own_kx: ciphertext.ephemeral?.x,
    own_ky: ciphertext.ephemeral?.y,
    own_c1x: ciphertext.c1.x,
    own_c1y: ciphertext.c1.y,
    own_c2x: ciphertext.c2.x,
    own_c2y: ciphertext.c2.y,
    own_e: ciphertext.e,
    own_esign: ciphertext.esign,
    note_root: noteProof.root,
    budget_nf: poseidon[3]([TAG_BNF, holderSk, noteCm(note)]),
    cm_change: noteCm(change),
    q_spent: qSpent,
    q_in: note.q,
    rho_in: note.rho,
    q_change: changeQ,
    rho_change: change.rho,
    nt_depth: noteProof.depth,
    nt_index: noteProof.index,
    nt_sib: pad(noteProof.siblings, NT),
  };
  return { input: serialize(input), change, ct: ciphertext };
}

export interface RegisterWitnessOptions {
  human: Identity;
  cert0: Cert;
  domain: bigint;
  state: ChainState;
  ownW?: Point;
}

export function registerInput({ human, cert0, domain, state, ownW }: RegisterWitnessOptions): WitnessInput {
  const proof = state.group.proof(poseidon[2]([human.Ax, human.Ay]));
  const rootOwnW = ownW ?? cert0.ownW;
  if (!rootOwnW) throw new Error("root certificate is missing own_w");
  const input = {
    group_root: proof.root,
    domain,
    nf_domain: poseidon[3]([TAG_REG, human.sk, domain]),
    leaf0: cert0.hash,
    human_sk: human.sk,
    master_Ax: cert0.holder.Ax,
    master_Ay: cert0.holder.Ay,
    cap0: cert0.cap,
    expiry0: cert0.expiry,
    own_w: pointArray(rootOwnW),
    depth: proof.depth,
    index: proof.index,
    siblings: pad(proof.siblings, RT),
  };
  return serialize(input);
}

export interface RevokeWitnessOptions {
  entry: bigint;
  kind?: bigint;
  who?: bigint;
  hop?: bigint;
  issuer: Point;
  holder?: Point;
  cap?: bigint;
  expiry?: bigint;
  signerSk: bigint;
  state: ChainState;
  ownW?: Point;
}

export function revokeInput(options: RevokeWitnessOptions): { input: WitnessInput; newRoot: bigint; nextIndex: bigint } {
  const entry = options.entry;
  const truncated = truncateKey(entry);
  if (options.state.revoked.has(truncated)) throw new Error("entry already revoked");
  const lowIndex = options.state.revoked.lowIndex(truncated);
  const low = options.state.revoked.leaves[lowIndex]!;
  const lowPath = options.state.revoked.path(lowIndex);
  const afterLow = options.state.revoked.clone();
  const nextIndex = BigInt(afterLow.leaves.length);
  afterLow.setLeaf(lowIndex, { value: low.value, nextIndex, nextValue: truncated });
  const newPath = afterLow.path(Number(nextIndex));
  afterLow.setLeaf(Number(nextIndex), { value: truncated, nextIndex: low.nextIndex, nextValue: low.nextValue });
  const input = {
    old_root: options.state.revoked.root,
    new_root: afterLow.root,
    entry,
    next_index: nextIndex,
    kind: options.kind ?? 1n,
    who: options.who ?? 0n,
    hop: options.hop ?? 0n,
    ia: pointArray(options.issuer),
    ha: pointArray(options.holder ?? { x: 0n, y: 0n }),
    cap: options.cap ?? 0n,
    expiry: options.expiry ?? 0n,
    own_w: pointArray(options.ownW ?? { x: 0n, y: 1n }),
    sk: options.signerSk,
    low_value: low.value,
    low_next_index: low.nextIndex,
    low_next_value: low.nextValue,
    low_sib: lowPath.siblings,
    low_bit: lowPath.bits,
    new_sib: newPath.siblings,
  };
  return { input: serialize(input), newRoot: afterLow.root, nextIndex };
}

export function revokeCertInput(
  cert: Cert,
  writer: Identity,
  who: 0 | 1,
  state: ChainState,
  ownW?: Point,
): { input: WitnessInput; newRoot: bigint; nextIndex: bigint } {
  if (cert.hop === 0 && !(ownW ?? cert.ownW)) throw new Error("root certificate revocation requires ownW");
  return revokeInput({
    entry: cert.hash,
    kind: 1n,
    who: BigInt(who),
    hop: BigInt(cert.hop),
    issuer: { x: cert.issuer.Ax, y: cert.issuer.Ay },
    holder: { x: cert.holder.Ax, y: cert.holder.Ay },
    cap: cert.cap,
    expiry: cert.expiry,
    signerSk: writer.sk,
    state,
    ownW: ownW ?? cert.ownW,
  });
}

export function revokeKeyInput(
  holder: Identity,
  writer: Identity = holder,
  state: ChainState,
): { input: WitnessInput; newRoot: bigint; nextIndex: bigint } {
  return revokeInput({
    entry: keyEntry(holder),
    kind: 0n,
    who: 0n,
    issuer: { x: holder.Ax, y: holder.Ay },
    signerSk: writer.sk,
    state,
  });
}

export interface TransferWitnessOptions {
  holder: Identity;
  note: Note;
  child?: Cert;
  q1: bigint;
  q2: bigint;
  state: ChainState;
  random?: RandomSource;
}

export function transferInput(options: TransferWitnessOptions): { input: WitnessInput; out1: Note; out2: Note } {
  const { holder, note, child, q1, q2, state } = options;
  const random = options.random ?? randomBytes;
  const delegate = child ? 1n : 0n;
  const firstFree = note.lin.findIndex((value) => value === 0n);
  if (child && child.hop !== firstFree) throw new Error("child certificate must occupy first free lineage slot");
  const childHolder = child?.holder ?? holder;
  const out1: Note = {
    own: [childHolder.Ax, childHolder.Ay],
    q: q1,
    lin: [...note.lin],
    rho: scalarFrom(random(32)),
  };
  const out2: Note = { own: [...note.own], q: q2, lin: [...note.lin], rho: scalarFrom(random(32)) };
  if (child) out1.lin[firstFree] = child.hash;
  const zero = {
    lowValue: 0n,
    lowNextIndex: 0n,
    lowNextValue: 0n,
    siblings: Array(RD).fill(0n),
    bits: Array(RD).fill(0),
  };
  const lineage = note.lin.map((value) => (value === 0n ? zero : state.revoked.nonMemberWitness(value)));
  const ownerKey = state.revoked.nonMemberWitness(keyEntry(holder));
  const noteProof = state.notes.proof(noteCm(note));
  const input = {
    note_root: noteProof.root,
    revoked_root: state.revoked.root,
    nullifier: poseidon[3]([TAG_BNF, holder.sk, noteCm(note)]),
    cm_out1: noteCm(out1),
    cm_out2: noteCm(out2),
    own: note.own,
    q_in: note.q,
    lin: note.lin,
    rho_in: note.rho,
    sk: holder.sk,
    nt_depth: noteProof.depth,
    nt_index: noteProof.index,
    nt_sib: pad(noteProof.siblings, NT),
    r_low_value: lineage.map((witness) => witness.lowValue),
    r_low_next_index: lineage.map((witness) => witness.lowNextIndex),
    r_low_next_value: lineage.map((witness) => witness.lowNextValue),
    r_sib: lineage.map((witness) => witness.siblings),
    r_bit: lineage.map((witness) => witness.bits),
    k_low_value: ownerKey.lowValue,
    k_low_next_index: ownerKey.lowNextIndex,
    k_low_next_value: ownerKey.lowNextValue,
    k_sib: ownerKey.siblings,
    k_bit: ownerKey.bits,
    o1: pointArray({ x: childHolder.Ax, y: childHolder.Ay }),
    q1,
    rho1: out1.rho,
    delegate,
    q2,
    rho2: out2.rho,
    cap: child?.cap ?? 0n,
    expiry: child?.expiry ?? 0n,
  };
  return { input: serialize(input), out1, out2 };
}

export function mintInput(note: Note): WitnessInput {
  return serialize({ cm: noteCm(note), q: note.q, own: note.own, lin: note.lin, rho: note.rho });
}

function scalarFrom(bytes: Uint8Array): bigint {
  return (BigInt(bytesToHex(bytes)) % (1n << 250n)) || randomScalar();
}
