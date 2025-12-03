/**
 * Accept-Signal Command Tests
 *
 * Tests for the orchestra accept-signal command.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptSignalCommand,
  createAcceptSignalCommand,
} from "../../src/commands/accept-signal.js";

// Mock core module
vi.mock("../../src/core/signal.js", async () => {
  const actual = await vi.importActual("../../src/core/signal.js");
  return {
    ...actual,
    runAcceptSignal: vi.fn(),
  };
});

import { runAcceptSignal } from "../../src/core/signal.js";

describe("accept-signal command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "accept-signal-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    // Reset mocks
    vi.mocked(runAcceptSignal).mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("command registration", () => {
    it("should be registered with correct name", () => {
      const command = createAcceptSignalCommand();

      expect(command.name()).toBe("accept-signal");
    });

    it("should have description", () => {
      const command = createAcceptSignalCommand();

      expect(command.description()).toBe(
        "Verify implementor completion signal"
      );
    });

    it("should have --task option", () => {
      const command = createAcceptSignalCommand();
      const options = command.options;

      const taskOption = options.find((opt) => opt.long === "--task");
      expect(taskOption).toBeDefined();
    });

    it("should have --max-age option with default value", () => {
      const command = createAcceptSignalCommand();
      const options = command.options;

      const maxAgeOption = options.find((opt) => opt.long === "--max-age");
      expect(maxAgeOption).toBeDefined();
      expect(maxAgeOption?.defaultValue).toBe("60");
    });

    it("should have --force flag", () => {
      const command = createAcceptSignalCommand();
      const options = command.options;

      const forceOption = options.find((opt) => opt.long === "--force");
      expect(forceOption).toBeDefined();
      expect(forceOption?.short).toBe("-f");
    });

    it("should have --json flag", () => {
      const command = createAcceptSignalCommand();
      const options = command.options;

      const jsonOption = options.find((opt) => opt.long === "--json");
      expect(jsonOption).toBeDefined();
    });

    it("should have --verbose flag", () => {
      const command = createAcceptSignalCommand();
      const options = command.options;

      const verboseOption = options.find((opt) => opt.long === "--verbose");
      expect(verboseOption).toBeDefined();
      expect(verboseOption?.short).toBe("-v");
    });
  });

  describe("command execution", () => {
    it("should exit with code 0 when signal accepted", async () => {
      vi.mocked(runAcceptSignal).mockResolvedValue({
        taskId: 7,
        timestamp: new Date().toISOString(),
        overall: "ACCEPTED",
        checks: [
          {
            id: "S1",
            check: "Pre-signal artifact exists",
            passed: true,
            expected: "Present",
            actual: "Found",
          },
        ],
        canVerify: true,
      });

      await expect(
        acceptSignalCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("should exit with code 1 when signal rejected", async () => {
      vi.mocked(runAcceptSignal).mockResolvedValue({
        taskId: 7,
        timestamp: new Date().toISOString(),
        overall: "REJECTED",
        checks: [
          {
            id: "S1",
            check: "Pre-signal artifact exists",
            passed: false,
            expected: "Present",
            actual: "Not found",
            fix: "Run pre-signal check",
          },
        ],
        canVerify: false,
      });

      await expect(
        acceptSignalCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(1)");

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should output JSON when --json flag is set", async () => {
      vi.mocked(runAcceptSignal).mockResolvedValue({
        taskId: 7,
        timestamp: new Date().toISOString(),
        overall: "ACCEPTED",
        checks: [
          {
            id: "S1",
            check: "Pre-signal artifact exists",
            passed: true,
            expected: "Present",
            actual: "Found",
          },
        ],
        canVerify: true,
      });

      await expect(
        acceptSignalCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.task_id).toBe(7);
      expect(parsed.overall).toBe("ACCEPTED");
      expect(parsed.can_verify).toBe(true);
    });

    it("should show human-readable output by default", async () => {
      vi.mocked(runAcceptSignal).mockResolvedValue({
        taskId: 7,
        timestamp: new Date().toISOString(),
        overall: "ACCEPTED",
        checks: [
          {
            id: "S1",
            check: "Pre-signal artifact exists",
            passed: true,
            expected: "Present",
            actual: "Found",
          },
        ],
        canVerify: true,
      });

      await expect(
        acceptSignalCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("Accept Signal Check");
      expect(output).toContain("ACCEPTED");
    });

    it("should pass options to runAcceptSignal", async () => {
      vi.mocked(runAcceptSignal).mockResolvedValue({
        taskId: 7,
        timestamp: new Date().toISOString(),
        overall: "ACCEPTED",
        checks: [],
        canVerify: true,
      });

      await expect(
        acceptSignalCommand({
          task: "7",
          maxAge: "120",
          force: true,
          json: false,
          verbose: true,
        })
      ).rejects.toThrow("process.exit(0)");

      expect(runAcceptSignal).toHaveBeenCalledWith({
        task: "7",
        maxAge: "120",
        force: true,
        json: false,
        verbose: true,
      });
    });

    it("should exit with code 2 on error", async () => {
      vi.mocked(runAcceptSignal).mockRejectedValue(new Error("Test error"));

      await expect(
        acceptSignalCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(2)");

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should output error as JSON when --json flag is set", async () => {
      vi.mocked(runAcceptSignal).mockRejectedValue(new Error("Test error"));

      await expect(
        acceptSignalCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(2)");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Test error");
    });
  });

  describe("verbose output", () => {
    it("should show detailed check output when --verbose flag is set", async () => {
      vi.mocked(runAcceptSignal).mockResolvedValue({
        taskId: 7,
        timestamp: new Date().toISOString(),
        overall: "ACCEPTED",
        checks: [
          {
            id: "S1",
            check: "Pre-signal artifact exists",
            passed: true,
            expected: "Present",
            actual: "Found",
          },
        ],
        canVerify: true,
        preSignalDetails: {
          task_id: 7,
          timestamp: new Date().toISOString(),
          status: "PASSED",
          checks: {
            flutter_analyze: {
              status: "PASSED",
              files_checked: 15,
              issues: 0,
            },
          },
        },
      });

      await expect(
        acceptSignalCommand({ json: false, verbose: true })
      ).rejects.toThrow("process.exit(0)");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("flutter_analyze");
    });
  });
});
