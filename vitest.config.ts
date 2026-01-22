import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".vitest-cache",
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
    testTimeout: 30000,
    hookTimeout: 10000,
    // Optimize parallel execution
    pool: "forks",
    poolOptions: {
      forks: {
        // Use more workers for faster execution (adjust based on your CPU cores)
        maxWorkers: 4,
        // Reduce overhead by reusing workers
        reuseWorkers: true,
        // Isolate tests properly
        isolate: true,
      },
    },
    // Enable file-level parallelism
    fileParallelism: true,
    // Optimize test discovery and execution
    sequence: {
      shuffle: true,
    },
    // Optimize for CI environments
    reporter: process.env.CI ? ["verbose", "github-actions"] : ["verbose"],
  },
});
