/**
 * Check Executor Tests
 *
 * Tests for the verification check executor that runs
 * structural, behavioral, and quality checks.
 *
 * Schema aligned with MCP tool definitions:
 * - structural: path, pattern?, min_matches?
 * - behavioral: command, expect_exit_code?, expect_output_contains?
 * - quality: command? OR (path + pattern + min_matches?)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CheckConfig,
  executeBehavioralCheck,
  executeCheck,
  executeQualityCheck,
  executeStructuralCheck,
} from "../../src/core/check-executor.js";
import * as commandExecutor from "../../src/core/command-executor.js";

// Mock the command executor
vi.mock("../../src/core/command-executor.js", () => ({
  executeCommand: vi.fn(),
}));

describe("Check Executor", () => {
  const mockExecuteCommand = vi.mocked(commandExecutor.executeCommand);
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "check-exec-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("executeStructuralCheck", () => {
    it("should pass when file exists", async () => {
      const filePath = path.join(tempDir, "test.ts");
      fs.writeFileSync(filePath, "export const foo = 1;");

      const config: CheckConfig = {
        type: "structural",
        path: filePath,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.message).toContain("exists");
    });

    it("should fail when file does not exist", async () => {
      const config: CheckConfig = {
        type: "structural",
        path: path.join(tempDir, "nonexistent.ts"),
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("should pass when pattern matches in file", async () => {
      const filePath = path.join(tempDir, "module.ts");
      fs.writeFileSync(filePath, "export function myFunction() {}");

      const config: CheckConfig = {
        type: "structural",
        path: filePath,
        pattern: "export\\s+function\\s+myFunction",
        min_matches: 1,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.message).toContain("matches pattern");
    });

    it("should fail when pattern does not match", async () => {
      const filePath = path.join(tempDir, "module.ts");
      fs.writeFileSync(filePath, "export function otherFunction() {}");

      const config: CheckConfig = {
        type: "structural",
        path: filePath,
        pattern: "export\\s+function\\s+myFunction",
        min_matches: 1,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Pattern not found");
    });

    it("should check minimum matches count", async () => {
      const filePath = path.join(tempDir, "module.ts");
      fs.writeFileSync(
        filePath,
        "export function foo() {}\nexport function bar() {}"
      );

      const config: CheckConfig = {
        type: "structural",
        path: filePath,
        pattern: "export\\s+function",
        min_matches: 2,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should fail when not enough matches", async () => {
      const filePath = path.join(tempDir, "module.ts");
      fs.writeFileSync(filePath, "export function foo() {}");

      const config: CheckConfig = {
        type: "structural",
        path: filePath,
        pattern: "export\\s+function",
        min_matches: 3,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("expected 3");
    });

    it("should handle relative paths", async () => {
      const filePath = "test.ts";
      fs.writeFileSync(path.join(tempDir, filePath), "content");

      const config: CheckConfig = {
        type: "structural",
        path: filePath,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should match patterns across multiple lines", async () => {
      const filePath = path.join(tempDir, "error-handler.ts");
      fs.writeFileSync(
        filePath,
        `function handleError() {
  try {
    riskyOperation();
  } catch (error) {
    logError(error);
  }
}`
      );

      const config: CheckConfig = {
        type: "structural",
        path: filePath,
        pattern: "try.*catch",
        min_matches: 1,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.message).toContain("matches pattern");
    });
  });

  describe("executeBehavioralCheck", () => {
    it("should run command and pass on success", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "10 tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        command: "npm test",
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.output).toContain("10 tests passed");
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "npm test",
        expect.any(Object)
      );
    });

    it("should fail when command fails", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "FAIL: expected true, got false",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        command: "npm test",
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.output).toContain("FAIL");
    });

    it("should check expected exit code", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 2,
        stdout: "Some output",
        stderr: "",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        command: "some-command",
        expect_exit_code: 2,
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should fail when exit code does not match", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Error",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        command: "some-command",
        expect_exit_code: 0,
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("exited with code 1");
      expect(result.message).toContain("expected 0");
    });

    it("should check output contains expected string", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build complete: SUCCESS",
        stderr: "",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        command: "npm run build",
        expect_output_contains: "SUCCESS",
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should fail when output does not contain expected string", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build complete",
        stderr: "",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        command: "npm run build",
        expect_output_contains: "SUCCESS",
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("does not contain");
    });

    it("should handle command execution errors", async () => {
      mockExecuteCommand.mockRejectedValueOnce(new Error("Command not found"));

      const config: CheckConfig = {
        type: "behavioral",
        command: "nonexistent-command",
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Command error");
    });
  });

  describe("executeQualityCheck", () => {
    it("should run lint command and pass", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "No lint errors",
        stderr: "",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "quality",
        command: "npm run lint",
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Quality check passed");
    });

    it("should fail when lint command fails", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "5 lint errors found",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "quality",
        command: "npm run lint",
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.output).toContain("lint errors");
    });

    it("should check file pattern for quality", async () => {
      const filePath = path.join(tempDir, "code.ts");
      fs.writeFileSync(
        filePath,
        "// TODO: fix this\nfunction good() {}\n// TODO: also this"
      );

      const config: CheckConfig = {
        type: "quality",
        path: filePath,
        pattern: "TODO",
        min_matches: 2,
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should fail when quality pattern requirement not met", async () => {
      const filePath = path.join(tempDir, "code.ts");
      fs.writeFileSync(filePath, "function clean() {}");

      const config: CheckConfig = {
        type: "quality",
        path: filePath,
        pattern: "jsdoc|@param|@returns",
        min_matches: 1,
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(false);
    });

    it("should fail when quality file not found", async () => {
      const config: CheckConfig = {
        type: "quality",
        path: "nonexistent.ts",
        pattern: "something",
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("should fail when no command or path+pattern provided", async () => {
      const config: CheckConfig = {
        type: "quality",
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain(
        "requires either command or path+pattern"
      );
    });
  });

  describe("executeCheck", () => {
    it("should route to structural check", async () => {
      const filePath = path.join(tempDir, "test.ts");
      fs.writeFileSync(filePath, "content");

      const config: CheckConfig = {
        type: "structural",
        path: filePath,
      };

      const result = await executeCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should route to behavioral check", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "OK",
        stderr: "",
        duration: 100,
      });

      const config: CheckConfig = {
        type: "behavioral",
        command: "echo OK",
      };

      const result = await executeCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should route to quality check", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "OK",
        stderr: "",
        duration: 100,
      });

      const config: CheckConfig = {
        type: "quality",
        command: "npm run lint",
      };

      const result = await executeCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should return error for unknown check type", async () => {
      const config = {
        type: "unknown",
      } as unknown as CheckConfig;

      const result = await executeCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Unknown check type");
    });
  });
});
