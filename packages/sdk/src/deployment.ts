import { z } from "zod";
import type { Deployment } from "./types.js";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const DeploymentSchema = z.object({
  chainId: z.number().int().positive(),
  gate: address,
  registry: address,
  revocations: address,
  group: address,
  payout: address,
  treasury: address,
  vault: address,
  token: address,
  verifiers: z.object({
    d1: address,
    d2: address,
    d3: address.optional(),
    reg: address,
    revoke: address,
    transfer: address,
    mint: address,
  }),
  startBlock: z.number().int().nonnegative(),
  facilitator: z.string(),
  mailbox: z.string(),
});

export interface LoadDeploymentOptions {
  baseUrl?: string;
}

export async function loadDeployment(
  source: string | Deployment,
  options: LoadDeploymentOptions = {},
): Promise<Deployment> {
  if (typeof source === "object") return DeploymentSchema.parse(source) as Deployment;
  if (source.trim().startsWith("{")) return DeploymentSchema.parse(JSON.parse(source)) as Deployment;

  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`failed to load deployment: ${response.status}`);
    return DeploymentSchema.parse(await response.json()) as Deployment;
  }

  if (options.baseUrl) {
    const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/deployments/${source}.json`);
    if (!response.ok) throw new Error(`failed to load deployment: ${response.status}`);
    return DeploymentSchema.parse(await response.json()) as Deployment;
  }

  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFile } = await import("node:fs/promises");
    const path = new URL(`../../../deployments/${source}.json`, import.meta.url);
    return DeploymentSchema.parse(JSON.parse(await readFile(path, "utf8"))) as Deployment;
  }

  throw new Error("loadDeployment requires a URL, JSON object, JSON string, or Node filesystem");
}
