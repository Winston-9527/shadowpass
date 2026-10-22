import type { PasskeyRecord } from "../passkey/webauthn";

export interface WrapperRecord {
  id: string;
  kind: "passkey" | "recovery";
  credentialId?: string;
  wrapped: Uint8Array;
  createdAt: string;
}

const DB_NAME = "shadowpass-wallet";
const DB_VERSION = 1;
const PASSKEYS = "passkeys";
const WRAPPERS = "wrappers";
const SECRETS = "secrets";

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("IndexedDB request failed"));
  });
}

export async function openWalletDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available in this browser");
  return new Promise((resolve, reject) => {
    const upgrade = indexedDB.open(DB_NAME, DB_VERSION);
    upgrade.onupgradeneeded = () => {
      const db = upgrade.result;
      if (!db.objectStoreNames.contains(PASSKEYS)) db.createObjectStore(PASSKEYS, { keyPath: "credentialId" });
      if (!db.objectStoreNames.contains(WRAPPERS)) db.createObjectStore(WRAPPERS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SECRETS)) db.createObjectStore(SECRETS, { keyPath: "id" });
    };
    upgrade.onsuccess = () => resolve(upgrade.result);
    upgrade.onerror = () => reject(upgrade.error ?? new Error("Unable to open IndexedDB"));
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openWalletDb();
  try {
    const transaction = db.transaction(storeName, mode);
    const completion = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
    const result = await request(action(transaction.objectStore(storeName)));
    await completion;
    return result;
  } finally {
    db.close();
  }
}

export function savePasskey(record: PasskeyRecord): Promise<string> {
  return withStore(PASSKEYS, "readwrite", (store) => store.put(record)).then(() => record.credentialId);
}

export function listPasskeys(): Promise<PasskeyRecord[]> {
  return withStore(PASSKEYS, "readonly", (store) => store.getAll());
}

export function saveWrapper(record: WrapperRecord): Promise<string> {
  return withStore(WRAPPERS, "readwrite", (store) => store.put(record)).then(() => record.id);
}

export function getWrapper(id: string): Promise<WrapperRecord | undefined> {
  return withStore(WRAPPERS, "readonly", (store) => store.get(id));
}

export function saveViewSecret(secret: Uint8Array): Promise<string> {
  return withStore(SECRETS, "readwrite", (store) => store.put({ id: "view", secret })).then(() => "view");
}

export function getViewSecret(): Promise<Uint8Array | undefined> {
  return withStore<{ id: string; secret: Uint8Array } | undefined>(SECRETS, "readonly", (store) => store.get("view"))
    .then((record) => record?.secret);
}

export function clearViewSecret(): Promise<void> {
  return withStore(SECRETS, "readwrite", (store) => store.delete("view")).then(() => undefined);
}

export async function resetWalletDbForTests(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase(DB_NAME);
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error ?? new Error("Unable to reset IndexedDB"));
    deletion.onblocked = () => resolve();
  });
}

export async function inspectWalletDbForTests(): Promise<Record<string, unknown>[]> {
  const db = await openWalletDb();
  try {
    const transaction = db.transaction([PASSKEYS, WRAPPERS, SECRETS], "readonly");
    const stores = [PASSKEYS, WRAPPERS, SECRETS];
    const records: Record<string, unknown>[] = [];
    for (const storeName of stores) {
      records.push(...await request(transaction.objectStore(storeName).getAll()) as Record<string, unknown>[]);
    }
    return records;
  } finally {
    db.close();
  }
}
