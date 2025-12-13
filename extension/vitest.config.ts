import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "./test/__mocks__/vscode.ts"),
    },
  },
});
