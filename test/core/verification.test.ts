/**
 * Verification Core Logic Tests
 *
 * Tests for the verification check execution functions.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We need to test the module with proper mocking
vi.mock("../../src/core/config.js", () => ({
  requireOrchestraRoot: vi.fn(() => process.cwd()),
}));

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => ({
    success: true,
    data: {
      sprint: { id: "test-sprint" },
      tasks: [{ id: 8, title: "Test Task" }],
    },
  })),
}));

vi.mock("../../src/core/progress.js", () => ({
  loadProgress: vi.fn(() => ({
    entries: [{ task_id: 8 }],
  })),
}));

vi.mock("../../src/core/signal.js", () => ({
  runAcceptSignal: vi.fn(() =>
    Promise.resolve({
      overall: "ACCEPTED",
      canVerify: true,
    })
  ),
}));

import { requireOrchestraRoot } from "../../src/core/config.js";
import { runAcceptSignal } from "../../src/core/signal.js";
import { runVerification } from "../../src/core/verification.js";

describe("verification core", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verification-test-"));
    vi.mocked(requireOrchestraRoot).mockReturnValue(tempDir);

    // Create necessary directories
    fs.mkdirSync(path.join(tempDir, ".orchestra", "handover", "verification"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, ".orchestra", "reports", "verification"), {
      recursive: true,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("file_exists check", () => {
    it("should pass when file exists", async () => {
      // Create verification YAML
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: F1
    type: file_exists
    description: "Check test file"
    path: "test-file.txt"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      // Create the test file
      fs.writeFileSync(path.join(tempDir, "test-file.txt"), "test content");

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(1);
      expect(result.report.checks.failed).toBe(0);
      expect(result.report.overallPassed).toBe(true);
    });

    it("should fail when file does not exist", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: F1
    type: file_exists
    description: "Check missing file"
    path: "missing-file.txt"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(0);
      expect(result.report.checks.failed).toBe(1);
      expect(result.report.overallPassed).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe("dir_exists check", () => {
    it("should pass when directory exists", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: D1
    type: dir_exists
    description: "Check test directory"
    path: "test-dir"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      // Create the test directory
      fs.mkdirSync(path.join(tempDir, "test-dir"));

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(1);
      expect(result.report.overallPassed).toBe(true);
    });
  });

  describe("pattern_match check", () => {
    it("should pass when pattern is found", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: P1
    type: pattern_match
    description: "Check for function export"
    file: "test-module.ts"
    pattern: "export.*function.*testFunc"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      // Create the test file with matching pattern
      fs.writeFileSync(
        path.join(tempDir, "test-module.ts"),
        "export function testFunc(): void {}"
      );

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(1);
      expect(result.report.overallPassed).toBe(true);
    });

    it("should fail when pattern is not found", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: P1
    type: pattern_match
    description: "Check for function export"
    file: "test-module.ts"
    pattern: "export.*function.*missingFunc"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      // Create the test file without matching pattern
      fs.writeFileSync(
        path.join(tempDir, "test-module.ts"),
        "export function otherFunc(): void {}"
      );

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(0);
      expect(result.report.checks.failed).toBe(1);
    });
  });

  describe("json_valid check", () => {
    it("should pass for valid JSON", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: J1
    type: json_valid
    description: "Check JSON validity"
    path: "test.json"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      fs.writeFileSync(path.join(tempDir, "test.json"), '{"key": "value"}');

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(1);
    });

    it("should fail for invalid JSON", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: J1
    type: json_valid
    description: "Check JSON validity"
    path: "test.json"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      fs.writeFileSync(path.join(tempDir, "test.json"), "{invalid json}");

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(0);
      expect(result.report.checks.failed).toBe(1);
    });
  });

  describe("yaml_valid check", () => {
    it("should pass for valid YAML", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: Y1
    type: yaml_valid
    description: "Check YAML validity"
    path: "test.yaml"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      fs.writeFileSync(path.join(tempDir, "test.yaml"), "key: value\n");

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(1);
    });
  });

  describe("export_exists check", () => {
    it("should pass when all exports are found", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: E1
    type: export_exists
    description: "Check module exports"
    module: "test-module.ts"
    exports:
      - runVerification
      - VerifyReport
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      fs.writeFileSync(
        path.join(tempDir, "test-module.ts"),
        `
export async function runVerification() {}
export interface VerifyReport {}
`
      );

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(1);
    });

    it("should fail when exports are missing", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: E1
    type: export_exists
    description: "Check module exports"
    module: "test-module.ts"
    exports:
      - missingExport
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      fs.writeFileSync(
        path.join(tempDir, "test-module.ts"),
        "export function otherExport() {}"
      );

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.checks.passed).toBe(0);
      expect(result.report.checks.failed).toBe(1);
    });
  });

  describe("severity filtering", () => {
    it("should filter checks by severity", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: F1
    type: file_exists
    description: "Critical check"
    path: "critical.txt"
    severity: critical
  - id: F2
    type: file_exists
    description: "Warning check"
    path: "warning.txt"
    severity: warning
  - id: F3
    type: file_exists
    description: "Info check"
    path: "info.txt"
    severity: info
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      // Create only the critical file
      fs.writeFileSync(path.join(tempDir, "critical.txt"), "content");

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
        severity: "critical",
      });

      expect(result.report.checks.total).toBe(1);
      expect(result.report.checks.passed).toBe(1);
    });
  });

  describe("check ID filtering", () => {
    it("should run only specified checks", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: F1
    type: file_exists
    description: "First check"
    path: "file1.txt"
    severity: critical
  - id: F2
    type: file_exists
    description: "Second check"
    path: "file2.txt"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      // Create only file1
      fs.writeFileSync(path.join(tempDir, "file1.txt"), "content");

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
        checks: ["F1"],
      });

      expect(result.report.checks.total).toBe(1);
      expect(result.report.checks.passed).toBe(1);
    });
  });

  describe("continue-on-error", () => {
    it("should continue when flag is set", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: F1
    type: file_exists
    description: "First check fails"
    path: "missing1.txt"
    severity: critical
  - id: F2
    type: file_exists
    description: "Second check also fails"
    path: "missing2.txt"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
        continueOnError: true,
      });

      // Both checks should be executed
      expect(result.report.checks.total).toBe(2);
      expect(result.report.checks.failed).toBe(2);
    });

    it("should stop on first failure when flag is not set", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: F1
    type: file_exists
    description: "First check fails"
    path: "missing1.txt"
    severity: critical
  - id: F2
    type: file_exists
    description: "Second check would fail"
    path: "missing2.txt"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
        continueOnError: false,
      });

      // Only first check executed, second skipped
      expect(result.report.results).toHaveLength(1);
      expect(result.report.checks.skipped).toBe(1);
    });
  });

  describe("accept-signal integration", () => {
    it("should run accept-signal by default", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: F1
    type: file_exists
    description: "Check"
    path: "test.txt"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );
      fs.writeFileSync(path.join(tempDir, "test.txt"), "content");

      await runVerification({ taskId: 8 });

      expect(runAcceptSignal).toHaveBeenCalled();
    });

    it("should skip accept-signal when flag is set", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: F1
    type: file_exists
    description: "Check"
    path: "test.txt"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );
      fs.writeFileSync(path.join(tempDir, "test.txt"), "content");

      const result = await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      expect(result.report.acceptSignal?.skipped).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should return exit code 3 when criteria file not found", async () => {
      // Don't create the verification file

      const result = await runVerification({
        taskId: 99,
        skipAccept: true,
      });

      expect(result.exitCode).toBe(3);
    });
  });

  describe("report saving", () => {
    it("should save report to correct location", async () => {
      const verificationYaml = `
task_id: 8
task_title: "Test Task"
checks:
  - id: F1
    type: file_exists
    description: "Check"
    path: "test.txt"
    severity: critical
`;
      fs.writeFileSync(
        path.join(
          tempDir,
          ".orchestra",
          "handover",
          "verification",
          "task-008.yaml"
        ),
        verificationYaml
      );
      fs.writeFileSync(path.join(tempDir, "test.txt"), "content");

      await runVerification({
        taskId: 8,
        skipAccept: true,
      });

      const reportsDir = path.join(
        tempDir,
        ".orchestra",
        "reports",
        "verification"
      );
      const files = fs.readdirSync(reportsDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^task-008-.*\.json$/);
    });
  });
});
