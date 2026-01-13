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

    // ==========================================================================
    // Glob pattern tests - critical for TDD verification checks
    // ==========================================================================

    it("should pass when glob pattern finds file with matching content", async () => {
      // Create nested directory structure
      const testDir = path.join(tempDir, "test", "views");
      fs.mkdirSync(testDir, { recursive: true });

      // Create a test file that DOES match
      fs.writeFileSync(
        path.join(testDir, "component.test.ts"),
        'describe("Component", () => { it("should render tooltip", () => {}); });'
      );

      const config: CheckConfig = {
        type: "structural",
        path: "test/**/*.test.ts",
        pattern: "tooltip",
        min_matches: 1,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.message).toContain("Pattern found");
    });

    it("should pass when pattern found in ANY file (not require ALL files)", async () => {
      // Create nested directory structure
      const testDir = path.join(tempDir, "test", "views");
      fs.mkdirSync(testDir, { recursive: true });

      // Create file WITHOUT the pattern
      fs.writeFileSync(
        path.join(testDir, "other.test.ts"),
        'describe("Other", () => { it("does something else", () => {}); });'
      );

      // Create file WITH the pattern
      fs.writeFileSync(
        path.join(testDir, "tooltip.test.ts"),
        'describe("Tooltip", () => { it("uses MarkdownString", () => {}); });'
      );

      const config: CheckConfig = {
        type: "structural",
        path: "test/**/*.test.ts",
        pattern: "MarkdownString",
        min_matches: 1,
      };

      const result = await executeStructuralCheck(config, tempDir);

      // Should PASS because at least ONE file contains the pattern
      expect(result.passed).toBe(true);
      expect(result.message).toContain("Pattern found");
    });

    it("should fail when pattern not found in any glob-matched file", async () => {
      // Create nested directory structure
      const testDir = path.join(tempDir, "test", "views");
      fs.mkdirSync(testDir, { recursive: true });

      // Create files that don't contain the pattern
      fs.writeFileSync(
        path.join(testDir, "a.test.ts"),
        'describe("A", () => {});'
      );
      fs.writeFileSync(
        path.join(testDir, "b.test.ts"),
        'describe("B", () => {});'
      );

      const config: CheckConfig = {
        type: "structural",
        path: "test/**/*.test.ts",
        pattern: "nonexistent_pattern",
        min_matches: 1,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Pattern not found");
    });

    it("should aggregate pattern matches across multiple files", async () => {
      // Create nested directory structure
      const testDir = path.join(tempDir, "src");
      fs.mkdirSync(testDir, { recursive: true });

      // Create files with the pattern
      fs.writeFileSync(path.join(testDir, "a.ts"), "ThemeIcon usage 1");
      fs.writeFileSync(path.join(testDir, "b.ts"), "ThemeIcon usage 2");

      const config: CheckConfig = {
        type: "structural",
        path: "src/**/*.ts",
        pattern: "ThemeIcon",
        min_matches: 2, // Require 2 matches total across all files
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
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

    it("should pass when expect_exit_code is 1 and command fails with exit code 1 (TDD red-phase validation)", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "FAIL: 1 test failed",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        command: "npm test",
        expect_exit_code: 1,
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Command passed");
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

    // ==========================================================================
    // Glob pattern tests for quality checks
    // ==========================================================================

    it("should support glob patterns in path for quality checks", async () => {
      // Create nested directory structure
      const srcDir = path.join(tempDir, "src", "components");
      fs.mkdirSync(srcDir, { recursive: true });

      // Create a file with the pattern
      fs.writeFileSync(
        path.join(srcDir, "button.ts"),
        "export class Button { render() { return new ThemeIcon(); } }"
      );

      const config: CheckConfig = {
        type: "quality",
        path: "src/**/*.ts",
        pattern: "ThemeIcon",
        min_matches: 1,
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.message).toContain("match");
    });

    it("should aggregate quality pattern matches across multiple glob files", async () => {
      // Create nested directory structure
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      // Create two files each with one match
      fs.writeFileSync(path.join(srcDir, "a.ts"), "first ThemeIcon usage");
      fs.writeFileSync(path.join(srcDir, "b.ts"), "second ThemeIcon usage");

      const config: CheckConfig = {
        type: "quality",
        path: "src/**/*.ts",
        pattern: "ThemeIcon",
        min_matches: 2, // Require 2 total matches across all files
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should fail when glob pattern matches no files", async () => {
      const config: CheckConfig = {
        type: "quality",
        path: "nonexistent/**/*.ts",
        pattern: "something",
        min_matches: 1,
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("No files found matching glob");
    });

    it("should pass quality check when pattern in ANY file (not all)", async () => {
      // Create nested directory structure
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      // Create file WITHOUT the pattern
      fs.writeFileSync(path.join(srcDir, "empty.ts"), "export const x = 1;");

      // Create file WITH the pattern
      fs.writeFileSync(
        path.join(srcDir, "themed.ts"),
        "import { ThemeIcon } from 'vscode';"
      );

      const config: CheckConfig = {
        type: "quality",
        path: "src/**/*.ts",
        pattern: "ThemeIcon",
        min_matches: 1,
      };

      const result = await executeQualityCheck(config, tempDir);

      // Should PASS because at least ONE file contains the pattern
      expect(result.passed).toBe(true);
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
