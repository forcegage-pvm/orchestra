/**
 * Database connection tests
 *
 * Tests for workspace path resolution and database isolation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Database Connection", () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    // Reset modules to get fresh instances
    vi.resetModules();
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  describe("resolveWorkspacePath", () => {
    it("should use ORCHESTRA_WORKSPACE environment variable when set", async () => {
      process.env.ORCHESTRA_WORKSPACE = "/custom/workspace/path";

      const { resolveWorkspacePath } = await import(
        "../../src/db/connection.js"
      );
      const result = resolveWorkspacePath();

      expect(result).toBe("/custom/workspace/path");
    });

    it("should use --workspace CLI argument when env var not set", async () => {
      delete process.env.ORCHESTRA_WORKSPACE;
      process.argv = [
        "node",
        "script.js",
        "--workspace",
        "/cli/workspace/path",
      ];

      const { resolveWorkspacePath } = await import(
        "../../src/db/connection.js"
      );
      const result = resolveWorkspacePath();

      expect(result).toBe("/cli/workspace/path");
    });

    it("should use -w shorthand for workspace argument", async () => {
      delete process.env.ORCHESTRA_WORKSPACE;
      process.argv = ["node", "script.js", "-w", "/short/workspace/path"];

      const { resolveWorkspacePath } = await import(
        "../../src/db/connection.js"
      );
      const result = resolveWorkspacePath();

      expect(result).toBe("/short/workspace/path");
    });

    it("should prefer env var over CLI argument", async () => {
      process.env.ORCHESTRA_WORKSPACE = "/env/path";
      process.argv = ["node", "script.js", "--workspace", "/cli/path"];

      const { resolveWorkspacePath } = await import(
        "../../src/db/connection.js"
      );
      const result = resolveWorkspacePath();

      expect(result).toBe("/env/path");
    });

    it("should fallback to cwd when no workspace specified", async () => {
      delete process.env.ORCHESTRA_WORKSPACE;
      process.argv = ["node", "script.js"];

      const { resolveWorkspacePath } = await import(
        "../../src/db/connection.js"
      );
      const result = resolveWorkspacePath();

      expect(result).toBe(process.cwd());
    });

    it("should handle missing argument after --workspace flag", async () => {
      delete process.env.ORCHESTRA_WORKSPACE;
      process.argv = ["node", "script.js", "--workspace"]; // No path after flag

      const { resolveWorkspacePath } = await import(
        "../../src/db/connection.js"
      );
      const result = resolveWorkspacePath();

      // Should fallback to cwd when argument is missing
      expect(result).toBe(process.cwd());
    });
  });
});
