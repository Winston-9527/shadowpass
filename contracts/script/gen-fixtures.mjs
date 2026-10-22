// Real Groth16 fixtures for ShadowPass core-contract tests. The witness builder is the
// circuit reference implementation; the fixed gate/target addresses make ctx_hash match
// the Foundry deployment.
import fs from "fs";
import path from "path";
import * as snarkjs from "snarkjs";
import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { ShadowWorld, noteCm } from "@shadowpass/circuits/world";

const here = new URL(".", import.meta.url).pathname;
const root = path.resolve(here, "../..");
const build = path.join(root, "circuits/build");
const fixturesDir = path.join(root, "contracts/test/fixtures");

const CHAIN_ID = 31337n;
const GATE = "0x1000000000000000000000000000000000000001";
const TARGET = "0x2000000000000000000000000000000000000001";
const METHOD = keccak256(toBytes("shadowpass.PAY")).slice(0, 10);
const PARAMS = "0x2a";
const MEMO = "0x01020304";
const NOW = 1000n;
const DOMAIN = 7n;
const Q = 100n;

const stringify = (value) =>
  JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item), 2);

async function prove(circuit, input) {
  const wasm = path.join(build, circuit, `${circuit}_js/${circuit}.wasm`);
  const zkey = path.join(build, "zk", `${circuit}.zkey`);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  return {
    proof: {
      a: proof.pi_a.slice(0, 2),
      // Solidity Groth16 verifiers consume each Fp2 pair in the exportSolidityCallData order.
      b: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      c: proof.pi_c.slice(0, 2),
    },
    pub: publicSignals,
  };
}

function ctxHash(action, memoChange) {
  const encoded = encodeAbiParameters(
    [
      { type: "uint256" },
      { type: "address" },
      { type: "bytes4" },
      { type: "address" },
      { type: "bytes" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [
      CHAIN_ID,
      GATE,
      action.method,
      action.target,
      action.params,
      action.amount,
      action.nonce,
      keccak256(memoChange),
    ],
  );
  return BigInt(keccak256(encoded)) >> 8n;
}

async function makeWorld(seed) {
  const w = await ShadowWorld.create(seed);
  const alice = w.newIdentity();
  const steward = w.newIdentity();
  const buyer = w.newIdentity();
  const vk = w.newViewKey();
  w.addToGroup(alice);
  const c0 = w.issueRoot(alice, steward, 3n, 10_000n, vk);
  w.register(c0);
  const c1 = w.issue(c0, buyer, 1n, 9_000n);
  return { w, alice, steward, buyer, vk, c0, c1 };
}

async function coreScenario() {
  const x = await makeWorld("fixtures-core");
  const note1 = x.w.mintNote([x.c0, x.c1], Q);
  const note2 = x.w.mintNote([x.c0, x.c1], Q + 100n);
  const register = await prove("main_reg", x.w.registerInput({ human: x.alice, cert0: x.c0, domain: DOMAIN }));
  const steward2 = x.w.newIdentity();
  const c0b = x.w.issueRoot(x.alice, steward2, 3n, 11_000n, x.vk);
  const register2 = await prove("main_reg", x.w.registerInput({ human: x.alice, cert0: c0b, domain: DOMAIN }));
  const deposit1 = await prove("budget_mint", x.w.mintInput(note1));
  const deposit2 = await prove("budget_mint", x.w.mintInput(note2));
  const action = {
    target: TARGET,
    method: METHOD,
    amount: 10n,
    nonce: 1n,
    params: PARAMS,
  };
  const memoChange = "0xabc123";
  const execute = await prove(
    "main_d2",
    x.w.actionInput({
      chain: [x.c0, x.c1],
      holderSk: x.buyer.sk,
      note: note2,
      qSpent: action.amount,
      ctxHash: ctxHash(action, memoChange),
      reqCap: 1n,
      now: NOW,
    }).input,
  );
  const revokeC1 = await prove("main_revoke", x.w.revokeCertInput(x.c1, x.steward).input);
  const revokeC0 = await prove("main_revoke", x.w.revokeCertInput(x.c0, x.alice).input);
  return {
    group: { commitment: x.w.group.leaves[0], root: x.w.group.root },
    register,
    register2,
    issue: { certHash: x.c1.hash },
    roots: {
      issued: x.w.issued.root,
      revoked: x.w.revoked.root,
      root: x.w.roots.root,
    },
    revocations: { genesisRoot: x.w.revoked.root, genesisCount: x.w.revoked.leaves.length },
    deposit1: { ...deposit1, cm: noteCm(note1), q: note1.q, memo: MEMO },
    deposit2: { ...deposit2, cm: noteCm(note2), q: note2.q, memo: "0x05060708" },
    execute: {
      ...execute,
      roots: [x.w.issued.root, x.w.revoked.root, x.w.roots.root],
      now: NOW,
      action,
      ct: execute.pub.slice(4, 4 + 8),
      budget: execute.pub.slice(-4),
      memoChange,
    },
    revokeC1: { ...revokeC1, entry: x.c1.hash, newRoot: x.w.revokeCertInput(x.c1, x.steward).newRoot },
    revokeC0: { ...revokeC0, entry: x.c0.hash, newRoot: x.w.revokeCertInput(x.c0, x.alice).newRoot },
  };
}

async function transferScenario() {
  const x = await makeWorld("fixtures-core");
  const note = x.w.mintNote([x.c0], Q);
  const mint = await prove("budget_mint", x.w.mintInput(note));
  const transferInput = x.w.transferInput({
    holder: x.steward,
    holderSk: x.steward.sk,
    note,
    child: x.c1,
    q1: 40n,
    q2: 60n,
  });
  const transfer = await prove(
    "budget_transfer",
    transferInput.input,
  );
  x.w.notes.insert(noteCm(transferInput.out1));
  x.w.notes.insert(noteCm(transferInput.out2));
  const action = {
    target: TARGET,
    method: METHOD,
    amount: 10n,
    nonce: 2n,
    params: PARAMS,
  };
  const memoChange = "0xfeed";
  const register = await prove("main_reg", x.w.registerInput({ human: x.alice, cert0: x.c0, domain: DOMAIN }));
  const execute = await prove(
    "main_d2",
    x.w.actionInput({
      chain: [x.c0, x.c1],
      holderSk: x.buyer.sk,
      note: transferInput.out1,
      qSpent: action.amount,
      ctxHash: ctxHash(action, memoChange),
      reqCap: 1n,
      now: NOW,
    }).input,
  );
  return {
    register,
    issue: { certHash: x.c1.hash },
    roots: [x.w.issued.root, x.w.revoked.root, x.w.roots.root],
    deposit: { ...mint, cm: noteCm(note), q: note.q, memo: "0x04030201" },
    transfer: {
      ...transfer,
      noteRoot: transfer.pub[0],
      revokedRoot: transfer.pub[1],
      nullifier: transfer.pub[2],
      cm1: transfer.pub[3],
      cm2: transfer.pub[4],
      memo1: "0x1111",
      memo2: "0x2222",
    },
    execute: {
      ...execute,
      now: NOW,
      action,
      ct: execute.pub.slice(4, 4 + 8),
      budget: execute.pub.slice(-4),
      memoChange,
    },
  };
}

async function d1Scenario() {
  const x = await makeWorld("fixtures-core");
  const w = x.w;
  const issuedDecoy = 123n;
  w.issued.insert(issuedDecoy);
  const note = w.mintNote([x.c0], Q);
  const action = { target: TARGET, method: METHOD, amount: 10n, nonce: 3n, params: PARAMS };
  const memoChange = "0x11112222";
  return {
    register: await prove("main_reg", w.registerInput({ human: x.alice, cert0: x.c0, domain: DOMAIN })),
    issue: [x.c1.hash, issuedDecoy],
    roots: [w.issued.root, w.revoked.root, w.roots.root],
    deposit: { ...(await prove("budget_mint", w.mintInput(note))), cm: noteCm(note), q: note.q, memo: "0x01010101" },
    execute: {
      ...(await (async () => {
        const proof = await prove(
        "main_d1",
        w.actionInput({
          chain: [x.c0],
          holderSk: x.steward.sk,
          note,
          qSpent: action.amount,
          ctxHash: ctxHash(action, memoChange),
          reqCap: 1n,
          now: NOW,
        }).input,
        );
        return {
          ...proof,
          ct: proof.pub.slice(4, 4 + 7),
          budget: proof.pub.slice(-4),
        };
      })()),
      now: NOW,
      action,
      memoChange,
    },
  };
}

async function d3Scenario() {
  const x = await makeWorld("fixtures-core");
  const third = x.w.newIdentity();
  const c2 = x.w.issue(x.c1, third, 1n, 8_000n);
  const note = x.w.mintNote([x.c0, x.c1, c2], Q);
  const action = { target: TARGET, method: METHOD, amount: 10n, nonce: 4n, params: PARAMS };
  const memoChange = "0x33334444";
  return {
    register: await prove("main_reg", x.w.registerInput({ human: x.alice, cert0: x.c0, domain: DOMAIN })),
    issue: [x.c1.hash, c2.hash],
    roots: [x.w.issued.root, x.w.revoked.root, x.w.roots.root],
    deposit: { ...(await prove("budget_mint", x.w.mintInput(note))), cm: noteCm(note), q: note.q, memo: "0x02020202" },
    execute: {
      ...(await (async () => {
        const proof = await prove(
        "main_d3",
        x.w.actionInput({
          chain: [x.c0, x.c1, c2],
          holderSk: third.sk,
          note,
          qSpent: action.amount,
          ctxHash: ctxHash(action, memoChange),
          reqCap: 1n,
          now: NOW,
        }).input,
        );
        return {
          ...proof,
          ct: proof.pub.slice(4, 4 + 9),
          budget: proof.pub.slice(-4),
        };
      })()),
      now: NOW,
      action,
      memoChange,
    },
  };
}

const core = await coreScenario();
const transfer = await transferScenario();
const d1 = await d1Scenario();
const d3 = await d3Scenario();
fs.mkdirSync(fixturesDir, { recursive: true });
fs.writeFileSync(
  path.join(fixturesDir, "shadowpass.json"),
  stringify({
    chainId: CHAIN_ID,
    gate: GATE,
    target: TARGET,
    method: METHOD,
    reqCap: 1n,
    domain: DOMAIN,
    now: NOW,
    core,
    transfer,
    d1,
    d3,
  }),
);
console.log(`wrote ${path.join(fixturesDir, "shadowpass.json")}`);
process.exit(0);
