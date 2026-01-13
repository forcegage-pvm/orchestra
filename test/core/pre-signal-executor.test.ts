/**
 * Pre-Signal Executor Tests
 *
 * TDD tests for the pre-signal executor that actually runs build/test commands
 * instead of trusting agent claims.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as commandExecutor from "../../src/core/command-executor.js";
import {
  PreSignalConfig,
  runPreSignalChecks,
} from "../../src/core/pre-signal-executor.js";

// Mock the command executor
vi.mock("../../src/core/command-executor.js", () => ({
  executeCommand: vi.fn(),
}));

describe("Pre-Signal Executor", () => {
  const mockExecuteCommand = vi.mocked(commandExecutor.executeCommand);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runPreSignalChecks", () => {
    it("should execute build command and return result", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build successful",
        stderr: "",
        duration: 1000,
      });
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "All tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        buildCommand: "npm run build",
        testCommand: "npm test",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(mockExecuteCommand).toHaveBeenCalledWith("npm run build", {
        cwd: "/test/workspace",
        timeout: expect.any(Number),
      });
      expect(result.build.passed).toBe(true);
      expect(result.build.duration_ms).toBe(1000);
    });

    it("should execute test command and return result", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Tests: 10 passed",
        stderr: "",
        duration: 3000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        buildCommand: "npm run build",
        testCommand: "npm test",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(mockExecuteCommand).toHaveBeenCalledWith("npm test", {
        cwd: "/test/workspace",
        timeout: expect.any(Number),
      });
      expect(result.test.passed).toBe(true);
      expect(result.test.duration_ms).toBe(3000);
    });

    it("should fail if build command fails", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Compilation error",
        duration: 500,
      });
      // Test still runs even if build fails
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        buildCommand: "npm run build",
        testCommand: "npm test",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.build.passed).toBe(false);
      expect(result.build.output).toContain("Compilation error");
      expect(result.allPassed).toBe(false);
    });

    it("should fail if test command fails", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Test failed: expected true, got false",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        buildCommand: "npm run build",
        testCommand: "npm test",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain("Test failed");
      expect(result.allPassed).toBe(false);
    });

    it("should run lint command when configured", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Tests passed",
        stderr: "",
        duration: 2000,
      });
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "No lint errors",
        stderr: "",
        duration: 1000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        buildCommand: "npm run build",
        testCommand: "npm test",
        lintCommand: "npm run lint",
        skipLint: false,
      };

      const result = await runPreSignalChecks(config);

      expect(mockExecuteCommand).toHaveBeenCalledWith("npm run lint", {
        cwd: "/test/workspace",
        timeout: expect.any(Number),
      });
      expect(result.lint.passed).toBe(true);
    });

    it("should skip lint when skipLint is true", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        buildCommand: "npm run build",
        testCommand: "npm test",
        lintCommand: "npm run lint",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should only call build and test, not lint
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
      expect(result.lint.passed).toBe(true);
      expect(result.lint.skipped).toBe(true);
    });

    it("should use default commands when not specified", async () => {
      mockExecuteCommand.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "OK",
        stderr: "",
        duration: 100,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
      };

      await runPreSignalChecks(config);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "npm run build",
        expect.any(Object)
      );
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "npm test",
        expect.any(Object)
      );
    });

    it("should handle command timeout", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "",
        duration: 60000,
        timedOut: true,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        buildCommand: "npm run build",
        testCommand: "npm test",
        timeout: 60000,
      };

      const result = await runPreSignalChecks(config);

      expect(result.build.passed).toBe(false);
      expect(result.build.timedOut).toBe(true);
    });

    it("should return allPassed true only when all checks pass", async () => {
      mockExecuteCommand.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "OK",
        stderr: "",
        duration: 100,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.allPassed).toBe(true);
      expect(result.build.passed).toBe(true);
      expect(result.test.passed).toBe(true);
    });

    it("should skip build when skipBuild is true", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipBuild: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should only call test
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(result.build.passed).toBe(true);
      expect(result.build.skipped).toBe(true);
    });

    it("should skip test when skipTest is true", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipTest: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should only call build
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(result.test.passed).toBe(true);
      expect(result.test.skipped).toBe(true);
    });

    it("should accept tddRedPhase as optional property", async () => {
      mockExecuteCommand.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "OK",
        stderr: "",
        duration: 100,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Property should be accepted without errors
      expect(result).toBeDefined();
      expect(result.allPassed).toBe(true);
    });

    it("should work without tddRedPhase property", async () => {
      mockExecuteCommand.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "OK",
        stderr: "",
        duration: 100,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should work fine without tddRedPhase
      expect(result).toBeDefined();
      expect(result.allPassed).toBe(true);
    });

    it("should accept tddRedPhase: false", async () => {
      mockExecuteCommand.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "OK",
        stderr: "",
        duration: 100,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: false,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should accept explicit false value
      expect(result).toBeDefined();
      expect(result.allPassed).toBe(true);
    });
  });
});
