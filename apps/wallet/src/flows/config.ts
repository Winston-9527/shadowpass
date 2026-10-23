import { loadDeployment, type Deployment } from "@shadowpass/sdk";

export interface WalletConfig {
  network: string;
  deployment: Deployment;
  rpcUrl: string;
  facilitatorUrl: string;
  mailboxUrl: string;
  artifactsUrl: string;
}

function url(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/$/, "");
}

export async function loadWalletConfig(): Promise<WalletConfig> {
  const network = import.meta.env.VITE_NETWORK?.trim() || "anvil";
  const deploymentPath = import.meta.env.VITE_DEPLOYMENT_URL?.trim()
    || new URL(`/deployments/${encodeURIComponent(network)}.json`, location.origin).toString();
  const response = await fetch(deploymentPath);
  if (!response.ok) throw new Error(`deployment ${network} is unavailable (${response.status})`);
  const deployment = await loadDeployment(await response.json() as Deployment);
  const mailboxUrl = import.meta.env.VITE_MAILBOX_URL?.trim() || deployment.mailbox;
  if (!mailboxUrl) throw new Error("VITE_MAILBOX_URL is required for credential delivery");
  const facilitatorUrl = import.meta.env.VITE_FACILITATOR_URL?.trim()
    || (network === "anvil" ? "/facilitator" : deployment.facilitator);
  if (!facilitatorUrl) throw new Error("VITE_FACILITATOR_URL is required for gas relay access");
  return {
    network,
    deployment,
    rpcUrl: url(import.meta.env.VITE_RPC_URL, network === "anvil" ? "http://127.0.0.1:8545" : "https://sepolia.base.org"),
    facilitatorUrl: url(facilitatorUrl, ""),
    mailboxUrl,
    artifactsUrl: url(import.meta.env.VITE_ARTIFACTS_URL, "/zk/circuits-v2"),
  };
}
