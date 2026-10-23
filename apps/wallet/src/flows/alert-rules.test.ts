import { describe, expect, it } from "vitest";
import type { WalletBill } from "./bill";
import { DEFAULT_ALERT_RULES, evaluateBillAlerts, freshAlerts, normalizeAlertRules } from "./alert-rules";

function bill(overrides: Partial<WalletBill> & Pick<WalletBill, "budgetNf">): WalletBill {
  return {
    txHash: `0x${"12".repeat(32)}`,
    blockNumber: 1n,
    target: `0x${"34".repeat(20)}`,
    method: "0x12345678",
    amount: 1_000_000n,
    chain: [{ x: 1n, y: 2n }],
    chainTimeMs: 1_700_000_000_000,
    cardId: "card",
    agentName: "buyer",
    reported: true,
    ...overrides,
  };
}

describe("bill alert rules", () => {
  it("reports unreported, burst and large payment rules independently", () => {
    const now = 1_700_001_000_000;
    const bills = Array.from({ length: 6 }, (_, index) => bill({
      budgetNf: BigInt(index + 1),
      chainTimeMs: now - index * 1_000,
      reported: index !== 5,
      amount: index === 0 ? 25_000_000n : 1_000_000n,
    }));
    const alerts = evaluateBillAlerts(bills, DEFAULT_ALERT_RULES, now);
    expect(alerts.map((alert) => alert.kind)).toEqual(["unreported", "burst", "amount"]);
    expect(alerts.find((alert) => alert.kind === "burst")?.budgetNfs).toHaveLength(6);
  });

  it("uses strict K and threshold boundaries and honors disabled rules", () => {
    const now = 1_700_001_000_000;
    const exact = Array.from({ length: 5 }, (_, index) => bill({ budgetNf: BigInt(index + 1), chainTimeMs: now, amount: 20_000_000n }));
    expect(evaluateBillAlerts(exact, DEFAULT_ALERT_RULES, now)).toEqual([]);
    expect(evaluateBillAlerts([bill({ budgetNf: 9n, reported: false })], { ...DEFAULT_ALERT_RULES, unreported: false })).toEqual([]);
  });

  it("normalizes persisted settings and deduplicates delivered alerts", () => {
    expect(normalizeAlertRules({ unreported: "yes", burst: { count: 0, windowMinutes: 7 }, amount: { threshold: "-1" } })).toEqual({
      unreported: true,
      burst: { enabled: true, count: 5, windowMinutes: 7 },
      amount: { enabled: true, threshold: "20000000" },
    });
    const first = evaluateBillAlerts([bill({ budgetNf: 1n, reported: false })], DEFAULT_ALERT_RULES);
    expect(freshAlerts(new Set([first[0]!.id]), first)).toEqual([]);
  });
});
