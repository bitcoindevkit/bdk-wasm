import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Regtest suites share Bitcoin Core and must not run in parallel.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      // V8 covers the generated JS bindings, not the Rust/WASM implementation.
      include: ["../../pkg/bitcoindevkit.js"],
      exclude: ["**/*.test.*", "**/node_modules/**"],
      allowExternal: true,
      reporter: ["text", "json-summary", "json"],
    },
  },
});
