import * as snarkjs from "snarkjs";
import { ARTIFACT_HASHES } from "./artifact-hashes.js";
import { bytesToHex } from "./crypto.js";

export type CircuitName =
  | "main_d1"
  | "main_d2"
  | "main_d3"
  | "main_reg"
  | "main_revoke"
  | "budget_transfer"
  | "budget_mint";

export interface ArtifactSet {
  circuit: CircuitName;
  wasm: Uint8Array;
  zkey: Uint8Array;
  vk: any;
  manifest: string;
}

function scalar(input: Record<string, unknown>, key: string): string {
  if (input[key] === undefined) throw new Error(`witness is missing ${key}`);
  return String(input[key]);
}

export function expectedPublicSignals(circuit: CircuitName, input: Record<string, unknown>): string[] {
  if (circuit === "main_reg") {
    return ["group_root", "domain", "nf_domain", "leaf0"].map((key) => scalar(input, key));
  }
  if (circuit === "main_revoke") {
    return ["old_root", "new_root", "entry", "next_index"].map((key) => scalar(input, key));
  }
  if (circuit === "budget_transfer") {
    return ["note_root", "revoked_root", "nullifier", "cm_out1", "cm_out2"].map((key) => scalar(input, key));
  }
  if (circuit === "budget_mint") return ["cm", "q"].map((key) => scalar(input, key));
  const ownE = input.own_e;
  if (!Array.isArray(ownE)) throw new Error("witness is missing own_e");
  return [
    scalar(input, "state_root"),
    scalar(input, "now"),
    scalar(input, "ctx_hash"),
    scalar(input, "act_req_cap"),
    scalar(input, "own_c1x"),
    scalar(input, "own_c1y"),
    scalar(input, "own_c2x"),
    scalar(input, "own_c2y"),
    ...ownE.map(String),
    scalar(input, "own_esign"),
    scalar(input, "note_root"),
    scalar(input, "budget_nf"),
    scalar(input, "cm_change"),
    scalar(input, "q_spent"),
  ];
}

export interface LoadArtifactsOptions {
  circuit: CircuitName;
  dir?: string;
  baseUrl?: string;
  trustedHashes?: Readonly<Record<string, string>>;
  trustManifestHashes?: boolean;
}

function parseManifest(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (!match) continue;
    const path = match[2]!.replaceAll("\\", "/");
    entries.set(path.split("/").pop()!, match[1]!.toLowerCase());
  }
  return entries;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return bytesToHex(new Uint8Array(digest)).slice(2);
}

async function readUrl(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function readDir(dir: string, filename: string): Promise<Uint8Array> {
  const { readFile } = await import("node:fs/promises");
  return new Uint8Array(await readFile(`${dir.replace(/\/$/, "")}/${filename}`));
}

async function readArtifact(
  options: LoadArtifactsOptions,
  filename: string,
): Promise<Uint8Array> {
  if (options.dir) return readDir(options.dir, filename);
  if (options.baseUrl) return readUrl(`${options.baseUrl.replace(/\/$/, "")}/${filename}`);
  throw new Error("loadArtifacts requires dir or baseUrl");
}

export async function loadArtifacts(options: LoadArtifactsOptions): Promise<ArtifactSet> {
  const configured = options.dir ?? options.baseUrl ?? (globalThis as any).process?.env?.SHADOWPASS_ARTIFACTS;
  const resolved: LoadArtifactsOptions = options.dir || options.baseUrl
    ? options
    : {
        circuit: options.circuit,
        ...(configured ? (/^https?:\/\//.test(configured) ? { baseUrl: configured } : { dir: configured }) : {}),
      };
  const manifestBytes = await readArtifact(resolved, "MANIFEST.sha256");
  const manifest = new TextDecoder().decode(manifestBytes);
  const entries = parseManifest(manifest);
  const processEnv = (globalThis as any).process?.env;
  const trustManifestHashes = options.trustManifestHashes
    ?? (Boolean(resolved.dir) && processEnv?.SHADOWPASS_TRUST_LOCAL_ARTIFACTS === "1");
  const trustedHashes = options.trustedHashes ?? ARTIFACT_HASHES;
  const wasmName = `${options.circuit}.wasm`;
  const zkeyName = `${options.circuit}.zkey`;
  const vkName = `vk_${options.circuit}.json`;
  const [wasm, zkey, vkBytes] = await Promise.all([
    readArtifact(resolved, wasmName),
    readArtifact(resolved, zkeyName),
    readArtifact(resolved, vkName),
  ]);
  for (const [filename, bytes] of [
    [wasmName, wasm],
    [zkeyName, zkey],
    [vkName, vkBytes],
  ] as const) {
    const expected = options.trustedHashes?.[filename]
      ?? (filename === wasmName || trustManifestHashes ? entries.get(filename) : trustedHashes[filename]);
    if (!expected) throw new Error(`no trusted hash for ${filename}`);
    const actual = await sha256(bytes);
    if (actual !== expected) throw new Error(`${filename} hash mismatch`);
  }
  return {
    circuit: options.circuit,
    wasm,
    zkey,
    vk: JSON.parse(new TextDecoder().decode(vkBytes)),
    manifest,
  };
}

export async function prove(
  circuit: CircuitName,
  input: Record<string, unknown>,
  artifacts: ArtifactSet,
): Promise<{ proof: any; publicSignals: string[] }> {
  if (artifacts.circuit !== circuit) throw new Error("artifact circuit mismatch");
  const result = await snarkjs.groth16.fullProve(input, artifacts.wasm, artifacts.zkey);
  const expected = expectedPublicSignals(circuit, input);
  const publicSignals = result.publicSignals as string[];
  if (publicSignals.length !== expected.length || publicSignals.some((value: string, index: number) => value !== expected[index])) {
    throw new Error("publicSignals do not match witness public inputs");
  }
  return { proof: result.proof, publicSignals };
}

export async function verify(artifacts: ArtifactSet, proof: any, publicSignals: string[]): Promise<boolean> {
  return snarkjs.groth16.verify(artifacts.vk, publicSignals, proof);
}

export function toCalldata(proof: any, publicSignals: string[]): {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  publicSignals: string[];
} {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    c: [proof.pi_c[0], proof.pi_c[1]],
    publicSignals,
  };
}
