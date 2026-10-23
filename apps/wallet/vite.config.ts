import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

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

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === "test" ? [nodeBufferForTests()] : []),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true }, protocolImports: false }),
  ],
  server: { host: "localhost", port: 5173 },
  preview: { host: "localhost", port: 4173, headers: SECURITY_HEADERS },
}));
