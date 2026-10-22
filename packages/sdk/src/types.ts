export type Hex = `0x${string}`;
export type Address = `0x${string}`;
export type Scalar = bigint | string | number;

export interface Point {
  x: bigint;
  y: bigint;
}

export interface Identity {
  prv: Uint8Array;
  Ax: bigint;
  Ay: bigint;
  sk: bigint;
}

export interface ViewKey {
  vsk: bigint;
  w: Point;
  vpk: Point;
}

export interface BoxKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface KeySet {
  seed: Uint8Array;
  sign: Identity;
  steward: Identity;
  view: ViewKey;
  box: BoxKeyPair;
}

export interface Signature {
  S: bigint;
  R8x: bigint;
  R8y: bigint;
}

export interface Cert {
  hop: number;
  issuer: Identity;
  holder: Identity;
  cap: bigint;
  expiry: bigint;
  sig: Signature;
  vpk?: Point;
  ownW?: Point;
  hash: bigint;
}

export interface Note {
  own: [bigint, bigint];
  q: bigint;
  lin: [bigint, bigint, bigint, bigint];
  rho: bigint;
}

export interface Action {
  target: Address;
  method: Hex;
  amount: bigint;
  nonce: bigint;
  params: Hex;
}

export interface OwnerCiphertext {
  c1: Point;
  c2: Point;
  e: bigint[];
  esign: bigint;
  r?: bigint;
  ephemeral?: Point;
}

export interface BillEntry {
  budgetNf: bigint;
  txHash?: Hex;
  blockNumber?: bigint;
  target?: Address;
  method?: Hex;
  amount?: bigint;
  chain: Point[] | null;
}

export interface Deployment {
  chainId: number;
  gate: Address;
  registry: Address;
  revocations: Address;
  group: Address;
  payout: Address;
  treasury: Address;
  vault: Address;
  token: Address;
  verifiers: {
    d1: Address;
    d2: Address;
    d3?: Address;
    reg: Address;
    revoke: Address;
    transfer: Address;
    mint: Address;
  };
  startBlock: number;
  facilitator: string;
  mailbox: string;
}

export interface CertificateBundle {
  v: 1;
  chainId: number;
  deployment: string;
  chain: Array<{
    hop: number;
    issuer: { x: string; y: string };
    holder: { x: string; y: string };
    cap: string;
    expiry: string;
    sig: { S: string; R8x: string; R8y: string };
    vpk?: { x: string; y: string };
    ownW?: { x: string; y: string };
    hash: string;
  }>;
  note: { own: [string, string]; q: string; lin: [string, string, string, string]; rho: string };
  owner: { box: string };
}

export interface ReceiptMessage {
  type: "receipt";
  budgetNf: string;
  tx: string;
  resource: string;
  amount: string;
}

export interface DelegatedMessage {
  type: "delegated";
  parent: string;
  cert: CertificateBundle["chain"][number];
}

export type MailboxMessage = ReceiptMessage | DelegatedMessage;

export type WitnessInput = Record<string, unknown>;
