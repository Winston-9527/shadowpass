import { describe, expect, it } from "vitest";
import { pairingCodeFromLocation, parsePairingCode } from "./pairing";
import { formatAmount, parseAmount } from "./types";

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

const agentPk = {
  x: "5299619240641551281634865583518297030282874472190772894086521144482721001553",
  y: "16950150798460657717958625567821834550301663161624707787222815936182638968203",
};

describe("pairing payload", () => {
  it("parses an MCP pairing code and normalizes public keys", () => {
    const code = encode({ v: 1, name: "采购 Agent", agentPk, boxPk: `0x${"AB".repeat(32)}`, pair: "cd".repeat(16) });
    expect(parsePairingCode(code)).toEqual({
      v: 1,
      name: "采购 Agent",
      agentPk: { x: BigInt(agentPk.x), y: BigInt(agentPk.y) },
      boxPk: "ab".repeat(32),
      pair: "cd".repeat(16),
    });
  });

  it("rejects malformed or incomplete links", () => {
    expect(() => parsePairingCode("not-json")).toThrow(/base64url JSON/);
    expect(() => parsePairingCode(encode({ v: 1, name: "Agent", agentPk, boxPk: "00", pair: "00".repeat(16) }))).toThrow(/mailbox public key/);
    expect(() => parsePairingCode(encode({ v: 2, name: "Agent", agentPk, boxPk: "00".repeat(32), pair: "00".repeat(16) }))).toThrow(/version/);
  });

  it("only reads a code from the pair route fragment", () => {
    expect(pairingCodeFromLocation({ pathname: "/pair", hash: "#abc" } as Location)).toBe("abc");
    expect(pairingCodeFromLocation({ pathname: "/", hash: "#abc" } as Location)).toBe("");
  });

  it("handles fixed six-decimal token amounts", () => {
    expect(parseAmount("40")).toBe(40_000_000n);
    expect(parseAmount("0.000001")).toBe(1n);
    expect(formatAmount(100_000_000n)).toBe("100");
    expect(formatAmount(10_500_000n)).toBe("10.5");
    expect(() => parseAmount("1.0000001")).toThrow(/6 decimal/);
  });
});
