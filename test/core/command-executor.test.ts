/**
 * Command Executor Tests
 *
 * TDD tests for the command executor utility that runs shell commands
 * with timeout support and output capture.
 */

import { describe, expect, it } from "vitest";
import { executeCommand } from "../../src/core/command-executor.js";

describe("Command Executor", () => {
  describe("executeCommand", () => {
    it("should execute a simple command and return stdout", async () => {
      const result = await executeCommand("echo hello");

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("hello");
      expect(result.stderr).toBe("");
    });

    it("should capture stderr from commands", async () => {
      // Use node to write to stderr
      const result = await executeCommand(
        "node -e \"console.error('error output')\""
      );

      expect(result.stderr.trim()).toBe("error output");
    });

    it("should return non-zero exit code for failing commands", async () => {
      const result = await executeCommand('node -e "process.exit(1)"');

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("should handle commands that output to both stdout and stderr", async () => {
      const result = await executeCommand(
        "node -e \"console.log('out'); console.error('err')\""
      );

      expect(result.stdout.trim()).toBe("out");
      expect(result.stderr.trim()).toBe("err");
    });

    it("should timeout long-running commands", async () => {
      const result = await executeCommand(
        'node -e "setTimeout(() => {}, 10000)"',
        { timeout: 100 }
      );

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
    });

    it("should use custom working directory", async () => {
      const result = await executeCommand(
        'node -e "console.log(process.cwd())"',
        {
          cwd: process.cwd(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe(process.cwd());
    });

    it("should pass environment variables", async () => {
      const result = await executeCommand(
        'node -e "console.log(process.env.TEST_VAR)"',
        { env: { TEST_VAR: "test_value" } }
      );

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe("test_value");
    });

    it("should include duration in result", async () => {
      const result = await executeCommand("echo fast");

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe("number");
    });

    it("should handle commands with special characters", async () => {
      const result = await executeCommand(
        "node -e \"console.log('hello world')\""
      );

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe("hello world");
    });

    it("should handle empty command gracefully", async () => {
      const result = await executeCommand("");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle non-existent command", async () => {
      const result = await executeCommand("nonexistent_command_xyz_123");

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe("ExecuteResult interface", () => {
    it("should have all required properties", async () => {
      const result = await executeCommand("echo test");

      // Type check - these should all exist
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("exitCode");
      expect(result).toHaveProperty("stdout");
      expect(result).toHaveProperty("stderr");
      expect(result).toHaveProperty("duration");
    });
  });

  describe("ExecuteOptions", () => {
    it("should work with default options", async () => {
      const result = await executeCommand("echo default");

      expect(result.success).toBe(true);
    });

    it("should accept partial options", async () => {
      const result = await executeCommand("echo partial", { timeout: 5000 });

      expect(result.success).toBe(true);
    });
  });
});
