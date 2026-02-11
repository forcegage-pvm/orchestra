import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Auto-rebuild better-sqlite3 if compiled for Electron (VSIX packaging)
    // so that all DB-backed tests run without manual intervention.
    globalSetup: ["test/setup/ensure-native-modules.ts"],
    include: ["test/smoke/**/*.test.ts", "test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/agents/tools/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "./test/__mocks__/vscode.ts"),
      // Use root workspace's better-sqlite3 (Node.js-compiled) for tests
      // Extension's node_modules has Electron-compiled version for VS Code runtime
      "better-sqlite3": path.resolve(
        __dirname,
        "../node_modules/better-sqlite3",
      ),
    },
  },
});
