import fs from "node:fs";

const manifestUrl = new URL("../../../circuits/zk/MANIFEST.sha256", import.meta.url);
const outputUrl = new URL("../src/artifact-hashes.ts", import.meta.url);
const entries = new Map();
for (const line of fs.readFileSync(manifestUrl, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
  if (!match) continue;
  const name = match[2].replaceAll("\\", "/").split("/").pop();
  entries.set(name, match[1].toLowerCase());
}
const body = [...entries.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, hash]) => `  ${JSON.stringify(name)}: ${JSON.stringify(hash)},`)
  .join("\n");
fs.writeFileSync(outputUrl, `// Generated from circuits/zk/MANIFEST.sha256. Do not edit by hand.\nexport const ARTIFACT_HASHES: Readonly<Record<string, string>> = {\n${body}\n};\n`);
