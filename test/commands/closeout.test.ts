/**
 * Closeout Command Tests
 *
 * Tests for the orchestra closeout command.
 * TDD approach: tests written first, implementation follows.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeoutCommand,
  createCloseoutCommand,
  type CloseoutOptions,
} from "../../src/commands/closeout.js";
import { attemptAutoFix, runCloseoutChecks } from "../../src/core/closeout.js";
import type { Manifest, ProgressLog } from "../../src/core/types.js";

// Mock simple-git at module level
vi.mock("simple-git", () => {
  const mockGit = {
    status: vi.fn(),
    add: vi.fn(),
    commit: vi.fn(),
    log: vi.fn(),
    revparse: vi.fn(),
  };
  return {
    simpleGit: vi.fn(() => mockGit),
    default: vi.fn(() => mockGit),
  };
});

describe("closeout command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let mockGit: {
    status: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    revparse: ReturnType<typeof vi.fn>;
  };

  // Test manifest with completed previous task
  function createTestManifest(): Manifest {
    return {
      version: "1.0.0",
      sprint: {
        id: "TEST-001",
        name: "Test Sprint",
        status: "ACTIVE",
        created_at: "2025-12-02T00:00:00Z",
      },
      tasks: [
        {
          id: 1,
          title: "Task 1",
          description: "First task",
          status: "COMPLETE",
          dependencies: [],
          retry_count: 0,
          max_retries: 3,
          completed_at: "2025-12-02T01:00:00Z",
        },
        {
          id: 2,
          title: "Task 2",
          description: "Current task",
          status: "IMPLEMENT",
          dependencies: [1],
          retry_count: 0,
          max_retries: 3,
          started_at: "2025-12-02T02:00:00Z",
        },
      ],
      current_task_id: 2,
    };
  }

  // Test progress log with completed previous task
  function createTestProgress(): ProgressLog {
    return {
      sprint_id: "TEST-001",
      entries: [
        {
          task_id: 1,
          status: "COMPLETE",
          timestamp: "2025-12-02T01:00:00Z",
        },
      ],
      created_at: "2025-12-02T00:00:00Z",
      updated_at: "2025-12-02T01:00:00Z",
    };
  }

  // Helper to create orchestra directory structure
  function setupOrchestra(
    manifest: Manifest,
    options?: {
      withProgress?: boolean;
      withResults?: boolean;
      withSignal?: boolean | string;
      task1CompletedCommit?: string;
    }
  ): void {
    const orchestraDir = path.join(tempDir, ".orchestra");
    fs.mkdirSync(orchestraDir, { recursive: true });

    // Create orchestra.yaml config
    fs.writeFileSync(
      path.join(orchestraDir, "orchestra.yaml"),
      `version: "1.0"
paths:
  manifest: manifest.yaml
`
    );

    // Create manifest.yaml
    const yaml = require("yaml");
    fs.writeFileSync(
      path.join(orchestraDir, "manifest.yaml"),
      yaml.stringify(manifest)
    );

    // Create progress.yaml if requested
    if (options?.withProgress !== false) {
      const progressData: Record<string, unknown> = {
        sprint_id: manifest.sprint.id,
        current_task: 2,
        tasks: {
          1: {
            id: 1,
            status: "completed",
            started_at: "2025-12-02T00:00:00Z",
            completed_at: "2025-12-02T01:00:00Z",
          },
        },
        created_at: "2025-12-02T00:00:00Z",
        updated_at: "2025-12-02T01:00:00Z",
      };

      if (options?.task1CompletedCommit) {
        (progressData.tasks as Record<string, unknown>)[1] = {
          ...(progressData.tasks as Record<string, Record<string, unknown>>)[1],
          completed_commit: options.task1CompletedCommit,
        };
      }

      fs.writeFileSync(
        path.join(orchestraDir, "progress.yaml"),
        yaml.stringify(progressData)
      );
    }

    // Create results file if requested
    if (options?.withResults) {
      const resultsDir = path.join(orchestraDir, "orchestrator", "results");
      fs.mkdirSync(resultsDir, { recursive: true });
      fs.writeFileSync(
        path.join(resultsDir, "task-001-result.yaml"),
        yaml.stringify({ task_id: 1, result: "PASSED" })
      );
    }

    // Create handover directory for completion signal
    const handoverDir = path.join(orchestraDir, "handover");
    fs.mkdirSync(handoverDir, { recursive: true });

    // Create completion signal if requested
    if (options?.withSignal === true) {
      // Signal with content (should fail C5)
      fs.writeFileSync(
        path.join(handoverDir, "completion-signal.md"),
        `# Completion Signal

## Task ID
1

## Status
COMPLETE

## Summary
Previous task completed.
`
      );
    } else if (typeof options?.withSignal === "string") {
      fs.writeFileSync(
        path.join(handoverDir, "completion-signal.md"),
        options.withSignal
      );
    }
  }

  beforeEach(async () => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeout-test-"));

    // Spy on console and process.exit
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    // Get mock git instance
    const { simpleGit } = await import("simple-git");
    mockGit = (
      simpleGit as unknown as ReturnType<typeof vi.fn>
    )() as typeof mockGit;

    // Default to clean git status
    mockGit.status.mockResolvedValue({
      files: [],
      isClean: () => true,
      staged: [],
      modified: [],
      not_added: [],
      current: "main",
      tracking: "origin/main",
      ahead: 0,
      behind: 0,
    });

    mockGit.log.mockResolvedValue({
      latest: { hash: "abc1234def5678" },
      all: [{ hash: "abc1234def5678" }],
    });

    mockGit.add.mockResolvedValue({});
    mockGit.commit.mockResolvedValue({ commit: "abc1234" });
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Restore mocks
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Test 1: Command definition
  // =========================================================================
  describe("command definition", () => {
    it("should have correct name and description", () => {
      const cmd = createCloseoutCommand();
      expect(cmd.name()).toBe("closeout");
      expect(cmd.description()).toContain("previous task");
    });

    it("should have --task option", () => {
      const cmd = createCloseoutCommand();
      const taskOpt = cmd.options.find((o) => o.long === "--task");
      expect(taskOpt).toBeDefined();
    });

    it("should have --fix option", () => {
      const cmd = createCloseoutCommand();
      const fixOpt = cmd.options.find((o) => o.long === "--fix");
      expect(fixOpt).toBeDefined();
    });

    it("should have --force option", () => {
      const cmd = createCloseoutCommand();
      const forceOpt = cmd.options.find((o) => o.long === "--force");
      expect(forceOpt).toBeDefined();
    });

    it("should have --json option", () => {
      const cmd = createCloseoutCommand();
      const jsonOpt = cmd.options.find((o) => o.long === "--json");
      expect(jsonOpt).toBeDefined();
    });

    it("should have --verbose option", () => {
      const cmd = createCloseoutCommand();
      const verboseOpt = cmd.options.find((o) => o.long === "--verbose");
      expect(verboseOpt).toBeDefined();
    });
  });

  // =========================================================================
  // Test 2-4: Check C1 - Uncommitted changes
  // =========================================================================
  describe("check C1: uncommitted changes", () => {
    it("should pass when git is clean", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      mockGit.status.mockResolvedValue({
        files: [],
        isClean: () => true,
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c1 = report.checks.find((c) => c.id === "C1");

      expect(c1).toBeDefined();
      expect(c1!.passed).toBe(true);
    });

    it("should fail when uncommitted files exist", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      mockGit.status.mockResolvedValue({
        files: [
          { path: "src/test.ts", working_dir: "M" },
          { path: "README.md", working_dir: "M" },
        ],
        isClean: () => false,
        staged: [],
        modified: ["src/test.ts", "README.md"],
        not_added: [],
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c1 = report.checks.find((c) => c.id === "C1");

      expect(c1).toBeDefined();
      expect(c1!.passed).toBe(false);
      expect(c1!.actual).toContain("uncommitted");
    });

    it("should auto-fix with --fix flag by committing changes", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      // First call returns dirty, second call (after fix) returns clean
      mockGit.status
        .mockResolvedValueOnce({
          files: [{ path: "src/test.ts", working_dir: "M" }],
          isClean: () => false,
          modified: ["src/test.ts"],
        })
        .mockResolvedValueOnce({
          files: [],
          isClean: () => true,
        });

      const report = await runCloseoutChecks(tempDir, 1);
      expect(report.checks.find((c) => c.id === "C1")?.passed).toBe(false);

      const fixedReport = await attemptAutoFix(tempDir, report);
      const c1 = fixedReport.checks.find((c) => c.id === "C1");

      expect(mockGit.add).toHaveBeenCalledWith("-A");
      expect(mockGit.commit).toHaveBeenCalled();
      expect(c1!.passed).toBe(true);
    });
  });

  // =========================================================================
  // Test 5-6: Check C2 - Previous task status
  // =========================================================================
  describe("check C2: previous task status", () => {
    it("should pass when previous task status is completed", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c2 = report.checks.find((c) => c.id === "C2");

      expect(c2).toBeDefined();
      expect(c2!.passed).toBe(true);
    });

    it("should fail when previous task status is not completed", async () => {
      const manifest = createTestManifest();
      manifest.tasks[0].status = "IMPLEMENT";
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      // Update progress to show in-progress
      const yaml = require("yaml");
      const progressPath = path.join(tempDir, ".orchestra", "progress.yaml");
      const progressData = {
        sprint_id: "TEST-001",
        current_task: 2,
        tasks: {
          1: {
            id: 1,
            status: "in-progress",
            started_at: "2025-12-02T00:00:00Z",
          },
        },
      };
      fs.writeFileSync(progressPath, yaml.stringify(progressData));

      const report = await runCloseoutChecks(tempDir, 1);
      const c2 = report.checks.find((c) => c.id === "C2");

      expect(c2).toBeDefined();
      expect(c2!.passed).toBe(false);
      expect(c2!.actual).not.toBe("completed");
    });
  });

  // =========================================================================
  // Test 7-8: Check C3 - Commit hash recorded
  // =========================================================================
  describe("check C3: commit hash recorded", () => {
    it("should pass when commit hash is present", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234def5678",
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c3 = report.checks.find((c) => c.id === "C3");

      expect(c3).toBeDefined();
      expect(c3!.passed).toBe(true);
    });

    it("should fail when commit hash is missing", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        // No task1CompletedCommit
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c3 = report.checks.find((c) => c.id === "C3");

      expect(c3).toBeDefined();
      expect(c3!.passed).toBe(false);
      expect(c3!.actual).toContain("No commit hash");
    });
  });

  // =========================================================================
  // Test 9-11: Check C4 - SpecKit tasks
  // =========================================================================
  describe("check C4: SpecKit tasks", () => {
    it("should pass when SpecKit tasks are checked", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      // Create tasks.md with checked task
      const orchestratorDir = path.join(
        tempDir,
        ".orchestra",
        "orchestrator",
        ".orchestrator-only"
      );
      fs.mkdirSync(orchestratorDir, { recursive: true });
      fs.writeFileSync(
        path.join(orchestratorDir, "tasks.md"),
        "- [x] Task 1.1: Core setup\n- [x] Task 1.2: Testing\n"
      );

      // Add speckit_task_ref to manifest task
      const yaml = require("yaml");
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifestData = yaml.parse(fs.readFileSync(manifestPath, "utf-8"));
      manifestData.tasks[0].speckit_task_ref = ["1.1", "1.2"];
      fs.writeFileSync(manifestPath, yaml.stringify(manifestData));

      const report = await runCloseoutChecks(tempDir, 1);
      const c4 = report.checks.find((c) => c.id === "C4");

      expect(c4).toBeDefined();
      expect(c4!.passed).toBe(true);
    });

    it("should fail when SpecKit tasks are unchecked", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      // Create tasks.md with unchecked task
      const orchestratorDir = path.join(
        tempDir,
        ".orchestra",
        "orchestrator",
        ".orchestrator-only"
      );
      fs.mkdirSync(orchestratorDir, { recursive: true });
      fs.writeFileSync(
        path.join(orchestratorDir, "tasks.md"),
        "- [ ] Task 1.1: Core setup\n- [x] Task 1.2: Testing\n"
      );

      // Add speckit_task_ref to manifest task
      const yaml = require("yaml");
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifestData = yaml.parse(fs.readFileSync(manifestPath, "utf-8"));
      manifestData.tasks[0].speckit_task_ref = ["1.1", "1.2"];
      fs.writeFileSync(manifestPath, yaml.stringify(manifestData));

      const report = await runCloseoutChecks(tempDir, 1);
      const c4 = report.checks.find((c) => c.id === "C4");

      expect(c4).toBeDefined();
      expect(c4!.passed).toBe(false);
    });

    it("should skip check when no speckit_task_ref", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c4 = report.checks.find((c) => c.id === "C4");

      expect(c4).toBeDefined();
      expect(c4!.passed).toBe(true);
      expect(c4!.actual).toContain("No SpecKit refs");
    });
  });

  // =========================================================================
  // Test 12-14: Check C5 - Completion signal cleared
  // =========================================================================
  describe("check C5: completion signal cleared", () => {
    it("should pass when signal file does not exist", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
        withSignal: false,
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c5 = report.checks.find((c) => c.id === "C5");

      expect(c5).toBeDefined();
      expect(c5!.passed).toBe(true);
    });

    it("should fail when signal has content", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
        withSignal: true, // Signal with content
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c5 = report.checks.find((c) => c.id === "C5");

      expect(c5).toBeDefined();
      expect(c5!.passed).toBe(false);
    });

    it("should auto-fix with --fix flag by deleting signal file", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
        withSignal: true,
      });

      const signalPath = path.join(
        tempDir,
        ".orchestra",
        "handover",
        "completion-signal.md"
      );
      expect(fs.existsSync(signalPath)).toBe(true);

      const report = await runCloseoutChecks(tempDir, 1);
      expect(report.checks.find((c) => c.id === "C5")?.passed).toBe(false);

      const fixedReport = await attemptAutoFix(tempDir, report);
      const c5 = fixedReport.checks.find((c) => c.id === "C5");

      expect(c5!.passed).toBe(true);
      expect(fs.existsSync(signalPath)).toBe(false);
    });
  });

  // =========================================================================
  // Test 15-16: Check C6 - Results file exists
  // =========================================================================
  describe("check C6: results file exists", () => {
    it("should pass when results file exists", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c6 = report.checks.find((c) => c.id === "C6");

      expect(c6).toBeDefined();
      expect(c6!.passed).toBe(true);
    });

    it("should fail when results file is missing", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: false, // No results file
        task1CompletedCommit: "abc1234",
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c6 = report.checks.find((c) => c.id === "C6");

      expect(c6).toBeDefined();
      expect(c6!.passed).toBe(false);
      expect(c6!.actual).toContain("Not found");
    });
  });

  // =========================================================================
  // Test 17: First task handling
  // =========================================================================
  describe("first task handling", () => {
    it("should pass with N/A for checks when no previous task", async () => {
      const manifest = createTestManifest();
      manifest.tasks = [manifest.tasks[0]]; // Only one task
      manifest.current_task_id = 1;
      setupOrchestra(manifest, {
        withProgress: false,
      });

      // Remove progress file to simulate first task
      const progressPath = path.join(tempDir, ".orchestra", "progress.yaml");
      if (fs.existsSync(progressPath)) {
        fs.unlinkSync(progressPath);
      }

      const report = await runCloseoutChecks(tempDir, null);

      // C1 and C5 should still run
      const c1 = report.checks.find((c) => c.id === "C1");
      const c5 = report.checks.find((c) => c.id === "C5");
      expect(c1!.passed).toBe(true);
      expect(c5!.passed).toBe(true);

      // C2, C3, C4, C6 should be N/A (skipped)
      expect(report.checks.some((c) => c.id === "C2")).toBe(false);
      expect(report.checks.some((c) => c.id === "C3")).toBe(false);
      expect(report.checks.some((c) => c.id === "C4")).toBe(false);
      expect(report.checks.some((c) => c.id === "C6")).toBe(false);
    });
  });

  // =========================================================================
  // Test 18: --force flag
  // =========================================================================
  describe("--force flag", () => {
    it("should skip all checks with --force", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: false, // Would normally fail C6
        withSignal: true, // Would normally fail C5
      });

      // Mock dirty git
      mockGit.status.mockResolvedValue({
        files: [{ path: "src/test.ts", working_dir: "M" }],
        isClean: () => false,
      });

      const options: CloseoutOptions = {
        force: true,
        orchestraRoot: tempDir,
      };

      // Should not throw even with failures
      await closeoutCommand(options);

      // Should have logged warning about force
      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output.toLowerCase()).toContain("force");
    });
  });

  // =========================================================================
  // Test 19: --json output
  // =========================================================================
  describe("--json output", () => {
    it("should output valid JSON structure", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      const options: CloseoutOptions = {
        json: true,
        orchestraRoot: tempDir,
      };

      await closeoutCommand(options);

      const output = consoleSpy.mock.calls[0]?.[0];
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("task_id");
      expect(parsed).toHaveProperty("timestamp");
      expect(parsed).toHaveProperty("overall");
      expect(parsed).toHaveProperty("checks");
      expect(parsed).toHaveProperty("can_proceed");
      expect(Array.isArray(parsed.checks)).toBe(true);
    });
  });

  // =========================================================================
  // Test 20: --verbose output
  // =========================================================================
  describe("--verbose output", () => {
    it("should show detailed check results", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      const options: CloseoutOptions = {
        verbose: true,
        orchestraRoot: tempDir,
      };

      await closeoutCommand(options);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      // Should show expected/actual for each check
      expect(output).toContain("Expected");
      expect(output).toContain("Actual");
    });
  });

  // =========================================================================
  // Test 21-22: Exit codes
  // =========================================================================
  describe("exit codes", () => {
    it("should exit with code 0 when all pass", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      const options: CloseoutOptions = {
        orchestraRoot: tempDir,
      };

      // Should complete without throwing (exit 0)
      await closeoutCommand(options);
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("should exit with code 1 when any fail", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: false, // Will fail C6
        task1CompletedCommit: "abc1234",
      });

      const options: CloseoutOptions = {
        orchestraRoot: tempDir,
      };

      await expect(closeoutCommand(options)).rejects.toThrow("process.exit(1)");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  // =========================================================================
  // Additional edge case tests
  // =========================================================================
  describe("edge cases", () => {
    it("should handle signal file that is empty template", async () => {
      const manifest = createTestManifest();
      const templateContent = `<!-- Implementor: Fill this out when signaling completion -->
# Completion Signal

## Task ID

## Status

## Summary

`;
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
        withSignal: templateContent,
      });

      const report = await runCloseoutChecks(tempDir, 1);
      const c5 = report.checks.find((c) => c.id === "C5");

      // Empty template should pass
      expect(c5!.passed).toBe(true);
    });

    it("should handle --task option to specify task ID", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest, {
        withResults: true,
        task1CompletedCommit: "abc1234",
      });

      const options: CloseoutOptions = {
        task: 1,
        orchestraRoot: tempDir,
      };

      await closeoutCommand(options);

      // Should check task 1 specifically
      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("1");
    });
  });
});
