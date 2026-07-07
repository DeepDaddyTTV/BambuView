import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    fileParallelism: false,
    globals: true,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    setupFiles: "./src/test-setup.ts",
    testTimeout: 30000,
  }
});
