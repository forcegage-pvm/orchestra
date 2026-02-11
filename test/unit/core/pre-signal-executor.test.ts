/**
 * Pre-Signal Executor Tests
 *
 * TDD tests for the pre-signal executor that actually runs build/test commands
 * instead of trusting agent claims.
 *
 * Key behavior: TDD dual-command mode ONLY runs when tddRedPhase: true.
 * - When tddRedPhase: true:
 *   1. Tagged tests (tdd-red) MUST fail or not exist
 *   2. Non-tagged tests MUST pass
 * - When tddRedPhase: false or undefined:
 *   1. Normal test mode: all tests must pass
 *
 * This ensures:
 * - tdd-red tests that PASS cause verification failure (tag should be removed) - TDD mode only
 * - Non-tdd-red tests that FAIL cause verification failure (must be fixed)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as commandExecutor from "../../../src/core/command-executor.js";
import {
  PreSignalConfig,
  runPreSignalChecks,
} from "../../../src/core/pre-signal-executor.js";

// Mock the command executor
vi.mock("../../../src/core/command-executor.js", () => ({
  executeCommand: vi.fn(),
}));

describe("Pre-Signal Executor", () => {
  const mockExecuteCommand = vi.mocked(commandExecutor.executeCommand);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * Helper to mock standard successful execution in TDD mode:
   * - Build: passes
   * - Tagged tests: fail (as expected) or no tests found
   * - Non-tagged tests: pass
   */
  function mockSuccessfulTddExecution() {
    // Build passes
    mockExecuteCommand.mockResolvedValueOnce({
      success: true,
      exitCode: 0,
      stdout: "Build successful",
      stderr: "",
      duration: 1000,
    });
    // Tagged tests fail (expected - they're red-phase tests)
    mockExecuteCommand.mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      stdout: "1 test failed",
      stderr: "",
      duration: 500,
    });
    // Non-tagged tests pass
    mockExecuteCommand.mockResolvedValueOnce({
      success: true,
      exitCode: 0,
      stdout: "All tests passed",
      stderr: "",
      duration: 2000,
    });
  }

  /**
   * Helper to mock standard successful execution in normal mode (non-TDD):
   * - Build: passes
   * - Tests: all pass
   */
  function mockSuccessfulNormalExecution() {
    // Build passes
    mockExecuteCommand.mockResolvedValueOnce({
      success: true,
      exitCode: 0,
      stdout: "Build successful",
      stderr: "",
      duration: 1000,
    });
    // Tests pass
    mockExecuteCommand.mockResolvedValueOnce({
      success: true,
      exitCode: 0,
      stdout: "All tests passed",
      stderr: "",
      duration: 2000,
    });
  }

  // Legacy alias for backward compatibility
  const mockSuccessfulExecution = mockSuccessfulTddExecution;

  /**
   * Helper to mock execution with no tdd-red tests
   */
  function mockExecutionNoTddRedTests() {
    // Build passes
    mockExecuteCommand.mockResolvedValueOnce({
      success: true,
      exitCode: 0,
      stdout: "Build successful",
      stderr: "",
      duration: 1000,
    });
    // Tagged tests: no tests found (exit 0 with "no tests" message)
    mockExecuteCommand.mockResolvedValueOnce({
      success: true,
      exitCode: 0,
      stdout: "No tests found matching the pattern",
      stderr: "",
      duration: 100,
    });
    // Non-tagged tests pass
    mockExecuteCommand.mockResolvedValueOnce({
      success: true,
      exitCode: 0,
      stdout: "All tests passed",
      stderr: "",
      duration: 2000,
    });
  }

  describe("runPreSignalChecks", () => {
    it("should execute build command and return result", async () => {
      mockSuccessfulExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        buildCommand: "npm run build",
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

    it("should execute dual test commands for TDD verification", async () => {
      mockSuccessfulExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should call both tagged and non-tagged test commands
      expect(mockExecuteCommand).toHaveBeenCalledTimes(3); // build + 2 test commands
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'npm test -- --testNamePattern="\\[tdd-red\\]"',
        expect.any(Object),
      );
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"',
        expect.any(Object),
      );
      expect(result.test.passed).toBe(true);
    });

    it("should fail if build command fails", async () => {
      // Build fails
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Compilation error",
        duration: 500,
      });
      // Tests pass (normal mode - single test command)
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
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.build.passed).toBe(false);
      expect(result.build.output).toContain("Compilation error");
      expect(result.allPassed).toBe(false);
    });

    it("should fail if tests fail in normal mode", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Tests FAIL (single command in normal mode)
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Test failed: expected true, got false",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
        // No tddRedPhase - normal mode
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(false);
      expect(result.allPassed).toBe(false);
    });

    it("should run lint command when configured", async () => {
      mockSuccessfulNormalExecution();
      // Add lint mock
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "No lint errors",
        stderr: "",
        duration: 1000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
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
      mockSuccessfulExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        lintCommand: "npm run lint",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should call build + 2 test commands, not lint
      expect(mockExecuteCommand).toHaveBeenCalledTimes(3);
      expect(result.lint.passed).toBe(true);
      expect(result.lint.skipped).toBe(true);
    });

    it("should use default commands when not specified (TDD mode)", async () => {
      mockSuccessfulExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
      };

      await runPreSignalChecks(config);

      // Build command
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "npm run build",
        expect.any(Object),
      );
      // Tagged test command
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'npm test -- --testNamePattern="\\[tdd-red\\]"',
        expect.any(Object),
      );
      // Non-tagged test command
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"',
        expect.any(Object),
      );
    });

    it("should handle command timeout", async () => {
      // Build times out
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "",
        duration: 60000,
        timedOut: true,
      });
      // Tests pass (normal mode - single command)
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
        timeout: 60000,
      };

      const result = await runPreSignalChecks(config);

      expect(result.build.passed).toBe(false);
      expect(result.build.timedOut).toBe(true);
    });

    it("should return allPassed true when all checks pass (TDD mode)", async () => {
      mockSuccessfulExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.allPassed).toBe(true);
      expect(result.build.passed).toBe(true);
      expect(result.test.passed).toBe(true);
    });

    it("should skip build when skipBuild is true (TDD mode)", async () => {
      // Tagged tests fail (expected)
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "1 test failed",
        stderr: "",
        duration: 500,
      });
      // Non-tagged tests pass
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipBuild: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should call 2 test commands (no build)
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
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

    it("should pass when no tdd-red tests exist (TDD mode)", async () => {
      mockExecutionNoTddRedTests();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // No tdd-red tests is OK - treated as "expected failure"
      expect(result.test.passed).toBe(true);
      expect(result.allPassed).toBe(true);
    });

    it("should accept tddRedPhase as optional property", async () => {
      mockSuccessfulExecution();

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

    it("should work without tddRedPhase property (normal mode)", async () => {
      mockSuccessfulNormalExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should work fine without tddRedPhase - uses normal single-test mode
      expect(result).toBeDefined();
      expect(result.allPassed).toBe(true);
      // In normal mode, should only have 2 calls: build + single test
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });

    it("should accept tddRedPhase: false (normal mode)", async () => {
      mockSuccessfulNormalExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: false,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should accept explicit false value and use normal mode
      expect(result).toBeDefined();
      expect(result.allPassed).toBe(true);
      // In normal mode, should only have 2 calls: build + single test
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe("TDD Verification Behavior", () => {
    it("should fail if tdd-red tagged tests PASS (should fail)", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Tagged tests PASS (unexpected - they should fail!)
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "All tests passed",
        stderr: "",
        duration: 1000,
      });
      // Non-tagged tests pass
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "10 tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain("tdd-red");
      expect(result.test.output).toContain("PASSED but should FAIL");
      expect(result.allPassed).toBe(false);
    });

    it("should pass when tdd-red tests fail (expected)", async () => {
      mockSuccessfulExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Tagged tests failing is expected behavior
      expect(result.test.passed).toBe(true);
      expect(result.allPassed).toBe(true);
    });

    it("should fail if non-tagged tests fail in TDD mode", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Tagged tests fail (expected)
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "1 test failed",
        stderr: "",
        duration: 1000,
      });
      // Non-tagged tests FAIL (unexpected)
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Test error: assertion failed",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain("Non-tagged tests FAILED");
      expect(result.allPassed).toBe(false);
    });

    it("should fail if both tdd-red tests pass AND non-tagged fail", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Tagged tests PASS (unexpected)
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "All tests passed",
        stderr: "",
        duration: 1000,
      });
      // Non-tagged tests FAIL (unexpected)
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Test error",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(false);
      // Should contain both error messages
      expect(result.test.output).toContain("PASSED but should FAIL");
      expect(result.test.output).toContain("Non-tagged tests FAILED");
      expect(result.allPassed).toBe(false);
    });

    it("should use project-specific commands for TDD mode", async () => {
      mockSuccessfulExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      await runPreSignalChecks(config);

      // Default (Node.js/Vitest) commands - tagged tests use testNamePattern
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'npm test -- --testNamePattern="\\[tdd-red\\]"',
        expect.any(Object),
      );
    });

    it("should respect skipTest flag", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipTest: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should skip both test commands
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1); // Only build
      expect(result.test.passed).toBe(true);
      expect(result.test.skipped).toBe(true);
    });

    it("should handle timeout in test execution", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Tagged tests timeout
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "",
        duration: 60000,
        timedOut: true,
      });
      // Non-tagged tests pass
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
        timeout: 60000,
      };

      const result = await runPreSignalChecks(config);

      // Timeout counts as failure (expected for tdd-red tests)
      expect(result.test.timedOut).toBe(true);
    });

    it("should combine duration from both test runs", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Tagged tests fail
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "1 test failed",
        stderr: "",
        duration: 1000,
      });
      // Non-tagged tests pass
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Duration should be sum of both test runs
      expect(result.test.duration_ms).toBe(3000);
    });
  });
});
