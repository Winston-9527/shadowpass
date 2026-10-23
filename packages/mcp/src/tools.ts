import {
  budgetNullifier,
  ChainState,
  MailboxClient,
  noteCm,
  truncateKey,
} from "@shadowpass/sdk";
import type { CertificateBundle, Note } from "@shadowpass/sdk";
import { capForBundle, credentialCap, credentialExpiry, validateCredentialChain } from "./credentials.js";
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

function lineageMatches(note: Note, bundle: CertificateBundle): boolean {
  for (let index = 0; index < 4; index += 1) {
    const expected = index < bundle.chain.length ? BigInt(bundle.chain[index]!.hash) : 0n;
    if (note.lin[index] !== expected) return false;
  }
  return true;
}

function assertCapability(bundle: CertificateBundle, capability: Capability): void {
  if (!capForBundle(bundle, capability)) {
    throw new McpToolError("capability_mismatch", `capability_mismatch: ${capability}`);
  }
}

async function authorizedBundle(context: McpToolContext): Promise<CertificateBundle> {
  const bundle = await context.store.loadBundle();
  if (!bundle) throw new McpToolError("not_paired", "not_paired");
  const validation = validateCredentialChain(bundle, {
    store: context.store,
    state: context.state,
    deploymentName: context.deploymentName,
    chainId: context.chainId,
    nowSeconds: context.nowSeconds,
  });
  if (!validation.valid) {
    throw new McpToolError(validation.revoked ? "revoked" : "unauthorized", "credential_validation_failed");
  }
  return bundle;
}

export async function remainingBudget(context: McpToolContext, bundle: CertificateBundle): Promise<bigint> {
  if (!context.state) return 0n;
  const state = context.state;
  let remaining = 0n;
  for (const raw of await context.store.notes()) {
    const note = noteFromStored(raw);
    if (note.own[0] !== context.store.holder.Ax || note.own[1] !== context.store.holder.Ay) continue;
    if (!lineageMatches(note, bundle)) continue;
    if (state.notes.indexOf(noteCm(note)) < 0) continue;
    if (state.spentNullifiers.has(budgetNullifier(context.store.holder.sk, note).toString())) continue;
    if (note.lin.some((entry) => entry !== 0n && state.revoked.has(truncateKey(entry)))) continue;
    remaining += note.q;
  }
  return remaining;
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
  const validation = validateCredentialChain(bundle, {
    store: context.store,
    state: context.state,
    deploymentName: context.deploymentName,
    chainId: context.chainId,
    nowSeconds: context.nowSeconds,
  });
  let remaining = validation.valid ? await remainingBudget(context, bundle) : 0n;
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
  assertCapability(bundle, "PAY");
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
      const ownerBox = Buffer.from(bundle.owner.box.replace(/^0x/, ""), "hex");
      if (ownerBox.length !== 32) throw new Error("owner mailbox public key must be 32 bytes");
      await context.mailbox.send(Uint8Array.from(ownerBox), {
        type: "receipt",
        budgetNf: result.budgetNf,
        tx: result.tx,
        resource: result.resource,
        amount: result.amount,
      });
      receipt.reported = true;
      await context.store.addReceipt(receipt);
      receiptReported = true;
    } catch {
      receiptWarning = "receipt_delivery_failed";
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
  assertCapability(bundle, "TREASURY");
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
  assertCapability(bundle, "TREASURY");
  if (!context.services.treasury) {
    return { status: "unavailable", reason: "treasury_backend_not_configured" };
  }
  return context.services.treasury.status();
}

export async function delegate(context: McpToolContext, request: DelegateRequest): Promise<DelegateResult> {
  const bundle = await authorizedBundle(context);
  if (!request.name.trim()) throw new McpToolError("invalid_name", "name is required");
  if (request.amount <= 0n) throw new McpToolError("invalid_amount", "amount must be positive");
  const now = context.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
  if (request.expiry <= now || request.expiry > credentialExpiry(bundle)) {
    throw new McpToolError("invalid_expiry", "expiry must be within the parent credential lifetime");
  }
  const parentCap = credentialCap(bundle);
  if (request.cap === 0n || (request.cap & ~parentCap) !== 0n || (request.cap & ~3n) !== 0n) {
    throw new McpToolError("capability_mismatch", "requested capability exceeds the parent credential");
  }
  if (request.amount > await remainingBudget(context, bundle)) {
    throw new McpToolError("insufficient_budget", "requested amount exceeds the current budget");
  }
  if (!context.services.delegate) {
    throw new McpToolError("delegate_backend_unavailable", "delegation backend is not configured; waiting for the D3 integration");
  }
  return context.services.delegate.delegate(request);
}
