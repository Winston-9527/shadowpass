import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ReceiptText,
  Send,
  Shield,
  TreePine,
  WalletCards,
  X,
} from "lucide-react";
import {
  MailboxClient,
  type ChainState,
  type CircuitName,
} from "@shadowpass/sdk";
import type { WalletSession } from "../wallet/session";
import { bytesToHex } from "../lib/bytes";
import { BrowserWalletGateway, type WalletGateway } from "../flows/chain";
import { getWalletState, saveWalletState } from "../keystore/db";
import { DEFAULT_ALERT_RULES, alertRulesKey, evaluateBillAlerts, normalizeAlertRules, type AlertRules } from "../flows/alert-rules";
import { loadBillSnapshot, type ChainDelegation, type ChainReceipt, type WalletBill } from "../flows/bill";
import { deposit } from "../flows/deposit";
import { deliverCardCredential, issueCard } from "../flows/issue";
import { withCrossTabLock } from "../flows/lock";
import { loadLedger, saveLedger } from "../flows/ledger";
import { onboard } from "../flows/onboard";
import { pairingCodeFromLocation, parsePairingCode } from "../flows/pairing";
import { SnarkProofService, type ProofService } from "../flows/prove";
import { revokeAgent, revokeTree } from "../flows/revoke";
import { publishOwnerRecords, recoverNotes, restoreOwnerRecords } from "../flows/snapshot";
import {
  capValue,
  formatAmount,
  parseAmount,
  type Capability,
  type PairingPayload,
  type PendingBudgetTransfer,
  type ProgressReporter,
  type WalletLedger,
} from "../flows/types";
import type { WalletConfig } from "../flows/config";
import { useBillAlerts } from "../alerts/useBillAlerts";
import { Bill } from "./Bill";
import { Tree, buildAuthorizationTree } from "./Tree";

type Tab = "wallet" | "bills" | "issue" | "tree";
type Busy = null | "onboard" | "deposit" | "issue" | "refresh" | "revoke";

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

function pendingPairing(pending: PendingBudgetTransfer): PairingPayload {
  const pair = pending.card.delivery?.pair;
  if (!pair) throw new Error("pending card is missing its pairing data");
  return {
    v: 1,
    name: pending.card.name,
    agentPk: { x: BigInt(pending.card.agentPk.x), y: BigInt(pending.card.agentPk.y) },
    boxPk: pending.card.boxPk,
    pair,
  };
}

export function OwnerConsole({ session, config, gateway: injectedGateway, proofs: injectedProofs, mailer: injectedMailer }: OwnerConsoleProps) {
  const [tab, setTab] = useState<Tab>("wallet");
  const [ledger, setLedger] = useState<WalletLedger | null>(null);
  const [chainState, setChainState] = useState<ChainState | null>(null);
  const [bills, setBills] = useState<WalletBill[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRules>(DEFAULT_ALERT_RULES);
  const [revocationWindowSeconds, setRevocationWindowSeconds] = useState<bigint | null>(null);
  const [revocationNotice, setRevocationNotice] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<"tree" | string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [chainRevision, setChainRevision] = useState(0);
  const [latestBlockTimeMs, setLatestBlockTimeMs] = useState(0);
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
  const ledgerRef = useRef<WalletLedger | null>(null);
  const pollingRef = useRef(false);
  const busyRef = useRef(false);
  const mailboxCursorRef = useRef(0);
  const receiptsRef = useRef<ChainReceipt[]>([]);
  const delegationsRef = useRef<ChainDelegation[]>([]);

  const gateway = useMemo(() => injectedGateway ?? new BrowserWalletGateway(config), [config, injectedGateway]);
  const proofs = useMemo(() => injectedProofs ?? new SnarkProofService(config.artifactsUrl), [config.artifactsUrl, injectedProofs]);
  const mailer = useMemo(() => injectedMailer ?? new MailboxClient(config.mailboxUrl), [config.mailboxUrl, injectedMailer]);
  const alerts = useMemo(
    () => latestBlockTimeMs === 0 ? [] : evaluateBillAlerts(bills, alertRules, latestBlockTimeMs),
    [alertRules, bills, latestBlockTimeMs],
  );
  const alertHistoryStorageKey = `${alertRulesKey(config.deployment.chainId, config.network, session.bundle.sign.Ax)}:delivered`;
  const pageAlerts = useBillAlerts(alerts, alertHistoryStorageKey);
  const tree = useMemo(
    () => ledger && chainState ? buildAuthorizationTree(ledger, session.bundle, chainState, bills) : null,
    [bills, chainRevision, chainState, ledger, session.bundle],
  );
  const maximumExpiryDays = ledger?.root
    ? Math.max(0, Math.floor((Number(ledger.root.expiry) * 1_000 - Date.now()) / 86_400_000))
    : 0;

  const persist = async (next: WalletLedger) => {
    await saveLedger(next);
    ledgerRef.current = next;
    setLedger(structuredClone(next));
  };

  const walletLockName = `shadowpass:wallet:${config.deployment.chainId}:${session.bundle.sign.Ax.toString()}`;
  const loadFreshLedger = () => loadLedger(config.deployment.chainId, config.network, session.bundle.sign.Ax);

  const refresh = useCallback(async () => {
    const currentLedger = await loadFreshLedger();
    ledgerRef.current = currentLedger;
    setLedger(structuredClone(currentLedger));
    const snapshot = await loadBillSnapshot({
      ledger: currentLedger,
      gateway,
      mailbox: mailer,
      bundle: session.bundle,
      mailboxCursor: mailboxCursorRef.current,
      receipts: receiptsRef.current,
      delegations: delegationsRef.current,
    });
    mailboxCursorRef.current = snapshot.mailboxCursor;
    receiptsRef.current = snapshot.receipts;
    delegationsRef.current = snapshot.delegations;
    setChainState(snapshot.state);
    setLatestBlockTimeMs(snapshot.latestBlockTimeMs);
    setBills(snapshot.bills);
    setChainRevision((revision) => revision + 1);
    setPollError(null);
    return snapshot.state;
  }, [config.deployment.chainId, config.network, gateway, mailer, session.bundle]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setBusy("refresh");
      setError(null);
      try {
        const mounted = await withCrossTabLock(walletLockName, async () => {
          const base = await loadLedger(config.deployment.chainId, config.network, session.bundle.sign.Ax);
          const sync = await gateway.poll();
          const state = sync.state;
          let records = base;
          let mailboxWarning: string | null = null;
          try {
            records = await restoreOwnerRecords(mailer, session.bundle, state, base);
          } catch (cause) {
            mailboxWarning = `Mailbox records are temporarily unavailable: ${errorMessage(cause)}`;
          }
          const restored = await recoverNotes(records, session.bundle, state);
          await saveLedger(restored);
          return { restored, state, logs: sync.logs, mailboxWarning };
        });
        if (!active) return;
        ledgerRef.current = mounted.restored;
        setLedger(mounted.restored);
        setChainState(mounted.state);
        const billSnapshot = await loadBillSnapshot({
          ledger: mounted.restored,
          gateway,
          mailbox: mailer,
          bundle: session.bundle,
          receipts: receiptsRef.current,
          delegations: delegationsRef.current,
        });
        if (!active) return;
        mailboxCursorRef.current = billSnapshot.mailboxCursor;
        receiptsRef.current = billSnapshot.receipts;
        delegationsRef.current = billSnapshot.delegations;
        setChainState(billSnapshot.state);
        setLatestBlockTimeMs(billSnapshot.latestBlockTimeMs);
        setBills(billSnapshot.bills);
        setChainRevision((revision) => revision + 1);
        const rules = await getWalletState<AlertRules>(alertRulesKey(config.deployment.chainId, config.network, session.bundle.sign.Ax));
        const windowSeconds = await gateway.revocationWindow();
        if (!active) return;
        setAlertRules(normalizeAlertRules(rules));
        setRevocationWindowSeconds(windowSeconds);
        if (mounted.mailboxWarning) setError(mounted.mailboxWarning);
      } catch (cause) {
        if (active) setError(errorMessage(cause));
      } finally {
        if (active) setBusy(null);
      }
    })();
    return () => { active = false; };
  }, [config, gateway, mailer, session.bundle, walletLockName]);

  useEffect(() => {
    if (!ledger) return;
    ledgerRef.current = ledger;
  }, [ledger]);

  useEffect(() => {
    if (!ledger) return;
    let active = true;
    const pollNow = () => {
      if (!active || pollingRef.current || busyRef.current) return;
      pollingRef.current = true;
      void refresh()
        .catch((cause) => { if (active) setPollError(errorMessage(cause)); })
        .finally(() => { pollingRef.current = false; });
    };
    const interval = window.setInterval(pollNow, 7_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") pollNow();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [Boolean(ledger), refresh]);

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    setProgress(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
      try { await refresh(); } catch { /* the visible error is more useful than a secondary RPC failure */ }
    } finally {
      busyRef.current = false;
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
    let deliveryError: string | undefined;
    let publishError: string | undefined;
    await withCrossTabLock(walletLockName, async () => {
      const current = await loadFreshLedger();
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (!current.root) throw new Error("onboard the wallet before issuing a card");
      const pending = current.pendingTransfer;
      const request = pending
        ? {
            pairing: pendingPairing(pending),
            capability: BigInt(pending.card.cap),
            budget: BigInt(pending.card.budget),
            expiry: BigInt(pending.card.expiry),
          }
        : (() => {
            const parsed = pairing ?? parsePairingCode(pairInput);
            const budget = parseAmount(budgetInput);
            const days = Number(expiryDays);
            if (!Number.isSafeInteger(days) || days < 1 || days > 30) throw new Error("expiry must be between 1 and 30 days");
            const expiry = now + BigInt(days) * 86_400n;
            if (expiry > BigInt(current.root.expiry)) throw new Error("expiry exceeds the root certificate's remaining lifetime");
            return { pairing: parsed, capability: capValue(capability), budget, expiry };
          })();
      const result = await issueCard({
        ledger: current,
        bundle: session.bundle,
        ...request,
        gateway,
        proofs,
        mailer,
        onCheckpoint: persist,
        progress: setProgress,
        nowSeconds: now,
      });
      await persist(result.ledger);
      try {
        const published = await publishOwnerRecords(mailer, session.bundle, result.ledger, persist);
        await persist(published);
      } catch (cause) {
        publishError = errorMessage(cause);
      }
      deliveryError = result.deliveryError;
    });
    setPairing(null);
    setPairInput("");
    if (location.pathname.endsWith("/pair") && location.hash) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
    await refresh();
    if (publishError) throw new Error(`Card is safe on-chain, but the owner recovery record could not be published: ${publishError}`);
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
      await persist(delivered.ledger);
      try {
        const published = await publishOwnerRecords(mailer, session.bundle, delivered.ledger, persist);
        await persist(published);
      } catch (cause) {
        throw new Error(`Credential was delivered, but the owner recovery record could not be published: ${errorMessage(cause)}`);
      }
    });
    await refresh();
  });

  const handleAlertRules = (next: AlertRules) => {
    const normalized = normalizeAlertRules(next);
    setAlertRules(normalized);
    void saveWalletState(
      alertRulesKey(config.deployment.chainId, config.network, session.bundle.sign.Ax),
      normalized,
    ).catch((cause) => setError(errorMessage(cause)));
  };

  const handleRevokeCard = (cardId: string) => run("revoke", async () => {
    if (!ledger) throw new Error("wallet ledger is not ready");
    const card = ledger.cards.find((candidate) => candidate.id === cardId);
    if (!card) throw new Error("Agent card is not available");
    setRevoking(cardId);
    try {
      const result = await revokeAgent({ ledger, bundle: session.bundle, gateway, proofs, card, progress: setProgress });
      const windowSeconds = revocationWindowSeconds ?? await gateway.revocationWindow();
      setRevocationWindowSeconds(windowSeconds);
      setRevocationNotice(`${card.name} was revoked on-chain. The previous root remains valid for up to ${windowSeconds.toString()}s.`);
      await refresh();
      if (!result.transaction) throw new Error("revocation transaction was not returned");
    } finally {
      setRevoking(null);
    }
  });

  const handleRevokeTree = () => run("revoke", async () => {
    if (!ledger) throw new Error("wallet ledger is not ready");
    setRevoking("tree");
    try {
      const result = await revokeTree({ ledger, bundle: session.bundle, gateway, proofs, progress: setProgress });
      const windowSeconds = revocationWindowSeconds ?? await gateway.revocationWindow();
      setRevocationWindowSeconds(windowSeconds);
      setRevocationNotice(`The authorization tree was revoked on-chain. Previous proofs remain valid for up to ${windowSeconds.toString()}s.`);
      await refresh();
      if (!result.transaction) throw new Error("revocation transaction was not returned");
    } finally {
      setRevoking(null);
    }
  });

  if (!ledger) {
    return (
      <section className="console-loading">
        {error ? <><AlertTriangle size={20} /><span>{error}</span></> : <><LoaderCircle className="spin" size={20} /><span>Loading wallet state</span></>}
      </section>
    );
  }

  const readableBills = bills.filter((bill) => bill.chain !== null);
  const displayError = error ?? pollError;
  const availableBudget = tree?.stewardBudget ?? 0n;
  const currentRoot = ledger.root;
  const pendingTransfer = ledger.pendingTransfer;
  const rootReady = Boolean(currentRoot && chainState && chainState.rootTree.indexOf(BigInt(currentRoot.hash)) >= 0);
  const expiryInvalid = Number(expiryDays) > maximumExpiryDays;
  const unreportedCount = readableBills.filter((bill) => !bill.reported).length;

  return (
    <div className="owner-console">
      <nav className="console-tabs" aria-label="Wallet sections">
        <button className={tab === "wallet" ? "active" : ""} onClick={() => setTab("wallet")}><WalletCards size={17} />Wallet</button>
        <button className={tab === "bills" ? "active" : ""} onClick={() => setTab("bills")}><ReceiptText size={17} />Bills{unreportedCount > 0 && <span className="tab-count">{unreportedCount}</span>}</button>
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
      {displayError && <section className="inline-error console-error" role="alert"><AlertTriangle size={16} /><span>{displayError}</span></section>}
      {pageAlerts.active.length > 0 && (
        <section className="page-alert" role="alert" data-testid="bill-alert">
          <div className="page-alert-icon"><AlertTriangle size={20} /></div>
          <div className="page-alert-copy">
            <strong>{pageAlerts.active.length === 1 ? pageAlerts.active[0]!.title : `${pageAlerts.active.length} alerts need review`}</strong>
            <ul>
              {pageAlerts.active.map((alert) => (
                <li key={alert.id}><span><b>{alert.title}:</b> {alert.detail}</span></li>
              ))}
            </ul>
          </div>
          <button className="button secondary compact" onClick={() => setTab("bills")}>Review bills</button>
          <button className="icon-button" onClick={pageAlerts.dismiss} title="Dismiss alert" aria-label="Dismiss alert"><X size={17} /></button>
        </section>
      )}

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
            <div className="section-heading"><div><span className="eyebrow">Live cards</span><h2>Agent access</h2></div><span className="count-pill">{ledger.cards.length + (pendingTransfer ? 1 : 0)}</span></div>
            {pendingTransfer && (
              <div className="compact-card pending-transfer-card">
                <span className="status-dot pending" />
                <div><strong>{pendingTransfer.card.name}</strong><span>pending transfer / {formatAmount(BigInt(pendingTransfer.card.budget))} USDC</span></div>
                <button className="icon-button" onClick={handleIssue} disabled={busy !== null} title="Resume pending card" aria-label="Resume pending card"><RefreshCw size={17} /></button>
              </div>
            )}
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
            {pendingTransfer && (
              <div className="pending-transfer-notice" role="status">
                <Clock3 size={16} />
                <div><strong>{pendingTransfer.card.name}</strong><span>{formatAmount(BigInt(pendingTransfer.card.budget))} USDC is waiting for a budget transfer.</span></div>
              </div>
            )}
            <fieldset className="field-group"><legend>Capability</legend><div className="segmented capability-select">
              <button className={capability === "PAY" ? "active" : ""} onClick={() => setCapability("PAY")}><CreditCard size={16} />Pay</button>
              <button className={capability === "TREASURY" ? "active" : ""} onClick={() => setCapability("TREASURY")}><Landmark size={16} />Treasury</button>
            </div></fieldset>
            <div className="form-row">
              <label className="field"><span>Budget</span><input data-testid="card-budget" inputMode="decimal" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} /></label>
              <label className="field"><span>Expires</span><select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}><option value="1" disabled={maximumExpiryDays < 1}>1 day</option><option value="7" disabled={maximumExpiryDays < 7}>7 days</option><option value="30" disabled={maximumExpiryDays < 30}>30 days</option></select></label>
            </div>
            <button className="button primary wide" data-testid="issue-card" onClick={handleIssue} disabled={busy !== null || !chainState || (!pendingTransfer && (!pairing || availableBudget <= 0n || expiryInvalid))}>
              {busy === "issue" ? <LoaderCircle className="spin" size={17} /> : pendingTransfer ? <RefreshCw size={17} /> : <Plus size={17} />}
              {pendingTransfer ? "Resume pending card" : "Issue and deliver"}
            </button>
            <div className="issue-note"><Clock3 size={15} /><span>Credential delivery is encrypted end to end.</span></div>
          </section>
        </div>
      )}

      {tab === "bills" && <Bill bills={readableBills} rules={alertRules} alerts={alerts} onChangeRules={handleAlertRules} />}

      {tab === "tree" && tree && (
        <Tree
          model={tree}
          revocationWindowSeconds={revocationWindowSeconds}
          revocationNotice={revocationNotice}
          revoking={revoking}
          onRevokeCard={(card) => handleRevokeCard(card.id)}
          onRevokeTree={handleRevokeTree}
        />
      )}
    </div>
  );
}
