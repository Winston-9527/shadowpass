#!/usr/bin/env node
// Build deployments/<network>.json only from a completed Forge broadcast.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const networks = {
  anvil: { chainId: 31337, defaultRpc: "http://127.0.0.1:8545" },
  "base-sepolia": { chainId: 84532, defaultRpc: undefined },
};
const contractKeys = {
  ShadowVerifierD1: "d1",
  ShadowVerifierD2: "d2",
  ShadowVerifierD3: "d3",
  ShadowRegisterVerifier: "reg",
  ShadowRevokeVerifier: "revoke",
  ShadowBudgetTransferVerifier: "transfer",
  ShadowBudgetMintVerifier: "mint",
  ShadowGate: "gate",
  ShadowRegistry: "registry",
  ShadowRevocations: "revocations",
  ShadowGroup: "group",
  ShadowPayout: "payout",
  TreasuryAdapter: "treasury",
  MockVault: "vault",
  ShadowToken: "token",
};
const verifierKeys = ["d1", "d2", "d3", "reg", "revoke", "transfer", "mint"];
const contractAddressKeys = [
  "gate",
  "registry",
  "revocations",
  "group",
  "payout",
  "treasury",
  "vault",
  "token",
];

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function fail(message) {
  throw new Error(message);
}

function readBroadcast(file) {
  if (!fs.existsSync(file)) fail(`broadcast artifact not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function findNetwork(chainId, requested) {
  const entry = Object.entries(networks).find(([, config]) => config.chainId === chainId);
  if (!entry) fail(`unsupported chain id ${chainId}; refusing to record a deployment`);
  const [network, config] = entry;
  if (requested && requested !== network) {
    fail(`SHADOWPASS_NETWORK/--network is ${requested}, but broadcast chain id ${chainId} is ${network}`);
  }
  return { name: network, ...config };
}

function extractDeployment(artifact) {
  const transactions = artifact.transactions ?? [];
  const receipts = artifact.receipts ?? [];
  if (transactions.length === 0) fail("broadcast artifact contains no transactions");
  if ((artifact.pending ?? []).length > 0) fail("broadcast artifact still has pending transactions");
  if (receipts.length !== transactions.length) {
    fail(`broadcast artifact has ${transactions.length} transactions but ${receipts.length} receipts`);
  }

  const receiptByHash = new Map(receipts.map((receipt) => [receipt.transactionHash.toLowerCase(), receipt]));
  for (const transaction of transactions) {
    const receipt = receiptByHash.get(String(transaction.hash).toLowerCase());
    if (!receipt) fail(`missing receipt for ${transaction.hash}`);
    if (receipt.status !== "0x1") fail(`transaction failed: ${transaction.hash}`);
  }

  const addresses = {};
  for (const transaction of transactions) {
    const key = contractKeys[transaction.contractName];
    if (!key || transaction.transactionType !== "CREATE") continue;
    if (!transaction.contractAddress) fail(`missing deployed address for ${transaction.contractName}`);
    if (addresses[key]) fail(`duplicate deployment for ${transaction.contractName}`);
    addresses[key] = transaction.contractAddress;
  }

  for (const key of [...contractAddressKeys, ...verifierKeys]) {
    if (!addresses[key]) fail(`broadcast artifact is missing deployment address: ${key}`);
  }

  const blocks = receipts.map((receipt) => Number.parseInt(receipt.blockNumber, 16));
  if (blocks.some((block) => !Number.isSafeInteger(block) || block < 0)) {
    fail("broadcast artifact contains an invalid receipt block number");
  }

  return {
    addresses,
    startBlock: Math.min(...blocks),
    verifiers: Object.fromEntries(verifierKeys.map((key) => [key, addresses[key]])),
  };
}

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) fail(`RPC ${method} failed with HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) fail(`RPC ${method} failed: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result;
}

async function verifyChain({ rpcUrl, chainId, addresses }) {
  const actualChainId = Number.parseInt(await rpc(rpcUrl, "eth_chainId", []), 16);
  if (actualChainId !== chainId) fail(`RPC chain id is ${actualChainId}, expected ${chainId}`);

  const allAddresses = [...contractAddressKeys, ...verifierKeys].map((key) => addresses[key]);
  for (const address of allAddresses) {
    const code = await rpc(rpcUrl, "eth_getCode", [address, "latest"]);
    if (!code || code === "0x") fail(`no contract code at ${address}`);
  }

  // gate() selector; confirm the two immutable references agree on-chain.
  const result = await rpc(rpcUrl, "eth_call", [{ to: addresses.token, data: "0x7a0ebc88" }, "latest"]);
  if (!result || result === "0x") fail("token.gate() returned no data");
  const tokenGate = `0x${result.slice(-40)}`.toLowerCase();
  if (tokenGate !== addresses.gate.toLowerCase()) {
    fail(`token.gate() is ${tokenGate}, expected ${addresses.gate}`);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: node scripts/record-deployment.mjs [--network <name>] [--rpc-url <url>] [--broadcast <file>]");
    return;
  }

  const requestedNetwork = option("--network") ?? process.env.SHADOWPASS_NETWORK ?? undefined;
  const networkHint = requestedNetwork && requestedNetwork !== "anvil" && requestedNetwork !== "base-sepolia"
    ? fail(`unsupported network: ${requestedNetwork}`)
    : requestedNetwork;
  const rpcHint = option("--rpc-url") || (networkHint ? networks[networkHint].defaultRpc : undefined);
  const artifactHint = option("--broadcast");
  const artifactFile = artifactHint
    ? path.resolve(root, artifactHint)
    : path.join(root, "contracts/broadcast/Deploy.s.sol", String(networkHint ? networks[networkHint].chainId : 31337), "run-latest.json");
  const artifact = readBroadcast(artifactFile);
  const chainId = Number(artifact.chain);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) fail("broadcast artifact has an invalid chain id");

  const network = findNetwork(chainId, networkHint);
  const rpcUrl = rpcHint || (network.name === "base-sepolia" ? process.env.BASE_SEPOLIA_RPC : undefined);
  if (!rpcUrl) fail("Base Sepolia RPC is required: set BASE_SEPOLIA_RPC or pass --rpc-url");

  const deployment = extractDeployment(artifact);
  await verifyChain({ rpcUrl, chainId, addresses: deployment.addresses });

  const output = {
    chainId,
    ...Object.fromEntries(contractAddressKeys.map((key) => [key, deployment.addresses[key]])),
    verifiers: deployment.verifiers,
    startBlock: deployment.startBlock,
    facilitator: process.env.SHADOWPASS_FACILITATOR ?? "",
    mailbox: process.env.SHADOWPASS_MAILBOX ?? "",
  };
  const outputFile = path.join(root, "deployments", `${network.name}.json`);
  const temporaryFile = `${outputFile}.tmp`;
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(temporaryFile, `${JSON.stringify(output, null, 2)}\n`);
  fs.renameSync(temporaryFile, outputFile);
  console.log(`wrote ${path.relative(root, outputFile)} (chain ${chainId}, start block ${deployment.startBlock})`);
}

main().catch((error) => {
  console.error(`record-deployment: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
