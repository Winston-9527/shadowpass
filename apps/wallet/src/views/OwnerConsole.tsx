import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Landmark,
  LoaderCircle,
  Network,
  Plus,
  RefreshCw,
  ScanLine,
  Send,
  Shield,
  TreePine,
  WalletCards,
} from "lucide-react";
import {
  MailboxClient,
  scanBill,
  type BillEntry,
  type ChainState,
  type CircuitName,
} from "@shadowpass/sdk";
import type { WalletSession } from "../wallet/session";
import { bytesToHex } from "../lib/bytes";
import { BrowserWalletGateway, type WalletGateway } from "../flows/chain";
import { deposit } from "../flows/deposit";
import { deliverCardCredential, issueCard } from "../flows/issue";
import { withCrossTabLock } from "../flows/lock";
import { loadLedger, saveLedger } from "../flows/ledger";
import { onboard } from "../flows/onboard";
import { pairingCodeFromLocation, parsePairingCode } from "../flows/pairing";
import { SnarkProofService, type ProofService } from "../flows/prove";
import { publishOwnerRecords, recoverNotes, restoreOwnerRecords } from "../flows/snapshot";
import {
  capValue,
  formatAmount,
  parseAmount,
  type Capability,
  type PairingPayload,
  type ProgressReporter,
  type WalletLedger,
} from "../flows/types";
import type { WalletConfig } from "../flows/config";
import { Tree, buildAuthorizationTree } from "./Tree";

type Tab = "wallet" | "issue" | "tree";
type Busy = null | "onboard" | "deposit" | "issue" | "refresh";

export interface OwnerConsoleProps {
  session: WalletSession;
  config: WalletConfig;
  gateway?: WalletGateway;
  proofs?: ProofService;
  mailer?: MailboxClient;
}

const initialPairInput = typeof location === "undefined"
  ? ""
  : (() => {
      const code = pairingCodeFromLocation(location);
      if (!code) return "";
      try { parsePairingCode(code); return code; } catch { return code; }
    })();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed";
}

function short(value: string, length = 14): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

export function OwnerConsole({ session, config, gateway: injectedGateway, proofs: injectedProofs, mailer: injectedMailer }: OwnerConsoleProps) {
  const [tab, setTab] = useState<Tab>("wallet");
  const [ledger, setLedger] = useState<WalletLedger | null>(null);
  const [chainState, setChainState] = useState<ChainState | null>(null);
  const [bills, setBills] = useState<BillEntry[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairInput, setPairInput] = useState(initialPairInput);
  const [pairing, setPairing] = useState<PairingPayload | null>(() => {
    if (!initialPairInput) return null;
    try { return parsePairingCode(initialPairInput); } catch { return null; }
  });
  const [capability, setCapability] = useState<Capability>("PAY");
  const [budgetInput, setBudgetInput] = useState("40");
  const [expiryDays, setExpiryDays] = useState("1");
  const [depositMethod, setDepositMethod] = useState<"faucet" | "external">("faucet");
  const pairingScanInput = useRef<HTMLInputElement | null>(null);

  const gateway = useMemo(() => injectedGateway ?? new BrowserWalletGateway(config), [config, injectedGateway]);
  const proofs = useMemo(() => injectedProofs ?? new SnarkProofService(config.artifactsUrl), [config.artifactsUrl, injectedProofs]);
  const mailer = useMemo(() => injectedMailer ?? new MailboxClient(config.mailboxUrl), [config.mailboxUrl, injectedMailer]);
  const tree = useMemo(
    () => ledger && chainState ? buildAuthorizationTree(ledger, session.bundle, chainState, bills) : null,
    [bills, chainState, ledger, session.bundle],
  );
  const maximumExpiryDays = ledger?.root
    ? Math.max(0, Math.floor((Number(ledger.root.expiry) * 1_000 - Date.now()) / 86_400_000))
    : 0;

  const persist = async (next: WalletLedger) => {
    await saveLedger(next);
    setLedger(structuredClone(next));
  };

  const walletLockName = `shadowpass:wallet:${config.deployment.chainId}:${session.bundle.sign.Ax.toString()}`;
  const loadFreshLedger = () => loadLedger(config.deployment.chainId, config.network, session.bundle.sign.Ax);

  const refresh = async () => {
    const [state, logs] = await Promise.all([gateway.sync(), gateway.logs()]);
    setChainState(state);
    setBills(scanBill(state, logs, session.bundle.view.vsk));
    return state;
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      setBusy("refresh");
      setError(null);
      try {
        const base = await loadLedger(config.deployment.chainId, config.network, session.bundle.sign.Ax);
        const [state, logs] = await Promise.all([gateway.sync(), gateway.logs()]);
        let records = base;
        let mailboxWarning: string | null = null;
        try {
          records = await restoreOwnerRecords(mailer, session.bundle, state, base);
        } catch (cause) {
          mailboxWarning = `Mailbox records are temporarily unavailable: ${errorMessage(cause)}`;
        }
        const restored = await recoverNotes(records, session.bundle, state);
        await saveLedger(restored);
        if (!active) return;
        setLedger(restored);
        setChainState(state);
        setBills(scanBill(state, logs, session.bundle.view.vsk));
        if (mailboxWarning) setError(mailboxWarning);
      } catch (cause) {
        if (active) setError(errorMessage(cause));
      } finally {
        if (active) setBusy(null);
      }
    })();
    return () => { active = false; };
  }, [config, gateway, mailer, session.bundle]);

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setProgress(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
      try { await refresh(); } catch { /* the visible error is more useful than a secondary RPC failure */ }
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const handleOnboard = () => run("onboard", async () => {
    if (!ledger) throw new Error("wallet ledger is not ready");
    await withCrossTabLock(walletLockName, async () => {
      const current = await loadFreshLedger();
      const result = await onboard({
        ledger: current,
        bundle: session.bundle,
        gateway,
        proofs,
        onCheckpoint: persist,
        progress: setProgress,
      });
      const published = await publishOwnerRecords(mailer, session.bundle, result.ledger, persist);
      await persist(published);
    });
    await refresh();
  });

  const handleDeposit = (amount: bigint) => run("deposit", async () => {
    if (!ledger) throw new Error("wallet ledger is not ready");
    await withCrossTabLock(walletLockName, async () => {
      const current = await loadFreshLedger();
      const result = await deposit({
        ledger: current,
        bundle: session.bundle,
        amount,
        method: depositMethod,
        gateway,
        proofs,
        onCheckpoint: persist,
        progress: setProgress,
      });
      await persist(result.ledger);
    });
    await refresh();
  });

  const acceptPairingInput = (value: string) => {
    setError(null);
    try {
      const parsed = parsePairingCode(value);
      setPairing(parsed);
      setBudgetInput(parsed.name.toLowerCase().includes("理财") ? "50" : "40");
      setCapability(parsed.name.toLowerCase().includes("理财") ? "TREASURY" : "PAY");
      if (location.pathname.endsWith("/pair") && location.hash) {
        history.replaceState(null, "", `${location.pathname}${location.search}`);
      }
    } catch (cause) {
      setPairing(null);
      setError(errorMessage(cause));
    }
  };

  const handleParsePairing = () => acceptPairingInput(pairInput);

  const handlePairingImage = async (file: File | undefined) => {
    if (!file) return;
    const Detector = (window as typeof window & { BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: ImageBitmap): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    if (!Detector) {
      setError("QR scanning is not supported in this browser; paste the pairing code instead.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const [result] = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
        if (!result?.rawValue) throw new Error("The image does not contain a pairing QR code");
        let scanned = result.rawValue;
        if (scanned.includes("#")) {
          try { scanned = new URL(scanned).hash.slice(1) || scanned; } catch { scanned = scanned.slice(scanned.indexOf("#") + 1); }
        }
        setPairInput(scanned);
        acceptPairingInput(scanned);
      } finally {
        bitmap.close();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const handleIssue = () => run("issue", async () => {
    if (!ledger) throw new Error("wallet ledger is not ready");
    const parsed = pairing ?? parsePairingCode(pairInput);
    const budget = parseAmount(budgetInput);
    const days = Number(expiryDays);
    if (!Number.isSafeInteger(days) || days < 1 || days > 30) throw new Error("expiry must be between 1 and 30 days");
    let deliveryError: string | undefined;
    await withCrossTabLock(walletLockName, async () => {
      const current = await loadFreshLedger();
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (!current.root) throw new Error("onboard the wallet before issuing a card");
      if (now + BigInt(days) * 86_400n > BigInt(current.root.expiry)) {
        throw new Error("expiry exceeds the root certificate's remaining lifetime");
      }
      const result = await issueCard({
        ledger: current,
        bundle: session.bundle,
        pairing: parsed,
        capability: capValue(capability),
        budget,
        expiry: now + BigInt(days) * 86_400n,
        gateway,
        proofs,
        mailer,
        onCheckpoint: persist,
        progress: setProgress,
        nowSeconds: now,
      });
      const published = await publishOwnerRecords(mailer, session.bundle, result.ledger, persist);
      await persist(published);
      deliveryError = result.deliveryError;
    });
    setPairing(null);
    setPairInput("");
    if (location.pathname.endsWith("/pair") && location.hash) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
    await refresh();
    if (deliveryError) throw new Error(`Card is safe on-chain, but credential delivery failed: ${deliveryError}`);
  });

  const handleRetryDelivery = (cardId: string) => run("issue", async () => {
    if (!ledger) throw new Error("wallet ledger is not ready");
    await withCrossTabLock(walletLockName, async () => {
      const current = await loadFreshLedger();
      const delivered = await deliverCardCredential({
        ledger: current,
        cardId,
        mailer,
        onCheckpoint: persist,
        progress: setProgress,
      });
      const published = await publishOwnerRecords(mailer, session.bundle, delivered.ledger, persist);
      await persist(published);
    });
    await refresh();
  });

  if (!ledger) {
    return (
      <section className="console-loading">
        {error ? <><AlertTriangle size={20} /><span>{error}</span></> : <><LoaderCircle className="spin" size={20} /><span>Loading wallet state</span></>}
      </section>
    );
  }

  const availableBudget = tree?.stewardBudget ?? 0n;
  const currentRoot = ledger.root;
  const rootReady = Boolean(currentRoot && chainState && chainState.rootTree.indexOf(BigInt(currentRoot.hash)) >= 0);
  const expiryInvalid = Number(expiryDays) > maximumExpiryDays;

  return (
    <div className="owner-console">
      <nav className="console-tabs" aria-label="Wallet sections">
        <button className={tab === "wallet" ? "active" : ""} onClick={() => setTab("wallet")}><WalletCards size={17} />Wallet</button>
        <button className={tab === "issue" ? "active" : ""} onClick={() => setTab("issue")}><CreditCard size={17} />Issue card</button>
        <button className={tab === "tree" ? "active" : ""} onClick={() => setTab("tree")}><TreePine size={17} />Authorization</button>
      </nav>

      <section className="wallet-toolbar">
        <div className="metric"><span>Steward budget</span><strong>{formatAmount(availableBudget)} <small>USDC</small></strong></div>
        <div className="metric"><span>Agent cards</span><strong>{ledger.cards.length}</strong></div>
        <div className="metric"><span>Network</span><strong className="network-value"><Network size={16} />{config.network === "anvil" ? "Anvil" : "Base Sepolia"}</strong></div>
        <button className="icon-button toolbar-refresh" onClick={() => run("refresh", async () => { await refresh(); })} disabled={busy !== null} title="Refresh chain state" aria-label="Refresh chain state">
          <LoaderCircle className={busy === "refresh" ? "spin" : ""} size={18} />
        </button>
      </section>

      {progress && <section className="operation-banner"><LoaderCircle className="spin" size={16} />{progress}</section>}
      {error && <section className="inline-error console-error" role="alert"><AlertTriangle size={16} /><span>{error}</span></section>}

      {tab === "wallet" && (
        <div className="console-grid">
          <section className="console-section onboarding-section">
            <div className="section-heading">
              <div><span className="eyebrow">Step 01</span><h2>Open wallet</h2></div>
              {rootReady ? <span className="complete-pill"><Check size={14} />On-chain</span> : <span className="pending-pill">Not registered</span>}
            </div>
            <div className="flow-row">
              <span className={rootReady ? "flow-step complete" : "flow-step"}><Shield size={17} />Join group</span>
              <ChevronRight size={16} />
              <span className={rootReady ? "flow-step complete" : "flow-step"}><Landmark size={17} />Register cert0</span>
              <ChevronRight size={16} />
              <span className={ledger.notes.length > 0 ? "flow-step complete" : "flow-step"}><CircleDollarSign size={17} />Fund steward</span>
            </div>
            {!rootReady ? (
              <button className="button primary" data-testid="onboard-wallet" onClick={handleOnboard} disabled={busy !== null || !chainState}>
                {busy === "onboard" ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}
                Open wallet
              </button>
            ) : (
              <div className="deposit-controls">
                <div className="segmented">
                  <button className={depositMethod === "faucet" ? "active" : ""} onClick={() => setDepositMethod("faucet")}><CircleDollarSign size={16} />One-click</button>
                  <button className={depositMethod === "external" ? "active" : ""} onClick={() => setDepositMethod("external")}><WalletCards size={16} />MetaMask</button>
                </div>
                <div className="amount-buttons">
                  {[10n, 50n, 100n].map((amount) => (
                    <button key={amount.toString()} className="amount-button" onClick={() => handleDeposit(amount * 1_000_000n)} disabled={busy !== null}>
                      {amount.toString()} USDC
                    </button>
                  ))}
                </div>
                <div className="issue-note"><Clock3 size={15} /><span>Wait before issuing cards so deposits and card grants are less correlated.</span></div>
              </div>
            )}
          </section>

          <section className="console-section card-summary">
            <div className="section-heading"><div><span className="eyebrow">Live cards</span><h2>Agent access</h2></div><span className="count-pill">{ledger.cards.length}</span></div>
            {tree?.cards.length ? tree.cards.map((card) => {
              const pendingDelivery = ledger.cards.find((candidate) => candidate.id === card.id)?.status === "pending_delivery";
              return (
                <div className="compact-card" key={card.id}>
                  <span className={`status-dot ${card.status}`} />
                  <div><strong>{card.name}</strong><span>{pendingDelivery ? "pending delivery" : card.status} / {formatAmount(card.remaining)} USDC</span></div>
                  {pendingDelivery ? (
                    <button className="icon-button" onClick={() => handleRetryDelivery(card.id)} disabled={busy !== null} title="Retry credential delivery" aria-label="Retry credential delivery"><RefreshCw size={17} /></button>
                  ) : (
                    <button className="icon-button" onClick={() => setTab("tree")} title="Open authorization tree" aria-label="Open authorization tree"><ChevronRight size={17} /></button>
                  )}
                </div>
              );
            }) : <div className="empty-state"><CreditCard size={20} /><span>No Agent cards</span></div>}
          </section>
        </div>
      )}

      {tab === "issue" && (
        <div className="issue-layout">
          <section className="console-section pairing-panel">
            <div className="section-heading"><div><span className="eyebrow">Pairing</span><h2>Agent link</h2></div><Send size={20} /></div>
            <label className="field"><span>Pairing code</span><textarea data-testid="pairing-code" value={pairInput} onChange={(event) => { setPairInput(event.target.value); setPairing(null); }} placeholder="Paste the MCP pairing code" rows={4} /></label>
            <div className="pairing-actions">
              <button className="button secondary" onClick={handleParsePairing} disabled={!pairInput.trim()}><ArrowRight size={16} />Read pairing</button>
              <button className="icon-button" type="button" onClick={() => pairingScanInput.current?.click()} disabled={busy !== null} title="Scan pairing QR code" aria-label="Scan pairing QR code"><ScanLine size={18} /></button>
              <input ref={pairingScanInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void handlePairingImage(event.target.files?.[0]); event.target.value = ""; }} />
            </div>
            {pairing && (
              <div className="pairing-result">
                <span className="complete-pill"><Check size={14} />Paired</span>
                <strong>{pairing.name}</strong>
                <code title={pairing.agentPk.x.toString()}>{short(pairing.agentPk.x.toString(), 28)}</code>
              </div>
            )}
          </section>

          <section className="console-section issue-form">
            <div className="section-heading"><div><span className="eyebrow">Policy</span><h2>Card limits</h2></div><span className="budget-source">{formatAmount(availableBudget)} USDC available</span></div>
            <fieldset className="field-group"><legend>Capability</legend><div className="segmented capability-select">
              <button className={capability === "PAY" ? "active" : ""} onClick={() => setCapability("PAY")}><CreditCard size={16} />Pay</button>
              <button className={capability === "TREASURY" ? "active" : ""} onClick={() => setCapability("TREASURY")}><Landmark size={16} />Treasury</button>
            </div></fieldset>
            <div className="form-row">
              <label className="field"><span>Budget</span><input data-testid="card-budget" inputMode="decimal" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} /></label>
              <label className="field"><span>Expires</span><select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}><option value="1" disabled={maximumExpiryDays < 1}>1 day</option><option value="7" disabled={maximumExpiryDays < 7}>7 days</option><option value="30" disabled={maximumExpiryDays < 30}>30 days</option></select></label>
            </div>
            <button className="button primary wide" data-testid="issue-card" onClick={handleIssue} disabled={busy !== null || !pairing || !chainState || availableBudget <= 0n || expiryInvalid}>
              {busy === "issue" ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
              Issue and deliver
            </button>
            <div className="issue-note"><Clock3 size={15} /><span>Credential delivery is encrypted end to end.</span></div>
          </section>
        </div>
      )}

      {tab === "tree" && tree && <Tree model={tree} />}
    </div>
  );
}
