import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(import.meta.url);
const log = (...a) => console.log("[debug]", ...a);

log("cwd", root, "node", process.version);
for (const cmd of ["npm -v", "npm config get omit", "npm config get production"]) {
  try {
    log(cmd, "=>", execSync(cmd, { encoding: "utf8" }).trim());
  } catch (e) {
    log(cmd, "=> failed", e.message);
  }
}

for (const rel of ["node_modules", "node_modules/vite", "apps/wallet/node_modules", "apps/wallet/node_modules/vite"]) {
  log(rel, "exists:", fs.existsSync(path.join(root, rel)));
}

try {
  log("bin/vite:", fs.existsSync(path.join(root, "node_modules/.bin/vite")));
  log("nm top-level (vite/esbuild/rollup):", fs.readdirSync(path.join(root, "node_modules")).filter((n) => /vite|esbuild|rollup/.test(n)).join(",") || "(none)");
} catch (e) {
  log("readdir failed", e.message);
}

for (const target of ["vite", "vite/package.json", "esbuild"]) {
  try {
    log("resolve", target, "=>", require.resolve(target, { paths: [root, path.join(root, "apps/wallet")] }));
  } catch (e) {
    log("resolve", target, "=> FAILED", e.code);
  }
}

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "apps/wallet/package.json"), "utf8"));
  log("wallet deps:", JSON.stringify(pkg.dependencies));
} catch (e) {
  log("read wallet pkg failed", e.message);
}

try {
  const out = execSync("npm ls vite --all", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  log("npm ls vite:\n" + out.trim());
} catch (e) {
  log("npm ls vite failed:", (e.stdout || "") + (e.stderr || ""));
}
