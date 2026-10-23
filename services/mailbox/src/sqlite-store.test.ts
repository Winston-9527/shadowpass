import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteMailboxStore } from "./sqlite-store.js";

describe("SqliteMailboxStore", () => {
  it("keeps at most the configured message count", async () => {
    const store = new SqliteMailboxStore(":memory:", { maxMessages: 2, now: () => 3 });
    try {
      await store.append("ab".repeat(32), "one", 1);
      await store.append("ab".repeat(32), "two", 2);
      await store.append("ab".repeat(32), "three", 3);
      await expect(store.list("ab".repeat(32), 0, 10)).resolves.toEqual([
        { id: 2, ct: "two", ts: 2 },
        { id: 3, ct: "three", ts: 3 },
      ]);
    } finally {
      store.close();
    }
  });

  it("removes messages older than the retention window", async () => {
    const store = new SqliteMailboxStore(":memory:", { retentionMs: 100, now: () => 200 });
    try {
      await store.append("ab".repeat(32), "old", 1);
      await store.append("ab".repeat(32), "new", 200);
      await expect(store.list("ab".repeat(32), 0, 10)).resolves.toEqual([
        { id: 2, ct: "new", ts: 200 },
      ]);
    } finally {
      store.close();
    }
  });

  it("cleans expired rate-limit buckets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shadowpass-mailbox-rate-"));
    const path = join(dir, "mailbox.sqlite");
    try {
      const store = new SqliteMailboxStore(path);
      await store.hitRateLimit("old", 1, 100, 0);
      await store.hitRateLimit("new", 1, 100, 1_000);
      store.close();

      const db = new DatabaseSync(path);
      const row = db.prepare("SELECT COUNT(*) AS count FROM mailbox_rate_limits").get() as unknown as {
        count: number;
      };
      expect(Number(row.count)).toBe(1);
      db.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps slots independent from message retention and rejects the 17th entry", async () => {
    const store = new SqliteMailboxStore(":memory:", {
      retentionMs: 1,
      now: () => 10_000,
    });
    try {
      const slot = "ab".repeat(32);
      for (let index = 1; index <= 16; index += 1) {
        await expect(store.appendSlot(slot, `envelope-${index}`, 1)).resolves.toBe(index);
      }
      await expect(store.appendSlot(slot, "overflow", 1)).resolves.toBeNull();
      const entries = await store.listSlot(slot, 0, 200);
      expect(entries).toHaveLength(16);
      expect(entries[0]).toEqual({ id: 1, ct: "envelope-1", ts: 1 });
    } finally {
      store.close();
    }
  });
});
