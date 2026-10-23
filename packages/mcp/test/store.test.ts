import { chmod, readFile, rm, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildPairing, decodePairingCode } from "../src/pairing.js";
import { AgentStore, CredentialStoreError } from "../src/store.js";
import { createFixture } from "./fixtures.js";

describe("AgentStore", () => {
  it("creates 0700/0600 key files and a pairing code with a one-time secret", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
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
    expect(raw).toContain(fixture.store.pairingSecret);
    const pairing = buildPairing(fixture.store);
    expect(pairing.url.startsWith("https://shadowpass-wallet.vercel.app/pair#")).toBe(true);
    expect(pairing.code).not.toContain("holderPrv");
    expect(pairing.payload.pair).toBe(fixture.store.pairingSecret);
    expect(decodePairingCode(pairing.code)).toEqual(pairing.payload);
  });

  it("fixes permissive existing file modes and reconstructs a missing config from secrets", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    await fixture.store.addReceipt({
      budgetNf: "1",
      tx: "0x1",
      resource: "https://merchant.test/report",
      amount: "1",
      createdAt: new Date().toISOString(),
      reported: false,
    });
    const originalHolder = fixture.store.holder;
    const originalPair = fixture.store.pairingSecret;
    for (const file of [fixture.store.paths.config, fixture.store.paths.credentials, fixture.store.paths.notes, fixture.store.paths.receipts]) {
      await chmod(file, 0o644);
    }
    const reopenSecure = await AgentStore.open({ name: "buyer", root: fixture.root, network: "anvil", deployment: "anvil" });
    for (const file of [reopenSecure.paths.config, reopenSecure.paths.credentials, reopenSecure.paths.notes, reopenSecure.paths.receipts]) {
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    }

    await rm(fixture.store.paths.config);
    const reopened = await AgentStore.open({ name: "buyer", root: fixture.root, network: "anvil", deployment: "anvil" });
    expect(reopened.holder.Ax).toBe(originalHolder.Ax);
    expect(reopened.holder.Ay).toBe(originalHolder.Ay);
    expect(reopened.pairingSecret).toBe(originalPair);
    expect((await stat(reopened.paths.config)).mode & 0o777).toBe(0o600);
  });

  it("pins the first owner and rejects both owner changes and credential replay", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    expect(fixture.store.pinnedRootHash).toBe(fixture.c0.hash.toString());

    await expect(fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret })).rejects.toMatchObject({
      code: "credential_replay",
    });

    const changedOwner = structuredClone(fixture.bundle);
    changedOwner.owner.box = "11".repeat(32);
    await expect(fixture.store.saveBundle(changedOwner, { pair: fixture.store.pairingSecret })).rejects.toBeInstanceOf(CredentialStoreError);
    expect((await fixture.store.loadBundle())?.owner.box).toBe(fixture.bundle.owner.box);
  });

  it("rotates the pairing secret and clears the owner pin on explicit re-pairing", async () => {
    const fixture = await createFixture();
    await fixture.store.saveBundle(fixture.bundle, { pair: fixture.store.pairingSecret });
    const oldPair = fixture.store.pairingSecret;
    await fixture.store.rotatePairing();
    expect(fixture.store.pairingSecret).not.toBe(oldPair);
    expect(fixture.store.pinnedRootHash).toBeUndefined();
    expect(await fixture.store.loadBundle()).toBeUndefined();
  });
});
