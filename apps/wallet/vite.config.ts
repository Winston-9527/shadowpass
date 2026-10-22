import { defineConfig } from "vite";

// 提交号只用于页脚展示，缺省时退回 "dev"。
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);

export default defineConfig({
  base: "/",
  define: {
    "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(commit || "dev"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
