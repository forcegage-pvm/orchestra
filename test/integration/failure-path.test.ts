/**
 * Integration Tests: Failure Path Workflow
 *
 * Tests the complete failure workflow:
 * verify FAIL → feedback → retry → escalate
 *
 * Phase 1.2 Task 1.2.3
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test-specific mock variables
let testTempDir: string;
let mockManifestData: any;
let mockProgressData: any;
let mockVerificationResult: any;
let feedbackCount: number;

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
  addProgressEntry: vi.fn((progress, entry) => ({
    ...progress,
    entries: [
      ...progress.entries,
      { ...entry, timestamp: new Date().toISOString() },
    ],
  })),
  saveProgress: vi.fn(),
}));

// Mock templates module
vi.mock("../../src/core/templates.js", () => ({
  renderTemplate: vi.fn((templateName: string, context: any) => {
    if (templateName === "feedback-template.md") {
      return (
        `# Feedback: Task ${context.taskId} - Attempt ${context.attempt}\n\n` +
        `## Issues Found\n\n` +
        (context.issues || [])
          .map((i: any) => `- ${i.problem}: ${i.guidance}`)
          .join("\n") +
        `\n\nCan Retry: ${context.canRetry}`
      );
    }
    return `Template: ${templateName}`;
  }),
}));

import { runEscalate } from "../../src/core/escalate.js";
import { runFeedback } from "../../src/core/feedback.js";
import type { VerifyResult } from "../../src/core/verification.js";

describe("Failure Path Integration", () => {
  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-int-"));

    // Create directories
    fs.mkdirSync(path.join(testTempDir, ".orchestra/artifacts"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(testTempDir, ".orchestra/implementor/feedback"), {
      recursive: true,
    });

    feedbackCount = 0;

    // Default mock data
    mockManifestData = {
      success: true,
      data: {
        sprint: { id: "sprint-001", title: "Test Sprint" },
        current_task_id: 1,
        tasks: [
          {
            id: 1,
            title: "Test Task",
            status: "IN_PROGRESS",
            description: "Test task description",
          },
        ],
      },
    };

    mockProgressData = {
      sprint_id: "sprint-001",
      entries: [],
    };

    // Default failing verification result
    mockVerificationResult = {
      report: {
        task_id: 1,
        passed: false,
        results: [
          {
            id: "check-1",
            type: "content_contains",
            path: "src/secret.ts",
            pattern: "hidden-pattern",
            passed: false,
            severity: "critical",
            description: "Function handles errors correctly",
            guidance: "Add error handling",
          },
        ],
        summary: { passed: 0, failed: 1, total: 1, skipped: 0 },
        overallPassed: false,
      },
      exitCode: 1,
    } as VerifyResult;

    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  });

  describe("Verification Failure Path", () => {
    it("generates feedback after verify fails", async () => {
      const result = await runFeedback({
        task: "1",
        verificationResult: mockVerificationResult,
        orchestraRoot: testTempDir,
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(1);
      expect(result.feedbackPath).toBeDefined();
      expect(result.canRetry).toBe(true);
      expect(result.attempt).toBe(1);
    });

    it("increments attempt counter when passed explicitly", async () => {
      // Feedback uses the attempt option passed to it
      // In a real workflow, the caller tracks and passes the attempt number

      const result1 = await runFeedback({
        task: "1",
        attempt: 1,
        verificationResult: mockVerificationResult,
        orchestraRoot: testTempDir,
      });
      expect(result1.attempt).toBe(1);

      const result2 = await runFeedback({
        task: "1",
        attempt: 2,
        verificationResult: mockVerificationResult,
        orchestraRoot: testTempDir,
      });
      expect(result2.attempt).toBe(2);

      const result3 = await runFeedback({
        task: "1",
        attempt: 3,
        verificationResult: mockVerificationResult,
        orchestraRoot: testTempDir,
      });
      expect(result3.attempt).toBe(3);
      expect(result3.canRetry).toBe(false); // Max 3 attempts
    });
  });

  describe("Feedback Privacy", () => {
    it("does not reveal verification criteria in feedback", async () => {
      const verifyResultWithSecrets: VerifyResult = {
        report: {
          task_id: 1,
          passed: false,
          results: [
            {
              id: "check-1",
              type: "content_contains",
              path: "src/secret-file.ts",
              pattern: "hidden-regex-pattern",
              passed: false,
              severity: "critical",
              description: "Function handles errors correctly",
              guidance: "Add error handling",
            },
            {
              id: "check-2",
              type: "file_exists",
              path: "internal/path/to/file.ts",
              passed: false,
              severity: "critical",
              description: "Test file should exist",
              guidance: "Create the test file",
            },
          ],
          summary: { passed: 0, failed: 2, total: 2, skipped: 0 },
          overallPassed: false,
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        task: "1",
        verificationResult: verifyResultWithSecrets,
        orchestraRoot: testTempDir,
      });

      // The issues should NOT contain check type, path, or pattern
      for (const issue of result.issues) {
        expect(JSON.stringify(issue)).not.toContain("content_contains");
        expect(JSON.stringify(issue)).not.toContain("file_exists");
        expect(JSON.stringify(issue)).not.toContain("src/secret-file.ts");
        expect(JSON.stringify(issue)).not.toContain("hidden-regex-pattern");
        expect(JSON.stringify(issue)).not.toContain("internal/path/to/file.ts");
      }

      // But friendly description and guidance SHOULD be present
      // The transform maps description -> problem, guidance -> guidance (or default message)
      const allIssuesJson = JSON.stringify(result.issues);
      expect(allIssuesJson).toContain("handles errors");
      expect(allIssuesJson).toContain("Test file should exist");
    });

    it("strips check.type from all feedback issues", async () => {
      const result = await runFeedback({
        task: "1",
        verificationResult: mockVerificationResult,
        orchestraRoot: testTempDir,
      });

      // Verify no issue contains the hidden check type
      for (const issue of result.issues) {
        expect(issue).not.toHaveProperty("type");
        expect(JSON.stringify(issue)).not.toContain("content_contains");
      }
    });
  });

  describe("Escalation Path", () => {
    it("escalates after max attempts exceeded", async () => {
      // Pass attempt=3 to indicate this is the 3rd and final attempt
      const feedbackResult = await runFeedback({
        task: "1",
        attempt: 3, // Explicit 3rd attempt
        verificationResult: mockVerificationResult,
        orchestraRoot: testTempDir,
      });

      // After 3 attempts (maxAttempts=3), canRetry should be false
      expect(feedbackResult.canRetry).toBe(false);
      expect(feedbackResult.nextStep).toContain("escalate");

      // Now escalate
      const escalateResult = await runEscalate({
        task: "1",
        reason: "Max attempts exceeded",
        orchestraRoot: testTempDir,
      });

      expect(escalateResult.success).toBe(true);
      expect(escalateResult.newStatus).toBe("ESCALATED");
    });

    it("generates escalation report with attempt history", async () => {
      // Create feedback files to simulate history
      const feedbackPath = path.join(
        testTempDir,
        ".orchestra/implementor/feedback"
      );
      fs.writeFileSync(
        path.join(feedbackPath, "task-1-attempt-1.md"),
        "# Feedback\n\n**Problem**: First issue\n"
      );
      fs.writeFileSync(
        path.join(feedbackPath, "task-1-attempt-2.md"),
        "# Feedback\n\n**Problem**: Second issue\n"
      );
      fs.writeFileSync(
        path.join(feedbackPath, "task-1-attempt-3.md"),
        "# Feedback\n\n**Problem**: Third issue\n"
      );

      const result = await runEscalate({
        task: "1",
        reason: "Persistent failures",
        orchestraRoot: testTempDir,
      });

      expect(result.attemptHistory).toHaveLength(3);
      expect(result.attemptHistory[0].issue).toContain("First issue");
      expect(result.attemptHistory[2].issue).toContain("Third issue");

      // Check report file exists and contains history
      expect(fs.existsSync(result.reportPath)).toBe(true);
      const reportContent = fs.readFileSync(result.reportPath, "utf-8");
      expect(reportContent).toContain("Attempt History");
      expect(reportContent).toContain("Persistent failures");
    });
  });

  describe("Edge Cases", () => {
    it("handles already escalated task gracefully", async () => {
      // First escalation
      const first = await runEscalate({
        task: "1",
        reason: "First escalation",
        orchestraRoot: testTempDir,
      });
      expect(first.success).toBe(true);

      // Update mock to reflect escalated status
      mockManifestData.data.tasks[0].status = "ESCALATED";

      // Second escalation - should not error
      const second = await runEscalate({
        task: "1",
        reason: "Second escalation",
        orchestraRoot: testTempDir,
      });
      expect(second.success).toBe(true);
      expect(second.previousStatus).toBe("ESCALATED");
    });

    it("throws when escalating without reason", async () => {
      await expect(
        runEscalate({
          task: "1",
          reason: "",
          orchestraRoot: testTempDir,
        })
      ).rejects.toThrow(/reason.*required/i);
    });

    it("throws when task not found", async () => {
      await expect(
        runFeedback({
          task: "999",
          verificationResult: mockVerificationResult,
          orchestraRoot: testTempDir,
        })
      ).rejects.toThrow(/not found/i);
    });

    it("throws when task is already complete", async () => {
      mockManifestData.data.tasks[0].status = "COMPLETE";

      await expect(
        runEscalate({
          task: "1",
          reason: "Test",
          orchestraRoot: testTempDir,
        })
      ).rejects.toThrow(/already complete/i);
    });
  });

  describe("Complete Failure Workflow", () => {
    it("runs full cycle: verify fail → feedback → retry loop → escalate", async () => {
      // This simulates the "3 strikes" scenario

      // Track feedback attempts
      const feedbackResults: any[] = [];

      for (let attempt = 1; attempt <= 3; attempt++) {
        // Generate feedback (simulating verify → feedback flow)
        const feedbackResult = await runFeedback({
          task: "1",
          attempt: attempt,
          verificationResult: mockVerificationResult,
          orchestraRoot: testTempDir,
        });

        feedbackResults.push(feedbackResult);

        expect(feedbackResult.attempt).toBe(attempt);
        expect(feedbackResult.canRetry).toBe(attempt < 3);

        // Simulate progress entry for next iteration
        mockProgressData.entries.push({
          task_id: 1,
          event_type: "FEEDBACK_GENERATED",
          attempt: attempt,
          timestamp: new Date().toISOString(),
        });
      }

      // After 3 attempts, canRetry should be false
      expect(feedbackResults[2].canRetry).toBe(false);

      // Now escalate
      const escalateResult = await runEscalate({
        task: "1",
        reason: "Max attempts exceeded - all 3 retries failed",
        orchestraRoot: testTempDir,
      });

      expect(escalateResult.success).toBe(true);
      expect(escalateResult.newStatus).toBe("ESCALATED");
      expect(escalateResult.reason).toBe(
        "Max attempts exceeded - all 3 retries failed"
      );
    });
  });
});
