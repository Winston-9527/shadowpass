import {
  createRecoveryBackup,
  generateSeed,
  recoverSeedFromBackup,
  unwrapSeed,
  wrapSeed,
  zeroBytes,
} from "../keystore/crypto";
import { getWrapper, listPasskeys, savePasskey, saveViewSecret, saveWrapper } from "../keystore/db";
import { registerPasskey, authenticatePasskey, type PasskeyRecord } from "../passkey/webauthn";
import { clearKeyBundle, deriveWalletKeys, type WalletKeyBundle } from "./keys";

export interface WalletSession {
  seed: Uint8Array;
  bundle: WalletKeyBundle;
  source: "sdk" | "provisional";
  activePasskeyId: string;
}

export interface CreatedWallet {
  session: WalletSession;
  recoveryCode: string;
}

async function persistDerivedView(bundle: WalletKeyBundle): Promise<void> {
  await saveViewSecret(bundle.view.secret);
}

export async function createWallet(label: string): Promise<CreatedWallet> {
  const seed = generateSeed();
  const passkey = await registerPasskey(label);
  const wrapped = await wrapSeed(seed, passkey.prf);
  const recoveryCode = await createRecoveryBackup(seed);
  const derived = await deriveWalletKeys(seed);

  await savePasskey(passkey);
  await saveWrapper({
    id: `passkey:${passkey.credentialId}`,
    kind: "passkey",
    credentialId: passkey.credentialId,
    wrapped,
    createdAt: new Date().toISOString(),
  });
  await persistDerivedView(derived.bundle);

  return {
    session: { seed, bundle: derived.bundle, source: derived.source, activePasskeyId: passkey.credentialId },
    recoveryCode,
  };
}

export async function unlockWallet(record: PasskeyRecord): Promise<WalletSession> {
  const wrapper = await getWrapper(`passkey:${record.credentialId}`);
  if (!wrapper) throw new Error("This passkey has no wrapped seed in this browser");
  const { prf } = await authenticatePasskey(record.credentialId);
  const seed = await unwrapSeed(wrapper.wrapped, prf);
  const derived = await deriveWalletKeys(seed);
  await persistDerivedView(derived.bundle);
  return { seed, bundle: derived.bundle, source: derived.source, activePasskeyId: record.credentialId };
}

export async function addPasskey(session: WalletSession, label: string): Promise<PasskeyRecord> {
  const existing = (await listPasskeys())[0];
  const passkey = await registerPasskey(label, existing?.userId);
  const wrapped = await wrapSeed(session.seed, passkey.prf);
  await savePasskey(passkey);
  await saveWrapper({
    id: `passkey:${passkey.credentialId}`,
    kind: "passkey",
    credentialId: passkey.credentialId,
    wrapped,
    createdAt: new Date().toISOString(),
  });
  return passkey;
}

export async function recoverWallet(recoveryCode: string): Promise<WalletSession> {
  const seed = await recoverSeedFromBackup(recoveryCode);
  const derived = await deriveWalletKeys(seed);
  await persistDerivedView(derived.bundle);
  return { seed, bundle: derived.bundle, source: derived.source, activePasskeyId: "recovery" };
}

export function lockSession(session: WalletSession | null): void {
  if (!session) return;
  zeroBytes(session.seed);
  clearKeyBundle(session.bundle);
}
