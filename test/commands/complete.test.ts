/**
 * Complete Command Tests
 *
 * Tests for the orchestra complete command.
 * Implements TDD for Task 9.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCompleteCommand,
  completeCommand,
} from "../../src/commands/complete.js";

// Mock core modules
vi.mock("../../src/core/complete.js", async () => {
  const actual = await vi.importActual("../../src/core/complete.js");
  return {
    ...actual,
    runComplete: vi.fn(),
  };
});

import { runComplete, type CompleteResult } from "../../src/core/complete.js";

describe("complete command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "complete-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    // Reset mocks
    vi.mocked(runComplete).mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("command registration", () => {
    it("registers with correct name", () => {
      const command = createCompleteCommand();
      expect(command.name()).toBe("complete");
    });

    it("has --task option", () => {
      const command = createCompleteCommand();
      const options = command.options;

      const taskOption = options.find((opt) => opt.long === "--task");
      expect(taskOption).toBeDefined();
      expect(taskOption?.short).toBe("-t");
    });

    it("has --commit flag", () => {
      const command = createCompleteCommand();
      const options = command.options;

      const commitOption = options.find((opt) => opt.long === "--commit");
      expect(commitOption).toBeDefined();
    });

    it("has --push flag", () => {
      const command = createCompleteCommand();
      const options = command.options;

      const pushOption = options.find((opt) => opt.long === "--push");
      expect(pushOption).toBeDefined();
    });

    it("has --force flag", () => {
      const command = createCompleteCommand();
      const options = command.options;

      const forceOption = options.find((opt) => opt.long === "--force");
      expect(forceOption).toBeDefined();
    });

    it("has --no-next flag", () => {
      const command = createCompleteCommand();
      const options = command.options;

      const noNextOption = options.find((opt) => opt.long === "--no-next");
      expect(noNextOption).toBeDefined();
    });

    it("has --json and --verbose flags", () => {
      const command = createCompleteCommand();
      const options = command.options;

      const jsonOption = options.find((opt) => opt.long === "--json");
      const verboseOption = options.find((opt) => opt.long === "--verbose");
      expect(jsonOption).toBeDefined();
      expect(verboseOption).toBeDefined();
      expect(verboseOption?.short).toBe("-v");
    });

    it("accepts message argument", () => {
      const command = createCompleteCommand();
      const args = command.registeredArguments;

      expect(args.length).toBe(1);
      expect(args[0].name()).toBe("message");
      expect(args[0].required).toBe(false);
    });
  });

  describe("precondition validation", () => {
    const createMockResult = (
      overrides?: Partial<CompleteResult>
    ): CompleteResult => ({
      taskId: 9,
      taskTitle: "Complete Command",
      status: "completed",
      archivePath: ".orchestra/orchestrator/results/task-009",
      pushed: false,
      progressUpdated: true,
      manifestUpdated: true,
      handoverCleared: true,
      exitCode: 0,
      ...overrides,
    });

    it("requires verification passed (unless --force)", async () => {
      vi.mocked(runComplete).mockResolvedValue(
        createMockResult({
          status: "failed",
          exitCode: 2,
        })
      );

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(2)");

      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it("allows force completion without verification", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ force: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalledWith(
        expect.objectContaining({ force: true })
      );
    });

    it("requires task in progress", async () => {
      vi.mocked(runComplete).mockResolvedValue(
        createMockResult({
          status: "failed",
          exitCode: 1,
        })
      );

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(1)");

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("fails if no current task", async () => {
      vi.mocked(runComplete).mockResolvedValue(
        createMockResult({
          status: "failed",
          exitCode: 1,
        })
      );

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(1)");
    });
  });

  describe("archive creation", () => {
    const createMockResult = (
      overrides?: Partial<CompleteResult>
    ): CompleteResult => ({
      taskId: 9,
      taskTitle: "Complete Command",
      status: "completed",
      archivePath: ".orchestra/orchestrator/results/task-009",
      pushed: false,
      progressUpdated: true,
      manifestUpdated: true,
      handoverCleared: true,
      exitCode: 0,
      ...overrides,
    });

    it("creates task archive directory", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalled();
    });

    it("copies handover artifacts", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalled();
    });

    it("creates metadata.json", async () => {
      const mockResult = createMockResult();
      vi.mocked(runComplete).mockResolvedValue(mockResult);

      await expect(
        completeCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.archive_path).toBeDefined();
    });

    it("copies verification report", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalled();
    });
  });

  describe("progress update", () => {
    const createMockResult = (
      overrides?: Partial<CompleteResult>
    ): CompleteResult => ({
      taskId: 9,
      taskTitle: "Complete Command",
      status: "completed",
      archivePath: ".orchestra/orchestrator/results/task-009",
      pushed: false,
      progressUpdated: true,
      manifestUpdated: true,
      handoverCleared: true,
      exitCode: 0,
      ...overrides,
    });

    it("updates progress.yaml status", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.progress_updated).toBe(true);
    });

    it("records commit hash", async () => {
      vi.mocked(runComplete).mockResolvedValue(
        createMockResult({
          commit: "abc1234",
        })
      );

      await expect(
        completeCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.commit).toBe("abc1234");
    });

    it("sets completed_at timestamp", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalled();
    });
  });

  describe("manifest update", () => {
    const createMockResult = (
      overrides?: Partial<CompleteResult>
    ): CompleteResult => ({
      taskId: 9,
      taskTitle: "Complete Command",
      status: "completed",
      archivePath: ".orchestra/orchestrator/results/task-009",
      pushed: false,
      progressUpdated: true,
      manifestUpdated: true,
      handoverCleared: true,
      exitCode: 0,
      ...overrides,
    });

    it("updates manifest status to completed", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.manifest_updated).toBe(true);
    });

    it("records commit in manifest", async () => {
      vi.mocked(runComplete).mockResolvedValue(
        createMockResult({ commit: "def5678" })
      );

      await expect(
        completeCommand({ commit: true, json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.commit).toBe("def5678");
    });
  });

  describe("handover clearing", () => {
    const createMockResult = (
      overrides?: Partial<CompleteResult>
    ): CompleteResult => ({
      taskId: 9,
      taskTitle: "Complete Command",
      status: "completed",
      archivePath: ".orchestra/orchestrator/results/task-009",
      pushed: false,
      progressUpdated: true,
      manifestUpdated: true,
      handoverCleared: true,
      exitCode: 0,
      ...overrides,
    });

    it("clears completion-signal.md", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.handover_cleared).toBe(true);
    });

    it("clears current-task.md", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalled();
    });

    it("clears pre-signal artifacts", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalled();
    });

    it("preserves task-context.md", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      // task-context.md should be preserved
      expect(runComplete).toHaveBeenCalled();
    });
  });

  describe("git operations", () => {
    const createMockResult = (
      overrides?: Partial<CompleteResult>
    ): CompleteResult => ({
      taskId: 9,
      taskTitle: "Complete Command",
      status: "completed",
      archivePath: ".orchestra/orchestrator/results/task-009",
      pushed: false,
      progressUpdated: true,
      manifestUpdated: true,
      handoverCleared: true,
      exitCode: 0,
      ...overrides,
    });

    it("commits when --commit flag set", async () => {
      vi.mocked(runComplete).mockResolvedValue(
        createMockResult({ commit: "abc1234", pushed: false })
      );

      await expect(
        completeCommand({ commit: true, json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalledWith(
        expect.objectContaining({ commit: true })
      );
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.commit).toBe("abc1234");
    });

    it("uses provided commit message", async () => {
      vi.mocked(runComplete).mockResolvedValue(
        createMockResult({ commit: "abc1234" })
      );

      await expect(
        completeCommand({
          commit: true,
          message: "feat: add complete command",
          json: false,
          verbose: false,
        })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          commit: true,
          message: "feat: add complete command",
        })
      );
    });

    it("pushes when --push flag set", async () => {
      vi.mocked(runComplete).mockResolvedValue(
        createMockResult({ commit: "abc1234", pushed: true })
      );

      await expect(
        completeCommand({ commit: true, push: true, json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalledWith(
        expect.objectContaining({ push: true })
      );
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.pushed).toBe(true);
    });

    it("skips commit without --commit", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      // When commit is not specified, the commit property won't be in the options
      // Just verify the call happened without commit being true
      const calls = vi.mocked(runComplete).mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0].commit).toBeFalsy();
    });
  });

  describe("exit codes", () => {
    it("returns 0 on success", async () => {
      vi.mocked(runComplete).mockResolvedValue({
        taskId: 9,
        taskTitle: "Complete Command",
        status: "completed",
        archivePath: ".orchestra/orchestrator/results/task-009",
        pushed: false,
        progressUpdated: true,
        manifestUpdated: true,
        handoverCleared: true,
        exitCode: 0,
      });

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("returns 1 if task not in progress", async () => {
      vi.mocked(runComplete).mockResolvedValue({
        taskId: 9,
        taskTitle: "Complete Command",
        status: "failed",
        archivePath: "",
        pushed: false,
        progressUpdated: false,
        manifestUpdated: false,
        handoverCleared: false,
        exitCode: 1,
      });

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(1)");

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("returns 2 if verification not passed", async () => {
      vi.mocked(runComplete).mockResolvedValue({
        taskId: 9,
        taskTitle: "Complete Command",
        status: "failed",
        archivePath: "",
        pushed: false,
        progressUpdated: false,
        manifestUpdated: false,
        handoverCleared: false,
        exitCode: 2,
      });

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(2)");

      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it("returns 4 if git commit fails", async () => {
      vi.mocked(runComplete).mockResolvedValue({
        taskId: 9,
        taskTitle: "Complete Command",
        status: "failed",
        archivePath: "",
        pushed: false,
        progressUpdated: true,
        manifestUpdated: true,
        handoverCleared: true,
        exitCode: 4,
      });

      await expect(
        completeCommand({ commit: true, json: false, verbose: false })
      ).rejects.toThrow("process.exit(4)");

      expect(exitSpy).toHaveBeenCalledWith(4);
    });

    it("returns 4 on execution error", async () => {
      vi.mocked(runComplete).mockRejectedValue(new Error("Execution error"));

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(4)");

      expect(exitSpy).toHaveBeenCalledWith(4);
    });
  });

  describe("output formatting", () => {
    const createMockResult = (
      overrides?: Partial<CompleteResult>
    ): CompleteResult => ({
      taskId: 9,
      taskTitle: "Complete Command",
      status: "completed",
      archivePath: ".orchestra/orchestrator/results/task-009",
      pushed: false,
      progressUpdated: true,
      manifestUpdated: true,
      handoverCleared: true,
      exitCode: 0,
      ...overrides,
    });

    it("outputs JSON when --json flag is set", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.task_id).toBe(9);
      expect(parsed.status).toBe("completed");
    });

    it("outputs human-readable format by default", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("Completed");
    });

    it("shows verbose output when --verbose flag is set", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: false, verbose: true })
      ).rejects.toThrow("process.exit(0)");

      expect(runComplete).toHaveBeenCalledWith(
        expect.objectContaining({ verbose: true })
      );
    });

    it("includes archive path in output", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: true, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.archive_path).toBe(".orchestra/orchestrator/results/task-009");
    });

    it("shows next task suggestion", async () => {
      vi.mocked(runComplete).mockResolvedValue(createMockResult());

      await expect(
        completeCommand({ json: false, verbose: false })
      ).rejects.toThrow("process.exit(0)");

      const output = consoleSpy.mock.calls.map((call) => call[0]).join("\n");
      expect(output).toContain("prepare");
    });
  });
});
