/**
 * Pre-Signal Check Command Tests
 *
 * Tests for the CLI command wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { createPreSignalCheckCommand } from "../../src/commands/pre-signal-check.js";
import * as preSignalCheck from "../../src/core/pre-signal-check.js";
import type { PreSignalReport } from "../../src/core/types.js";

// Mock the core module
vi.mock("../../src/core/pre-signal-check.js");

describe("pre-signal-check command", () => {
  let program: Command;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockExit: ReturnType<typeof vi.spyOn>;

  const mockPassedReport: PreSignalReport = {
    taskId: 1,
    timestamp: "2025-12-06T10:00:00Z",
    status: "PASSED",
    checks: [
      {
        id: "P1",
        name: "File exists: src/test.ts",
        category: "deliverables",
        severity: "BLOCKING",
        passed: true,
        message: "File created",
        file: "src/test.ts",
      },
    ],
    summary: { total: 1, passed: 1, failed: 0, warnings: 0 },
    artifactPath: ".orchestra/handover/verification/pre-signal.yaml",
  };

  const mockFailedReport: PreSignalReport = {
    taskId: 1,
    timestamp: "2025-12-06T10:00:00Z",
    status: "FAILED",
    checks: [
      {
        id: "P1",
        name: "File exists: src/missing.ts",
        category: "deliverables",
        severity: "BLOCKING",
        passed: false,
        message: "File not found",
        fix: "Create the file: src/missing.ts",
        file: "src/missing.ts",
      },
    ],
    summary: { total: 1, passed: 0, failed: 1, warnings: 0 },
    artifactPath: ".orchestra/handover/verification/pre-signal.yaml",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    program.addCommand(createPreSignalCheckCommand());

    mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockExit.mockRestore();
  });

  it("should create command with correct name and description", () => {
    const cmd = createPreSignalCheckCommand();
    expect(cmd.name()).toBe("pre-signal-check");
    expect(cmd.description()).toContain("deliverables");
  });

  it("should have all expected options", () => {
    const cmd = createPreSignalCheckCommand();
    const options = cmd.options.map((o) => o.long);
    
    expect(options).toContain("--task");
    expect(options).toContain("--force");
    expect(options).toContain("--json");
    expect(options).toContain("--verbose");
    expect(options).toContain("--skip-tests");
    expect(options).toContain("--skip-build");
  });

  it("should exit 0 on PASSED status", async () => {
    vi.mocked(preSignalCheck.runPreSignalCheck).mockResolvedValue(mockPassedReport);

    await expect(
      program.parseAsync(["node", "test", "pre-signal-check"])
    ).rejects.toThrow("process.exit(0)");

    expect(preSignalCheck.runPreSignalCheck).toHaveBeenCalled();
  });

  it("should exit 1 on FAILED status", async () => {
    vi.mocked(preSignalCheck.runPreSignalCheck).mockResolvedValue(mockFailedReport);

    await expect(
      program.parseAsync(["node", "test", "pre-signal-check"])
    ).rejects.toThrow("process.exit(1)");
  });

  it("should exit 2 on error", async () => {
    vi.mocked(preSignalCheck.runPreSignalCheck).mockRejectedValue(
      new Error("Something went wrong")
    );

    await expect(
      program.parseAsync(["node", "test", "pre-signal-check"])
    ).rejects.toThrow("process.exit(2)");
  });

  it("should output JSON when --json flag is used", async () => {
    vi.mocked(preSignalCheck.runPreSignalCheck).mockResolvedValue(mockPassedReport);

    await expect(
      program.parseAsync(["node", "test", "pre-signal-check", "--json"])
    ).rejects.toThrow("process.exit(0)");

    // Check that JSON was logged
    const logCalls = mockConsoleLog.mock.calls.flat().join("");
    expect(logCalls).toContain('"success": true');
    expect(logCalls).toContain('"taskId": 1');
  });

  it("should pass --force option to core function", async () => {
    vi.mocked(preSignalCheck.runPreSignalCheck).mockResolvedValue(mockPassedReport);

    await expect(
      program.parseAsync(["node", "test", "pre-signal-check", "--force"])
    ).rejects.toThrow("process.exit(0)");

    expect(preSignalCheck.runPreSignalCheck).toHaveBeenCalledWith(
      expect.objectContaining({ force: true })
    );
  });

  it("should pass --task option to core function", async () => {
    vi.mocked(preSignalCheck.runPreSignalCheck).mockResolvedValue(mockPassedReport);

    await expect(
      program.parseAsync(["node", "test", "pre-signal-check", "--task", "5"])
    ).rejects.toThrow("process.exit(0)");

    expect(preSignalCheck.runPreSignalCheck).toHaveBeenCalledWith(
      expect.objectContaining({ task: "5" })
    );
  });

  it("should pass --skip-tests and --skip-build options", async () => {
    vi.mocked(preSignalCheck.runPreSignalCheck).mockResolvedValue(mockPassedReport);

    await expect(
      program.parseAsync([
        "node",
        "test",
        "pre-signal-check",
        "--skip-tests",
        "--skip-build",
      ])
    ).rejects.toThrow("process.exit(0)");

    expect(preSignalCheck.runPreSignalCheck).toHaveBeenCalledWith(
      expect.objectContaining({ skipTests: true, skipBuild: true })
    );
  });
});
