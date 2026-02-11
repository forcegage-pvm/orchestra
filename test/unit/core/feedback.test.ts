/**
 * Tests for Feedback Generation Core Logic
 *
 * Verifies:
 * - runFeedback generates correct feedback after verification failure
 * - FeedbackResult type includes all required fields
 * - Feedback archives previous attempts correctly
 * - Progress tracking is updated with VERIFY_FAILED status
 * - Hidden verification criteria are NOT exposed in feedback
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as yaml from "yaml";
import {
  getAttemptNumber,
  loadVerificationResultFromDisk,
  runFeedback,
  saveVerificationResultForFeedback,
  type FeedbackIssue,
  type FeedbackResult,
} from "../../../src/core/feedback.js";
import type { Manifest, ProgressLog } from "../../../src/core/types.js";
import type { VerifyResult } from "../../../src/core/verification.js";

describe("Feedback Core Module", () => {
  let tempDir: string;
  let orchestraRoot: string;

  beforeEach(() => {
    // Create temp directory for testing
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "orchestra-feedback-test-")
    );
    orchestraRoot = path.join(tempDir, "project");

    // Create orchestra directory structure
    const orchestraDir = path.join(orchestraRoot, ".orchestra");
    const handoverDir = path.join(orchestraDir, "handover");
    const orchestratorDir = path.join(orchestraDir, "orchestrator");
    const resultsDir = path.join(orchestratorDir, "results");

    fs.mkdirSync(orchestraRoot, { recursive: true });
    fs.mkdirSync(handoverDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });

    // Create minimal config.yaml
    const config = {
      project: {
        name: "test-project",
        templates: {
          handover: "handover.md",
        },
      },
      retry: {
        max_retries: 3,
      },
    };
    fs.writeFileSync(
      path.join(orchestraDir, "config.yaml"),
      yaml.stringify(config)
    );

    // Create minimal manifest.yaml
    const manifest: Manifest = {
      sprint: {
        id: "sprint-001",
        name: "Test Sprint",
        status: "ACTIVE",
        created_at: new Date().toISOString(),
      },
      tasks: [
        {
          id: 1,
          title: "Test Task",
          status: "IMPLEMENT",
          dependencies: [],
          max_retries: 3,
          retry_count: 0,
        },
      ],
      current_task_id: 1,
    };
    fs.writeFileSync(
      path.join(orchestraDir, "manifest.yaml"),
      yaml.stringify(manifest)
    );

    // Create empty progress.yaml
    const progress: ProgressLog = {
      sprint_id: "sprint-001",
      entries: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(orchestraDir, "progress.yaml"),
      yaml.stringify(progress)
    );
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("runFeedback", () => {
    test("generates feedback with correct structure", async () => {
      // Create a verification result with failures
      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "File src/example.ts must exist",
              passed: false,
              severity: "critical",
              details: {},
            },
            {
              description: "Tests must pass",
              passed: true,
              severity: "critical",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        task: "1",
        verificationResult: verifyResult,
        orchestraRoot,
      });

      // Verify FeedbackResult structure
      expect(result.success).toBe(true);
      expect(result.taskId).toBe(1);
      expect(result.attempt).toBe(1);
      expect(result.maxAttempts).toBe(3);
      expect(result.canRetry).toBe(true);
      expect(result.feedbackPath).toContain("feedback.md");
      expect(result.issues).toHaveLength(1);
      expect(result.passedChecks).toHaveLength(1);
      expect(result.nextStep).toBe("retry");
    });

    test("FeedbackIssue has correct severity mapping", async () => {
      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "Critical issue",
              passed: false,
              severity: "critical",
              details: {},
            },
            {
              description: "Warning issue",
              passed: false,
              severity: "warning",
              details: {},
            },
            {
              description: "Info issue",
              passed: false,
              severity: "info",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        task: "1",
        verificationResult: verifyResult,
        orchestraRoot,
      });

      expect(result.issues).toHaveLength(3);
      expect(result.issues[0]?.severity).toBe("critical");
      expect(result.issues[1]?.severity).toBe("major");
      expect(result.issues[2]?.severity).toBe("minor");
    });

    test("writes feedback file to correct location", async () => {
      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "File missing",
              passed: false,
              severity: "critical",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        task: "1",
        verificationResult: verifyResult,
        orchestraRoot,
      });

      const feedbackPath = path.join(
        orchestraRoot,
        ".orchestra",
        "handover",
        "feedback.md"
      );

      expect(fs.existsSync(feedbackPath)).toBe(true);
      expect(result.feedbackPath).toBe(feedbackPath);

      const content = fs.readFileSync(feedbackPath, "utf-8");
      expect(content).toContain("Task 1");
      expect(content).toContain("File missing");
    });

    test("archives previous feedback on retry", async () => {
      // First attempt - create initial feedback
      const firstResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "First failure",
              passed: false,
              severity: "critical",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      await runFeedback({
        task: "1",
        verificationResult: firstResult,
        orchestraRoot,
      });

      // Verify first feedback exists
      const feedbackPath = path.join(
        orchestraRoot,
        ".orchestra",
        "handover",
        "feedback.md"
      );
      expect(fs.existsSync(feedbackPath)).toBe(true);

      // Second attempt - should archive previous feedback
      const secondResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "Second failure",
              passed: false,
              severity: "critical",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      await runFeedback({
        task: "1",
        verificationResult: secondResult,
        orchestraRoot,
      });

      // Check that archive exists
      const archivePath = path.join(
        orchestraRoot,
        ".orchestra",
        "handover",
        "feedback-history",
        "attempt-1.md"
      );

      expect(fs.existsSync(archivePath)).toBe(true);

      const archivedContent = fs.readFileSync(archivePath, "utf-8");
      expect(archivedContent).toContain("First failure");

      const currentContent = fs.readFileSync(feedbackPath, "utf-8");
      expect(currentContent).toContain("Second failure");
    });

    test("updates progress with VERIFY_FAILED status", async () => {
      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "Failure",
              passed: false,
              severity: "critical",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      await runFeedback({
        task: "1",
        verificationResult: verifyResult,
        orchestraRoot,
      });

      const progressPath = path.join(
        orchestraRoot,
        ".orchestra",
        "progress.yaml"
      );
      const progress = yaml.parse(
        fs.readFileSync(progressPath, "utf-8")
      ) as ProgressLog;

      expect(progress.entries).toHaveLength(1);
      expect(progress.entries[0]?.status).toBe("VERIFY_FAILED");
      expect(progress.entries[0]?.task_id).toBe(1);
    });

    test("sets canRetry to false when max attempts reached", async () => {
      // Add failures to reach max attempts
      const progressPath = path.join(
        orchestraRoot,
        ".orchestra",
        "progress.yaml"
      );
      const progress = yaml.parse(
        fs.readFileSync(progressPath, "utf-8")
      ) as ProgressLog;

      // Add 2 previous failures (next will be attempt 3 of 3)
      progress.entries.push(
        {
          task_id: 1,
          status: "VERIFY_FAILED",
          timestamp: new Date().toISOString(),
        },
        {
          task_id: 1,
          status: "VERIFY_FAILED",
          timestamp: new Date().toISOString(),
        }
      );
      fs.writeFileSync(progressPath, yaml.stringify(progress));

      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "Failure",
              passed: false,
              severity: "critical",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        task: "1",
        verificationResult: verifyResult,
        orchestraRoot,
      });

      expect(result.attempt).toBe(3);
      expect(result.maxAttempts).toBe(3);
      expect(result.canRetry).toBe(false);
      expect(result.nextStep).toBe("escalate");
    });

    test("does NOT expose hidden verification criteria", async () => {
      // Create verification result with internal check details
      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "File must exist",
              passed: false,
              severity: "critical",
              details: {
                type: "file_exists", // HIDDEN
                path: "src/secret.ts", // HIDDEN
                pattern: /secret/i, // HIDDEN
              },
            },
          ],
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        task: "1",
        verificationResult: verifyResult,
        orchestraRoot,
      });

      // Read the generated feedback file
      const feedbackPath = path.join(
        orchestraRoot,
        ".orchestra",
        "handover",
        "feedback.md"
      );
      const feedbackContent = fs.readFileSync(feedbackPath, "utf-8");

      // Verify hidden info is NOT in feedback
      expect(feedbackContent).not.toContain("file_exists");
      expect(feedbackContent).not.toContain("src/secret.ts");
      expect(feedbackContent).not.toContain("pattern");

      // Verify only description is exposed
      expect(feedbackContent).toContain("File must exist");

      // Verify FeedbackIssue doesn't include hidden fields
      expect(result.issues[0]).not.toHaveProperty("type");
      expect(result.issues[0]).not.toHaveProperty("path");
      expect(result.issues[0]).not.toHaveProperty("pattern");
      expect(result.issues[0]).not.toHaveProperty("details");
    });

    test("uses current_task_id from manifest when task not specified", async () => {
      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "Failure",
              passed: false,
              severity: "critical",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      // Don't specify task - should use manifest's current_task_id (1)
      const result = await runFeedback({
        verificationResult: verifyResult,
        orchestraRoot,
      });

      expect(result.taskId).toBe(1);
    });

    test("throws error when no task specified and no current task found", async () => {
      // Remove current_task_id from manifest
      const manifestPath = path.join(
        orchestraRoot,
        ".orchestra",
        "manifest.yaml"
      );
      const manifest = yaml.parse(
        fs.readFileSync(manifestPath, "utf-8")
      ) as Manifest;
      delete manifest.current_task_id;
      fs.writeFileSync(manifestPath, yaml.stringify(manifest));

      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [],
        },
        exitCode: 1,
      };

      await expect(
        runFeedback({
          verificationResult: verifyResult,
          orchestraRoot,
        })
      ).rejects.toThrow("No task specified and no current task found");
    });

    test("throws error when verification result not provided", async () => {
      await expect(
        runFeedback({
          task: "1",
          orchestraRoot,
        })
      ).rejects.toThrow("No verification results provided");
    });
  });

  describe("saveVerificationResultForFeedback", () => {
    test("saves verification result to correct location", () => {
      const verifyResult: VerifyResult = {
        report: {
          taskId: 5,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [],
        },
        exitCode: 1,
      };

      const resultPath = saveVerificationResultForFeedback(
        5,
        verifyResult,
        orchestraRoot
      );

      expect(resultPath).toContain("task-005-verification-full.json");
      expect(fs.existsSync(resultPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
      expect(saved.report.taskId).toBe(5);
    });

    test("creates results directory if it doesn't exist", () => {
      const resultsDir = path.join(
        orchestraRoot,
        ".orchestra",
        "orchestrator",
        "results"
      );
      fs.rmSync(resultsDir, { recursive: true, force: true });

      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [],
        },
        exitCode: 1,
      };

      saveVerificationResultForFeedback(1, verifyResult, orchestraRoot);

      expect(fs.existsSync(resultsDir)).toBe(true);
    });
  });

  describe("loadVerificationResultFromDisk", () => {
    test("loads saved verification result", () => {
      const verifyResult: VerifyResult = {
        report: {
          taskId: 3,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "Test",
              passed: false,
              severity: "critical",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      saveVerificationResultForFeedback(3, verifyResult, orchestraRoot);

      const loaded = loadVerificationResultFromDisk(3, orchestraRoot);

      expect(loaded).not.toBeNull();
      expect(loaded?.report.taskId).toBe(3);
      expect(loaded?.report.results).toHaveLength(1);
    });

    test("returns null when file doesn't exist", () => {
      const loaded = loadVerificationResultFromDisk(999, orchestraRoot);
      expect(loaded).toBeNull();
    });
  });

  describe("getAttemptNumber", () => {
    test("returns 1 for first attempt (no failures)", () => {
      const progress: ProgressLog = {
        sprint_id: "sprint-001",
        entries: [],
      };

      const attempt = getAttemptNumber(progress, 1);
      expect(attempt).toBe(1);
    });

    test("counts VERIFY_FAILED entries correctly", () => {
      const progress: ProgressLog = {
        sprint_id: "sprint-001",
        entries: [
          {
            task_id: 1,
            status: "VERIFY_FAILED",
            timestamp: new Date().toISOString(),
          },
          {
            task_id: 1,
            status: "VERIFY_FAILED",
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const attempt = getAttemptNumber(progress, 1);
      expect(attempt).toBe(3); // 2 failures + 1
    });

    test("counts RETRY entries correctly", () => {
      const progress: ProgressLog = {
        sprint_id: "sprint-001",
        entries: [
          {
            task_id: 1,
            status: "VERIFY_FAILED",
            timestamp: new Date().toISOString(),
          },
          {
            task_id: 1,
            status: "RETRY",
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const attempt = getAttemptNumber(progress, 1);
      expect(attempt).toBe(3);
    });

    test("ignores other task failures", () => {
      const progress: ProgressLog = {
        sprint_id: "sprint-001",
        entries: [
          {
            task_id: 2,
            status: "VERIFY_FAILED",
            timestamp: new Date().toISOString(),
          },
          {
            task_id: 1,
            status: "VERIFY_FAILED",
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const attempt = getAttemptNumber(progress, 1);
      expect(attempt).toBe(2);
    });
  });

  describe("FeedbackResult type", () => {
    test("has all required fields", async () => {
      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [],
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        task: "1",
        verificationResult: verifyResult,
        orchestraRoot,
      });

      // Type check - ensures all fields exist
      const requiredFields: Array<keyof FeedbackResult> = [
        "success",
        "taskId",
        "attempt",
        "maxAttempts",
        "canRetry",
        "feedbackPath",
        "issues",
        "passedChecks",
        "nextStep",
      ];

      requiredFields.forEach((field) => {
        expect(result).toHaveProperty(field);
      });
    });
  });

  describe("FeedbackIssue type", () => {
    test("has correct structure", async () => {
      const verifyResult: VerifyResult = {
        report: {
          taskId: 1,
          timestamp: new Date().toISOString(),
          overallPassed: false,
          results: [
            {
              description: "Test issue",
              passed: false,
              severity: "critical",
              details: {},
            },
          ],
        },
        exitCode: 1,
      };

      const result = await runFeedback({
        task: "1",
        verificationResult: verifyResult,
        orchestraRoot,
      });

      const issue = result.issues[0];
      expect(issue).toBeDefined();

      // Type check - ensures all fields exist
      const requiredFields: Array<keyof FeedbackIssue> = [
        "severity",
        "category",
        "problem",
        "impact",
        "guidance",
      ];

      requiredFields.forEach((field) => {
        expect(issue).toHaveProperty(field);
      });

      // Verify severity is one of allowed values
      expect(["critical", "major", "minor"]).toContain(issue?.severity);
    });
  });
});
