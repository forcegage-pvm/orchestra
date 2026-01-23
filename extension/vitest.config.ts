import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Skip tests that require Node.js-compiled better-sqlite3
    // when extension is packaged with Electron-compiled version
    exclude: [
      "**/node_modules/**",
      "**/session-persistence.test.ts", // Requires Node.js better-sqlite3
    ],
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
