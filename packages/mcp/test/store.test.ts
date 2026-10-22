import { readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildPairing, decodePairingCode } from "../src/pairing.js";
import { AgentStore } from "../src/store.js";
import { createFixture } from "./fixtures.js";

describe("AgentStore", () => {
  it("creates 0700/0600 key files and a pairing code without secrets", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle);
    await fixture.store.addReceipt({
      budgetNf: "1",
      tx: "0x1",
      resource: "https://merchant.test/report",
      amount: "1",
      createdAt: new Date().toISOString(),
      reported: false,
    });
    const directory = await stat(fixture.store.paths.directory);
    expect(directory.mode & 0o777).toBe(0o700);
    for (const file of [
      fixture.store.paths.config,
      fixture.store.paths.secrets,
      fixture.store.paths.credentials,
      fixture.store.paths.notes,
      fixture.store.paths.receipts,
    ]) {
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    }

    const raw = await readFile(fixture.store.paths.secrets, "utf8");
    expect(raw).toContain("holderPrv");
    const pairing = buildPairing(fixture.store);
    expect(pairing.url.startsWith("https://shadowpass-wallet.vercel.app/pair#")).toBe(true);
    expect(pairing.code).not.toContain("holderPrv");
    expect(decodePairingCode(pairing.code)).toEqual(pairing.payload);
  });
});
