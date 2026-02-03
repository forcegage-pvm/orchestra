import { cpus } from "os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".vitest-cache",
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "testing/hello-greeter/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    // Global setup - creates pre-migrated database template once
    globalSetup: ["./test/setup/global-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
    testTimeout: 30000,
    hookTimeout: 10000,
    // Optimize parallel execution with threads for lower overhead
    pool: "threads",
    poolOptions: {
      threads: {
        // Dynamically scale workers based on CPU cores (half available cores)
        maxWorkers: Math.max(1, Math.floor(cpus().length / 2)),
        // Reduce overhead by reusing workers
        reuseWorkers: true,
        // Allow shared context for related tests to improve performance
        isolate: true,
      },
    },
    // Enable file-level parallelism
    fileParallelism: true,
    // Optimize test discovery and execution
    sequence: {
      shuffle: false, // Deterministic order for consistent performance
      hooks: "parallel", // Run hooks in parallel
    },
    // Enhanced caching for better performance
    cache: true,
    // Enable sharding for CI environments
    shard: process.env.VITEST_SHARD || undefined,
    // Optimize for CI environments
    reporter: process.env.CI ? ["verbose", "github-actions"] : ["verbose"],
  },
  // Watch mode optimizations
  watch: {
    include: ["src/**", "test/**"],
    exclude: ["node_modules/**", ".vitest-cache/**"],
  },
});
