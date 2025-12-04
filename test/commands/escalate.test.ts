/**
 * Escalate Command Tests
 *
 * Tests for `orchestra escalate` CLI command.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

let testTempDir: string;
let mockEscalateResult: any;

// Mock the core modules
vi.mock("../../src/core/config.js", () => ({
  requireOrchestraRoot: vi.fn(() => testTempDir),
  loadConfig: vi.fn(() => ({
    version: "1.0",
    paths: {},
  })),
  getResolvedPaths: vi.fn((root: string) => ({
    orchestraDir: path.join(root, ".orchestra"),
    manifest: path.join(root, ".orchestra", "manifest.yaml"),
    artifacts: path.join(root, ".orchestra", "artifacts"),
  })),
}));

vi.mock("../../src/core/escalate.js", () => ({
  runEscalate: vi.fn(async () => mockEscalateResult),
}));

vi.mock("../../src/core/output.js", () => ({
  print: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { createEscalateCommand } from "../../src/commands/escalate.js";
import { runEscalate } from "../../src/core/escalate.js";
import * as output from "../../src/core/output.js";

describe("Escalate Command", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-escalate-cmd-"));
    
    // Default successful result
    mockEscalateResult = {
      success: true,
      taskId: 1,
      previousStatus: "IN_PROGRESS",
      newStatus: "ESCALATED",
      reason: "Test reason",
      escalatedAt: new Date().toISOString(),
      reportPath: path.join(testTempDir, ".orchestra/artifacts/task-1/escalation-report.md"),
      attemptHistory: [],
      humanOptions: ["fix_manually", "modify_spec", "skip_task", "abort_sprint"],
    };

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(testTempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should require --reason option", () => {
    const cmd = createEscalateCommand();
    
    // Check that the command has the required option defined
    const reasonOption = cmd.options.find(opt => 
      opt.flags.includes("--reason") || opt.flags.includes("-r")
    );
    expect(reasonOption).toBeDefined();
    expect(reasonOption?.required).toBe(true);
  });

  it("should accept --task option to select specific task", async () => {
    const program = new Command();
    program.addCommand(createEscalateCommand());
    
    await program.parseAsync(["node", "test", "escalate", "-r", "Test reason", "-t", "5"]);
    
    expect(runEscalate).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "5",
        reason: "Test reason",
      })
    );
  });

  it("should accept --context option for additional context", async () => {
    const program = new Command();
    program.addCommand(createEscalateCommand());
    
    await program.parseAsync(["node", "test", "escalate", "-r", "Test", "-c", "Additional context here"]);
    
    expect(runEscalate).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "Additional context here",
      })
    );
  });

  it("should output valid JSON with --json flag", async () => {
    const program = new Command();
    program.addCommand(createEscalateCommand());
    
    await program.parseAsync(["node", "test", "escalate", "-r", "Test", "--json"]);
    
    expect(consoleLogSpy).toHaveBeenCalled();
    const jsonOutput = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(jsonOutput);
    
    expect(parsed.success).toBe(true);
    expect(parsed.newStatus).toBe("ESCALATED");
    expect(parsed.humanOptions).toBeInstanceOf(Array);
  });

  it("should show human options on success", async () => {
    const program = new Command();
    program.addCommand(createEscalateCommand());
    
    await program.parseAsync(["node", "test", "escalate", "-r", "Test reason"]);
    
    expect(output.print.success).toHaveBeenCalled();
    
    // Check console.log was called with human options info
    const allLogCalls = consoleLogSpy.mock.calls.flat().join(" ");
    expect(allLogCalls).toContain("Human");
  });

  it("should show warning about workflow halted", async () => {
    const program = new Command();
    program.addCommand(createEscalateCommand());
    
    await program.parseAsync(["node", "test", "escalate", "-r", "Test"]);
    
    expect(output.print.warning).toHaveBeenCalled();
  });

  it("should show error and exit on failure", async () => {
    vi.mocked(runEscalate).mockRejectedValueOnce(new Error("Task not found"));
    
    const program = new Command();
    program.addCommand(createEscalateCommand());
    
    await program.parseAsync(["node", "test", "escalate", "-r", "Test"]);
    
    expect(output.print.error).toHaveBeenCalledWith("Task not found");
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("should show the escalation report path on success", async () => {
    const program = new Command();
    program.addCommand(createEscalateCommand());
    
    await program.parseAsync(["node", "test", "escalate", "-r", "Test"]);
    
    const allLogCalls = consoleLogSpy.mock.calls.flat().join(" ");
    expect(allLogCalls).toContain("report");
  });

  it("should use default current task when --task not specified", async () => {
    const program = new Command();
    program.addCommand(createEscalateCommand());
    
    await program.parseAsync(["node", "test", "escalate", "-r", "Test reason"]);
    
    expect(runEscalate).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Test reason",
      })
    );
    
    // task should not be set (undefined defaults to current)
    const callArgs = vi.mocked(runEscalate).mock.calls[0][0];
    expect(callArgs.task).toBeUndefined();
  });

  it("should display the reason in output", async () => {
    mockEscalateResult.reason = "External API is down";
    
    const program = new Command();
    program.addCommand(createEscalateCommand());
    
    await program.parseAsync(["node", "test", "escalate", "-r", "External API is down"]);
    
    const allLogCalls = consoleLogSpy.mock.calls.flat().join(" ");
    expect(allLogCalls).toContain("External API is down");
  });
});
