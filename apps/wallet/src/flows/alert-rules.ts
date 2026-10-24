import { formatAmount } from "./types";
import type { WalletBill } from "./bill";

export interface AlertRules {
  unreported: boolean;
  burst: {
    enabled: boolean;
    count: number;
    windowMinutes: number;
  };
  amount: {
    enabled: boolean;
    threshold: string;
  };
}

export interface BillAlert {
  id: string;
  kind: "unreported" | "burst" | "amount";
  title: string;
  detail: string;
  budgetNfs: string[];
}

export const UNREPORTED_GRACE_MS = 30_000;

export const DEFAULT_ALERT_RULES: AlertRules = {
  unreported: true,
  burst: { enabled: true, count: 5, windowMinutes: 5 },
  amount: { enabled: true, threshold: "20000000" },
};

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

function scalar(value: unknown, fallback: string): string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) ? value : fallback;
}

export function normalizeAlertRules(value: unknown): AlertRules {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const burst = source.burst && typeof source.burst === "object" ? source.burst as Record<string, unknown> : {};
  const amount = source.amount && typeof source.amount === "object" ? source.amount as Record<string, unknown> : {};
  return {
    unreported: typeof source.unreported === "boolean" ? source.unreported : DEFAULT_ALERT_RULES.unreported,
    burst: {
      enabled: typeof burst.enabled === "boolean" ? burst.enabled : DEFAULT_ALERT_RULES.burst.enabled,
      count: integer(burst.count, DEFAULT_ALERT_RULES.burst.count, 1, 1_000),
      windowMinutes: integer(burst.windowMinutes, DEFAULT_ALERT_RULES.burst.windowMinutes, 1, 1_440),
    },
    amount: {
      enabled: typeof amount.enabled === "boolean" ? amount.enabled : DEFAULT_ALERT_RULES.amount.enabled,
      threshold: scalar(amount.threshold, DEFAULT_ALERT_RULES.amount.threshold),
    },
  };
}

export function alertRulesKey(chainId: number, deployment: string, ownerAx: bigint): string {
  return `alert-rules:${chainId}:${deployment}:${ownerAx}`;
}

function billLabel(bill: WalletBill): string {
  return bill.agentName ?? (bill.cardId ? bill.cardId.slice(0, 12) : "Unknown Agent");
}

export function evaluateBillAlerts(
  bills: readonly WalletBill[],
  rules: AlertRules,
  nowMs = Date.now(),
): BillAlert[] {
  const alerts: BillAlert[] = [];
  const actionable = bills.filter((bill) => bill.amount !== undefined && bill.chain !== null);

  if (rules.unreported) {
    for (const bill of actionable) {
      if (bill.reported) continue;
      if (nowMs - bill.chainTimeMs < UNREPORTED_GRACE_MS) continue;
      alerts.push({
        id: `unreported:${bill.budgetNf.toString()}`,
        kind: "unreported",
        title: "Unreported spend",
        detail: `${billLabel(bill)} spent ${formatAmount(bill.amount!)} USDC without a matching receipt.`,
        budgetNfs: [bill.budgetNf.toString()],
      });
    }
  }

  if (rules.burst.enabled) {
    const windowMs = rules.burst.windowMinutes * 60_000;
    const groups = new Map<string, WalletBill[]>();
    for (const bill of actionable) {
      const key = bill.cardId ?? "unknown";
      groups.set(key, [...(groups.get(key) ?? []), bill]);
    }
    for (const [key, group] of groups) {
      const recent = group.filter((bill) => bill.chainTimeMs >= nowMs - windowMs && bill.chainTimeMs <= nowMs);
      if (recent.length <= rules.burst.count) continue;
      const ordered = [...recent].sort((left, right) => right.chainTimeMs - left.chainTimeMs);
      const latest = ordered[0]!;
      alerts.push({
        id: `burst:${key}:${latest.budgetNf.toString()}`,
        kind: "burst",
        title: "Rapid spending",
        detail: `${billLabel(latest)} made ${ordered.length} payments in ${rules.burst.windowMinutes} minutes.`,
        budgetNfs: ordered.map((bill) => bill.budgetNf.toString()),
      });
    }
  }

  if (rules.amount.enabled) {
    const threshold = BigInt(rules.amount.threshold);
    for (const bill of actionable) {
      if (bill.amount! <= threshold) continue;
      alerts.push({
        id: `amount:${bill.budgetNf.toString()}`,
        kind: "amount",
        title: "Large payment",
        detail: `${billLabel(bill)} paid ${formatAmount(bill.amount!)} USDC, above ${formatAmount(threshold)} USDC.`,
        budgetNfs: [bill.budgetNf.toString()],
      });
    }
  }

  return alerts;
}

export function freshAlerts(seen: ReadonlySet<string>, alerts: readonly BillAlert[]): BillAlert[] {
  return alerts.filter((alert) => !seen.has(alert.id));
}

export function mergeActiveAlerts(
  active: readonly BillAlert[],
  alerts: readonly BillAlert[],
  seen: ReadonlySet<string>,
): BillAlert[] {
  const currentIds = new Set(alerts.map((alert) => alert.id));
  const retained = active.filter((alert) => currentIds.has(alert.id));
  const displayedIds = new Set(retained.map((alert) => alert.id));
  return [
    ...retained,
    ...freshAlerts(seen, alerts.filter((alert) => !displayedIds.has(alert.id))),
  ];
}

export function newlyDisplayedAlerts(active: readonly BillAlert[], seen: ReadonlySet<string>): BillAlert[] {
  return active.filter((alert) => !seen.has(alert.id));
}
