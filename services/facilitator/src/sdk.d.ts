declare module "@shadowpass/sdk" {
  export type Hex = `0x${string}`;
  export type Address = `0x${string}`;
  export function reqHash(input: {
    network: string;
    asset: Address;
    amount: bigint;
    payTo: Address;
    resource: string;
  }): Hex;
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
    verifiers: Record<string, Address>;
    startBlock: number;
    facilitator: string;
    mailbox: string;
  }
  export function loadDeployment(source: string): Promise<Deployment>;
}
