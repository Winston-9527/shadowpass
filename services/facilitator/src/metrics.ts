export interface LatencyRecord {
  operation: "verify" | "settle";
  totalMs: number;
  verifyMs?: number;
  simulationMs?: number;
  settleMs?: number;
  proofMs?: number;
  budgetNf?: string;
  transaction?: string;
  network?: string;
  timestamp: string;
}

export class InMemoryLatencyRecorder {
  private readonly records: LatencyRecord[] = [];

  constructor(private readonly limit = 1_000) {}

  record(entry: LatencyRecord): void {
    this.records.push(entry);
    if (this.records.length > this.limit) this.records.splice(0, this.records.length - this.limit);
    console.log(JSON.stringify({ type: "shadowpass.latency", ...entry }));
  }

  list(): LatencyRecord[] {
    return [...this.records];
  }
}
