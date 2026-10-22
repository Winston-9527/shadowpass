import { generateSeed, unwrapSeed, wrapSeed, type KeySet } from "../sdk";
import {
  defaultBackupSlotClient,
  generateRecoveryCode,
  restoreSeedFromPasskeySlot,
  restoreSeedFromRecoverySlot,
  writePasskeyBackup,
  writeRecoveryBackup,
  type BackupSlotClient,
} from "../backup/slots";
import { getWrapper, listPasskeys, savePasskey, saveViewSecret, saveWrapper } from "../keystore/db";
import { authenticatePasskey, registerPasskey, type PasskeyRecord, type PasskeyRegistration } from "../passkey/webauthn";
import { clearKeyBundle, deriveWalletKeys } from "./keys";
import { bytesToBase64Url, utf8 } from "../lib/bytes";

export interface WalletSession {
  seed: Uint8Array;
  bundle: KeySet;
  source: "sdk";
  activePasskeyId: string;
  backupMode: BackupSlotClient["mode"];
}

export interface CreatedWallet {
  session: WalletSession;
  recoveryCode: string;
}

function publicPasskeyRecord(passkey: PasskeyRegistration): PasskeyRecord {
  const { credentialId, userId, label, createdAt } = passkey;
  return { credentialId, userId, label, createdAt };
}

async function persistDerivedView(bundle: KeySet): Promise<void> {
  await saveViewSecret(utf8(bundle.view.vsk.toString()));
}

async function localWrapper(credentialId: string): Promise<Uint8Array | null> {
  return (await getWrapper(`passkey:${credentialId}`))?.wrapped ?? null;
}

async function saveLocalPasskey(passkey: PasskeyRegistration, wrapped: Uint8Array): Promise<void> {
  const record = publicPasskeyRecord(passkey);
  await savePasskey(record);
  await saveWrapper({
    id: `passkey:${record.credentialId}`,
    kind: "passkey",
    credentialId: record.credentialId,
    wrapped,
    createdAt: new Date().toISOString(),
  });
}

export async function createWallet(
  label: string,
  client: BackupSlotClient = defaultBackupSlotClient(),
): Promise<CreatedWallet> {
  const seed = generateSeed();
  const passkey = await registerPasskey(label);
  const wrapped = await wrapSeed(passkey.prf, seed);
  const recoveryCode = generateRecoveryCode();

  await saveLocalPasskey(passkey, wrapped);
  await writePasskeyBackup(client, passkey.credentialId, passkey.prf, seed);
  await writeRecoveryBackup(client, recoveryCode, seed);

  const bundle = await deriveWalletKeys(seed);
  await persistDerivedView(bundle);
  return {
    session: { seed, bundle, source: "sdk", activePasskeyId: passkey.credentialId, backupMode: client.mode },
    recoveryCode,
  };
}

export async function unlockWallet(
  record: PasskeyRecord,
  client: BackupSlotClient = defaultBackupSlotClient(),
): Promise<WalletSession> {
  const { prf } = await authenticatePasskey(record.credentialId);
  const wrapped = await localWrapper(record.credentialId);
  const seed = wrapped
    ? await unwrapSeed(prf, wrapped)
    : await restoreSeedFromPasskeySlot(client, record.credentialId, prf);
  if (!seed) throw new Error("No wrapped seed was found for this passkey");
  if (!wrapped) await saveLocalPasskey({ ...record, prf }, await wrapSeed(prf, seed));
  const bundle = await deriveWalletKeys(seed);
  await persistDerivedView(bundle);
  return { seed, bundle, source: "sdk", activePasskeyId: record.credentialId, backupMode: client.mode };
}

export async function unlockWithSyncedPasskey(client: BackupSlotClient = defaultBackupSlotClient()): Promise<WalletSession> {
  const { credential, prf } = await authenticatePasskey();
  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId));
  const wrapped = await localWrapper(credentialId);
  const seed = wrapped
    ? await unwrapSeed(prf, wrapped)
    : await restoreSeedFromPasskeySlot(client, credentialId, prf);
  if (!seed) throw new Error("The synced passkey has no backup in the configured slot");
  const record: PasskeyRegistration = {
    credentialId,
    userId: "synced",
    label: "Synced passkey",
    createdAt: new Date().toISOString(),
    prf,
  };
  await saveLocalPasskey(record, wrapped ?? await wrapSeed(prf, seed));
  const bundle = await deriveWalletKeys(seed);
  await persistDerivedView(bundle);
  return { seed, bundle, source: "sdk", activePasskeyId: credentialId, backupMode: client.mode };
}

export async function addPasskey(
  session: WalletSession,
  label: string,
  client: BackupSlotClient = defaultBackupSlotClient(),
): Promise<PasskeyRecord> {
  const existing = await listPasskeys();
  const passkey = await registerPasskey(label, existing.map((record) => record.credentialId));
  const wrapped = await wrapSeed(passkey.prf, session.seed);
  await saveLocalPasskey(passkey, wrapped);
  await writePasskeyBackup(client, passkey.credentialId, passkey.prf, session.seed);
  return publicPasskeyRecord(passkey);
}

export async function recoverWallet(
  recoveryCode: string,
  client: BackupSlotClient = defaultBackupSlotClient(),
): Promise<WalletSession> {
  const seed = await restoreSeedFromRecoverySlot(client, recoveryCode);
  if (!seed) throw new Error("No matching recovery backup was found");
  const bundle = await deriveWalletKeys(seed);
  await persistDerivedView(bundle);
  return { seed, bundle, source: "sdk", activePasskeyId: "recovery", backupMode: client.mode };
}

export function lockSession(session: WalletSession | null): void {
  if (!session) return;
  clearKeyBundle(session.bundle);
  session.seed.fill(0);
}
