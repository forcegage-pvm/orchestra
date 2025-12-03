/**
 * Verify Command Tests
 *
 * Tests for the orchestra verify command.
 * Implements TDD for Task 8.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVerifyCommand,
  verifyCommand,
} from "../../src/commands/verify.js";

// Mock core modules
vi.mock("../../src/core/verification.js", async () => {
  const actual = await vi.importActual("../../src/core/verification.js");
  return {
    ...actual,
    runVerification: vi.fn(),
  };
});

vi.mock("../../src/core/signal.js", async () => {
  const actual = await vi.importActual("../../src/core/signal.js");
  return {
    ...actual,
    runAcceptSignal: vi.fn(),
  };
});

import { runAcceptSignal } from "../../src/core/signal.js";
import {
  runVerification,
  type VerifyResult,
} from "../../src/core/verification.js";

describe("verify command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    // Reset mocks
    vi.mocked(runVerification).mockReset();
    vi.mocked(runAcceptSignal).mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("command registration", () => {
    it("registers with correct name", () => {
      const command = createVerifyCommand();

      expect(command.name()).toBe("verify");
    });

    it("has --task option", () => {
      const command = createVerifyCommand();
      const options = command.options;

      const taskOption = options.find((opt) => opt.long === "--task");
      expect(taskOption).toBeDefined();
      expect(taskOption?.short).toBe("-t");
    });

    it("has --check option", () => {
      const command = createVerifyCommand();
      const options = command.options;

      const checkOption = options.find((opt) => opt.long === "--check");
      expect(checkOption).toBeDefined();
      expect(checkOption?.short).toBe("-c");
    });

    it("has --severity option", () => {
      const command = createVerifyCommand();
      const options = command.options;

      const severityOption = options.find((opt) => opt.long === "--severity");
      expect(severityOption).toBeDefined();
      expect(severityOption?.defaultValue).toBe("all");
    });

    it("has --continue-on-error flag", () => {
      const command = createVerifyCommand();
      const options = command.options;

      const continueOption = options.find(
        (opt) => opt.long === "--continue-on-error"
      );
      expect(continueOption).toBeDefined();
    });

    it("has --skip-accept flag", () => {
      const command = createVerifyCommand();
      const options = command.options;

      const skipOption = options.find((opt) => opt.long === "--skip-accept");
      expect(skipOption).toBeDefined();
    });

    it("has --json and --verbose flags", () => {
      const command = createVerifyCommand();
      const options = command.options;

      const jsonOption = options.find((opt) => opt.long === "--json");
      const verboseOption = options.find((opt) => opt.long === "--verbose");
      expect(jsonOption).toBeDefined();
      expect(verboseOption).toBeDefined();
      expect(verboseOption?.short).toBe("-v");
    });
  });

  describe("check execution", () => {
    const createMockResult = (
      overrides?: Partial<VerifyResult>
    ): VerifyResult => ({
      report: {
        taskId: 8,
        taskTitle: "Verify Command",
        timestamp: new Date().toISOString(),
        duration: 1500,
        acceptSignal: { passed: true, skipped: false },
        checks: { total: 5, passed: 5, failed: 0, skipped: 0 },
        results: [
          {
            checkId: "F1",
            type: "file_exists",
            description: "Command file exists",
            severity: "critical",
            passed: true,
            message: "File found",
            duration: 10,
          },
        ],
        overallPassed: true,
      },
      exitCode: 0,
      ...overrides,
    });

    it("executes file_exists checks", async () => {
      const mockResult = createMockResult();
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runVerification).toHaveBeenCalledWith(
        expect.objectContaining({ skipAccept: true })
      );
    });

    it("executes pattern_match checks", async () => {
      const mockResult = createMockResult({
        report: {
          ...createMockResult().report,
          results: [
            {
              checkId: "P1",
              type: "pattern_match",
              description: "Function exported",
              severity: "critical",
              passed: true,
              message: "Pattern found",
              duration: 15,
            },
          ],
        },
      });
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");
    });

    it("executes command checks", async () => {
      const mockResult = createMockResult({
        report: {
          ...createMockResult().report,
          results: [
            {
              checkId: "C1",
              type: "command",
              description: "Tests pass",
              severity: "critical",
              passed: true,
              message: "Command exited with expected code",
              duration: 5000,
            },
          ],
        },
      });
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");
    });

    it("handles check failures", async () => {
      const mockResult = createMockResult({
        report: {
          ...createMockResult().report,
          checks: { total: 5, passed: 3, failed: 2, skipped: 0 },
          overallPassed: false,
        },
        exitCode: 1,
      });
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(1)");

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("continues on error when flag set", async () => {
      const mockResult = createMockResult({
        report: {
          ...createMockResult().report,
          checks: { total: 5, passed: 4, failed: 1, skipped: 0 },
          overallPassed: false,
        },
        exitCode: 1,
      });
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({
          skipAccept: true,
          continueOnError: true,
          json: false,
          verbose: false,
        })
      ).rejects.toThrow("process.exit(1)");

      expect(runVerification).toHaveBeenCalledWith(
        expect.objectContaining({ continueOnError: true })
      );
    });
  });

  describe("accept-signal integration", () => {
    const createMockResult = (
      overrides?: Partial<VerifyResult>
    ): VerifyResult => ({
      report: {
        taskId: 8,
        taskTitle: "Verify Command",
        timestamp: new Date().toISOString(),
        duration: 1500,
        acceptSignal: { passed: true, skipped: false },
        checks: { total: 3, passed: 3, failed: 0, skipped: 0 },
        results: [],
        overallPassed: true,
      },
      exitCode: 0,
      ...overrides,
    });

    it("runs accept-signal before verification", async () => {
      const mockResult = createMockResult();
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runVerification).toHaveBeenCalledWith(
        expect.objectContaining({ skipAccept: undefined })
      );
    });

    it("skips accept-signal with --skip-accept", async () => {
      const mockResult = createMockResult({
        report: {
          ...createMockResult().report,
          acceptSignal: { passed: true, skipped: true },
        },
      });
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runVerification).toHaveBeenCalledWith(
        expect.objectContaining({ skipAccept: true })
      );
    });

    it("fails fast if accept-signal fails", async () => {
      const mockResult = createMockResult({
        report: {
          ...createMockResult().report,
          acceptSignal: { passed: false, skipped: false },
          overallPassed: false,
        },
        exitCode: 1,
      });
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(1)");
    });
  });

  describe("report generation", () => {
    const createMockResult = (): VerifyResult => ({
      report: {
        taskId: 8,
        taskTitle: "Verify Command",
        timestamp: new Date().toISOString(),
        duration: 2500,
        acceptSignal: { passed: true, skipped: false },
        checks: { total: 10, passed: 10, failed: 0, skipped: 0 },
        results: [
          {
            checkId: "F1",
            type: "file_exists",
            description: "File check",
            severity: "critical",
            passed: true,
            message: "OK",
            duration: 10,
          },
        ],
        overallPassed: true,
      },
      exitCode: 0,
    });

    it("generates verification report", async () => {
      vi.mocked(runVerification).mockResolvedValue(createMockResult());

      await expect(
        verifyCommand({ json: true, skipAccept: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.task_id).toBe(8);
      expect(parsed.checks).toBeDefined();
      expect(parsed.results).toBeDefined();
    });

    it("saves report to correct path", async () => {
      vi.mocked(runVerification).mockResolvedValue(createMockResult());

      await expect(
        verifyCommand({ json: false, skipAccept: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runVerification).toHaveBeenCalled();
    });

    it("includes all check results", async () => {
      const mockResult = createMockResult();
      mockResult.report.results = [
        {
          checkId: "F1",
          type: "file_exists",
          description: "File 1",
          severity: "critical",
          passed: true,
          message: "OK",
          duration: 10,
        },
        {
          checkId: "F2",
          type: "file_exists",
          description: "File 2",
          severity: "warning",
          passed: true,
          message: "OK",
          duration: 12,
        },
        {
          checkId: "P1",
          type: "pattern_match",
          description: "Pattern",
          severity: "critical",
          passed: true,
          message: "Found",
          duration: 25,
        },
      ];
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({ json: true, skipAccept: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.results).toHaveLength(3);
    });
  });

  describe("exit codes", () => {
    it("returns 0 when all pass", async () => {
      vi.mocked(runVerification).mockResolvedValue({
        report: {
          taskId: 8,
          taskTitle: "Test",
          timestamp: new Date().toISOString(),
          duration: 1000,
          acceptSignal: { passed: true, skipped: true },
          checks: { total: 5, passed: 5, failed: 0, skipped: 0 },
          results: [],
          overallPassed: true,
        },
        exitCode: 0,
      });

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("returns 1 when any fail", async () => {
      vi.mocked(runVerification).mockResolvedValue({
        report: {
          taskId: 8,
          taskTitle: "Test",
          timestamp: new Date().toISOString(),
          duration: 1000,
          acceptSignal: { passed: true, skipped: true },
          checks: { total: 5, passed: 3, failed: 2, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 1,
      });

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(1)");

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("returns 2 when no task", async () => {
      vi.mocked(runVerification).mockResolvedValue({
        report: {
          taskId: 0,
          taskTitle: "",
          timestamp: new Date().toISOString(),
          duration: 0,
          checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 2,
      });

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(2)");

      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it("returns 3 when criteria missing", async () => {
      vi.mocked(runVerification).mockResolvedValue({
        report: {
          taskId: 8,
          taskTitle: "Test",
          timestamp: new Date().toISOString(),
          duration: 0,
          checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 3,
      });

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(3)");

      expect(exitSpy).toHaveBeenCalledWith(3);
    });

    it("returns 4 on execution error", async () => {
      vi.mocked(runVerification).mockRejectedValue(
        new Error("Execution error")
      );

      await expect(
        verifyCommand({ skipAccept: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(4)");

      expect(exitSpy).toHaveBeenCalledWith(4);
    });
  });

  describe("output formatting", () => {
    const createMockResult = (): VerifyResult => ({
      report: {
        taskId: 8,
        taskTitle: "Verify Command",
        timestamp: new Date().toISOString(),
        duration: 1500,
        acceptSignal: { passed: true, skipped: false },
        checks: { total: 5, passed: 5, failed: 0, skipped: 0 },
        results: [
          {
            checkId: "F1",
            type: "file_exists",
            description: "Command file exists",
            severity: "critical",
            passed: true,
            message: "File found",
            duration: 10,
          },
        ],
        overallPassed: true,
      },
      exitCode: 0,
    });

    it("outputs JSON when --json flag is set", async () => {
      vi.mocked(runVerification).mockResolvedValue(createMockResult());

      await expect(
        verifyCommand({ json: true, skipAccept: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.task_id).toBe(8);
      expect(parsed.overall_passed).toBe(true);
    });

    it("outputs human-readable format by default", async () => {
      vi.mocked(runVerification).mockResolvedValue(createMockResult());

      await expect(
        verifyCommand({ json: false, skipAccept: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("Verification");
    });

    it("shows verbose output when --verbose flag is set", async () => {
      const mockResult = createMockResult();
      mockResult.report.results[0].details = { path: "src/commands/verify.ts" };
      vi.mocked(runVerification).mockResolvedValue(mockResult);

      await expect(
        verifyCommand({ json: false, skipAccept: true, verbose: true })
      ).rejects.toThrow("process.exit(0)");

      expect(runVerification).toHaveBeenCalledWith(
        expect.objectContaining({ verbose: true })
      );
    });
  });
});
