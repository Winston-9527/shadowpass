import {
  budgetNullifier,
  ChainState,
  MailboxClient,
  noteCm,
  truncateKey,
} from "@shadowpass/sdk";
import type { CertificateBundle, Note } from "@shadowpass/sdk";
import { capForBundle, validateCredentialBundle } from "./credentials.js";
import type { AgentStore } from "./store.js";
import {
  McpToolError,
  type Capability,
  type DelegateRequest,
  type DelegateResult,
  type McpServices,
  type PaymentRequest,
  type PaymentResult,
  type TreasurySupplyRequest,
  type TreasurySupplyResult,
} from "./types.js";

export interface McpToolContext {
  store: AgentStore;
  state?: ChainState;
  deploymentName: string;
  chainId: number;
  services: McpServices;
  mailbox?: MailboxClient;
  malicious: boolean;
  maxPayment: bigint;
  nowSeconds?: bigint;
}

function noteFromStored(note: CertificateBundle["note"]): Note {
  return {
    own: [BigInt(note.own[0]), BigInt(note.own[1])],
    q: BigInt(note.q),
    lin: [BigInt(note.lin[0]), BigInt(note.lin[1]), BigInt(note.lin[2]), BigInt(note.lin[3])],
    rho: BigInt(note.rho),
  };
}

function assertCapability(bundle: CertificateBundle, capability: Capability, action: string): void {
  if (!capForBundle(bundle, capability)) {
    throw new McpToolError("capability_mismatch", `${action} requires ${capability}; this agent has ${bundle.chain.at(-1)?.cap ?? "0"}`);
  }
}

async function authorizedBundle(context: McpToolContext): Promise<CertificateBundle> {
  const bundle = await context.store.loadBundle();
  if (!bundle) throw new McpToolError("not_paired", "this agent is not paired");
  const validation = validateCredentialBundle(bundle, {
    store: context.store,
    state: context.state,
    deploymentName: context.deploymentName,
    chainId: context.chainId,
    nowSeconds: context.nowSeconds,
  });
  if (!validation.valid) {
    throw new McpToolError(validation.revoked ? "revoked" : "unauthorized", validation.errors.join("; "));
  }
  return bundle;
}

export async function walletStatus(context: McpToolContext): Promise<Record<string, unknown>> {
  const bundle = await context.store.loadBundle();
  if (!bundle) {
    return {
      name: context.store.name,
      status: "unpaired",
      capabilities: [],
      remainingBudget: "0",
      lastCredentialError: context.store.lastCredentialError,
    };
  }
  const validation = validateCredentialBundle(bundle, {
    store: context.store,
    state: context.state,
    deploymentName: context.deploymentName,
    chainId: context.chainId,
    nowSeconds: context.nowSeconds,
  });
  const notes = await context.store.notes();
  let remaining = 0n;
  for (const raw of notes) {
    const note = noteFromStored(raw);
    if (context.state) {
      if (context.state.notes.indexOf(noteCm(note)) < 0) continue;
      if (context.state.spentNullifiers.has(budgetNullifier(context.store.holder.sk, note).toString())) continue;
      if (note.lin.some((entry) => entry !== 0n && context.state!.revoked.has(truncateKey(entry)))) continue;
    }
    remaining += note.q;
  }
  if (!validation.valid) remaining = 0n;
  return {
    name: context.store.name,
    status: validation.valid ? "active" : validation.revoked ? "revoked" : "invalid",
    capabilities: validation.capabilities,
    remainingBudget: remaining.toString(),
    expiry: validation.expiry.toString(),
    revoked: validation.revoked,
    stateRegistered: validation.stateRegistered,
    validationErrors: validation.errors,
    lastCredentialError: context.store.lastCredentialError,
  };
}

export async function listReceipts(context: McpToolContext): Promise<Array<Record<string, unknown>>> {
  return (await context.store.receipts()).map((receipt) => ({ ...receipt }));
}

export async function pay(context: McpToolContext, request: PaymentRequest): Promise<Record<string, unknown>> {
  const bundle = await authorizedBundle(context);
  assertCapability(bundle, "PAY", "pay");
  if (request.maxAmount <= 0n) throw new McpToolError("invalid_amount", "maxAmount must be positive");
  if (request.maxAmount > context.maxPayment) {
    throw new McpToolError("spend_limit", `maxAmount exceeds local limit ${context.maxPayment.toString()}`);
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new McpToolError("invalid_url", "url must be an absolute URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new McpToolError("invalid_url", "url must use http or https");
  if (!context.services.payment) {
    throw new McpToolError("payment_backend_unavailable", "x402 payment backend is not configured; waiting for issue #8 integration");
  }

  const result: PaymentResult = await context.services.payment.pay(request);
  const receipt = {
    budgetNf: result.budgetNf,
    tx: result.tx,
    resource: result.resource,
    amount: result.amount,
    createdAt: new Date().toISOString(),
    reported: false,
  };
  await context.store.addReceipt(receipt);

  let receiptReported = false;
  let receiptWarning: string | undefined;
  if (!context.malicious) {
    try {
      if (!context.mailbox) throw new Error("mailbox client is unavailable");
      await context.mailbox.send(bundle.owner.box, {
        type: "receipt",
        budgetNf: result.budgetNf,
        tx: result.tx,
        resource: result.resource,
        amount: result.amount,
      });
      receipt.reported = true;
      await context.store.addReceipt(receipt);
      receiptReported = true;
    } catch (error) {
      receiptWarning = `payment succeeded but receipt delivery failed: ${String(error)}`;
    }
  }
  return {
    ...result,
    receiptReported,
    ...(receiptWarning ? { warning: receiptWarning } : {}),
  };
}

export async function treasurySupply(
  context: McpToolContext,
  request: TreasurySupplyRequest,
): Promise<Record<string, unknown>> {
  const bundle = await authorizedBundle(context);
  assertCapability(bundle, "TREASURY", "treasury_supply");
  if (!/^0x[0-9a-fA-F]{40}$/.test(request.vault)) throw new McpToolError("invalid_vault", "vault must be a 20-byte address");
  if (request.amount <= 0n) throw new McpToolError("invalid_amount", "amount must be positive");
  if (request.amount > context.maxPayment) {
    throw new McpToolError("spend_limit", `amount exceeds local limit ${context.maxPayment.toString()}`);
  }
  if (request.termSeconds <= 0n) throw new McpToolError("invalid_term", "termSeconds must be positive");
  if (!context.services.treasury) {
    throw new McpToolError("treasury_backend_unavailable", "treasury backend is not configured; waiting for issue #4/#5 integration");
  }
  const result: TreasurySupplyResult = await context.services.treasury.supply(request);
  return { ...result };
}

export async function treasuryStatus(context: McpToolContext): Promise<Record<string, unknown>> {
  const bundle = await authorizedBundle(context);
  assertCapability(bundle, "TREASURY", "treasury_status");
  if (!context.services.treasury) {
    return { status: "unavailable", reason: "treasury backend is not configured" };
  }
  return context.services.treasury.status();
}

export async function delegate(context: McpToolContext, request: DelegateRequest): Promise<DelegateResult> {
  await authorizedBundle(context);
  if (!request.name.trim()) throw new McpToolError("invalid_name", "name is required");
  if (request.amount <= 0n) throw new McpToolError("invalid_amount", "amount must be positive");
  if (request.expiry <= (context.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000)))) {
    throw new McpToolError("invalid_expiry", "expiry must be in the future");
  }
  if (!context.services.delegate) {
    throw new McpToolError("delegate_backend_unavailable", "delegation backend is not configured; waiting for the D3 integration");
  }
  return context.services.delegate.delegate(request);
}
