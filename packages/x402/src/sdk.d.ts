// Leaf-module typing boundary for the SDK exports consumed by this package.
// Runtime imports still resolve to @shadowpass/sdk; this avoids compiling the SDK's
// browser/native dependency graph into callers that only need hashing helpers.
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
