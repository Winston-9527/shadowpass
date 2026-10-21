import "./polyfills.js";
import { loadArtifacts, prove, toCalldata, verify } from "../src/index.js";

const result = document.querySelector("#result")!;

try {
  const input = await fetch("/fixture.json").then((response) => response.json());
  const artifacts = await loadArtifacts({ baseUrl: "/zk/circuits-v2", circuit: "main_d2" });
  const started = performance.now();
  const { proof, publicSignals } = await prove("main_d2", input, artifacts);
  const verified = await verify(artifacts, proof, publicSignals);
  const elapsedMs = performance.now() - started;
  const output = {
    circuit: "main_d2",
    verified,
    elapsedMs: Math.round(elapsedMs),
    publicInputs: publicSignals.length,
    device: {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
    },
    calldata: toCalldata(proof, publicSignals),
  };
  (globalThis as any).__SHADOWPASS_RESULT__ = output;
  result.textContent = JSON.stringify(output);
} catch (error) {
  const output = { verified: false, error: String(error) };
  (globalThis as any).__SHADOWPASS_RESULT__ = output;
  result.textContent = JSON.stringify(output);
}
