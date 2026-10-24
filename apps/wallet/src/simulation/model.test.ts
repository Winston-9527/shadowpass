import { describe, expect, it } from "vitest";
import {
  fundSimulationWallet,
  initialSimulationState,
  issueSimulationCard,
  openSimulationWallet,
  revokeSimulationAgent,
  revokeSimulationTree,
  simulateAgentAction,
  SIMULATION_PAYMENT,
} from "./model";

const NOW = 1_800_000_000_000;

function fundedWallet() {
  return fundSimulationWallet(openSimulationWallet(initialSimulationState()));
}

describe("wallet simulation", () => {
  it("opens and funds a local-only demo wallet", () => {
    const opened = openSimulationWallet(initialSimulationState());
    expect(opened.opened).toBe(true);
    expect(opened.stewardBudget).toBe(0n);
    expect(fundSimulationWallet(opened).stewardBudget).toBe(100_000_000n);
  });

  it("issues a card and reserves its budget without external state", () => {
    const next = issueSimulationCard(fundedWallet(), {
      name: "Purchasing Agent",
      capability: "PAY",
      budget: 40_000_000n,
      expiryDays: 7,
      nowMs: NOW,
    });
    expect(next.stewardBudget).toBe(60_000_000n);
    expect(next.agents[0]).toMatchObject({
      name: "Purchasing Agent",
      capability: "PAY",
      budget: 40_000_000n,
      remaining: 40_000_000n,
      status: "active",
    });
  });

  it("records a simulated payment and decrements the Agent budget", () => {
    const issued = issueSimulationCard(fundedWallet(), {
      name: "Purchasing Agent",
      capability: "PAY",
      budget: 40_000_000n,
      expiryDays: 7,
      nowMs: NOW,
    });
    const paid = simulateAgentAction(issued, issued.agents[0]!.id, NOW + 1_000);
    expect(paid.agents[0]!.remaining).toBe(40_000_000n - SIMULATION_PAYMENT);
    expect(paid.bills[0]).toMatchObject({ agentName: "Purchasing Agent", amount: SIMULATION_PAYMENT, reported: true });
  });

  it("blocks revoked Agents and marks the whole tree revoked", () => {
    const issued = issueSimulationCard(fundedWallet(), {
      name: "Treasury Agent",
      capability: "TREASURY",
      budget: 50_000_000n,
      expiryDays: 30,
      nowMs: NOW,
    });
    const revoked = revokeSimulationAgent(issued, issued.agents[0]!.id);
    expect(() => simulateAgentAction(revoked, revoked.agents[0]!.id, NOW + 1_000)).toThrow(/revoked/i);
    const treeRevoked = revokeSimulationTree(issued);
    expect(treeRevoked.rootRevoked).toBe(true);
    expect(treeRevoked.agents.every((agent) => agent.status === "revoked")).toBe(true);
  });
});
