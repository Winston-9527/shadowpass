export type SimulationCapability = "PAY" | "TREASURY";

export interface SimulationAgent {
  id: string;
  name: string;
  capability: SimulationCapability;
  budget: bigint;
  remaining: bigint;
  expiresAt: number;
  status: "active" | "revoked";
}

export interface SimulationBill {
  id: string;
  agentId: string;
  agentName: string;
  amount: bigint;
  target: string;
  createdAt: number;
  reported: boolean;
}

export interface SimulationState {
  opened: boolean;
  stewardBudget: bigint;
  agents: SimulationAgent[];
  bills: SimulationBill[];
  nextAgentId: number;
  nextBillId: number;
  rootRevoked: boolean;
}

export const SIMULATION_FUNDING = 100_000_000n;
export const SIMULATION_PAYMENT = 12_500_000n;
export const SIMULATION_TREASURY_SUPPLY = 25_000_000n;

export function initialSimulationState(): SimulationState {
  return {
    opened: false,
    stewardBudget: 0n,
    agents: [],
    bills: [],
    nextAgentId: 1,
    nextBillId: 1,
    rootRevoked: false,
  };
}

export function openSimulationWallet(state: SimulationState): SimulationState {
  return state.opened ? state : { ...state, opened: true };
}

export function fundSimulationWallet(state: SimulationState): SimulationState {
  if (!state.opened) throw new Error("Open the demo wallet before funding it");
  return { ...state, stewardBudget: state.stewardBudget + SIMULATION_FUNDING };
}

export interface IssueSimulationCardInput {
  name: string;
  capability: SimulationCapability;
  budget: bigint;
  expiryDays: number;
  nowMs?: number;
}

export function issueSimulationCard(state: SimulationState, input: IssueSimulationCardInput): SimulationState {
  if (!state.opened) throw new Error("Open the demo wallet before issuing a card");
  if (state.rootRevoked) throw new Error("The simulated authorization tree is revoked");
  const name = input.name.trim();
  if (!name) throw new Error("Enter an Agent name");
  if (name.length > 64) throw new Error("Agent name must be 64 characters or fewer");
  if (input.budget <= 0n) throw new Error("Budget must be greater than zero");
  if (input.budget > state.stewardBudget) throw new Error("Budget exceeds the available demo balance");
  if (!Number.isSafeInteger(input.expiryDays) || input.expiryDays < 1 || input.expiryDays > 30) {
    throw new Error("Expiry must be between 1 and 30 days");
  }
  const nowMs = input.nowMs ?? Date.now();
  const id = `sim-card-${state.nextAgentId}`;
  const agent: SimulationAgent = {
    id,
    name,
    capability: input.capability,
    budget: input.budget,
    remaining: input.budget,
    expiresAt: nowMs + input.expiryDays * 86_400_000,
    status: "active",
  };
  return {
    ...state,
    stewardBudget: state.stewardBudget - input.budget,
    agents: [...state.agents, agent],
    nextAgentId: state.nextAgentId + 1,
  };
}

export function simulateAgentAction(state: SimulationState, agentId: string, nowMs = Date.now()): SimulationState {
  const agent = state.agents.find((candidate) => candidate.id === agentId);
  if (!agent) throw new Error("Simulated Agent card was not found");
  if (state.rootRevoked || agent.status === "revoked") throw new Error("This simulated Agent is revoked");
  if (agent.expiresAt < nowMs) throw new Error("This simulated Agent card has expired");
  const amount = agent.capability === "PAY" ? SIMULATION_PAYMENT : SIMULATION_TREASURY_SUPPLY;
  if (amount > agent.remaining) throw new Error("The simulated Agent has insufficient budget");
  const target = agent.capability === "PAY" ? "Demo research API" : "Demo yield vault";
  const bill: SimulationBill = {
    id: `sim-bill-${state.nextBillId}`,
    agentId,
    agentName: agent.name,
    amount,
    target,
    createdAt: nowMs,
    reported: true,
  };
  return {
    ...state,
    agents: state.agents.map((candidate) => candidate.id === agentId
      ? { ...candidate, remaining: candidate.remaining - amount }
      : candidate),
    bills: [bill, ...state.bills],
    nextBillId: state.nextBillId + 1,
  };
}

export function revokeSimulationAgent(state: SimulationState, agentId: string): SimulationState {
  if (!state.agents.some((agent) => agent.id === agentId)) throw new Error("Simulated Agent card was not found");
  return {
    ...state,
    agents: state.agents.map((agent) => agent.id === agentId ? { ...agent, status: "revoked" } : agent),
  };
}

export function revokeSimulationTree(state: SimulationState): SimulationState {
  return {
    ...state,
    rootRevoked: true,
    agents: state.agents.map((agent) => ({ ...agent, status: "revoked" })),
  };
}
