import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function nodeBufferForTests() {
  return {
    name: "node-buffer-for-wallet-tests",
    enforce: "pre" as const,
    resolveId(source: string) {
      return source === "buffer" ? "node:buffer" : null;
    },
  };
}

function walletDeployments() {
  const directory = fileURLToPath(new URL("../../deployments/", import.meta.url));
  return {
    name: "shadowpass-wallet-deployments",
    configureServer(server: any) {
      server.middlewares.use("/deployments", async (request: any, response: any, next: () => void) => {
        const name = String(request.url ?? "").replace(/^\//, "").match(/^[a-z0-9-]+\.json$/)?.[0];
        if (!name) return next();
        try {
          const source = await readFile(path.join(directory, name), "utf8");
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(source);
        } catch {
          next();
        }
      });
    },
    async generateBundle(this: any) {
      for (const name of await readdir(directory)) {
        if (!name.endsWith(".json")) continue;
        this.emitFile({ type: "asset", fileName: `deployments/${name}`, source: await readFile(path.join(directory, name), "utf8") });
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    walletDeployments(),
    ...(mode === "test" ? [nodeBufferForTests()] : []),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true }, protocolImports: false }),
  ],
  server: {
    host: "localhost",
    port: 5173,
    proxy: {
      "/facilitator": {
        target: process.env.VITE_FACILITATOR_PROXY_TARGET ?? "http://127.0.0.1:4022",
        changeOrigin: true,
        rewrite: (requestPath: string) => requestPath.replace(/^\/facilitator/, ""),
      },
    },
  },
  preview: {
    host: "localhost",
    port: 4173,
    headers: SECURITY_HEADERS,
    proxy: {
      "/facilitator": {
        target: process.env.VITE_FACILITATOR_PROXY_TARGET ?? "http://127.0.0.1:4022",
        changeOrigin: true,
        rewrite: (requestPath: string) => requestPath.replace(/^\/facilitator/, ""),
      },
    },
  },
}));
