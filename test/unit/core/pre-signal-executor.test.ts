/**
 * Pre-Signal Executor Tests
 *
 * TDD tests for the pre-signal executor that actually runs build/test commands
 * instead of trusting agent claims.
 *
 * Key behavior: TDD red-phase mode ONLY runs when tddRedPhase: true.
 * - When tddRedPhase: true:
 *   1. Runs "red" tier via runTestsCore with inverted logic
 *   2. Failures expected (failed > 0 → PASS)
 *   3. All passing → FAIL (promote tests)
 *   4. No tests → FAIL (tests required)
 * - When tddRedPhase: false or undefined:
 *   1. Normal test mode: runs all non-red tiers via runTestsCore
 *
 * This ensures:
 * - Red-phase tests that PASS cause verification failure (should be promoted)
 * - Non-red tests that FAIL cause verification failure (must be fixed)
 */

import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as commandExecutor from "../../../src/core/command-executor.js";
import {
  PreSignalConfig,
  runPreSignalChecks,
} from "../../../src/core/pre-signal-executor.js";
import * as testRunnerCore from "../../../src/core/pre-signal-test-adapter.js";

// Mock the command executor
vi.mock("../../../src/core/command-executor.js", () => ({
  executeCommand: vi.fn(),
}));

// Mock the test runner adapter (shared pipeline wrapper)
vi.mock("../../../src/core/pre-signal-test-adapter.js", () => ({
  runTestsCore: vi.fn(),
  runAllNonInvertedTiers: vi.fn(),
}));

// Mock fs module for .agent-test-config.json reading
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(actual.existsSync),
      readFileSync: vi.fn(actual.readFileSync),
    },
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});

describe("Pre-Signal Executor", () => {
  const mockExecuteCommand = vi.mocked(commandExecutor.executeCommand);
  const mockRunTestsCore = vi.mocked(testRunnerCore.runTestsCore);
  const mockRunAllNonInvertedTiers = vi.mocked(
    testRunnerCore.runAllNonInvertedTiers,
  );
  const mockExistsSync = vi.mocked(fs.existsSync);
  const mockReadFileSync = vi.mocked(fs.readFileSync);

  /**
   * Default agent test config with non-red tiers
   */
  const defaultAgentTestConfig = {
    framework: "vitest",
    tiers: [
      {
        name: "red",
        path: "test/red/**/*.test.ts",
        timeout: 30000,
        inverted: true,
      },
      { name: "smoke", path: "test/smoke/**/*.test.ts", timeout: 10000 },
      { name: "unit", path: "test/unit/**/*.test.ts", timeout: 120000 },
    ],
    workingDir: ".",
    defaultTimeout: 30000,
  };

  /**
   * Helper to mock .agent-test-config.json file reading
   */
  function mockAgentTestConfig(config: Record<string, unknown> | null) {
    // For .agent-test-config.json path checks
    mockExistsSync.mockImplementation((p: unknown) => {
      const pathStr = String(p);
      if (pathStr.endsWith(".agent-test-config.json")) {
        return config !== null;
      }
      // For detectProjectType - simulate having package.json
      if (pathStr.endsWith("package.json")) {
        return true;
      }
      return false;
    });

    if (config !== null) {
      mockReadFileSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        if (pathStr.endsWith(".agent-test-config.json")) {
          return JSON.stringify(config);
        }
        return "";
      });
    }
  }

  beforeEach(() => {
    vi.resetAllMocks();
    // Default: agent test config exists with standard tiers
    mockAgentTestConfig(defaultAgentTestConfig);
  });

  /**
   * Helper to mock standard successful execution in TDD mode:
   * - Build: passes (via executeCommand)
   * - Red tier tests: have failures (expected in red phase, via runTestsCore)
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
    // Red tier: tests fail (expected in red phase)
    mockRunTestsCore.mockResolvedValueOnce({
      tier: "red",
      passed: 1,
      failed: 2,
      total: 3,
      duration_ms: 500,
    });
    // Non-red tiers: called after red passes (regression check)
    mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);
  }

  /**
   * Helper to mock standard successful execution in normal mode (non-TDD):
   * - Build: passes (via executeCommand)
   * - Tests: all tiers pass (via runTestsCore)
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
    // All non-red tiers pass via runAllNonInvertedTiers
    mockRunAllNonInvertedTiers.mockResolvedValueOnce([
      { tier: "smoke", passed: 5, failed: 0, total: 5, duration_ms: 500 },
      { tier: "unit", passed: 10, failed: 0, total: 10, duration_ms: 500 },
    ]);
  }

  describe("runPreSignalChecks", () => {
    it("should execute build command and return result", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build successful",
        stderr: "",
        duration: 1000,
      });
      // Normal mode: tests via runAllNonInvertedTiers
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 5, failed: 0, total: 5, duration_ms: 500 },
      ]);

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

    it("should run red tier via runTestsCore for TDD verification", async () => {
      mockSuccessfulTddExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should call runTestsCore with tier='red'
      expect(mockRunTestsCore).toHaveBeenCalledWith({
        tier: "red",
        workspacePath: "/test/workspace",
      });
      // Build via executeCommand + red tests via runTestsCore
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1); // Only build
      expect(mockRunTestsCore).toHaveBeenCalledTimes(1); // Only red tier
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
      // Tests pass via runAllNonInvertedTiers (normal mode)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 5, failed: 0, total: 5, duration_ms: 500 },
      ]);

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
      // Tiers via runAllNonInvertedTiers: smoke passes, unit FAILS
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 3, failed: 0, total: 3, duration_ms: 200 },
        {
          tier: "unit",
          passed: 8,
          failed: 2,
          total: 10,
          duration_ms: 2000,
          output: "Test failed: expected true, got false",
        },
      ]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
        // No tddRedPhase - normal mode
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain(
        "Tests failed in tier(s): unit (2 failed)",
      );
      expect(result.test.output).toContain(
        "Run 'run_tests' with scope=suite and target=<tier> for detailed diagnostics.",
      );
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
      mockSuccessfulTddExecution();

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Should call build via executeCommand + red tier via runTestsCore, not lint
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1); // Only build
      expect(result.lint.passed).toBe(true);
      expect(result.lint.skipped).toBe(true);
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
      // Tests pass via runAllNonInvertedTiers (normal mode)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 5, failed: 0, total: 5, duration_ms: 500 },
      ]);

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
      mockSuccessfulTddExecution();

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
      // Red tier: tests fail (expected)
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 1,
        failed: 2,
        total: 3,
        duration_ms: 500,
      });
      // Non-red tiers: called after red passes (regression check)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipBuild: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // No build command, only red tier via runTestsCore
      expect(mockExecuteCommand).toHaveBeenCalledTimes(0);
      expect(mockRunTestsCore).toHaveBeenCalledTimes(1);
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
      mockSuccessfulTddExecution();

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

      // Should work fine without tddRedPhase - uses runTestsCore for each non-red tier
      expect(result).toBeDefined();
      expect(result.allPassed).toBe(true);
      // In normal mode: build via executeCommand, tests via runAllNonInvertedTiers
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1); // Only build
      // runAllNonInvertedTiers called once for all non-red tiers
      expect(mockRunAllNonInvertedTiers).toHaveBeenCalledTimes(1);
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
      // In normal mode: build via executeCommand, tests via runAllNonInvertedTiers
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1); // Only build
      expect(mockRunAllNonInvertedTiers).toHaveBeenCalledTimes(1);
    });
  });

  describe("Normal Test Verification via runTestsCore", () => {
    it("should call runAllNonInvertedTiers for normal test execution", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // All non-red tiers pass
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 5, failed: 0, total: 5, duration_ms: 300 },
        { tier: "unit", passed: 10, failed: 0, total: 10, duration_ms: 700 },
      ]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      await runPreSignalChecks(config);

      // Should call runAllNonInvertedTiers once (it handles tier iteration internally)
      expect(mockRunAllNonInvertedTiers).toHaveBeenCalledTimes(1);
      expect(mockRunAllNonInvertedTiers).toHaveBeenCalledWith(
        "/test/workspace",
      );
    });

    it("should filter out inverted (red) tiers", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // runAllNonInvertedTiers returns only non-red tiers (filtering done internally)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 5, failed: 0, total: 5, duration_ms: 300 },
      ]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      await runPreSignalChecks(config);

      // runTestsCore should NOT be called directly for normal mode (only for TDD red)
      expect(mockRunTestsCore).not.toHaveBeenCalled();
      // runAllNonInvertedTiers handles red tier filtering internally
      expect(mockRunAllNonInvertedTiers).toHaveBeenCalledTimes(1);
    });

    it("should aggregate results from multiple tiers", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Smoke tier passes (200ms) + Unit tier passes (1500ms)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 3, failed: 0, total: 3, duration_ms: 200 },
        { tier: "unit", passed: 10, failed: 0, total: 10, duration_ms: 1500 },
      ]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(true);
      // Duration is aggregated from all tiers
      expect(result.test.duration_ms).toBe(1700);
      expect(result.allPassed).toBe(true);
    });

    it("should fail if any tier has failures", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Smoke passes, Unit FAILS
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 3, failed: 0, total: 3, duration_ms: 200 },
        {
          tier: "unit",
          passed: 8,
          failed: 2,
          total: 10,
          duration_ms: 1500,
          output: "FAIL src/foo.test.ts > should work",
        },
      ]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(false);
      expect(result.allPassed).toBe(false);
    });

    it("should output exact diagnostic message on failure", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Smoke tier fails
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        {
          tier: "smoke",
          passed: 0,
          failed: 1,
          total: 1,
          duration_ms: 100,
          output: "Some test error output",
        },
        { tier: "unit", passed: 10, failed: 0, total: 10, duration_ms: 1500 },
      ]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain(
        "Tests failed in tier(s): smoke (1 failed)",
      );
      expect(result.test.output).toContain(
        "Run 'run_tests' with scope=suite and target=<tier> for detailed diagnostics.",
      );
    });

    it("should have minimal failure output per FR-005", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Smoke tier fails with verbose output
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        {
          tier: "smoke",
          passed: 0,
          failed: 1,
          total: 1,
          duration_ms: 100,
          output: "AssertionError: expected 1 to be 2",
        },
        { tier: "unit", passed: 10, failed: 0, total: 10, duration_ms: 1500 },
      ]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // FR-005: Output should contain per-tier diagnostic message
      expect(result.test.output).toContain(
        "Tests failed in tier(s): smoke (1 failed)",
      );
      expect(result.test.output).toContain(
        "Run 'run_tests' with scope=suite and target=<tier> for detailed diagnostics.",
      );
    });

    it("should pass with 'No tests found' when config is missing", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // runAllNonInvertedTiers returns empty when no config
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(true);
      expect(result.test.output).toContain("No tests found");
      expect(result.allPassed).toBe(true);
    });

    it("should pass with 'No tests found' when all tiers are inverted", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // runAllNonInvertedTiers returns empty when all tiers are inverted
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(true);
      expect(result.test.output).toContain("No tests found");
      expect(result.allPassed).toBe(true);
    });

    it("should pass with 'No tests found' when config has no tiers", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // runAllNonInvertedTiers returns empty when no tiers configured
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(true);
      expect(result.test.output).toContain("No tests found");
    });

    it("should return PreSignalCheckResult with passed, output, duration_ms", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 2, failed: 0, total: 2, duration_ms: 300 },
        { tier: "unit", passed: 5, failed: 0, total: 5, duration_ms: 700 },
      ]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Verify PreSignalCheckResult shape
      expect(result.test).toHaveProperty("passed");
      expect(result.test).toHaveProperty("duration_ms");
      expect(typeof result.test.passed).toBe("boolean");
      expect(typeof result.test.duration_ms).toBe("number");
      expect(result.test.passed).toBe(true);
      expect(result.test.duration_ms).toBe(1000);
    });

    it("should skip test when skipTest is true in normal mode", async () => {
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

      expect(result.test.passed).toBe(true);
      expect(result.test.skipped).toBe(true);
      expect(mockRunAllNonInvertedTiers).not.toHaveBeenCalled();
    });

    it("should not call executeCommand for tests in normal mode", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 5, failed: 0, total: 5, duration_ms: 300 },
      ]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        skipLint: true,
      };

      await runPreSignalChecks(config);

      // executeCommand should only be called for build, NOT for tests
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "npm run build",
        expect.any(Object),
      );
    });
  });

  describe("TDD Red-Phase Verification via runTestsCore (Inverted Logic)", () => {
    it("should PASS when red-phase tests have failures (failed > 0)", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier: tests fail (expected in red phase)
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 1,
        failed: 3,
        total: 4,
        duration_ms: 800,
      });
      // Non-red tiers: called after red passes (regression check)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Inverted: failures are expected → PASS
      expect(result.test.passed).toBe(true);
      expect(result.test.duration_ms).toBe(800);
      expect(result.allPassed).toBe(true);
    });

    it("should FAIL when ALL red-phase tests pass (failed === 0, total > 0) with promotion message", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier: ALL tests pass (unexpected in red phase)
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 5,
        failed: 0,
        total: 5,
        duration_ms: 1000,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Inverted: all passing means tests need promotion → FAIL
      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain("Promote tests from test/red/");
      expect(result.test.duration_ms).toBe(1000);
      expect(result.allPassed).toBe(false);
    });

    it("should FAIL when no red tests found (total === 0) with 'none found' message", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier: no tests found
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 0,
        failed: 0,
        total: 0,
        duration_ms: 100,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // No tests found → FAIL (red phase requires tests)
      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain(
        "Task requires TDD red-phase tests but none found",
      );
      expect(result.test.duration_ms).toBe(100);
      expect(result.allPassed).toBe(false);
    });

    it("should call runTestsCore with tier='red' and workspacePath", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 0,
        failed: 2,
        total: 2,
        duration_ms: 500,
      });
      // Non-red tiers: called after red passes (regression check)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/my/project/path",
        tddRedPhase: true,
        skipLint: true,
      };

      await runPreSignalChecks(config);

      expect(mockRunTestsCore).toHaveBeenCalledWith({
        tier: "red",
        workspacePath: "/my/project/path",
      });
    });

    it("should NOT call executeCommand for test execution in TDD mode", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier via runTestsCore
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 0,
        failed: 2,
        total: 2,
        duration_ms: 500,
      });
      // Non-red tiers: called after red passes (regression check)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      await runPreSignalChecks(config);

      // executeCommand only called for build, NOT for tests
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "npm run build",
        expect.any(Object),
      );
    });

    it("should respect skipTest flag in TDD mode", async () => {
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

      // Should skip test execution entirely
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1); // Only build
      expect(mockRunTestsCore).not.toHaveBeenCalled();
      expect(result.test.passed).toBe(true);
      expect(result.test.skipped).toBe(true);
    });

    it("should use tier-configured timeout from .agent-test-config.json", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier via runTestsCore (the timeout is handled internally by runTestsCore)
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 0,
        failed: 1,
        total: 1,
        duration_ms: 500,
      });
      // Non-red tiers: called after red passes (regression check)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      await runPreSignalChecks(config);

      // runTestsCore is called with tier='red' - it reads timeout from config internally
      // The tier config has timeout: 30000 for the "red" tier
      // Verify that runTestsCore is called with the correct tier (timeout is handled by runTestsCore)
      expect(mockRunTestsCore).toHaveBeenCalledWith({
        tier: "red",
        workspacePath: "/test/workspace",
      });
      // No hardcoded timeout should be passed - runTestsCore reads it from config
      const callArgs = mockRunTestsCore.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.tier).toBe("red");
      // fallbackTimeoutMs should NOT be set - let the tier config handle it
      expect(callArgs).not.toHaveProperty("fallbackTimeoutMs");
    });

    it("should handle red tier with only failures (all fail)", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier: all tests fail
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 0,
        failed: 5,
        total: 5,
        duration_ms: 1500,
      });
      // Non-red tiers: called after red passes (regression check)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // All failures → PASS (inverted)
      expect(result.test.passed).toBe(true);
      expect(result.allPassed).toBe(true);
    });

    it("should propagate duration from runTestsCore result", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier with specific duration
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 1,
        failed: 2,
        total: 3,
        duration_ms: 2345,
      });
      // Non-red tiers: called after red passes (regression check)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.duration_ms).toBe(2345);
    });
  });

  describe("Explicit Success Criteria Verification (SC-004, SC-006, SC-007, SC-008)", () => {
    it("SC-004: runTestsCore is called with {tier:'red', workspacePath} when tddRedPhase=true", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier result
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 0,
        failed: 3,
        total: 3,
        duration_ms: 750,
      });
      // Non-red tiers: called after red passes (regression check)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/my/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      await runPreSignalChecks(config);

      // SC-004: Verify the mock is called with exactly {tier:'red', workspacePath}
      expect(mockRunTestsCore).toHaveBeenCalledTimes(1);
      expect(mockRunTestsCore).toHaveBeenCalledWith({
        tier: "red",
        workspacePath: "/my/workspace",
      });
    });

    it("SC-006: verification FAILS when no red tests exist (total=0), output contains 'none found'", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier: no tests found (total=0, failed=0)
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 0,
        failed: 0,
        total: 0,
        duration_ms: 50,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // SC-006: Must FAIL and output must contain 'none found'
      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain("none found");
      expect(result.test.output).toContain(
        "Task requires TDD red-phase tests but none found",
      );
      expect(result.allPassed).toBe(false);
    });

    it("SC-007: verification PASSES when red tests have failures (failed > 0)", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier: tests with failures (failed > 0)
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 2,
        failed: 3,
        total: 5,
        duration_ms: 900,
      });
      // Non-red tiers: called after red passes (regression check)
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([]);

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // SC-007: Must PASS (inverted logic - failures are expected in red phase)
      expect(result.test.passed).toBe(true);
      expect(result.allPassed).toBe(true);
    });

    it("SC-008: verification FAILS when ALL red tests pass (failed=0, total>0), output contains 'Promote'", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Red tier: ALL tests pass (failed=0, total>0)
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "red",
        passed: 4,
        failed: 0,
        total: 4,
        duration_ms: 1200,
      });

      const config: PreSignalConfig = {
        workspacePath: "/test/workspace",
        tddRedPhase: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // SC-008: Must FAIL and output must contain 'Promote'
      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain("Promote");
      expect(result.test.output).toContain("Promote tests from test/red/");
      expect(result.allPassed).toBe(false);
    });
  });
});
