import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ChainState,
  createNote,
  deriveKeys,
  encodeBundle,
  encodeNoteMemo,
  IndexedMerkleTree,
  issue,
  issueRoot,
  MerkleTree,
  noteCm,
  stateRoot,
} from "@shadowpass/sdk";
import type { CertificateBundle, Deployment, Note } from "@shadowpass/sdk";
import { AgentStore } from "../src/store.js";

export const deployment: Deployment = {
  chainId: 84532,
  gate: "0x1111111111111111111111111111111111111111",
  registry: "0x2222222222222222222222222222222222222222",
  revocations: "0x3333333333333333333333333333333333333333",
  group: "0x4444444444444444444444444444444444444444",
  payout: "0x5555555555555555555555555555555555555555",
  treasury: "0x6666666666666666666666666666666666666666",
  vault: "0x7777777777777777777777777777777777777777",
  token: "0x8888888888888888888888888888888888888888",
  verifiers: {
    d1: "0x9999999999999999999999999999999999999999",
    d2: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    d3: "0xabababababababababababababababababababab",
    reg: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    revoke: "0xcccccccccccccccccccccccccccccccccccccccc",
    transfer: "0xdddddddddddddddddddddddddddddddddddddddd",
    mint: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  },
  startBlock: 0,
  facilitator: "http://localhost:3000",
  mailbox: "http://localhost:3001",
};

export async function createFixture(options: {
  name?: string;
  ownerSeed?: Uint8Array;
  cap?: bigint;
  rootCap?: bigint;
  agentCap?: bigint;
  expiry?: bigint;
  rootExpiry?: bigint;
  agentExpiry?: bigint;
  noteQ?: bigint;
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "shadowpass-mcp-"));
  const store = await AgentStore.open({ name: options.name ?? "buyer", root, network: "anvil", deployment: "anvil" });
  const owner = await deriveKeys(options.ownerSeed ?? Uint8Array.from({ length: 32 }, (_, index) => index + 10));
  const cap = options.cap ?? 3n;
  const rootCap = options.rootCap ?? cap;
  const agentCap = options.agentCap ?? cap;
  const expiry = options.expiry ?? 2_000_000_000n;
  const rootExpiry = options.rootExpiry ?? expiry;
  const agentExpiry = options.agentExpiry ?? expiry - 1_000n;
  const c0 = issueRoot(owner.sign, owner.steward, rootCap, rootExpiry, owner.view.vpk, owner.view.w);
  const c1 = issue(c0, store.holder, agentCap, agentExpiry);
  const note: Note = createNote(store.holder, options.noteQ ?? 80n, [c0.hash, c1.hash]);
  const memo = await encodeNoteMemo(note, store.boxPublicKey);
  const bundle: CertificateBundle = {
    v: 1,
    chainId: deployment.chainId,
    deployment: "anvil",
    chain: [
      {
        hop: 0,
        issuer: { x: owner.sign.Ax.toString(), y: owner.sign.Ay.toString() },
        holder: { x: owner.steward.Ax.toString(), y: owner.steward.Ay.toString() },
        cap: rootCap.toString(),
        expiry: rootExpiry.toString(),
        sig: { S: c0.sig.S.toString(), R8x: c0.sig.R8x.toString(), R8y: c0.sig.R8y.toString() },
        vpk: { x: owner.view.vpk.x.toString(), y: owner.view.vpk.y.toString() },
        ownW: { x: owner.view.w.x.toString(), y: owner.view.w.y.toString() },
        hash: c0.hash.toString(),
      },
      {
        hop: 1,
        issuer: { x: c1.issuer.Ax.toString(), y: c1.issuer.Ay.toString() },
        holder: { x: c1.holder.Ax.toString(), y: c1.holder.Ay.toString() },
        cap: c1.cap.toString(),
        expiry: c1.expiry.toString(),
        sig: { S: c1.sig.S.toString(), R8x: c1.sig.R8x.toString(), R8y: c1.sig.R8y.toString() },
        hash: c1.hash.toString(),
      },
    ],
    note: {
      own: [note.own[0].toString(), note.own[1].toString()],
      q: note.q.toString(),
      lin: note.lin.map(String) as CertificateBundle["note"]["lin"],
      rho: note.rho.toString(),
    },
    owner: { box: Buffer.from(owner.box.publicKey).toString("hex") },
  };

  const issued = new MerkleTree();
  const roots = new MerkleTree();
  const notes = new MerkleTree();
  issued.insert(c1.hash);
  roots.insert(c0.hash);
  notes.insert(noteCm(note));
  const revokedRoot = new IndexedMerkleTree().root;
  const logs = [
    { eventName: "Registered", args: { nf: 1n, leaf0: c0.hash, index: 0, root: roots.root }, blockNumber: 1n, logIndex: 0 },
    { eventName: "Issued", args: { certHash: c1.hash, index: 0, root: issued.root }, blockNumber: 1n, logIndex: 1 },
    { eventName: "NoteInserted", args: { cm: noteCm(note), index: 0, root: notes.root }, blockNumber: 1n, logIndex: 2 },
    { eventName: "NoteMemo", args: { cm: noteCm(note), memo: `0x${Buffer.from(memo).toString("hex")}` }, blockNumber: 1n, logIndex: 3 },
    {
      eventName: "StateRegistered",
      args: { issued: issued.root, revoked: revokedRoot, root: roots.root, stateRoot: stateRoot(issued.root, revokedRoot, roots.root) },
      blockNumber: 1n,
      logIndex: 4,
    },
  ];
  const state = ChainState.fromLogs(deployment, logs);
  return {
    root,
    store,
    owner,
    cap,
    rootCap,
    agentCap,
    expiry,
    rootExpiry,
    agentExpiry,
    c0,
    c1,
    note,
    bundle,
    memo,
    encodedBundle: encodeBundle(bundle),
    logs,
    state,
  };
}

export async function createForeignBundle(
  store: AgentStore,
  options: {
    ownerSeed?: Uint8Array;
    cap?: bigint;
    expiry?: bigint;
    noteQ?: bigint;
  } = {},
) {
  const owner = await deriveKeys(options.ownerSeed ?? Uint8Array.from({ length: 32 }, (_, index) => index + 80));
  const cap = options.cap ?? 3n;
  const expiry = options.expiry ?? 2_000_000_000n;
  const root = issueRoot(owner.sign, owner.steward, cap, expiry, owner.view.vpk, owner.view.w);
  const child = issue(root, store.holder, cap, expiry - 1_000n);
  const note = createNote(store.holder, options.noteQ ?? 10n, [root.hash, child.hash]);
  const bundle: CertificateBundle = {
    v: 1,
    chainId: deployment.chainId,
    deployment: "anvil",
    chain: [
      {
        hop: 0,
        issuer: { x: owner.sign.Ax.toString(), y: owner.sign.Ay.toString() },
        holder: { x: owner.steward.Ax.toString(), y: owner.steward.Ay.toString() },
        cap: cap.toString(),
        expiry: expiry.toString(),
        sig: { S: root.sig.S.toString(), R8x: root.sig.R8x.toString(), R8y: root.sig.R8y.toString() },
        vpk: { x: owner.view.vpk.x.toString(), y: owner.view.vpk.y.toString() },
        ownW: { x: owner.view.w.x.toString(), y: owner.view.w.y.toString() },
        hash: root.hash.toString(),
      },
      {
        hop: 1,
        issuer: { x: child.issuer.Ax.toString(), y: child.issuer.Ay.toString() },
        holder: { x: child.holder.Ax.toString(), y: child.holder.Ay.toString() },
        cap: cap.toString(),
        expiry: (expiry - 1_000n).toString(),
        sig: { S: child.sig.S.toString(), R8x: child.sig.R8x.toString(), R8y: child.sig.R8y.toString() },
        hash: child.hash.toString(),
      },
    ],
    note: {
      own: [note.own[0].toString(), note.own[1].toString()],
      q: note.q.toString(),
      lin: note.lin.map(String) as CertificateBundle["note"]["lin"],
      rho: note.rho.toString(),
    },
    owner: { box: Buffer.from(owner.box.publicKey).toString("hex") },
  };
  return { owner, root, child, note, bundle, encodedBundle: encodeBundle(bundle) };
}

export function revokedState(fixture: Awaited<ReturnType<typeof createFixture>>): ChainState {
  const revoked = new IndexedMerkleTree();
  const oldRoot = revoked.root;
  revoked.insert(fixture.c1.hash);
  const root = new MerkleTree(fixture.c0 ? [fixture.c0.hash] : []);
  const issued = new MerkleTree([fixture.c1.hash]);
  const notes = new MerkleTree([noteCm(fixture.note)]);
  return ChainState.fromLogs(deployment, [
    { eventName: "Registered", args: { nf: 1n, leaf0: fixture.c0.hash, index: 0, root: root.root }, blockNumber: 1n, logIndex: 0 },
    { eventName: "Issued", args: { certHash: fixture.c1.hash, index: 0, root: issued.root }, blockNumber: 1n, logIndex: 1 },
    { eventName: "NoteInserted", args: { cm: noteCm(fixture.note), index: 0, root: notes.root }, blockNumber: 1n, logIndex: 2 },
    { eventName: "Revoked", args: { entry: fixture.c1.hash, index: 1, oldRoot, newRoot: revoked.root }, blockNumber: 1n, logIndex: 3 },
  ]);
}
