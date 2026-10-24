import type { CertificateBundle } from "@shadowpass/sdk";

export type Capability = "PAY" | "TREASURY";

export interface AgentConfig {
  v: 1;
  name: string;
  createdAt: string;
  network: string;
  deployment: string;
  holderPk: { x: string; y: string };
  boxPk: string;
  ownerBoxPk?: string;
  pinnedRootHash?: string;
  pairingHash?: string;
  acceptedCredentials?: string[];
  mailboxCursor: number;
  lastCredentialError?: string;
}

export interface AgentSecrets {
  v: 1;
  holderPrv: string;
  boxSk: string;
  pair?: string;
}

export interface StoredReceipt {
  budgetNf: string;
  tx: string;
  resource: string;
  amount: string;
  createdAt: string;
  reported: boolean;
}

export interface CredentialValidation {
  valid: boolean;
  errors: string[];
  capabilities: Capability[];
  revoked: boolean;
  expiry: bigint;
  stateRegistered: boolean;
}

export interface PaymentRequest {
  url: string;
  maxAmount: bigint;
}

export interface PaymentResult {
  budgetNf: string;
  tx: string;
  resource: string;
  amount: string;
  resourceContent?: {
    text: string;
    truncated: boolean;
    trust: "untrusted";
  };
  warnings?: string[];
}

export interface TreasurySupplyRequest {
  vault: string;
  amount: bigint;
  termSeconds: bigint;
}

export interface TreasurySupplyResult {
  positionId: string;
  tx: string;
  budgetNf: string;
  expectedQ: string;
  returnCm: string;
  maturity: string;
  resource: string;
  timings?: { proofMs: number };
  warnings?: string[];
}

export interface TreasuryWithdrawResult {
  positionId: string;
  tx: string;
  expectedQ: string;
  returnCm: string;
  recovered: boolean;
  warnings?: string[];
}

export interface StoredTreasuryPosition {
  positionId: string;
  vault: string;
  amount: string;
  expectedQ: string;
  maturity: string;
  returnCm: string;
  returnMemo: string;
  returnNote: CertificateBundle["note"];
  openTx: string;
  openedAt: string;
  withdrawn: boolean;
  withdrawTx?: string;
}

export interface DelegateRequest {
  name: string;
  cap: bigint;
  expiry: bigint;
  amount: bigint;
}

export interface DelegateResult {
  parent: string;
  cert: CertificateBundle["chain"][number];
  pairingCode: string;
}

export interface McpServices {
  payment?: {
    pay(request: PaymentRequest): Promise<PaymentResult>;
  };
  treasury?: {
    supply(request: TreasurySupplyRequest): Promise<TreasurySupplyResult>;
    withdraw(positionId: bigint): Promise<TreasuryWithdrawResult>;
    status(): Promise<Record<string, unknown>>;
  };
  delegate?: {
    delegate(request: DelegateRequest): Promise<DelegateResult>;
  };
}

export class McpToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "McpToolError";
  }
}
