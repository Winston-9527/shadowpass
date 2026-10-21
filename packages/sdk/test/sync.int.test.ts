import { describe, expect, it } from "vitest";
import { createPublicClient, http } from "viem";
import { loadDeployment } from "../src/deployment.js";
import { ChainState } from "../src/state.js";

const rpc = process.env.SHADOWPASS_ANVIL_RPC;
const deploymentPath = process.env.SHADOWPASS_DEPLOYMENT ?? "anvil";

describe.skipIf(!rpc)("ChainState anvil integration", () => {
  it("replays Anvil events to the deployed roots", async () => {
    const deployment = await loadDeployment(deploymentPath);
    const client = createPublicClient({ transport: http(rpc!) });
    const state = await ChainState.sync(client, deployment, { startBlock: deployment.startBlock });
    const expected = await client.readContract({
      address: deployment.gate,
      abi: [{ type: "function", name: "issuedRoot", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }],
      functionName: "issuedRoot",
    });
    expect(state.roots().issued).toBe(expected);
  });
});
