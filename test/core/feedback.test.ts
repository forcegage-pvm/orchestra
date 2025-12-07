/**
 * Feedback Generation Tests
 *
 * TDD: Tests for `orchestra feedback` core logic.
 * Bible Section 8.5: generate-feedback
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Mock progress module
vi.mock("../../src/core/progress.js", () => ({
  loadProgress: vi.fn(() => mockProgressData),
  addProgressEntry: vi.fn((progress, entry) => {
    // Actually mutate mockProgressData so subsequent calls see the entry
    const newEntry = { ...entry, timestamp: new Date().toISOString() };
    mockProgressData.entries.push(newEntry);
    return mockProgressData;
  }),
  saveProgress: vi.fn(),
}));

// Mock templates module
vi.mock("../../src/core/templates.js", () => ({
  renderTemplate: vi.fn(
    (templateName: string, context: any) =>
      `# Feedback: Task ${context.taskId} - Attempt ${context.attempt}\n\n` +
      `Issues: ${context.issues?.length || 0}\n` +
      `Can Retry: ${context.canRetry}\n`
  ),
}));

import { runFeedback, type FeedbackOptions } from "../../src/core/feedback.js";
import type { VerifyResult } from "../../src/core/verification.js";

describe("Feedback Generation (Orchestrator)", () => {
  let tempDir: string;
  let orchestraRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-test-"));
    testTempDir = tempDir;
    orchestraRoot = path.join(tempDir, ".orchestra");

    // Create directory structure
    fs.mkdirSync(path.join(orchestraRoot, "implementor", "feedback"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(orchestraRoot, "artifacts"), {
      recursive: true,
    });

    // Default mock data
    mockManifestData = {
      success: true,
      message: "Loaded",
      data: {
        version: "1.0.0",
        sprint: {
          id: "test-sprint",
          name: "Test Sprint",
          status: "ACTIVE",
        },
        tasks: [
          {
            id: 1,
            title: "Test Task",
            status: "IMPLEMENT",
            category: "CORE",
            retry_count: 0,
            max_retries: 3,
          },
        ],
        current_task_id: 1,
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

  describe("Basic Feedback Generation", () => {
    it("should generate feedback file from verification results", async () => {
      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 2, passed: 1, failed: 1, skipped: 0 },
          results: [
            {
              checkId: "check-1",
              type: "file_exists",
              description: "File should exist",
              severity: "critical",
              passed: true,
              message: "File exists",
              duration: 100,
            },
            {
              checkId: "check-2",
              type: "pattern_match",
              description: "Code should follow pattern",
              severity: "critical",
              passed: false,
              message: "Pattern not found",
              duration: 100,
            },
          ],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const options: FeedbackOptions = {
        verificationResult,
        orchestraRoot: tempDir,
      };

      const result = await runFeedback(options);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(1);
      // New: feedback path is now standardized to handover/feedback.md
      expect(result.feedbackPath).toContain("feedback.md");
      expect(result.feedbackPath).toContain("handover");
      expect(fs.existsSync(result.feedbackPath)).toBe(true);
    });

    it("should transform failed checks into feedback issues", async () => {
      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 2, passed: 0, failed: 2, skipped: 0 },
          results: [
            {
              checkId: "check-1",
              type: "file_exists",
              description: "Config file should exist",
              severity: "critical",
              passed: false,
              message: "File not found",
              duration: 100,
            },
            {
              checkId: "check-2",
              type: "command",
              description: "Tests should pass",
              severity: "major" as any,
              passed: false,
              message: "Tests failed",
              duration: 500,
            },
          ],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const options: FeedbackOptions = {
        verificationResult,
        orchestraRoot: tempDir,
      };

      const result = await runFeedback(options);

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].problem).toBe("Config file should exist");
      expect(result.issues[0].severity).toBe("critical");
      expect(result.issues[1].problem).toBe("Tests should pass");
    });

    it("should NOT include check type or path in issues (trust boundary)", async () => {
      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 1, passed: 0, failed: 1, skipped: 0 },
          results: [
            {
              checkId: "secret-check-1",
              type: "pattern_match",
              description: "Function should be exported",
              severity: "critical",
              passed: false,
              message: "Not found in file",
              details: {
                path: ".orchestra/orchestrator/.orchestrator-only/verification.yaml",
                pattern: "export.*mySecret",
              },
              duration: 100,
            },
          ],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const options: FeedbackOptions = {
        verificationResult,
        orchestraRoot: tempDir,
      };

      const result = await runFeedback(options);

      // Verify NO secret information leaked
      const issue = result.issues[0];
      expect(issue.problem).not.toContain("pattern_match");
      expect(issue.problem).not.toContain(".orchestrator-only");
      expect(issue.problem).not.toContain("export.*mySecret");
      // Only the description should be in the problem
      expect(issue.problem).toBe("Function should be exported");
    });
  });

  describe("Attempt Tracking", () => {
    it("should track attempt number starting from 1", async () => {
      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 1, passed: 0, failed: 1, skipped: 0 },
          results: [
            {
              checkId: "check-1",
              type: "file_exists",
              description: "File should exist",
              severity: "critical",
              passed: false,
              message: "Not found",
              duration: 100,
            },
          ],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        verificationResult,
        orchestraRoot: tempDir,
      });

      expect(result.attempt).toBe(1);
      expect(result.maxAttempts).toBe(3);
      expect(result.canRetry).toBe(true);
    });

    it("should calculate attempt from progress entries with VERIFY_FAILED status", async () => {
      // Add a prior VERIFY_FAILED entry to mock progress data
      mockProgressData.entries = [
        {
          task_id: 1,
          status: "IMPLEMENT",
          timestamp: "2024-01-01T10:00:00Z",
        },
        {
          task_id: 1,
          status: "VERIFY_FAILED",
          timestamp: "2024-01-01T11:00:00Z",
          notes: "Attempt 1: 2 issues found",
        },
      ];

      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 1, passed: 0, failed: 1, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        verificationResult,
        orchestraRoot: tempDir,
      });

      // With 1 prior VERIFY_FAILED, current attempt should be 2
      expect(result.attempt).toBe(2);
      expect(result.canRetry).toBe(true);
    });

    it("should set canRetry=false when max attempts reached", async () => {
      // Add 2 prior VERIFY_FAILED entries to mock progress data
      mockProgressData.entries = [
        {
          task_id: 1,
          status: "IMPLEMENT",
          timestamp: "2024-01-01T10:00:00Z",
        },
        {
          task_id: 1,
          status: "VERIFY_FAILED",
          timestamp: "2024-01-01T11:00:00Z",
          notes: "Attempt 1: 2 issues found",
        },
        {
          task_id: 1,
          status: "VERIFY_FAILED",
          timestamp: "2024-01-01T12:00:00Z",
          notes: "Attempt 2: 1 issue found",
        },
      ];

      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 1, passed: 0, failed: 1, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        verificationResult,
        orchestraRoot: tempDir,
      });

      // With 2 prior VERIFY_FAILED, current attempt is 3 (max)
      expect(result.attempt).toBe(3);
      expect(result.maxAttempts).toBe(3);
      expect(result.canRetry).toBe(false);
      expect(result.nextStep).toBe("escalate");
    });

    it("should return nextStep=retry when retries available", async () => {
      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 1, passed: 0, failed: 1, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        verificationResult,
        attempt: 1,
        orchestraRoot: tempDir,
      });

      expect(result.nextStep).toBe("retry");
    });
  });

  describe("Task Selection", () => {
    it("should use current task when no task specified", async () => {
      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        verificationResult,
        orchestraRoot: tempDir,
      });

      expect(result.taskId).toBe(1);
    });

    it("should use explicit task ID when provided", async () => {
      mockManifestData.data.tasks.push({
        id: 2,
        title: "Task 2",
        status: "IMPLEMENT",
        category: "CORE",
        retry_count: 0,
        max_retries: 3,
      });

      const verificationResult: VerifyResult = {
        report: {
          taskId: 2,
          taskTitle: "Task 2",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        task: "2",
        verificationResult,
        orchestraRoot: tempDir,
      });

      expect(result.taskId).toBe(2);
    });

    it("should fail when task does not exist", async () => {
      const verificationResult: VerifyResult = {
        report: {
          taskId: 999,
          taskTitle: "Missing",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 1,
      };

      await expect(
        runFeedback({
          task: "999",
          verificationResult,
          orchestraRoot: tempDir,
        })
      ).rejects.toThrow("Task 999 not found");
    });
  });

  describe("Error Handling", () => {
    it("should fail when manifest cannot be loaded", async () => {
      mockManifestData = { success: false, message: "Not found" };

      await expect(
        runFeedback({
          verificationResult: {
            report: {
              taskId: 1,
              taskTitle: "Test",
              timestamp: new Date().toISOString(),
              duration: 0,
              checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
              results: [],
              overallPassed: false,
            },
            exitCode: 1,
          },
          orchestraRoot: tempDir,
        })
      ).rejects.toThrow("Cannot load manifest");
    });

    it("should fail when no task specified and no current task", async () => {
      mockManifestData.data.current_task_id = undefined;
      mockProgressData.entries = [];

      await expect(
        runFeedback({
          verificationResult: {
            report: {
              taskId: 1,
              taskTitle: "Test",
              timestamp: new Date().toISOString(),
              duration: 0,
              checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
              results: [],
              overallPassed: false,
            },
            exitCode: 1,
          },
          orchestraRoot: tempDir,
        })
      ).rejects.toThrow("No task specified");
    });
  });

  describe("Feedback File Output", () => {
    it("should create feedback directory if it does not exist", async () => {
      // Remove feedback directory
      fs.rmSync(path.join(orchestraRoot, "implementor", "feedback"), {
        recursive: true,
        force: true,
      });

      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        verificationResult,
        orchestraRoot: tempDir,
      });

      expect(fs.existsSync(result.feedbackPath)).toBe(true);
    });

    it("should write to standard feedback.md location in handover folder", async () => {
      const verificationResult: VerifyResult = {
        report: {
          taskId: 1,
          taskTitle: "Test Task",
          timestamp: new Date().toISOString(),
          duration: 1000,
          checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          overallPassed: false,
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        verificationResult,
        orchestraRoot: tempDir,
      });

      // New: feedback is always at handover/feedback.md
      expect(result.feedbackPath).toMatch(/handover[/\\]feedback\.md$/);
    });
  });
});
