import {
  actionInput,
  ctxHash,
  createNote,
  encodeNoteMemo,
  loadArtifacts,
  noteCm,
  prove,
  reqHash,
  toCalldata,
  type ArtifactSet,
  type CertificateBundle,
  type ChainState,
  type CircuitName,
  type Deployment,
} from "@shadowpass/sdk";
import type { AgentStore } from "@shadowpass/mcp";
import {
  createWalletClient,
  encodeAbiParameters,
  hexToBytes,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { deserializeCert } from "../src/flows/cert.js";
import { memoHex } from "../src/flows/memo.js";
import type { WalletGateway } from "../src/flows/chain.js";
import type { CalldataProof } from "../src/flows/types.js";

const PAY = keccak256(toBytes("shadowpass.PAY")).slice(0, 10) as Hex;
const TREASURY = keccak256(toBytes("shadowpass.TREASURY_SUPPLY")).slice(0, 10) as Hex;
const ANVIL_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;

const gateAbi = parseAbi([
  "function execute((uint256[2] a,uint256[2][2] b,uint256[2] c) proof,(uint256 issued,uint256 revoked,uint256 root) roots,uint64 nowTs,(address target,bytes4 method,uint256 amount,uint256 nonce,bytes params) action,uint256[] ct,(uint256 noteRoot,uint256 budgetNf,uint256 cmChange,uint256 qSpent) budget,bytes memoChange)",
  "error StaleIssuedRoot()",
  "error StaleRevokedRoot()",
  "error UnregisteredRootRoot()",
  "error BadClock()",
  "error UnknownMethod()",
  "error TargetMismatch()",
  "error InvalidProof()",
  "error BadField()",
  "error BadCiphertextLength()",
  "error StaleNoteRoot()",
  "error BudgetSpent()",
  "error AmountMismatch()",
  "error UnknownState()",
  "error MemoTooLong()",
  "error TokenTransferFailed()",
]);
const treasuryAbi = parseAbi(["function quote(address vault,uint256 amount,uint256 term) view returns (uint256 expectedQ)"]);

export interface PreparedAction {
  proof: CalldataProof;
  roots: { issued: bigint; revoked: bigint; root: bigint };
  nowTs: bigint;
  action: {
    target: Address;
    method: Hex;
    amount: bigint;
    nonce: bigint;
    params: Hex;
  };
  ct: bigint[];
  budget: {
    noteRoot: bigint;
    budgetNf: bigint;
    cmChange: bigint;
    qSpent: bigint;
  };
  memoChange: Hex;
  change: CertificateBundle["note"];
}

const artifactCache = new Map<CircuitName, Promise<ArtifactSet>>();

async function proveAction(input: Record<string, unknown>, artifactsDir: string): Promise<CalldataProof> {
  let artifacts = artifactCache.get("main_d2");
  if (!artifacts) {
    artifacts = loadArtifacts({ circuit: "main_d2", dir: artifactsDir });
    artifactCache.set("main_d2", artifacts);
  }
  const result = await prove("main_d2", input, await artifacts);
  return { ...toCalldata(result.proof, result.publicSignals), publicSignals: result.publicSignals };
}

function deterministicRandom(seed: string): (length: number) => Uint8Array {
  let counter = 0;
  return (length: number) => {
    const bytes = hexToBytes(keccak256(toBytes(`${seed}:${counter}`)));
    counter += 1;
    return Uint8Array.from(bytes.slice(0, length));
  };
}

function storedNote(note: CertificateBundle["note"]) {
  return {
    own: [BigInt(note.own[0]), BigInt(note.own[1])] as [bigint, bigint],
    q: BigInt(note.q),
    lin: note.lin.map(BigInt) as [bigint, bigint, bigint, bigint],
    rho: BigInt(note.rho),
  };
}

async function prepareAction(options: {
  deployment: Deployment;
  state: ChainState;
  store: AgentStore;
  bundle: CertificateBundle;
  note: CertificateBundle["note"];
  target: Address;
  method: Hex;
  amount: bigint;
  params: Hex;
  reqCap: bigint;
  seed: string;
  artifactsDir: string;
}): Promise<PreparedAction> {
  const chain = options.bundle.chain.map(deserializeCert);
  const note = storedNote(options.note);
  const nowTs = BigInt(Math.floor(Date.now() / 1000));
  const nonce = BigInt(Date.now());
  const action = {
    target: options.target,
    method: options.method,
    amount: options.amount,
    nonce,
    params: options.params,
  };
  const witnessOptions = {
    chain,
    holderSk: options.store.holder.sk,
    note,
    qSpent: options.amount,
    reqCap: options.reqCap,
    now: nowTs,
    state: options.state,
    random: deterministicRandom(options.seed),
  };
  const draft = actionInput({ ...witnessOptions, ctxHash: 0n });
  const memoChange = memoHex(await encodeNoteMemo(draft.change, options.store.boxPublicKey));
  const context = ctxHash({ chainId: options.deployment.chainId, gate: options.deployment.gate, action, memoChange });
  const output = actionInput({ ...witnessOptions, ctxHash: context, random: deterministicRandom(options.seed) });
  if (noteCm(output.change) !== noteCm(draft.change)) throw new Error("deterministic action witness changed the change note");
  const proof = await proveAction(output.input, options.artifactsDir);
  const roots = options.state.roots();
  return {
    proof,
    roots: { issued: roots.issued, revoked: roots.revoked, root: roots.root },
    nowTs,
    action,
    ct: [output.ct.c1.x, output.ct.c1.y, output.ct.c2.x, output.ct.c2.y, ...output.ct.e, output.ct.esign],
    budget: {
      noteRoot: BigInt(String(output.input.note_root)),
      budgetNf: BigInt(String(output.input.budget_nf)),
      cmChange: BigInt(String(output.input.cm_change)),
      qSpent: options.amount,
    },
    memoChange,
    change: {
      own: output.change.own.map(String) as [string, string],
      q: output.change.q.toString(),
      lin: output.change.lin.map(String) as [string, string, string, string],
      rho: output.change.rho.toString(),
    },
  };
}

export async function preparePayment(options: {
  deployment: Deployment;
  state: ChainState;
  store: AgentStore;
  bundle: CertificateBundle;
  note: CertificateBundle["note"];
  amount: bigint;
  payTo: Address;
  resource: string;
  seed: string;
  artifactsDir: string;
}): Promise<PreparedAction> {
  const requestHash = reqHash({
    network: "anvil",
    asset: options.deployment.token,
    amount: options.amount,
    payTo: options.payTo,
    resource: options.resource,
  });
  const params = encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [options.payTo, requestHash]);
  return prepareAction({ ...options, target: options.deployment.payout, method: PAY, params, reqCap: 1n });
}

export async function prepareTreasurySupply(options: {
  publicClient: PublicClient;
  deployment: Deployment;
  state: ChainState;
  store: AgentStore;
  bundle: CertificateBundle;
  note: CertificateBundle["note"];
  amount: bigint;
  term: bigint;
  seed: string;
  artifactsDir: string;
}): Promise<PreparedAction> {
  const expectedQ = await options.publicClient.readContract({
    address: options.deployment.treasury,
    abi: treasuryAbi,
    functionName: "quote",
    args: [options.deployment.vault, options.amount, options.term],
  });
  if (expectedQ <= 0n) throw new Error("treasury quote is zero");
  const returnNote = createNote(options.store.holder, expectedQ, options.bundle.chain.map((cert) => BigInt(cert.hash)));
  const returnMemo = await encodeNoteMemo(returnNote, options.store.boxPublicKey);
  const params = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
    [options.deployment.vault, options.term, noteCm(returnNote), expectedQ, memoHex(returnMemo)],
  );
  return prepareAction({ ...options, target: options.deployment.treasury, method: TREASURY, params, reqCap: 2n });
}

function executeArgs(action: PreparedAction) {
  return [
    { a: action.proof.a as readonly [Hex, Hex], b: action.proof.b as readonly [readonly [Hex, Hex], readonly [Hex, Hex]], c: action.proof.c as readonly [Hex, Hex] },
    action.roots,
    action.nowTs,
    action.action,
    action.ct,
    action.budget,
    action.memoChange,
  ] as const;
}

export async function registerActionState(
  gateway: WalletGateway,
  action: PreparedAction,
): Promise<void> {
  await gateway.relay("registerState", {
    issued: action.roots.issued.toString(),
    revoked: action.roots.revoked.toString(),
    root: action.roots.root.toString(),
  });
}

export async function simulateAction(
  publicClient: PublicClient,
  deployment: Deployment,
  action: PreparedAction,
): Promise<void> {
  await publicClient.simulateContract({
    account: ANVIL_ACCOUNT,
    address: deployment.gate,
    abi: gateAbi,
    functionName: "execute",
    args: executeArgs(action),
  });
}

export async function submitAction(
  publicClient: PublicClient,
  rpcUrl: string,
  deployment: Deployment,
  action: PreparedAction,
): Promise<Hex> {
  const walletClient = createWalletClient({ account: ANVIL_ACCOUNT, transport: http(rpcUrl) });
  const hash = await walletClient.writeContract({
    account: ANVIL_ACCOUNT,
    chain: null,
    address: deployment.gate,
    abi: gateAbi,
    functionName: "execute",
    args: executeArgs(action),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Gate execute reverted in ${hash}`);
  return hash;
}
