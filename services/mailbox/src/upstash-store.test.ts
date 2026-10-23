import { describe, expect, it } from "vitest";
import { UpstashMailboxStore } from "./upstash-store.js";

function fakeUpstash(options: { gateFirstWrite?: boolean } = {}) {
  const strings = new Map<string, string>();
  const sets = new Map<string, Map<string, number>>();
  const counters = new Map<string, number>();
  const commands: unknown[][] = [];
  let writeTail = Promise.resolve();
  let appendWrites = 0;
  let releaseFirst = () => {};
  let firstStarted = () => {};
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstObserved = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });

  async function serialized<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = writeTail;
    let release = () => {};
    writeTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  const sorted = (key: string) =>
    [...(sets.get(key)?.entries() ?? [])].sort((left, right) => left[1] - right[1]);

  const fetchStub = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    commands.push(command);
    const name = String(command[0] ?? "");
    if (name === "ZRANGEBYSCORE") {
      const key = String(command[1] ?? "");
      const min = String(command[2] ?? "").replace(/^\(/, "");
      const offset = Number(command[5] ?? 0);
      const count = Number(command[6] ?? 200);
      const members = sorted(key)
        .filter(([, score]) => score > Number(min))
        .slice(offset, offset + count)
        .map(([member]) => member);
      return Response.json({ result: members });
    }
    if (name === "MGET") {
      return Response.json({
        result: command.slice(1).map((key) => strings.get(String(key)) ?? null),
      });
    }
    if (name === "ZREM") {
      const key = String(command[1] ?? "");
      const set = sets.get(key);
      for (const member of command.slice(2).map(String)) set?.delete(member);
      return Response.json({ result: 1 });
    }
    if (name === "DEL") {
      for (const key of command.slice(1).map(String)) strings.delete(key);
      return Response.json({ result: 1 });
    }
    if (name === "PEXPIRE") return Response.json({ result: 1 });
    if (name === "EVAL") {
      const script = String(command[1] ?? "");
      const keyCount = Number(command[2] ?? 0);
      const keys = command.slice(3, 3 + keyCount).map(String);
      const args = command.slice(3 + keyCount).map(String);
      if (script.includes("local expired")) {
        return Response.json({
          result: await serialized(async () => {
            appendWrites += 1;
            if (options.gateFirstWrite === true && appendWrites === 1) {
              firstStarted();
              await firstGate;
            }
            const [idKey = "", indexKey = "", expiryKey = ""] = keys;
            const [json = "{}", prefix = "", tsText = "0", cutoffText = "0", maxText = "1000"] = args;
            const id = (counters.get(idKey) ?? 0) + 1;
            counters.set(idKey, id);
            strings.set(`${prefix}${id}`, json);
            const index = sets.get(indexKey) ?? new Map<string, number>();
            index.set(String(id), id);
            const expiry = sets.get(expiryKey) ?? new Map<string, number>();
            expiry.set(String(id), Number(tsText));
            for (const [member, score] of expiry) {
              if (score < Number(cutoffText)) {
                strings.delete(`${prefix}${member}`);
                index.delete(member);
                expiry.delete(member);
              }
            }
            const excess = index.size - Number(maxText);
            if (excess > 0) {
              for (const [member] of [...index.entries()].sort((a, b) => a[1] - b[1]).slice(0, excess)) {
                strings.delete(`${prefix}${member}`);
                index.delete(member);
                expiry.delete(member);
              }
            }
            sets.set(indexKey, index);
            sets.set(expiryKey, expiry);
            return id;
          }),
        });
      }
      if (script.includes('return -1')) {
        return Response.json({
          result: await serialized(() => {
            const [idKey = "", indexKey = ""] = keys;
            const [json = "{}", prefix = ""] = args;
            const index = sets.get(indexKey) ?? new Map<string, number>();
            if (index.size >= 16) return -1;
            const id = (counters.get(idKey) ?? 0) + 1;
            counters.set(idKey, id);
            strings.set(`${prefix}${id}`, json);
            index.set(String(id), id);
            sets.set(indexKey, index);
            return id;
          }),
        });
      }
      return Response.json({
        result: await serialized(() => {
          const key = keys[0] ?? "";
          const count = (counters.get(key) ?? 0) + 1;
          counters.set(key, count);
          return [count, Number(args[0] ?? 60_000)];
        }),
      });
    }
    return Response.json({ error: `unhandled ${name}` });
  };
  return { fetchStub, commands, releaseFirst: () => releaseFirst(), firstObserved };
}

describe("UpstashMailboxStore", () => {
  it("uses sorted sets for atomic incremental reads", async () => {
    const fake = fakeUpstash();
    const store = new UpstashMailboxStore("https://kv.example", "token", fake.fetchStub, {
      now: () => 20,
    });
    await expect(store.append("ab".repeat(32), "ciphertext", 10)).resolves.toBe(1);
    await expect(store.append("ab".repeat(32), "newer", 11)).resolves.toBe(2);
    await expect(store.list("ab".repeat(32), 1, 10)).resolves.toEqual([
      { id: 2, ct: "newer", ts: 11 },
    ]);
    expect(fake.commands.some((command) => command[0] === "ZRANGEBYSCORE")).toBe(true);
    expect(fake.commands.some((command) => command[0] === "HGETALL")).toBe(false);
  });

  it("never exposes a higher id before an earlier append is committed", async () => {
    const fake = fakeUpstash({ gateFirstWrite: true });
    const store = new UpstashMailboxStore("https://kv.example", "token", fake.fetchStub, {
      now: () => 20,
    });
    const recipient = "ab".repeat(32);
    const first = store.append(recipient, "first", 10);
    await fake.firstObserved;
    const second = store.append(recipient, "second", 11);
    await expect(store.list(recipient, 0, 10)).resolves.toEqual([]);
    fake.releaseFirst();
    await Promise.all([first, second]);
    await expect(store.list(recipient, 0, 10)).resolves.toEqual([
      { id: 1, ct: "first", ts: 10 },
      { id: 2, ct: "second", ts: 11 },
    ]);
  });

  it("trims oldest and expired messages while filtering reads", async () => {
    let now = 100;
    const fake = fakeUpstash();
    const store = new UpstashMailboxStore("https://kv.example", "token", fake.fetchStub, {
      maxMessages: 2,
      retentionMs: 100,
      now: () => now,
    });
    await store.append("ab".repeat(32), "old", 1);
    await store.append("ab".repeat(32), "two", 90);
    await store.append("ab".repeat(32), "three", 99);
    now = 195;
    await expect(store.list("ab".repeat(32), 0, 10)).resolves.toEqual([
      { id: 3, ct: "three", ts: 99 },
    ]);
  });

  it("stores at most 16 slot entries without expiry or eviction", async () => {
    const fake = fakeUpstash();
    const store = new UpstashMailboxStore("https://kv.example", "token", fake.fetchStub, {
      retentionMs: 1,
      now: () => 10_000,
    });
    const slot = "cd".repeat(32);
    for (let index = 1; index <= 16; index += 1) {
      await expect(store.appendSlot(slot, `envelope-${index}`, 1)).resolves.toBe(index);
    }
    await expect(store.appendSlot(slot, "overflow", 1)).resolves.toBeNull();
    await expect(store.listSlot(slot, 0, 200)).resolves.toHaveLength(16);
  });

  it("aborts a hung Upstash request", async () => {
    const fetchStub = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    const store = new UpstashMailboxStore("https://kv.example", "token", fetchStub, {
      timeoutMs: 5,
    });
    await expect(store.list("ab".repeat(32), 0, 10)).rejects.toBeDefined();
  });
});
