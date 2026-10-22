import { describe, expect, it } from "vitest";
import { validateCredentialBundle } from "../src/credentials.js";
import { createFixture, deployment, revokedState } from "./fixtures.js";

describe("credential validation", () => {
  it("accepts a signed, registered, unspent certificate and note", async () => {
    const fixture = await createFixture();
    const result = validateCredentialBundle(fixture.bundle, {
      store: fixture.store,
      state: fixture.state,
      deploymentName: "anvil",
      chainId: deployment.chainId,
      nowSeconds: 1_000n,
    });
    expect(result.valid).toBe(true);
    expect(result.capabilities).toEqual(["PAY", "TREASURY"]);
    expect(result.revoked).toBe(false);
    expect(result.stateRegistered).toBe(true);
  });

  it("rejects a revoked certificate", async () => {
    const fixture = await createFixture();
    const result = validateCredentialBundle(fixture.bundle, {
      store: fixture.store,
      state: revokedState(fixture),
      deploymentName: "anvil",
      chainId: deployment.chainId,
      nowSeconds: 1_000n,
    });
    expect(result.valid).toBe(false);
    expect(result.revoked).toBe(true);
    expect(result.errors.join(" ")).toMatch(/revoked/);
  });

  it("rejects wrong holder, expired chains and notes missing from the tree", async () => {
    const fixture = await createFixture();
    const wrongHolder = structuredClone(fixture.bundle);
    wrongHolder.chain[1]!.holder.x = "1";
    const wrong = validateCredentialBundle(wrongHolder, {
      store: fixture.store,
      state: fixture.state,
      deploymentName: "anvil",
      chainId: deployment.chainId,
      nowSeconds: 1_000n,
    });
    expect(wrong.errors).toContain("bundle terminal holder is not this agent");

    const expired = validateCredentialBundle(fixture.bundle, {
      store: fixture.store,
      state: fixture.state,
      deploymentName: "anvil",
      chainId: deployment.chainId,
      nowSeconds: fixture.expiry,
    });
    expect(expired.errors).toContain("certificate chain is expired");

    const noNote = fixture.logs.filter((log) => log.eventName !== "NoteInserted");
    const stateWithoutNote = (await import("@shadowpass/sdk")).ChainState.fromLogs(deployment, noNote);
    const missing = validateCredentialBundle(fixture.bundle, {
      store: fixture.store,
      state: stateWithoutNote,
      deploymentName: "anvil",
      chainId: deployment.chainId,
      nowSeconds: 1_000n,
    });
    expect(missing.errors).toContain("note is not in the on-chain note tree");
  });
});
