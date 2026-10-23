import { describe, expect, it } from "vitest";
import "../sdk";
import {
  ChainState,
  deriveKeys,
  expectedPublicSignals,
  issue,
  issueRoot,
  truncateKey,
  type CircuitName,
  type KeySet,
} from "@shadowpass/sdk";
import { serializeCert } from "./cert";
import type { WalletGateway } from "./chain";
import type { ProofService } from "./prove";
import { revokeAgent, revokeTree } from "./revoke";
import { emptyLedger, type CalldataProof, type CardRecord, type RelayResult, type WalletLedger } from "./types";

class Proofs implements ProofService {
  calls: Array<{ circuit: CircuitName; input: Record<string, unknown> }> = [];

  async prove(circuit: CircuitName, input: Record<string, unknown>): Promise<CalldataProof> {
    this.calls.push({ circuit, input });
    return { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"], publicSignals: expectedPublicSignals(circuit, input) };
  }
}

class Gateway implements WalletGateway {
  readonly state = new ChainState();
  readonly relays: Array<{ action: string; args: Record<string, unknown> }> = [];

  async sync() { return this.state; }
  async logs() { return []; }
  async blockTimestamps() { return new Map<string, number>(); }
  async registryDomain() { return 7n; }
  async revocationWindow() { return 10n; }
  async externalDeposit(): Promise<never> { throw new Error("not used"); }
  async relay(action: Parameters<WalletGateway["relay"]>[0], args: Record<string, unknown>): Promise<RelayResult> {
    this.relays.push({ action, args });
    if (action !== "revoke") throw new Error(`unexpected action ${action}`);
    this.state.revoked.insert(BigInt(String(args.entry)));
    return { transaction: `0x${"ab".repeat(32)}`, blockNumber: "1", logs: [] };
  }
}

async function fixture(): Promise<{ bundle: KeySet; ledger: WalletLedger; card: CardRecord }> {
  const bundle = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 7));
  const agent = await deriveKeys(Uint8Array.from({ length: 32 }, (_, index) => index + 81));
  const c0 = issueRoot(bundle.sign, bundle.steward, 3n, 2_000_200_000n, bundle.view.vpk, bundle.view.w);
  const c1 = issue(c0, agent.sign, 1n, 2_000_100_000n);
  const card: CardRecord = {
    id: c1.hash.toString(), name: "buyer", agentPk: { x: agent.sign.Ax.toString(), y: agent.sign.Ay.toString() },
    boxPk: "00".repeat(32), cap: "1", budget: "1000000", expiry: c1.expiry.toString(), status: "delivered",
    cert: serializeCert(c1), note: null, issueTx: `0x${"11".repeat(32)}`, timings: { proofMs: 0, chainMs: 0, totalMs: 0 }, createdAt: new Date().toISOString(),
  };
  return { bundle, ledger: { ...emptyLedger(31337, "anvil", bundle.sign.Ax), root: serializeCert(c0), cards: [card] }, card };
}

describe("wallet revocation flow", () => {
  it("uses the steward witness to revoke one Agent certificate", async () => {
    const { bundle, ledger, card } = await fixture();
    const gateway = new Gateway();
    const proofs = new Proofs();
    const result = await revokeAgent({ ledger, bundle, gateway, proofs, card });
    expect(result.entry).toBe(BigInt(card.id));
    expect(proofs.calls[0]?.circuit).toBe("main_revoke");
    expect(proofs.calls[0]?.input).toMatchObject({ entry: card.id, who: "0", hop: "1" });
    expect(gateway.relays[0]?.action).toBe("revoke");
    expect(gateway.state.revoked.has(truncateKey(result.entry))).toBe(true);
  });

  it("uses Alice's signing key and own_w to revoke the whole root certificate", async () => {
    const { bundle, ledger } = await fixture();
    const gateway = new Gateway();
    const proofs = new Proofs();
    const result = await revokeTree({ ledger, bundle, gateway, proofs });
    expect(result.entry).toBe(BigInt(ledger.root!.hash));
    expect(proofs.calls[0]?.input).toMatchObject({ entry: ledger.root!.hash, who: "0", hop: "0" });
    expect(proofs.calls[0]?.input.own_w).toEqual([bundle.view.w.x.toString(), bundle.view.w.y.toString()]);
  });
});
