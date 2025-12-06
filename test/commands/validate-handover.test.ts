/**
 * Validate Handover Command Tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { createValidateHandoverCommand } from "../../src/commands/validate-handover.js";
import type { ValidationReport } from "../../src/core/types.js";

// Mock the core function
vi.mock("../../src/core/validate-handover.js", () => ({
  runValidateHandover: vi.fn(),
}));

import { runValidateHandover } from "../../src/core/validate-handover.js";

describe("validate-handover command", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createMockReport(
    overrides: Partial<ValidationReport> = {}
  ): ValidationReport {
    return {
      taskId: 1,
      taskTitle: "Test Task",
      timestamp: new Date().toISOString(),
      status: "PASSED",
      checks: [
        {
          id: "V1",
          name: "Has task title",
          category: "structure",
          severity: "BLOCKING",
          passed: true,
        },
      ],
      summary: {
        total: 1,
        passed: 1,
        failed: 0,
        warnings: 0,
      },
      createFiles: [],
      updateFiles: [],
      isIntegrationTask: false,
      isVisualTask: false,
      ...overrides,
    };
  }

  async function runCommand(args: string[]): Promise<void> {
    const program = new Command();
    program.addCommand(createValidateHandoverCommand());
    await program.parseAsync(["node", "test", "validate-handover", ...args]);
  }

  describe("basic execution", () => {
    it("should call runValidateHandover", async () => {
      vi.mocked(runValidateHandover).mockResolvedValue(createMockReport());
      await runCommand([]);
      expect(runValidateHandover).toHaveBeenCalled();
    });

    it("should exit 0 on PASSED", async () => {
      vi.mocked(runValidateHandover).mockResolvedValue(
        createMockReport({ status: "PASSED" })
      );
      await runCommand([]);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it("should exit 1 on FAILED", async () => {
      vi.mocked(runValidateHandover).mockResolvedValue(
        createMockReport({
          status: "FAILED",
          summary: { total: 1, passed: 0, failed: 1, warnings: 0 },
        })
      );
      await runCommand([]);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should exit 2 on WARNINGS", async () => {
      vi.mocked(runValidateHandover).mockResolvedValue(
        createMockReport({
          status: "WARNINGS",
          summary: { total: 1, passed: 0, failed: 0, warnings: 1 },
        })
      );
      await runCommand([]);
      expect(processExitSpy).toHaveBeenCalledWith(2);
    });
  });

  describe("JSON output", () => {
    it("should output JSON when --json flag used", async () => {
      const report = createMockReport();
      vi.mocked(runValidateHandover).mockResolvedValue(report);

      await runCommand(["--json"]);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.taskId).toBe(1);
      expect(parsed.status).toBe("PASSED");
    });

    it("should output error as JSON on failure", async () => {
      vi.mocked(runValidateHandover).mockRejectedValue(
        new Error("Test error")
      );

      await runCommand(["--json"]);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.error).toBe("Test error");
    });
  });

  describe("error handling", () => {
    it("should exit 1 on error", async () => {
      vi.mocked(runValidateHandover).mockRejectedValue(
        new Error("Handover not found")
      );

      await runCommand([]);

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should display error message", async () => {
      vi.mocked(runValidateHandover).mockRejectedValue(
        new Error("Handover not found")
      );

      await runCommand([]);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("options", () => {
    it("should pass task option to core function", async () => {
      vi.mocked(runValidateHandover).mockResolvedValue(createMockReport());

      await runCommand(["--task", "5"]);

      expect(runValidateHandover).toHaveBeenCalledWith(
        expect.objectContaining({ task: "5" })
      );
    });

    it("should pass verbose option to core function", async () => {
      vi.mocked(runValidateHandover).mockResolvedValue(createMockReport());

      await runCommand(["--verbose"]);

      expect(runValidateHandover).toHaveBeenCalledWith(
        expect.objectContaining({ verbose: true })
      );
    });
  });
});
