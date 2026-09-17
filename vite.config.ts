import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
