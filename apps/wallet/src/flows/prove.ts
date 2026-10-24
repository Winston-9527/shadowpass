import {
  loadArtifacts,
  prove,
  toCalldata,
  type ArtifactSet,
  type CircuitName,
} from "@shadowpass/sdk";
import type { CalldataProof } from "./types";

export interface ProofService {
  prove(circuit: CircuitName, input: Record<string, unknown>): Promise<CalldataProof>;
}

export class SnarkProofService implements ProofService {
  private readonly artifacts = new Map<CircuitName, Promise<ArtifactSet>>();

  constructor(private readonly baseUrl: string) {}

  proveCircuit(circuit: CircuitName, input: Record<string, unknown>): Promise<CalldataProof> {
    return this.prove(circuit, input);
  }

  async prove(circuit: CircuitName, input: Record<string, unknown>): Promise<CalldataProof> {
    let artifacts = this.artifacts.get(circuit);
    if (!artifacts) {
      artifacts = loadArtifacts({
        circuit,
        baseUrl: this.baseUrl,
        trustManifestHashes: import.meta.env.VITE_TRUST_LOCAL_ARTIFACTS === "1",
      });
      this.artifacts.set(circuit, artifacts);
    }
    const result = await prove(circuit, input, await artifacts);
    const calldata = toCalldata(result.proof, result.publicSignals);
    return {
      a: calldata.a,
      b: calldata.b,
      c: calldata.c,
      publicSignals: calldata.publicSignals,
    };
  }
}
