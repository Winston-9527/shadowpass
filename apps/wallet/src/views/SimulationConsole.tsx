import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FlaskConical,
  Landmark,
  Play,
  ReceiptText,
  RefreshCw,
  Shield,
  TreePine,
  WalletCards,
} from "lucide-react";
import { formatAmount, parseAmount } from "../flows/types";
import {
  fundSimulationWallet,
  initialSimulationState,
  issueSimulationCard,
  openSimulationWallet,
  revokeSimulationAgent,
  revokeSimulationTree,
  simulateAgentAction,
  type SimulationCapability,
  type SimulationState,
} from "../simulation/model";

type SimulationTab = "wallet" | "bills" | "issue" | "tree";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The simulated operation could not be completed";
}

function capabilityLabel(capability: SimulationCapability): string {
  return capability === "PAY" ? "Pay" : "Treasury";
}

export function SimulationConsole() {
  const [state, setState] = useState<SimulationState>(initialSimulationState);
  const [tab, setTab] = useState<SimulationTab>("wallet");
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("Purchasing Agent");
  const [capability, setCapability] = useState<SimulationCapability>("PAY");
  const [budgetInput, setBudgetInput] = useState("40");
  const [expiryDays, setExpiryDays] = useState("7");

  const apply = (operation: () => SimulationState, message?: string) => {
    setError(null);
    try {
      setState(operation());
      if (message) setActivity(message);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const handleCapability = (next: SimulationCapability) => {
    setCapability(next);
    setAgentName(next === "PAY" ? "Purchasing Agent" : "Treasury Agent");
  };

  const handleIssue = () => {
    apply(() => issueSimulationCard(state, {
      name: agentName,
      capability,
      budget: parseAmount(budgetInput),
      expiryDays: Number(expiryDays),
    }), `${agentName.trim()} card issued in simulation.`);
  };

  const handleAction = (agentId: string) => {
    const agent = state.agents.find((candidate) => candidate.id === agentId);
    if (!agent) return;
    apply(
      () => simulateAgentAction(state, agentId),
      agent.capability === "PAY" ? "Demo purchase completed." : "Demo treasury allocation completed.",
    );
  };

  const handleRevoke = (agentId: string) => {
    const agent = state.agents.find((candidate) => candidate.id === agentId);
    apply(() => revokeSimulationAgent(state, agentId), `${agent?.name ?? "Agent"} revoked in simulation.`);
  };

  const reset = () => {
    setState(initialSimulationState());
    setTab("wallet");
    setError(null);
    setActivity("Simulation reset.");
    setAgentName("Purchasing Agent");
    setCapability("PAY");
    setBudgetInput("40");
    setExpiryDays("7");
  };

  const totalPayments = state.bills.reduce((sum, bill) => sum + bill.amount, 0n);
  const activeAgents = state.agents.filter((agent) => agent.status === "active" && !state.rootRevoked).length;

  return (
    <div className="simulation-console" data-testid="simulation-panel">
      <section className="simulation-intro">
        <div>
          <span className="simulation-badge"><FlaskConical size={15} />Simulation</span>
          <h1>Agent card sandbox</h1>
          <p>Every action on this page is local and simulated. No passkey, mailbox, facilitator, proof, or chain transaction is used.</p>
        </div>
        <button className="button secondary" onClick={reset}><RefreshCw size={16} />Reset demo</button>
      </section>

      <nav className="console-tabs" aria-label="Simulated wallet sections">
        <button className={tab === "wallet" ? "active" : ""} onClick={() => setTab("wallet")}><WalletCards size={17} />Wallet</button>
        <button className={tab === "bills" ? "active" : ""} onClick={() => setTab("bills")}><ReceiptText size={17} />Bills</button>
        <button className={tab === "issue" ? "active" : ""} onClick={() => setTab("issue")} data-testid="simulation-issue-tab"><CreditCard size={17} />Issue card</button>
        <button className={tab === "tree" ? "active" : ""} onClick={() => setTab("tree")} data-testid="simulation-tree-tab"><TreePine size={17} />Authorization</button>
      </nav>

      <section className="wallet-toolbar simulation-toolbar">
        <div className="metric"><span>Steward budget</span><strong>{formatAmount(state.stewardBudget)} <small>USDC</small></strong></div>
        <div className="metric"><span>Active Agent cards</span><strong>{activeAgents}</strong></div>
        <div className="metric"><span>Simulated volume</span><strong>{formatAmount(totalPayments)} <small>USDC</small></strong></div>
        <div className="simulation-mode-pill"><FlaskConical size={16} />No real execution</div>
      </section>

      {error && <section className="inline-error console-error" role="alert"><AlertTriangle size={16} /><span>{error}</span></section>}
      {activity && <section className="operation-banner simulation-activity" role="status"><Check size={16} />{activity}</section>}

      {tab === "wallet" && (
        <div className="console-grid">
          <section className="console-section onboarding-section">
            <div className="section-heading">
              <div><span className="eyebrow">Demo setup</span><h2>Open wallet</h2></div>
              {state.opened && state.stewardBudget > 0n
                ? <span className="simulation-complete"><Check size={14} />Simulated</span>
                : <span className="pending-pill">Local demo</span>}
            </div>
            <div className="flow-row">
              <span className={state.opened ? "flow-step complete" : "flow-step"}><Shield size={17} />Open locally</span>
              <ChevronRight size={16} />
              <span className={state.stewardBudget > 0n ? "flow-step complete" : "flow-step"}><CircleDollarSign size={17} />Fund demo</span>
              <ChevronRight size={16} />
              <span className={state.agents.length > 0 ? "flow-step complete" : "flow-step"}><CreditCard size={17} />Issue Agent</span>
            </div>
            {!state.opened ? (
              <button className="button primary" data-testid="simulation-open" onClick={() => apply(
                () => openSimulationWallet(state),
                "Demo wallet opened locally.",
              )}><ArrowRight size={17} />Open demo wallet</button>
            ) : state.stewardBudget === 0n ? (
              <button className="button primary" data-testid="simulation-fund" onClick={() => apply(
                () => fundSimulationWallet(state),
                "100 USDC added to the demo steward.",
              )}><CircleDollarSign size={17} />Add 100 demo USDC</button>
            ) : (
              <button className="button primary" onClick={() => {
                setAgentName("Purchasing Agent");
                setCapability("PAY");
                setTab("issue");
              }}><PlusIcon />Issue a simulated card</button>
            )}
          </section>

          <section className="console-section card-summary">
            <div className="section-heading"><div><span className="eyebrow">Demo cards</span><h2>Agent access</h2></div><span className="count-pill">{state.agents.length}</span></div>
            {state.agents.length === 0 ? (
              <div className="empty-state"><CreditCard size={20} /><span>No simulated Agent cards</span></div>
            ) : state.agents.map((agent) => (
              <div className="compact-card simulation-agent-row" key={agent.id}>
                <span className={`status-dot ${agent.status}`} />
                <div>
                  <strong>{agent.name}</strong>
                  <span>{capabilityLabel(agent.capability)} / {formatAmount(agent.remaining)} USDC remaining / {agent.status}</span>
                </div>
                {agent.status === "active" && !state.rootRevoked ? (
                  <button className="icon-button" onClick={() => handleAction(agent.id)} title={agent.capability === "PAY" ? "Simulate purchase" : "Simulate treasury allocation"} aria-label={agent.capability === "PAY" ? `Simulate purchase for ${agent.name}` : `Simulate treasury allocation for ${agent.name}`} data-testid={`simulation-action-${agent.id}`}><Play size={17} /></button>
                ) : null}
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === "issue" && (
        <div className="issue-layout">
          <section className="console-section simulation-instructions">
            <div className="section-heading"><div><span className="eyebrow">Simulation</span><h2>Issue without a real Agent</h2></div><FlaskConical size={20} /></div>
            <p>The sandbox creates a local Agent identity and authorization card. Use the capability selector to demonstrate purchase and treasury separation.</p>
            <div className="simulation-callout"><Check size={16} /><span>No pairing code, proof generation, mailbox delivery, or blockchain call.</span></div>
          </section>
          <section className="console-section issue-form">
            <div className="section-heading"><div><span className="eyebrow">Policy</span><h2>Simulated limits</h2></div><span className="budget-source">{formatAmount(state.stewardBudget)} USDC available</span></div>
            <label className="field"><span>Agent name</span><input data-testid="simulation-agent-name" value={agentName} onChange={(event) => setAgentName(event.target.value)} maxLength={64} /></label>
            <fieldset className="field-group"><legend>Capability</legend><div className="segmented capability-select">
              <button className={capability === "PAY" ? "active" : ""} onClick={() => handleCapability("PAY")}><CreditCard size={16} />Pay</button>
              <button className={capability === "TREASURY" ? "active" : ""} onClick={() => handleCapability("TREASURY")}><Landmark size={16} />Treasury</button>
            </div></fieldset>
            <div className="form-row">
              <label className="field"><span>Budget</span><input data-testid="simulation-card-budget" inputMode="decimal" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} /></label>
              <label className="field"><span>Expires</span><select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select></label>
            </div>
            <button className="button primary wide" data-testid="simulation-issue" onClick={handleIssue} disabled={!state.opened || state.rootRevoked || state.stewardBudget === 0n}><CreditCard size={17} />Issue simulated card</button>
            <div className="issue-note"><FlaskConical size={15} /><span>This card exists only in this browser tab.</span></div>
          </section>
        </div>
      )}

      {tab === "bills" && (
        <div className="bills-layout">
          <section className="bill-metrics" aria-label="Simulated bill summary">
            <div className="bill-metric"><ReceiptText size={18} /><span>Simulated events</span><strong>{state.bills.length}</strong></div>
            <div className="bill-metric"><CircleDollarSign size={18} /><span>Simulated volume</span><strong>{formatAmount(totalPayments)} <small>USDC</small></strong></div>
            <div className="bill-metric"><Shield size={18} /><span>Owner visible</span><strong>{state.bills.length}</strong></div>
            <div className="bill-metric"><FlaskConical size={18} /><span>Chain writes</span><strong>0</strong></div>
          </section>
          <section className="console-section">
            <div className="section-heading"><div><span className="eyebrow">Local demo ledger</span><h2>Simulated activity</h2></div><span className="simulation-badge"><FlaskConical size={14} />Simulation</span></div>
            {state.bills.length === 0 ? (
              <div className="empty-state"><ReceiptText size={20} /><span>Run a simulated Agent action first</span></div>
            ) : (
              <div className="bill-table-wrap">
                <table className="bill-table">
                  <thead><tr><th>Agent</th><th>Amount</th><th>Status</th><th>Target</th><th>Time</th></tr></thead>
                  <tbody>{state.bills.map((bill) => (
                    <tr key={bill.id} data-testid="simulation-bill-row">
                      <td><strong>{bill.agentName}</strong><code>{bill.id}</code></td>
                      <td className="bill-amount">{formatAmount(bill.amount)} USDC</td>
                      <td><span className="bill-status reported"><span className="status-dot" />Simulated</span></td>
                      <td><code>{bill.target}</code></td>
                      <td><span className="bill-time"><Clock3 size={13} />{new Date(bill.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "tree" && (
        <section className="tree-panel simulation-tree">
          <div className="tree-owner">
            <div><span className="eyebrow">Simulated owner</span><strong>Alice</strong><code>local demo identity</code></div>
            <div className="tree-owner-actions">
              <div className="tree-budget">{formatAmount(state.stewardBudget)} <span>USDC available</span></div>
              <button className="button secondary compact" onClick={() => apply(() => revokeSimulationTree(state), "Whole authorization tree revoked in simulation.")} disabled={state.rootRevoked || state.agents.length === 0}><Ban size={16} />{state.rootRevoked ? "Tree revoked" : "Revoke tree"}</button>
            </div>
          </div>
          <div className="tree-trunk" aria-hidden="true" />
          <div className="tree-steward">
            <span className="node-dot" />
            <div><span className="eyebrow">Wallet steward</span><strong>PAY + TREASURY</strong></div>
            <span className={state.rootRevoked ? "status-text revoked" : "muted"}>{state.rootRevoked ? "revoked" : "local simulation"}</span>
          </div>
          <div className="tree-cards">
            {state.agents.length === 0 ? <div className="tree-empty">No simulated Agent cards issued</div> : state.agents.map((agent) => (
              <article className="tree-card" key={agent.id} data-testid={`simulation-tree-${agent.id}`}>
                <div className="tree-card-head"><span className={`status-dot ${agent.status}`} /><strong>{agent.name}</strong><span className={`status-text ${agent.status}`}>{agent.status}</span></div>
                <div className="tree-card-grid">
                  <span>{capabilityLabel(agent.capability)}</span>
                  <span>{formatAmount(agent.remaining)} / {formatAmount(agent.budget)}</span>
                  <span>expires {new Date(agent.expiresAt).toLocaleDateString()}</span>
                  <code>{agent.id}</code>
                </div>
                <div className="budget-track"><span style={{ width: `${agent.budget === 0n ? 0 : Number((agent.remaining * 100n) / agent.budget)}%` }} /></div>
                <div className="tree-card-actions">
                  {agent.status !== "revoked" && !state.rootRevoked ? (
                    <button className="button secondary compact" onClick={() => handleRevoke(agent.id)} data-testid={`simulation-revoke-${agent.id}`}><Ban size={15} />Revoke Agent</button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PlusIcon() {
  return <CreditCard size={17} />;
}
