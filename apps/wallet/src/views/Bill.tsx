import {
  BellRing,
  CheckCheck,
  CircleDollarSign,
  Clock3,
  Radio,
  ReceiptText,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import type { BillAlert, AlertRules } from "../flows/alert-rules";
import type { WalletBill } from "../flows/bill";
import { formatAmount, parseAmount } from "../flows/types";

export interface BillProps {
  bills: WalletBill[];
  rules: AlertRules;
  alerts: BillAlert[];
  onChangeRules(rules: AlertRules): void;
}

function short(value: string | undefined, length = 16): string {
  if (!value) return "Unknown";
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function billStatus(bill: WalletBill): { label: string; className: string } {
  if (bill.chain === null) return { label: "No view access", className: "unowned" };
  if (!bill.cardId) return { label: "Unknown Agent", className: "unowned" };
  if (bill.reported) return { label: "Reported", className: "reported" };
  return { label: "Unreported", className: "unreported" };
}

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Bill({ bills, rules, alerts, onChangeRules }: BillProps) {
  const unreported = bills.filter((bill) => bill.chain !== null && !bill.reported).length;
  const total = bills.reduce((sum, bill) => sum + (bill.chain === null ? 0n : bill.amount ?? 0n), 0n);
  const threshold = formatAmount(BigInt(rules.amount.threshold));

  const updateThreshold = (value: string) => {
    try {
      const parsed = parseAmount(value);
      onChangeRules({ ...rules, amount: { ...rules.amount, threshold: parsed.toString() } });
    } catch {
      // Keep the last valid threshold while the input is incomplete.
    }
  };

  return (
    <div className="bills-layout">
      <section className="bill-metrics" aria-label="Bill summary">
        <div className="bill-metric">
          <ReceiptText size={18} />
          <span>Payment events</span>
          <strong>{bills.length}</strong>
        </div>
        <div className="bill-metric">
          <CircleDollarSign size={18} />
          <span>Attributed volume</span>
          <strong>{formatAmount(total)} <small>USDC</small></strong>
        </div>
        <div className={unreported ? "bill-metric alerting" : "bill-metric"}>
          <ShieldAlert size={18} />
          <span>Unreported</span>
          <strong>{unreported}</strong>
        </div>
        <div className={alerts.length ? "bill-metric alerting" : "bill-metric"}>
          <BellRing size={18} />
          <span>Rule hits</span>
          <strong>{alerts.length}</strong>
        </div>
      </section>

      <div className="bills-grid">
        <section className="console-section bill-list-panel">
          <div className="section-heading">
            <div><span className="eyebrow">On-chain ledger</span><h2>Payments</h2></div>
            <span className="count-pill">{bills.length}</span>
          </div>
          {bills.length === 0 ? (
            <div className="empty-state"><ReceiptText size={20} /><span>No payments observed</span></div>
          ) : (
            <div className="bill-table-wrap">
              <table className="bill-table">
                <thead><tr><th>Agent</th><th>Amount</th><th>Status</th><th>Target</th><th>Time</th></tr></thead>
                <tbody>
                  {bills.map((bill) => {
                    const status = billStatus(bill);
                    return (
                      <tr key={`${bill.budgetNf.toString()}:${bill.txHash ?? ""}`} data-testid="bill-row">
                        <td><strong>{bill.agentName ?? "Unknown"}</strong><code>{short(bill.txHash)}</code></td>
                        <td className="bill-amount">{bill.amount === undefined ? "Hidden" : `${formatAmount(bill.amount)} USDC`}</td>
                        <td><span className={`bill-status ${status.className}`}><span className="status-dot" />{status.label}</span></td>
                        <td><code title={bill.target}>{short(bill.target, 12)}</code></td>
                        <td><span className="bill-time"><Clock3 size={13} />{timeLabel(bill.chainTimeMs)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="console-section alert-rules-panel">
          <div className="section-heading">
            <div><span className="eyebrow">Local policy</span><h2>Alert rules</h2></div>
            <SlidersHorizontal size={20} />
          </div>
          <label className="rule-toggle">
            <span><Radio size={17} /><strong>Unreported payment</strong></span>
            <input type="checkbox" checked={rules.unreported} onChange={(event) => onChangeRules({ ...rules, unreported: event.target.checked })} />
          </label>
          <div className="rule-block">
            <label className="rule-toggle">
              <span><BellRing size={17} /><strong>Rapid spending</strong></span>
              <input type="checkbox" checked={rules.burst.enabled} onChange={(event) => onChangeRules({ ...rules, burst: { ...rules.burst, enabled: event.target.checked } })} />
            </label>
            <div className="rule-inputs">
              <label className="field"><span>Window (min)</span><input type="number" min="1" max="1440" value={rules.burst.windowMinutes} onChange={(event) => onChangeRules({ ...rules, burst: { ...rules.burst, windowMinutes: Math.max(1, Number(event.target.value) || 1) } })} /></label>
              <label className="field"><span>More than (tx)</span><input type="number" min="1" max="1000" value={rules.burst.count} onChange={(event) => onChangeRules({ ...rules, burst: { ...rules.burst, count: Math.max(1, Number(event.target.value) || 1) } })} /></label>
            </div>
          </div>
          <div className="rule-block">
            <label className="rule-toggle">
              <span><CircleDollarSign size={17} /><strong>Large payment</strong></span>
              <input type="checkbox" checked={rules.amount.enabled} onChange={(event) => onChangeRules({ ...rules, amount: { ...rules.amount, enabled: event.target.checked } })} />
            </label>
            <label className="field"><span>Threshold (USDC)</span><input inputMode="decimal" defaultValue={threshold} key={threshold} onBlur={(event) => updateThreshold(event.target.value)} /></label>
          </div>
          <div className="rule-privacy"><CheckCheck size={16} /><span>Receipts are unauthenticated reports. They only suppress an unreported marker after matching the on-chain transaction; the chain remains authoritative.</span></div>
        </section>
      </div>
    </div>
  );
}
