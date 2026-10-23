import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

function nodeBufferForTests() {
  return {
    name: "node-buffer-for-wallet-tests",
    enforce: "pre" as const,
    resolveId(source: string) {
      return source === "buffer" ? "node:buffer" : null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === "test" ? [nodeBufferForTests()] : []),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true }, protocolImports: false }),
  ],
  server: { host: "localhost", port: 5173 },
  preview: { host: "localhost", port: 4173 },
}));
