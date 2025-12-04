/**
 * Unit tests for escalate core function
 * TDD: Tests written first before implementation
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testTempDir: string;
let mockManifestData: any;

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
    verification: {
      maxAttempts: 3,
    },
  })),
  getResolvedPaths: vi.fn((root: string) => ({
    orchestraDir: path.join(root, ".orchestra"),
    manifest: path.join(root, ".orchestra", "manifest.yaml"),
    handovers: path.join(root, ".orchestra", "implementor", "handovers"),
    signals: path.join(root, ".orchestra", "implementor", "signals"),
    feedback: path.join(root, ".orchestra", "implementor", "feedback"),
    artifacts: path.join(root, ".orchestra", "artifacts"),
    progress: path.join(root, ".orchestra", "progress.yaml"),
    templates: path.join(root, ".orchestra", "common", "templates"),
  })),
}));

// Mock manifest module
vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => mockManifestData),
  getTask: vi.fn((manifest: any, taskId: number) => {
    return manifest.tasks.find((t: any) => t.id === taskId);
  }),
}));

import { runEscalate } from "../../src/core/escalate.js";

describe("Escalate Core Logic", () => {
  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-escalate-"));

    // Create directories
    fs.mkdirSync(path.join(testTempDir, ".orchestra/artifacts"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(testTempDir, ".orchestra/implementor/feedback"), {
      recursive: true,
    });

    // Reset mock data
    mockManifestData = {
      success: true,
      data: {
        sprint: { id: "sprint-001", title: "Test Sprint" },
        current_task_id: 1,
        tasks: [
          {
            id: 1,
            title: "Task 1",
            status: "IN_PROGRESS",
            description: "Test description",
          },
        ],
      },
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  });

  describe("runEscalate", () => {
    it("should throw if reason is not provided", async () => {
      await expect(
        runEscalate({ orchestraRoot: testTempDir } as any)
      ).rejects.toThrow(/reason.*required/i);
    });

    it("should throw if task is not found", async () => {
      mockManifestData.data.tasks = [];

      await expect(
        runEscalate({
          task: "999",
          reason: "Test reason",
          orchestraRoot: testTempDir,
        })
      ).rejects.toThrow(/task.*not found|invalid task/i);
    });

    it("should throw if task is already complete", async () => {
      mockManifestData.data.tasks = [
        { id: 1, title: "Task 1", status: "COMPLETE" },
      ];

      await expect(
        runEscalate({
          task: "1",
          reason: "Test reason",
          orchestraRoot: testTempDir,
        })
      ).rejects.toThrow(/already complete/i);
    });

    it("should handle already-escalated task gracefully", async () => {
      mockManifestData.data.tasks = [
        { id: 1, title: "Task 1", status: "ESCALATED" },
      ];

      const result = await runEscalate({
        task: "1",
        reason: "Test reason",
        orchestraRoot: testTempDir,
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe("ESCALATED");
      expect(result.previousStatus).toBe("ESCALATED");
    });

    it("should update status to ESCALATED", async () => {
      const result = await runEscalate({
        task: "1",
        reason: "Persistent test failures",
        orchestraRoot: testTempDir,
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(1);
      expect(result.previousStatus).toBe("IN_PROGRESS");
      expect(result.newStatus).toBe("ESCALATED");
      expect(result.reason).toBe("Persistent test failures");
    });

    it("should generate escalation report file", async () => {
      const result = await runEscalate({
        task: "1",
        reason: "Cannot resolve issue",
        orchestraRoot: testTempDir,
      });

      expect(result.reportPath).toContain("escalation-report.md");
      expect(fs.existsSync(result.reportPath)).toBe(true);

      const reportContent = fs.readFileSync(result.reportPath, "utf-8");
      expect(reportContent).toContain("Escalation Report");
      expect(reportContent).toContain("Task 1");
      expect(reportContent).toContain("Cannot resolve issue");
    });

    it("should compile attempt history from feedback files", async () => {
      // Create feedback files for task 1
      const feedbackPath = path.join(
        testTempDir,
        ".orchestra/implementor/feedback"
      );
      fs.writeFileSync(
        path.join(feedbackPath, "task-1-attempt-1.md"),
        "# Feedback\n\n**Problem**: Test file not found\n"
      );
      fs.writeFileSync(
        path.join(feedbackPath, "task-1-attempt-2.md"),
        "# Feedback\n\n**Problem**: Wrong export format\n"
      );

      const result = await runEscalate({
        task: "1",
        reason: "Max attempts exceeded",
        orchestraRoot: testTempDir,
      });

      expect(result.attemptHistory.length).toBe(2);
      expect(result.attemptHistory[0].attempt).toBe(1);
      expect(result.attemptHistory[0].issue).toContain("Test file not found");
      expect(result.attemptHistory[1].attempt).toBe(2);
      expect(result.attemptHistory[1].issue).toContain("Wrong export format");
    });

    it("should include context in result and report", async () => {
      const result = await runEscalate({
        task: "1",
        reason: "Cannot fix bug",
        context: "External API is returning unexpected 500 errors",
        orchestraRoot: testTempDir,
      });

      expect(result.context).toBe(
        "External API is returning unexpected 500 errors"
      );

      const reportContent = fs.readFileSync(result.reportPath, "utf-8");
      expect(reportContent).toContain(
        "External API is returning unexpected 500 errors"
      );
    });

    it("should include human options in result", async () => {
      const result = await runEscalate({
        task: "1",
        reason: "Need help",
        orchestraRoot: testTempDir,
      });

      expect(result.humanOptions).toContain("fix_manually");
      expect(result.humanOptions).toContain("modify_spec");
      expect(result.humanOptions).toContain("skip_task");
      expect(result.humanOptions).toContain("abort_sprint");
    });

    it("should use current task from manifest if task not specified", async () => {
      mockManifestData.data.current_task_id = 2;
      mockManifestData.data.tasks = [
        { id: 1, title: "Task 1", status: "COMPLETE" },
        { id: 2, title: "Task 2", status: "IN_PROGRESS" },
      ];

      const result = await runEscalate({
        reason: "Need help with task 2",
        orchestraRoot: testTempDir,
      });

      expect(result.taskId).toBe(2);
      expect(result.success).toBe(true);
    });

    it("should include escalatedAt timestamp", async () => {
      const before = new Date().toISOString();
      const result = await runEscalate({
        task: "1",
        reason: "Test",
        orchestraRoot: testTempDir,
      });
      const after = new Date().toISOString();

      expect(result.escalatedAt).toBeDefined();
      expect(result.escalatedAt >= before).toBe(true);
      expect(result.escalatedAt <= after).toBe(true);
    });
  });
});
