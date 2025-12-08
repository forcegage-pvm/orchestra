/**
 * Accept-Signal Core Logic Tests
 *
 * Tests for pre-signal verification checks.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as yaml from "yaml";

let testTempDir: string;

// Mock config module BEFORE importing signal
vi.mock("../../src/core/config.js", () => ({
  requireOrchestraRoot: vi.fn(() => testTempDir),
  loadConfig: vi.fn(() => ({
    version: "1.0",
    paths: {
      manifest: "manifest.yaml",
      handovers: "handover",
      signals: "implementor/signals",
      feedback: "implementor/feedback",
      artifacts: "artifacts",
      templates: "common/templates",
    },
  })),
  getResolvedPaths: vi.fn((root: string) => ({
    orchestraDir: path.join(root, ".orchestra"),
  })),
}));

// Mock manifest module
vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => ({
    success: true,
    message: "Loaded",
    data: {
      version: "1.0.0",
      sprint: {
        id: "test-sprint",
        name: "Test Sprint",
        status: "ACTIVE",
        created_at: new Date().toISOString(),
      },
      tasks: [],
    },
  })),
}));

import { runAcceptSignal } from "../../src/core/signal.js";

describe("Accept-Signal Core Logic", () => {
  let tempDir: string;
  let orchestraRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-test-"));
    testTempDir = tempDir; // Set for mock
    orchestraRoot = path.join(tempDir, ".orchestra");
    fs.mkdirSync(orchestraRoot, { recursive: true });
    fs.mkdirSync(path.join(orchestraRoot, "handover", "verification"), {
      recursive: true,
    });

    // Create minimal progress.yaml
    const progressPath = path.join(orchestraRoot, "progress.yaml");
    const progressData = {
      sprint_id: "test-sprint",
      entries: [
        {
          task_id: 7,
          status: "IMPLEMENT",
          timestamp: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(progressPath, yaml.stringify(progressData));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("Check S1: Pre-signal artifact exists", () => {
    it("should pass when artifact exists", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      // Create completion signal
      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      fs.writeFileSync(
        signalPath,
        "## Summary\nDone\n## Artifacts Created\nFiles\n## Tests\nPassed"
      );

      // Create verification criteria (S7 check)
      const verificationPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "task-007.yaml"
      );
      fs.writeFileSync(
        verificationPath,
        yaml.stringify({
          task_id: 7,
          checks: [{ id: "v1", type: "file_exists", description: "test" }],
        })
      );

      const result = await runAcceptSignal({});

      expect(result.overall).toBe("ACCEPTED");
      expect(result.checks[0].passed).toBe(true);
      expect(result.checks[0].id).toBe("S1");
    });

    it("should fail when artifact missing", async () => {
      const result = await runAcceptSignal({});

      expect(result.overall).toBe("REJECTED");
      expect(result.checks[0].passed).toBe(false);
      expect(result.checks[0].id).toBe("S1");
      expect(result.checks[0].fix).toContain("pre-signal-check.ps1");
    });
  });

  describe("Check S2: Pre-signal status PASSED", () => {
    it("should pass when status is PASSED", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      // Create completion signal
      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      fs.writeFileSync(
        signalPath,
        "## Summary\nDone\n## Artifacts Created\nFiles\n## Tests\nPassed"
      );

      const result = await runAcceptSignal({});

      const s2Check = result.checks.find((c) => c.id === "S2");
      expect(s2Check?.passed).toBe(true);
      expect(s2Check?.actual).toBe("PASSED");
    });

    it("should fail when status is FAILED", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "FAILED",
        checks: {
          linter: { status: "FAILED", issues: 3 },
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      const result = await runAcceptSignal({});

      const s2Check = result.checks.find((c) => c.id === "S2");
      expect(s2Check?.passed).toBe(false);
      expect(s2Check?.expected).toBe("PASSED");
      expect(s2Check?.actual).toBe("FAILED");
      expect(s2Check?.details).toBeDefined();
    });
  });

  describe("Check S3: Task ID matches", () => {
    it("should pass when task IDs match", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      // Create completion signal
      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      fs.writeFileSync(
        signalPath,
        "## Summary\nDone\n## Artifacts Created\nFiles\n## Tests\nPassed"
      );

      const result = await runAcceptSignal({});

      const s3Check = result.checks.find((c) => c.id === "S3");
      expect(s3Check?.passed).toBe(true);
      expect(s3Check?.expected).toBe(7);
      expect(s3Check?.actual).toBe(7);
    });

    it("should fail when task IDs mismatch (stale artifact)", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 6,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      const result = await runAcceptSignal({});

      const s3Check = result.checks.find((c) => c.id === "S3");
      expect(s3Check?.passed).toBe(false);
      expect(s3Check?.expected).toBe(7);
      expect(s3Check?.actual).toBe(6);
      expect(s3Check?.message).toContain("stale");
    });
  });

  describe("Check S4: Artifact freshness", () => {
    it("should pass when artifact is fresh (< 60 minutes)", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      // Create completion signal
      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      fs.writeFileSync(
        signalPath,
        "## Summary\nDone\n## Artifacts Created\nFiles\n## Tests\nPassed"
      );

      const result = await runAcceptSignal({});

      const s4Check = result.checks.find((c) => c.id === "S4");
      expect(s4Check?.passed).toBe(true);
    });

    it("should fail when artifact is stale (> 60 minutes)", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      const result = await runAcceptSignal({});

      const s4Check = result.checks.find((c) => c.id === "S4");
      expect(s4Check?.passed).toBe(false);
      expect(s4Check?.message).toContain("stale");
    });

    it("should respect custom max-age threshold", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      // Create completion signal
      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      fs.writeFileSync(
        signalPath,
        "## Summary\nDone\n## Artifacts Created\nFiles\n## Tests\nPassed"
      );

      const result = await runAcceptSignal({ maxAge: "120" });

      const s4Check = result.checks.find((c) => c.id === "S4");
      expect(s4Check?.passed).toBe(true);
    });
  });

  describe("Check S5: Completion signal filled", () => {
    it("should pass when completion signal exists and is filled", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      const signalContent = `## Summary
Implemented accept-signal command

## Artifacts Created
- src/commands/accept-signal.ts
- src/core/signal.ts

## Tests
All 23 tests passing`;
      fs.writeFileSync(signalPath, signalContent);

      const result = await runAcceptSignal({});

      const s5Check = result.checks.find((c) => c.id === "S5");
      expect(s5Check?.passed).toBe(true);
    });

    it("should fail when completion signal is missing", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      const result = await runAcceptSignal({});

      const s5Check = result.checks.find((c) => c.id === "S5");
      expect(s5Check?.passed).toBe(false);
      expect(s5Check?.fix).toContain("completion-signal.md");
    });

    it("should fail when completion signal is empty template", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      const signalContent = `<!-- Implementor: Fill out sections below -->

## Summary

`;
      fs.writeFileSync(signalPath, signalContent);

      const result = await runAcceptSignal({});

      const s5Check = result.checks.find((c) => c.id === "S5");
      expect(s5Check?.passed).toBe(false);
      expect(s5Check?.actual).toContain("Template not filled");
    });
  });

  describe("Check S6: Deliverables check passed", () => {
    it("should pass when deliverables check passed in pre-signal", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: {
            status: "PASSED",
            files_exist: ["src/commands/accept-signal.ts"],
          },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      // Create completion signal
      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      fs.writeFileSync(
        signalPath,
        "## Summary\nDone\n## Artifacts Created\nFiles\n## Tests\nPassed"
      );

      const result = await runAcceptSignal({});

      const s6Check = result.checks.find((c) => c.id === "S6");
      expect(s6Check?.passed).toBe(true);
    });

    it("should fail when deliverables check failed in pre-signal", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: {
            status: "FAILED",
            missing_files: ["src/commands/accept-signal.ts"],
          },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      const result = await runAcceptSignal({});

      const s6Check = result.checks.find((c) => c.id === "S6");
      expect(s6Check?.passed).toBe(false);
      expect(s6Check?.details).toBeDefined();
    });
  });

  describe("Check S7: Verification criteria exists", () => {
    it("should pass when verification criteria file exists", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      // Create completion signal
      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      fs.writeFileSync(
        signalPath,
        "## Summary\nDone\n## Artifacts Created\nFiles\n## Tests\nPassed"
      );

      // Create verification criteria
      const verificationPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "task-007.yaml"
      );
      fs.writeFileSync(
        verificationPath,
        yaml.stringify({
          task_id: 7,
          checks: [{ id: "v1", type: "file_exists", description: "test" }],
        })
      );

      const result = await runAcceptSignal({});

      const s7Check = result.checks.find((c) => c.id === "S7");
      expect(s7Check?.passed).toBe(true);
    });

    it("should fail when verification criteria file missing (finalize not run)", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "PASSED",
        checks: {
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      // Create completion signal
      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      fs.writeFileSync(
        signalPath,
        "## Summary\nDone\n## Artifacts Created\nFiles\n## Tests\nPassed"
      );

      // Note: intentionally NOT creating verification criteria file

      const result = await runAcceptSignal({});

      const s7Check = result.checks.find((c) => c.id === "S7");
      expect(s7Check?.passed).toBe(false);
      expect(s7Check?.fix).toContain("orchestra prepare --finalize");
    });
  });

  describe("runAcceptSignal orchestration", () => {
    it("should return ACCEPTED when all checks pass", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        status: "PASSED",
        checks: {
          linter: { status: "PASSED", files_checked: 15, issues: 0 },
          tests: { status: "PASSED", tests_run: 42, tests_passed: 42 },
          deliverables: { status: "PASSED", files_exist: ["file1.ts"] },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      const signalPath = path.join(
        orchestraRoot,
        "handover",
        "completion-signal.md"
      );
      fs.writeFileSync(
        signalPath,
        "## Summary\nDone\n## Artifacts Created\nFiles\n## Tests\nPassed"
      );

      // Create verification criteria (S7 check)
      const verificationPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "task-007.yaml"
      );
      fs.writeFileSync(
        verificationPath,
        yaml.stringify({
          task_id: 7,
          checks: [{ id: "v1", type: "file_exists", description: "test" }],
        })
      );

      const result = await runAcceptSignal({});

      expect(result.overall).toBe("ACCEPTED");
      expect(result.canVerify).toBe(true);
      expect(result.checks.every((c) => c.passed)).toBe(true);
      expect(result.preSignalDetails).toBeDefined();
    });

    it("should return REJECTED when any check fails", async () => {
      const preSignalPath = path.join(
        orchestraRoot,
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      const artifact = {
        task_id: 7,
        timestamp: new Date().toISOString(),
        status: "FAILED",
        checks: {
          linter: { status: "FAILED", issues: 3 },
          deliverables: { status: "PASSED" },
        },
      };
      fs.writeFileSync(preSignalPath, yaml.stringify(artifact));

      const result = await runAcceptSignal({});

      expect(result.overall).toBe("REJECTED");
      expect(result.canVerify).toBe(false);
      expect(result.checks.some((c) => !c.passed)).toBe(true);
    });

    it("should bypass all checks when force flag is set", async () => {
      const result = await runAcceptSignal({ force: true });

      expect(result.overall).toBe("ACCEPTED");
      expect(result.canVerify).toBe(true);
      expect(result.checks).toHaveLength(0);
    });
  });
});
