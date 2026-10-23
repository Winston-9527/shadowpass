import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Fingerprint,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { shortFingerprint } from "./lib/bytes";
import { listPasskeys } from "./keystore/db";
import { isBackupConfigured } from "./backup/slots";
import { hasPlatformPasskeySupport, PrfUnsupportedError, type PasskeyRecord } from "./passkey/webauthn";
import { addPasskey, createWallet, lockSession, recoverWallet, unlockWallet, unlockWithSyncedPasskey, type WalletSession } from "./wallet/session";
import { publicKeyText, type WalletKeyKind } from "./wallet/keys";
import { LandingSections } from "./LandingSections";

type SupportState =
  | { status: "checking" }
  | { status: "ready" }
  | { status: "unsupported"; reason: string };

const RP_ID = "shadowpass-wallet.vercel.app";

function hostSupportsPasskey(): { ok: boolean; reason?: string } {
  if (location.hostname === "localhost" || location.hostname === RP_ID) return { ok: true };
  return {
    ok: false,
    reason: `Passkey is disabled on ${location.hostname}. Use localhost or ${RP_ID}.`,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof PrfUnsupportedError) return error.message;
  return error instanceof Error ? error.message : "The operation could not be completed";
}

function KeyRow({ label, publicKey, storage }: { label: string; publicKey: string; storage: string }) {
  return (
    <article className="key-row">
      <div className="key-icon"><KeyRound size={18} /></div>
      <div className="key-copy">
        <div className="key-title">{label}</div>
        <code title={publicKey}>{shortFingerprint(publicKey)}</code>
      </div>
      <span className="storage-pill">{storage}</span>
    </article>
  );
}
function RecoveryDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  };
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
        <button className="icon-button dialog-close" onClick={onClose} title="Close recovery code" aria-label="Close recovery code">
          <X size={18} />
        </button>
        <div className="dialog-icon"><RotateCcw size={22} /></div>
        <h2 id="recovery-title">Recovery code</h2>
        <p>This code is shown once. The encrypted seed is stored in the backup slot and can be restored in a new browser.</p>
        <code className="recovery-code">{code}</code>
        <div className="dialog-actions">
          <button className="button secondary" onClick={copy}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? "Copied" : "Copy code"}
          </button>
          <button className="button primary" onClick={onClose}>I stored it</button>
        </div>
      </section>
    </div>
  );
}

export function App() {
  const [support, setSupport] = useState<SupportState>({ status: "checking" });
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [passkeyLabel, setPasskeyLabel] = useState("Mac Touch ID");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<WalletSession | null>(null);

  const keyRows = useMemo(() => session ? [
    { label: "Signing key", kind: "sign" as WalletKeyKind, storage: "memory" },
    { label: "Steward key", kind: "steward" as WalletKeyKind, storage: "memory" },
    { label: "View key", kind: "view" as WalletKeyKind, storage: "IndexedDB" },
    { label: "Mailbox key", kind: "box" as WalletKeyKind, storage: "memory" },
  ] : [], [session]);

  const refreshPasskeys = async () => setPasskeys(await listPasskeys());

  useEffect(() => {
    let active = true;
    void (async () => {
      const host = hostSupportsPasskey();
      if (!active) return;
      if (!host.ok) {
        setSupport({ status: "unsupported", reason: host.reason ?? "Passkey is unavailable" });
        return;
      }
      if (!hasPlatformPasskeySupport()) {
        setSupport({ status: "unsupported", reason: "WebAuthn is not available in this browser." });
        return;
      }
      if (!isBackupConfigured()) {
        setSupport({ status: "unsupported", reason: "Backup mailbox is not configured. Set VITE_MAILBOX_URL before creating a wallet." });
        return;
      }
      await refreshPasskeys();
      if (active) setSupport({ status: "ready" });
    })().catch((cause) => {
      if (active) setSupport({ status: "unsupported", reason: errorMessage(cause) });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => () => lockSession(sessionRef.current), []);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = () => run("create", async () => {
    const created = await createWallet(passkeyLabel.trim() || "Passkey");
    sessionRef.current = created.session;
    setSession(created.session);
    setRecoveryCode(created.recoveryCode);
    await refreshPasskeys();
  });

  const handleUnlock = (record: PasskeyRecord) => run(`unlock:${record.credentialId}`, async () => {
    const unlocked = await unlockWallet(record);
    sessionRef.current = unlocked;
    setSession(unlocked);
  });

  const handleRecovery = () => run("recovery", async () => {
    const recovered = await recoverWallet(recoveryInput);
    sessionRef.current = recovered;
    setSession(recovered);
    setRecoveryInput("");
  });

  const handleSyncedUnlock = () => run("synced-unlock", async () => {
    const unlocked = await unlockWithSyncedPasskey();
    sessionRef.current = unlocked;
    setSession(unlocked);
  });

  const handleAddPasskey = () => run("add-passkey", async () => {
    if (!session) return;
    await addPasskey(session, passkeyLabel.trim() || "Second passkey");
    await refreshPasskeys();
  });

  const handleLock = () => {
    lockSession(sessionRef.current);
    sessionRef.current = null;
    setSession(null);
    setError(null);
  };

  if (support.status === "checking") {
    return (
      <div className="center-state">
        <LoaderCircle className="spin" size={24} />
        <span>Checking authenticator</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={20} /></span>
          <span>ShadowPass</span>
          <span className="brand-sub">Wallet</span>
        </div>
        <div className="topbar-meta">
          <span className="network-pill"><Link2 size={14} /> Base Sepolia</span>
          <span className={`lock-pill ${session ? "online" : ""}`}>
            {session ? <Check size={14} /> : <LockKeyhole size={14} />}
            {session ? "Unlocked" : "Locked"}
          </span>
        </div>
      </header>

      <main>
        {support.status === "unsupported" ? (
          <section className="notice warning" data-testid="prf-unavailable">
            <AlertTriangle size={22} />
            <div>
              <h1>Wallet unavailable</h1>
              <p>{support.reason}</p>
            </div>
          </section>
        ) : session ? (
          <>
            <section className="status-band">
              <div>
                <span className="eyebrow">Owner session</span>
                <h1>Keys unlocked</h1>
              </div>
              <div className="status-actions">
                <span className={`source-badge ${session.source}`}>
                  <Database size={14} />
                  SDK keys
                </span>
                <button className="button secondary" onClick={handleAddPasskey} disabled={busy !== null}>
                  {busy === "add-passkey" ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                  Add passkey
                </button>
                <button className="button dark" onClick={handleLock} disabled={busy !== null}>
                  <LockKeyhole size={17} />
                  Lock
                </button>
              </div>
            </section>

            {busy === "add-passkey" && <p className="operation-hint">Touch ID may be requested twice while the new passkey is confirmed.</p>}
            {error && <section className="inline-error session-error" role="alert"><AlertTriangle size={16} />{error}</section>}

            <section className="keys-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Derived material</span>
                  <h2>Wallet keys</h2>
                </div>
                <span className="active-passkey"><UserRoundCheck size={15} /> {session.activePasskeyId.slice(0, 12)}</span>
              </div>
              <div className="keys-grid">
                {keyRows.map((row) => (
                  <KeyRow key={row.label} label={row.label} storage={row.storage} publicKey={publicKeyText(session.bundle, row.kind)} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="setup-layout">
            <section className="setup-panel">
              <div className="setup-heading">
                <span className="eyebrow">Owner access</span>
                <h1>Wallet access</h1>
                <p>Use a platform passkey to create or unlock the local wallet seed.</p>
              </div>
              <label className="field">
                <span>Passkey label</span>
                <input value={passkeyLabel} onChange={(event) => setPasskeyLabel(event.target.value)} maxLength={48} />
              </label>
              <button className="button primary wide" data-testid="create-wallet" onClick={handleCreate} disabled={busy !== null}>
                {busy === "create" ? <LoaderCircle className="spin" size={18} /> : <Fingerprint size={18} />}
                Create with passkey
              </button>
              {busy === "create" && <p className="operation-hint">Touch ID may be requested twice while the PRF result is confirmed.</p>}
              {error && <div className="inline-error" role="alert"><AlertTriangle size={16} />{error}</div>}
            </section>

            <section className="access-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Local credentials</span>
                  <h2>Passkeys</h2>
                </div>
                <span className="count-pill">{passkeys.length}</span>
              </div>
              <div className="passkey-list" data-testid="passkey-list">
                {passkeys.length === 0 ? (
                  <div className="empty-row"><Fingerprint size={18} /> No passkey registered in this browser</div>
                ) : passkeys.map((record) => (
                  <button className="passkey-row" key={record.credentialId} onClick={() => handleUnlock(record)} disabled={busy !== null}>
                    <span className="passkey-symbol"><Fingerprint size={18} /></span>
                    <span className="passkey-copy">
                      <strong>{record.label}</strong>
                      <code>{record.credentialId.slice(0, 18)}…</code>
                    </span>
                    {busy === `unlock:${record.credentialId}` ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}
                  </button>
                ))}
              </div>
              <button className="button secondary wide synced-button" onClick={handleSyncedUnlock} disabled={busy !== null}>
                {busy === "synced-unlock" ? <LoaderCircle className="spin" size={17} /> : <Fingerprint size={17} />}
                Use synced passkey
              </button>

              <div className="recovery-section">
                <label className="field">
                  <span>Recovery code</span>
                  <input
                    data-testid="recovery-input"
                    value={recoveryInput}
                    onChange={(event) => setRecoveryInput(event.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                    spellCheck={false}
                  />
                </label>
                <button className="button secondary wide" data-testid="recover-wallet" onClick={handleRecovery} disabled={busy !== null || !recoveryInput.trim()}>
                  {busy === "recovery" ? <LoaderCircle className="spin" size={17} /> : <RotateCcw size={17} />}
                  Recover wallet
                </button>
              </div>
            </section>
          </div>
        )}
        <LandingSections />
      </main>

      <footer className="app-footer">
        <span>{location.hostname}</span>
        <span>RP ID: {location.hostname === "localhost" ? "localhost" : RP_ID}</span>
      </footer>

      {recoveryCode && <RecoveryDialog code={recoveryCode} onClose={() => setRecoveryCode(null)} />}
    </div>
  );
}
