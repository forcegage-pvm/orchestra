/**
 * Signal Creation Tests (Implementor)
 *
 * TDD: Tests for `orchestra signal` command core logic.
 * Bible Section 8.3: signal-complete
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as yaml from "yaml";

let testTempDir: string;
let mockManifestData: any;
let mockProgressData: any;

// Mock config module
vi.mock("../../src/core/config.js", () => ({
  requireOrchestraRoot: vi.fn(() => testTempDir),
  loadConfig: vi.fn(() => ({
    version: "1.0",
    paths: {
      manifest: "manifest.yaml",
      handovers: "implementor/handovers",
      signals: "implementor/signals",
      feedback: "implementor/feedback",
      artifacts: "artifacts",
      templates: "common/templates",
    },
  })),
  getResolvedPaths: vi.fn((root: string) => ({
    orchestraDir: path.join(root, ".orchestra"),
    manifest: path.join(root, ".orchestra", "manifest.yaml"),
    handovers: path.join(root, ".orchestra", "implementor", "handovers"),
    signals: path.join(root, ".orchestra", "implementor", "signals"),
    progress: path.join(root, ".orchestra", "progress.yaml"),
  })),
}));

// Mock manifest module
vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => mockManifestData),
  getTask: vi.fn((manifest: any, taskId: number) => {
    return manifest.tasks.find((t: any) => t.id === taskId);
  }),
}));

// Mock progress module
vi.mock("../../src/core/progress.js", () => ({
  loadProgress: vi.fn(() => mockProgressData),
}));

// Mock git module (for auto-detect)
vi.mock("../../src/core/git.js", () => ({
  getGitStatus: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        untracked: ["src/new-file.ts"],
        staged: [],
        unstaged: ["src/modified-file.ts"],
      },
    })
  ),
}));

import { runSignal, type SignalOptions } from "../../src/core/signal.js";

describe("Signal Creation (Implementor)", () => {
  let tempDir: string;
  let orchestraRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-create-test-"));
    testTempDir = tempDir;
    orchestraRoot = path.join(tempDir, ".orchestra");

    // Create directory structure
    fs.mkdirSync(path.join(orchestraRoot, "implementor", "handovers"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(orchestraRoot, "implementor", "signals"), {
      recursive: true,
    });

    // Create handover file (current-task.md)
    fs.writeFileSync(
      path.join(orchestraRoot, "implementor", "handovers", "current-task.md"),
      "# Task 1: Test Task\n\nImplement feature X."
    );

    // Default mock data
    mockManifestData = {
      success: true,
      message: "Loaded",
      data: {
        version: "1.0.0",
        sprint: {
          id: "test-sprint",
          name: "Test Sprint",
          status: "in_progress",
        },
        tasks: [
          {
            id: 1,
            title: "Test Task",
            status: "in_progress",
            category: "CORE",
          },
        ],
      },
    };

    mockProgressData = {
      sprint_id: "test-sprint",
      entries: [
        {
          task_id: 1,
          status: "IMPLEMENT",
          timestamp: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("Basic Signal Creation", () => {
    it("should create signal file with required summary", async () => {
      const options: SignalOptions = {
        summary: "Implemented feature X with tests",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(1);
      expect(result.summary).toBe("Implemented feature X with tests");
      expect(result.signalPath).toContain("task-1-signal.yaml");
      expect(result.nextStep).toBe("Orchestrator runs accept-signal");
    });

    it("should fail when summary is missing", async () => {
      const options: SignalOptions = {
        summary: "",
        orchestraRoot: tempDir,
      };

      await expect(runSignal(options)).rejects.toThrow("--summary is required");
    });

    it("should create signal file with correct YAML structure", async () => {
      const options: SignalOptions = {
        summary: "Test summary",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      // Read and parse the signal file
      const signalContent = fs.readFileSync(result.signalPath, "utf-8");
      const signalData = yaml.parse(signalContent);

      expect(signalData.version).toBe("1.0");
      expect(signalData.task_id).toBe(1);
      expect(signalData.summary).toBe("Test summary");
      expect(signalData.signaled_at).toBeDefined();
      expect(signalData.artifacts).toBeDefined();
    });
  });

  describe("Task Validation", () => {
    it("should use explicit task ID when provided", async () => {
      mockManifestData.data.tasks.push({
        id: 2,
        title: "Task 2",
        status: "IMPLEMENT",
        category: "CORE",
      });
      mockProgressData.entries.push({
        task_id: 2,
        status: "IMPLEMENT",
        timestamp: new Date().toISOString(),
      });

      const options: SignalOptions = {
        task: "2",
        summary: "Task 2 complete",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      expect(result.taskId).toBe(2);
      expect(result.signalPath).toContain("task-2-signal.yaml");
    });

    it("should fail when task is not in_progress", async () => {
      mockManifestData.data.tasks[0].status = "PENDING";
      mockProgressData.entries[0].status = "PENDING";

      const options: SignalOptions = {
        summary: "Complete",
        orchestraRoot: tempDir,
      };

      await expect(runSignal(options)).rejects.toThrow("not in progress");
    });

    it("should fail when task does not exist", async () => {
      const options: SignalOptions = {
        task: "999",
        summary: "Complete",
        orchestraRoot: tempDir,
      };

      await expect(runSignal(options)).rejects.toThrow("Task 999 not found");
    });

    it("should fail when no current task and no task specified", async () => {
      // Clear entries so no task can be inferred
      mockProgressData.entries = [];
      // Also remove current_task_id from manifest
      mockManifestData.data.current_task_id = undefined;

      const options: SignalOptions = {
        summary: "Complete",
        orchestraRoot: tempDir,
      };

      await expect(runSignal(options)).rejects.toThrow("No task specified");
    });
  });

  describe("Handover Validation", () => {
    it("should fail when no handover exists", async () => {
      // Remove handover file
      fs.unlinkSync(
        path.join(orchestraRoot, "implementor", "handovers", "current-task.md")
      );

      const options: SignalOptions = {
        summary: "Complete",
        orchestraRoot: tempDir,
      };

      await expect(runSignal(options)).rejects.toThrow("No handover found");
    });
  });

  describe("Artifact Detection", () => {
    it("should auto-detect files from git when not specified", async () => {
      const options: SignalOptions = {
        summary: "Auto-detect test",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      expect(result.artifacts.created).toContain("src/new-file.ts");
      expect(result.artifacts.modified).toContain("src/modified-file.ts");
    });

    it("should use explicit files when provided", async () => {
      const options: SignalOptions = {
        summary: "Explicit files",
        files: ["src/custom.ts", "src/other.ts"],
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      expect(result.artifacts.modified).toContain("src/custom.ts");
      expect(result.artifacts.modified).toContain("src/other.ts");
    });

    it("should include test files when specified", async () => {
      const options: SignalOptions = {
        summary: "With tests",
        tests: ["test/unit.test.ts"],
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      // Read signal file to verify tests are recorded
      const signalContent = fs.readFileSync(result.signalPath, "utf-8");
      const signalData = yaml.parse(signalContent);

      expect(signalData.tests).toContain("test/unit.test.ts");
    });
  });

  describe("Optional Fields", () => {
    it("should include notes when provided", async () => {
      const options: SignalOptions = {
        summary: "With notes",
        notes: "Had to refactor the API slightly",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      const signalContent = fs.readFileSync(result.signalPath, "utf-8");
      const signalData = yaml.parse(signalContent);

      expect(signalData.notes).toBe("Had to refactor the API slightly");
    });

    it("should set notes to null when not provided", async () => {
      const options: SignalOptions = {
        summary: "No notes",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      const signalContent = fs.readFileSync(result.signalPath, "utf-8");
      const signalData = yaml.parse(signalContent);

      expect(signalData.notes).toBeNull();
    });
  });

  describe("Signal File Location", () => {
    it("should create signal in correct directory", async () => {
      const options: SignalOptions = {
        summary: "Location test",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      expect(result.signalPath).toBe(
        path.join(orchestraRoot, "implementor", "signals", "task-1-signal.yaml")
      );
      expect(fs.existsSync(result.signalPath)).toBe(true);
    });

    it("should create signals directory if it does not exist", async () => {
      // Remove signals directory
      fs.rmSync(path.join(orchestraRoot, "implementor", "signals"), {
        recursive: true,
      });

      const options: SignalOptions = {
        summary: "Dir creation test",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      expect(fs.existsSync(result.signalPath)).toBe(true);
    });
  });

  describe("Timestamp", () => {
    it("should include ISO timestamp in result", async () => {
      const options: SignalOptions = {
        summary: "Timestamp test",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      expect(result.signaledAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should include timestamp in signal file", async () => {
      const options: SignalOptions = {
        summary: "Timestamp file test",
        orchestraRoot: tempDir,
      };

      const result = await runSignal(options);

      const signalContent = fs.readFileSync(result.signalPath, "utf-8");
      const signalData = yaml.parse(signalContent);

      expect(signalData.signaled_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });
  });
});
