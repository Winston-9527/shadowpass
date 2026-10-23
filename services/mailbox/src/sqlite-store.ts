import { DatabaseSync } from "node:sqlite";
import type { MailboxEnvelope, MailboxStore, RateLimitResult } from "./types.js";

interface IdRow {
  id: number;
}

interface EnvelopeRow {
  id: number;
  ct: string;
  ts: number;
}

interface RateRow {
  window_start: number;
  count: number;
}

export interface SqliteMailboxStoreOptions {
  maxMessages?: number;
  retentionMs?: number;
  now?: () => number;
}

export class SqliteMailboxStore implements MailboxStore {
  readonly #db: DatabaseSync;
  readonly #maxMessages: number;
  readonly #retentionMs: number;
  readonly #now: () => number;

  constructor(path = ":memory:", options: SqliteMailboxStoreOptions = {}) {
    this.#db = new DatabaseSync(path);
    this.#maxMessages = options.maxMessages ?? 1_000;
    this.#retentionMs = options.retentionMs ?? 30 * 24 * 60 * 60 * 1_000;
    this.#now = options.now ?? Date.now;
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS mailbox_messages (
        recipient TEXT NOT NULL,
        id INTEGER NOT NULL,
        ct TEXT NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (recipient, id)
      );
      CREATE TABLE IF NOT EXISTS mailbox_rate_limits (
        bucket TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mailbox_rate_limits_window
        ON mailbox_rate_limits (window_start);
      CREATE TABLE IF NOT EXISTS mailbox_slots (
        slot TEXT NOT NULL,
        id INTEGER NOT NULL,
        ct TEXT NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (slot, id)
      );
    `);
  }

  async append(recipient: string, ct: string, ts: number): Promise<number> {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#db
        .prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM mailbox_messages WHERE recipient = ?")
        .get(recipient) as unknown as IdRow;
      const id = Number(row.id);
      this.#db
        .prepare("INSERT INTO mailbox_messages (recipient, id, ct, ts) VALUES (?, ?, ?, ?)")
        .run(recipient, id, ct, ts);
      this.#db
        .prepare(
          "DELETE FROM mailbox_messages WHERE recipient = ? AND (ts < ? OR id <= ?)",
        )
        .run(recipient, ts - this.#retentionMs, id - this.#maxMessages);
      this.#db.exec("COMMIT");
      return id;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  async list(recipient: string, after: number, limit: number): Promise<MailboxEnvelope[]> {
    const rows = this.#db
      .prepare(
        "SELECT id, ct, ts FROM mailbox_messages WHERE recipient = ? AND id > ? AND ts >= ? ORDER BY id ASC LIMIT ?",
      )
      .all(recipient, after, this.#now() - this.#retentionMs, limit) as unknown as EnvelopeRow[];
    return rows.map((row) => ({ id: Number(row.id), ct: row.ct, ts: Number(row.ts) }));
  }

  async appendSlot(slot: string, ct: string, ts: number): Promise<number | null> {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const count = this.#db
        .prepare("SELECT COUNT(*) AS count FROM mailbox_slots WHERE slot = ?")
        .get(slot) as unknown as { count: number };
      if (Number(count.count) >= 16) {
        this.#db.exec("COMMIT");
        return null;
      }
      const row = this.#db
        .prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM mailbox_slots WHERE slot = ?")
        .get(slot) as unknown as IdRow;
      const id = Number(row.id);
      this.#db
        .prepare("INSERT INTO mailbox_slots (slot, id, ct, ts) VALUES (?, ?, ?, ?)")
        .run(slot, id, ct, ts);
      this.#db.exec("COMMIT");
      return id;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  async listSlot(slot: string, after: number, limit: number): Promise<MailboxEnvelope[]> {
    const rows = this.#db
      .prepare(
        "SELECT id, ct, ts FROM mailbox_slots WHERE slot = ? AND id > ? ORDER BY id ASC LIMIT ?",
      )
      .all(slot, after, limit) as unknown as EnvelopeRow[];
    return rows.map((row) => ({ id: Number(row.id), ct: row.ct, ts: Number(row.ts) }));
  }

  async hitRateLimit(
    bucket: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<RateLimitResult> {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db
        .prepare("DELETE FROM mailbox_rate_limits WHERE window_start < ?")
        .run(now - windowMs);
      const row = this.#db
        .prepare("SELECT window_start, count FROM mailbox_rate_limits WHERE bucket = ?")
        .get(bucket) as RateRow | undefined;
      let windowStart = Number(row?.window_start ?? now);
      let count = Number(row?.count ?? 0);

      if (row === undefined || now - windowStart >= windowMs) {
        windowStart = now;
        count = 0;
      }

      if (count >= limit) {
        this.#db.exec("COMMIT");
        return { allowed: false, retryAfterMs: Math.max(1, windowStart + windowMs - now) };
      }

      count += 1;
      this.#db
        .prepare(
          `INSERT INTO mailbox_rate_limits (bucket, window_start, count) VALUES (?, ?, ?)
           ON CONFLICT(bucket) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`,
        )
        .run(bucket, windowStart, count);
      this.#db.exec("COMMIT");
      return { allowed: true, retryAfterMs: 0 };
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.#db.close();
  }
}
