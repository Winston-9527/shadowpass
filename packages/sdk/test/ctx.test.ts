import { describe, expect, it } from "vitest";
import { ctxHash, reqHash } from "../src/ctx.js";

describe("ctx", () => {
  it("matches the Foundry/cast fixed vector for ctxHash", () => {
    expect(ctxHash({
      chainId: 84532n,
      gate: "0x1111111111111111111111111111111111111111",
      action: {
        target: "0x2222222222222222222222222222222222222222",
        method: "0x12345678",
        amount: 12345n,
        nonce: 7n,
        params: "0xdeadbeef",
      },
      memoChange: "0x010203",
    })).toBe(269967330513118763063442127486799396061052212780023532984835628296506995388n);
  });

  it("matches the Foundry/cast fixed vector for reqHash", () => {
    expect(reqHash({
      network: "eip155:84532",
      asset: "0x3333333333333333333333333333333333333333",
      amount: 1_000_000n,
      payTo: "0x4444444444444444444444444444444444444444",
      resource: "https://example.com/report",
    })).toBe("0x0c379878d4c398bcf334bf23fa848e9df571bb2a7615414bdbf8aa6775685a6a");
  });
});
