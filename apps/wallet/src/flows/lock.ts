import { randomBytes } from "../lib/bytes";

const LOCK_PREFIX = "shadowpass-lock:";

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

function manager(): LockManagerLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { locks?: LockManagerLike }).locks ?? null;
}

async function withLocalStorageLock<T>(name: string, task: () => Promise<T>, timeoutMs: number): Promise<T> {
  if (typeof localStorage === "undefined") return task();
  const key = `${LOCK_PREFIX}${name}`;
  const token = Array.from(randomBytes(16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const started = Date.now();
  for (;;) {
    const current = localStorage.getItem(key);
    const expiresAt = current ? Number(current.split(":")[1]) : 0;
    if (!current || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      const value = `${token}:${Date.now() + timeoutMs}`;
      localStorage.setItem(key, value);
      if (localStorage.getItem(key) === value) break;
    }
    if (Date.now() - started >= timeoutMs) throw new Error("another wallet tab is still using this budget ticket");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  try {
    return await task();
  } finally {
    if (localStorage.getItem(key)?.startsWith(`${token}:`)) localStorage.removeItem(key);
  }
}

/** Serializes card issuance across tabs; the Web Locks path is atomic in supporting browsers. */
export async function withCrossTabLock<T>(name: string, task: () => Promise<T>, timeoutMs = 120_000): Promise<T> {
  const locks = manager();
  if (locks) return locks.request(name, task);
  return withLocalStorageLock(name, task, timeoutMs);
}
