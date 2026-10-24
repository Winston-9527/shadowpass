import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadArtifacts } from "../src/prove.js";

describe("artifact loading", () => {
  it("loads only artifacts covered by MANIFEST.sha256 and rejects tampering", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shadowpass-sdk-artifacts-"));
    const files: Record<string, Uint8Array> = {
      "budget_mint.wasm": Uint8Array.of(1, 2, 3),
      "budget_mint.zkey": Uint8Array.of(4, 5, 6),
      "vk_budget_mint.json": new TextEncoder().encode('{"vk":true}'),
    };
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(dir, name), bytes);
    const manifest = Object.entries(files)
      .map(([name, bytes]) => `${createHash("sha256").update(bytes).digest("hex")}  ${name}`)
      .join("\n");
    await writeFile(join(dir, "MANIFEST.sha256"), `${manifest}\n`);
    await expect(loadArtifacts({ dir, circuit: "budget_mint" })).rejects.toThrow(/hash mismatch/);
    const local = await loadArtifacts({ dir, circuit: "budget_mint", trustManifestHashes: true });
    expect(local.zkey).toEqual(files["budget_mint.zkey"]);
    const trustedHashes = Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [name, createHash("sha256").update(bytes).digest("hex")]),
    );
    const artifacts = await loadArtifacts({ dir, circuit: "budget_mint", trustedHashes });
    expect(artifacts.wasm).toEqual(files["budget_mint.wasm"]);
    expect(artifacts.vk).toEqual({ vk: true });

    await writeFile(join(dir, "budget_mint.wasm"), Uint8Array.of(9));
    await expect(loadArtifacts({ dir, circuit: "budget_mint", trustedHashes })).rejects.toThrow(/hash mismatch/);
  });
});
