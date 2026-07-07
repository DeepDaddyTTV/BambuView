import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globals: true,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    testTimeout: 30000,
  },
});
