import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { once } from "node:events";

export const CIRCUITS = [
  "main_d2",
  "main_reg",
  "budget_transfer",
  "budget_mint",
];

export const MVP_CIRCUITS = [...CIRCUITS, "main_revoke"];

const VERIFIERS = {
  main_d2: "ShadowVerifierD2.sol",
  main_reg: "ShadowRegisterVerifier.sol",
  budget_transfer: "ShadowBudgetTransferVerifier.sol",
  budget_mint: "ShadowBudgetMintVerifier.sol",
  main_revoke: "ShadowRevokeVerifier.sol",
};

const PTAU_NAME = "powersOfTau28_hez_final_18.ptau";
const PTAU_URL = process.env.SHADOWPASS_PTAU_URL
  ?? `https://circom.info/${PTAU_NAME}`;
const PTAU_SHA256 = "e970efa7774da80101e0ac336d083ef3339855c98112539338d706b2b89ac694";
const PTAU_SIZE = 302_072_984;
const PTAU_DOWNLOAD_ATTEMPTS = 6;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function parseManifest(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (!match) continue;
    const name = match[2].replaceAll("\\", "/").split("/").pop();
    entries.set(name, match[1].toLowerCase());
  }
  return entries;
}

function sameFileHash(file, expected) {
  return fs.existsSync(file) && sha256(fs.readFileSync(file)) === expected;
}

function artifactPaths(buildDir, zkDir, circuits) {
  return circuits.map((circuit) => ({
    circuit,
    wasm: path.join(buildDir, circuit, `${circuit}_js`, `${circuit}.wasm`),
    zkey: path.join(buildDir, "zk", `${circuit}.zkey`),
    vk: path.join(zkDir, `vk_${circuit}.json`),
    verifier: path.join(zkDir, VERIFIERS[circuit]),
  }));
}

function validSource(buildDir, zkDir, circuits) {
  const manifestFile = path.join(zkDir, "MANIFEST.sha256");
  if (!fs.existsSync(manifestFile)) return undefined;
  const manifest = fs.readFileSync(manifestFile, "utf8");
  const hashes = parseManifest(manifest);
  for (const artifact of artifactPaths(buildDir, zkDir, circuits)) {
    if (![artifact.wasm, artifact.zkey, artifact.vk, artifact.verifier].every(fs.existsSync)) return undefined;
    if (!sameFileHash(artifact.zkey, hashes.get(path.basename(artifact.zkey)))) return undefined;
    if (!sameFileHash(artifact.vk, hashes.get(path.basename(artifact.vk)))) return undefined;
    if (!sameFileHash(artifact.verifier, hashes.get(path.basename(artifact.verifier)))) return undefined;
  }
  return { buildDir, zkDir, manifest, hashes };
}

function copyOrLink(source, destination) {
  fs.rmSync(destination, { force: true });
  try {
    fs.symlinkSync(source, destination);
  } catch {
    fs.copyFileSync(source, destination);
  }
}

export function circuitSourceFingerprint(root) {
  const files = [
    path.join(root, "circuits", "scripts", "build.sh"),
    path.join(root, "circuits", "scripts", "setup.sh"),
  ];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith(".circom")) files.push(target);
    }
  };
  visit(path.join(root, "circuits", "src"));
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) {
    hash.update(path.relative(root, file));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function validRuntime(runtimeDir, fingerprint, circuits) {
  const markerFile = path.join(runtimeDir, "SOURCE.sha256");
  const manifestFile = path.join(runtimeDir, "MANIFEST.sha256");
  if (!fs.existsSync(markerFile) || !fs.existsSync(manifestFile)) return undefined;
  if (fs.readFileSync(markerFile, "utf8").trim() !== fingerprint) return undefined;
  const manifest = fs.readFileSync(manifestFile, "utf8");
  const hashes = parseManifest(manifest);
  for (const circuit of circuits) {
    for (const name of [`${circuit}.wasm`, `${circuit}.zkey`, `vk_${circuit}.json`]) {
      if (!sameFileHash(path.join(runtimeDir, name), hashes.get(name))) return undefined;
    }
  }
  const verifierOverridesDir = path.join(path.dirname(runtimeDir), "verifiers");
  for (const circuit of circuits) {
    const name = VERIFIERS[circuit];
    if (!sameFileHash(path.join(verifierOverridesDir, name), hashes.get(name))) return undefined;
  }
  return {
    dir: runtimeDir,
    manifest,
    manifestHashes: Object.fromEntries(hashes),
    verifierOverridesDir,
  };
}

function materialize(source, runtimeDir, fingerprint, circuits, generatedVerifiers = false) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const artifacts = artifactPaths(source.buildDir, source.zkDir, circuits);
  const manifestHashes = Object.fromEntries(source.hashes);
  for (const artifact of artifacts) {
    manifestHashes[path.basename(artifact.wasm)] = sha256(fs.readFileSync(artifact.wasm));
  }
  const manifest = `${source.manifest.trimEnd()}\n${Object.entries(manifestHashes)
    .filter(([name]) => name.endsWith(".wasm"))
    .map(([name, hash]) => `${hash}  ${name}`)
    .join("\n")}\n`;
  for (const artifact of artifacts) {
    copyOrLink(artifact.wasm, path.join(runtimeDir, `${artifact.circuit}.wasm`));
    copyOrLink(artifact.zkey, path.join(runtimeDir, `${artifact.circuit}.zkey`));
    const runtimeVk = path.join(runtimeDir, `vk_${artifact.circuit}.json`);
    fs.rmSync(runtimeVk, { force: true });
    fs.copyFileSync(artifact.vk, runtimeVk);
  }
  fs.writeFileSync(path.join(runtimeDir, "MANIFEST.sha256"), manifest);
  fs.writeFileSync(path.join(runtimeDir, "SOURCE.sha256"), `${fingerprint}\n`);

  if (!generatedVerifiers) {
    fs.rmSync(path.join(path.dirname(runtimeDir), "verifiers"), { recursive: true, force: true });
    return {
      dir: runtimeDir,
      manifest,
      manifestHashes,
      verifierOverridesDir: undefined,
    };
  }

  const verifierOverridesDir = path.join(path.dirname(runtimeDir), "verifiers");
  fs.mkdirSync(verifierOverridesDir, { recursive: true });
  for (const artifact of artifacts) {
    fs.copyFileSync(artifact.verifier, path.join(verifierOverridesDir, path.basename(artifact.verifier)));
  }
  return {
    dir: runtimeDir,
    manifest,
    manifestHashes,
    verifierOverridesDir,
  };
}

function snapshotFiles(directory, names) {
  return new Map(names.filter((name) => fs.existsSync(path.join(directory, name))).map((name) => [
    name,
    fs.readFileSync(path.join(directory, name)),
  ]));
}

function restoreFiles(directory, snapshot, allNames) {
  fs.mkdirSync(directory, { recursive: true });
  for (const name of allNames) {
    if (!snapshot.has(name)) fs.rmSync(path.join(directory, name), { force: true });
  }
  for (const [name, bytes] of snapshot) fs.writeFileSync(path.join(directory, name), bytes);
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
}

async function downloadPtau(file) {
  const temporary = `${file}.download`;
  let previousBytes = -1;

  for (let attempt = 1; attempt <= PTAU_DOWNLOAD_ATTEMPTS; attempt += 1) {
    let existing = fs.existsSync(temporary) ? fs.statSync(temporary).size : 0;
    if (existing === PTAU_SIZE && sameFileHash(temporary, PTAU_SHA256)) return;
    if (existing > PTAU_SIZE || (existing === PTAU_SIZE && !sameFileHash(temporary, PTAU_SHA256))) {
      fs.rmSync(temporary, { force: true });
      existing = 0;
    }

    if (attempt > 1) {
      console.log(`[demo] PTAU 下载重试 ${attempt}/${PTAU_DOWNLOAD_ATTEMPTS}，从 ${existing} 字节续传`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 1_000, 5_000)));
    }

    let output;
    let watchdog;
    try {
      const controller = new AbortController();
      watchdog = setTimeout(() => controller.abort(), 120_000);
      const response = await fetch(PTAU_URL, {
        headers: existing > 0 ? { range: `bytes=${existing}-` } : {},
        signal: controller.signal,
      });
      if (response.status === 416 && existing === PTAU_SIZE) {
        clearTimeout(watchdog);
        if (sameFileHash(temporary, PTAU_SHA256)) return;
        fs.rmSync(temporary, { force: true });
        continue;
      }
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const append = response.status === 206 && existing > 0;
      let written = append ? existing : 0;
      let lastReported = written;
      output = fs.createWriteStream(temporary, { flags: append ? "a" : "w" });
      for await (const chunk of response.body) {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => controller.abort(), 120_000);
        if (!output.write(Buffer.from(chunk))) await once(output, "drain");
        written += chunk.length;
        if (written - lastReported >= 25 * 1024 * 1024) {
          console.log(`[demo] PTAU 已写入 ${(written / 1024 / 1024).toFixed(1)} MiB`);
          lastReported = written;
        }
      }
      output.end();
      await once(output, "finish");
      clearTimeout(watchdog);

      if (written === PTAU_SIZE && sameFileHash(temporary, PTAU_SHA256)) return;
      console.log(`[demo] PTAU 第 ${attempt} 次下载未完成或不完整，保留 ${written} 字节`);
      if (written <= previousBytes) fs.rmSync(temporary, { force: true });
      previousBytes = Math.max(previousBytes, written);
    } catch (error) {
      clearTimeout(watchdog);
      output?.destroy();
      console.log(`[demo] PTAU 下载中断：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`ptau download failed after ${PTAU_DOWNLOAD_ATTEMPTS} attempts`);
}

async function ensurePtau(root) {
  const file = path.join(root, "artifacts", "ptau", PTAU_NAME);
  if (process.env.SHADOWPASS_PTAU) {
    const configured = path.resolve(process.env.SHADOWPASS_PTAU);
    if (!fs.existsSync(configured)) throw new Error(`SHADOWPASS_PTAU does not exist: ${configured}`);
    const actual = sha256(fs.readFileSync(configured));
    if (actual !== PTAU_SHA256) throw new Error(`ptau hash mismatch: ${actual}`);
    if (configured !== file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.rmSync(file, { force: true });
      try {
        fs.symlinkSync(configured, file);
      } catch {
        fs.copyFileSync(configured, file);
      }
    }
    return file;
  }
  if (fs.existsSync(file)) {
    const actual = sha256(fs.readFileSync(file));
    if (actual === PTAU_SHA256) return file;
    console.log(`[demo] 本地 PTAU 哈希不匹配，重新下载：${actual}`);
    fs.rmSync(file, { force: true });
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.download`;
  console.log(`[demo] 下载 ${PTAU_NAME}（${(PTAU_SIZE / 1_000_000).toFixed(1)} MB，支持断点续传）`);
  await downloadPtau(file);
  const actual = sha256(fs.readFileSync(temporary));
  if (actual !== PTAU_SHA256) {
    fs.rmSync(temporary, { force: true });
    throw new Error(`ptau hash mismatch: ${actual}`);
  }
  fs.renameSync(temporary, file);
  return file;
}

export async function ensureDemoArtifacts(root, options = {}) {
  const circuits = options.circuits ?? CIRCUITS;
  const runtimeRoot = options.runtimeRoot ?? path.join(root, "scripts", "demo", ".runtime");
  const runtimeDir = path.join(runtimeRoot, "artifacts");
  const fingerprint = `${circuitSourceFingerprint(root)}:${circuits.join(",")}`;
  const cached = validRuntime(runtimeDir, fingerprint, circuits);
  if (cached) return cached;

  const explicit = process.env.SHADOWPASS_BUILD_DIR
    ? {
        buildDir: path.resolve(process.env.SHADOWPASS_BUILD_DIR),
        zkDir: path.resolve(process.env.SHADOWPASS_ZK_DIR ?? path.join(process.env.SHADOWPASS_BUILD_DIR, "..", "zk")),
      }
    : {
        buildDir: path.join(root, "circuits", "build"),
        zkDir: path.join(root, "circuits", "zk"),
      };

  if (process.env.SHADOWPASS_BUILD_DIR && process.env.SHADOWPASS_TRUST_BUILD === "1") {
    const existing = validSource(explicit.buildDir, explicit.zkDir, circuits);
    if (existing) return materialize(existing, runtimeDir, fingerprint, circuits, true);
  }

  const zkDir = path.join(root, "circuits", "zk");
  const generatedNames = [
    "MANIFEST.sha256",
    ...circuits.flatMap((circuit) => [`vk_${circuit}.json`, VERIFIERS[circuit]]),
  ];
  const snapshot = snapshotFiles(zkDir, generatedNames);

  try {
    await ensurePtau(root);
    const circuitEnv = { ...process.env, CIRCUITS: circuits.join(" ") };
    run("npm", ["run", "build", "-w", "@shadowpass/circuits"], root, circuitEnv);
    run("npm", ["run", "setup", "-w", "@shadowpass/circuits"], root, circuitEnv);
    const generated = validSource(path.join(root, "circuits", "build"), zkDir, circuits);
    if (!generated) throw new Error("generated circuit artifacts did not match their manifest");
    return materialize(generated, runtimeDir, fingerprint, circuits, true);
  } finally {
    restoreFiles(zkDir, snapshot, generatedNames);
  }
}
