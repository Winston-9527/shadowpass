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
}
