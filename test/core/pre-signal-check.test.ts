/**
 * Pre-Signal Check Core Tests
 *
 * Tests for the core validation logic using mocks.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../../src/core/config.js", () => ({
  requireOrchestraRoot: vi.fn(),
  findOrchestraRoot: vi.fn(),
}));

vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(),
}));

vi.mock("../../src/core/progress.js", () => ({
  loadProgress: vi.fn(),
}));

import { requireOrchestraRoot } from "../../src/core/config.js";
import { loadManifest } from "../../src/core/manifest.js";
import { runPreSignalCheck } from "../../src/core/pre-signal-check.js";
import { loadProgress } from "../../src/core/progress.js";

describe("pre-signal-check core", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-psc-test-"));

    // Create required directories
    fs.mkdirSync(path.join(tempDir, ".orchestra", "handover", "verification"), {
      recursive: true,
    });
    fs.mkdirSync(
      path.join(
        tempDir,
        ".orchestra",
        "implementor",
        "artifacts",
        "pre-signal"
      ),
      { recursive: true }
    );

    // Setup mocks
    vi.mocked(requireOrchestraRoot).mockReturnValue(tempDir);

    vi.mocked(loadManifest).mockReturnValue({
      success: true,
      data: {
        sprint: { id: "test-sprint", name: "Test Sprint", status: "ACTIVE" },
        tasks: [{ task_id: 1, title: "Test Task", status: "IMPLEMENT" }],
      },
    });

    vi.mocked(loadProgress).mockReturnValue({
      sprint_id: "test-sprint",
      entries: [
        { task_id: 1, phase: "IMPLEMENT", timestamp: "2025-12-06T10:00:00Z" },
      ],
    });

    // Create default handover
    const handover = `# Task 1: Test Task

## File Operations

| Action | File |
|--------|------|
| CREATE | \`src/new-file.ts\` |
| UPDATE | \`src/existing.ts\` |
`;
    fs.writeFileSync(
      path.join(tempDir, ".orchestra", "handover", "current-task.md"),
      handover
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("force mode", () => {
    it("should skip all checks and return PASSED when --force is used", async () => {
      const result = await runPreSignalCheck({
        task: "1",
        force: true,
      });

      expect(result.status).toBe("PASSED");
      expect(result.checks).toHaveLength(0);
      expect(result.summary.total).toBe(0);
    });

    it("should still create artifact in force mode", async () => {
      await runPreSignalCheck({
        task: "1",
        force: true,
      });

      const artifactPath = path.join(
        tempDir,
        ".orchestra",
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      expect(fs.existsSync(artifactPath)).toBe(true);
    });
  });

  describe("file extraction", () => {
    it("should extract CREATE files from table format", async () => {
      // tempDir is the repo root (contains .orchestra/)
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, "src", "new-file.ts"),
        "export const x = 1;\n".repeat(5) // More than 50 bytes
      );

      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      // Check that P1 check was run for the file
      const p1Check = result.checks.find(
        (c) => c.id === "P1" && c.file === "src/new-file.ts"
      );
      expect(p1Check).toBeDefined();
    });

    it("should extract UPDATE files from table format", async () => {
      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      // Check that P3 check was run for the file
      const p3Check = result.checks.find(
        (c) => c.id === "P3" && c.file === "src/existing.ts"
      );
      expect(p3Check).toBeDefined();
    });

    it("should extract CREATE files from list format", async () => {
      // Update handover to use list format
      const handover = `# Task 1: Test Task

## File Operations

- CREATE: \`src/list-file.ts\`
- UPDATE: \`src/list-update.ts\`
`;
      fs.writeFileSync(
        path.join(tempDir, ".orchestra", "handover", "current-task.md"),
        handover
      );

      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const p1Check = result.checks.find(
        (c) => c.id === "P1" && c.file === "src/list-file.ts"
      );
      expect(p1Check).toBeDefined();
    });

    it("should extract files from bold format", async () => {
      const handover = `# Task 1: Test Task

**CREATE** \`src/bold-file.ts\`
`;
      fs.writeFileSync(
        path.join(tempDir, ".orchestra", "handover", "current-task.md"),
        handover
      );

      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const p1Check = result.checks.find(
        (c) => c.id === "P1" && c.file === "src/bold-file.ts"
      );
      expect(p1Check).toBeDefined();
    });
  });

  describe("artifact creation", () => {
    it("should create pre-signal.yaml artifact", async () => {
      await runPreSignalCheck({
        task: "1",
        force: true,
      });

      const artifactPath = path.join(
        tempDir,
        ".orchestra",
        "handover",
        "verification",
        "pre-signal.yaml"
      );
      expect(fs.existsSync(artifactPath)).toBe(true);

      const content = fs.readFileSync(artifactPath, "utf-8");
      expect(content).toContain("task_id: 1");
      // YAML may quote the status value, so use regex to match either form
      expect(content).toMatch(/status:\s*"?PASSED"?/);
    });

    it("should create audit trail artifact", async () => {
      await runPreSignalCheck({
        task: "1",
        force: true,
      });

      const auditDir = path.join(
        tempDir,
        ".orchestra",
        "implementor",
        "artifacts",
        "pre-signal"
      );
      const files = fs.readdirSync(auditDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toMatch(/^task-1-/);
    });

    it("should return artifact path in result", async () => {
      const result = await runPreSignalCheck({
        task: "1",
        force: true,
      });

      expect(result.artifactPath).toBeDefined();
      expect(result.artifactPath).toContain("pre-signal.yaml");
    });
  });

  describe("check categories", () => {
    it("should have checks in deliverables category", async () => {
      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const deliverableChecks = result.checks.filter(
        (c) => c.category === "deliverables"
      );
      expect(deliverableChecks.length).toBeGreaterThan(0);
    });

    it("should have checks in git category", async () => {
      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const gitChecks = result.checks.filter((c) => c.category === "git");
      expect(gitChecks.length).toBeGreaterThan(0);
    });

    it("should have checks in quality category when not skipping", async () => {
      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const qualityChecks = result.checks.filter(
        (c) => c.category === "quality"
      );
      expect(qualityChecks.length).toBeGreaterThan(0);
    });
  });

  describe("visual task detection", () => {
    it("should run visual checks when handover mentions VISUAL", async () => {
      const handover = `# Task 1: Visual Component

This is a VISUAL task.
`;
      fs.writeFileSync(
        path.join(tempDir, ".orchestra", "handover", "current-task.md"),
        handover
      );

      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const visualChecks = result.checks.filter((c) => c.category === "visual");
      expect(visualChecks.length).toBeGreaterThan(0);
    });

    it("should run visual checks when handover mentions demo", async () => {
      const handover = `# Task 1: Demo Component

Create a demo for the feature.
`;
      fs.writeFileSync(
        path.join(tempDir, ".orchestra", "handover", "current-task.md"),
        handover
      );

      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const visualChecks = result.checks.filter((c) => c.category === "visual");
      expect(visualChecks.length).toBeGreaterThan(0);
    });

    it("should not run visual checks for non-visual tasks", async () => {
      const handover = `# Task 1: Backend Service

Implement the API endpoint.
`;
      fs.writeFileSync(
        path.join(tempDir, ".orchestra", "handover", "current-task.md"),
        handover
      );

      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const visualChecks = result.checks.filter((c) => c.category === "visual");
      expect(visualChecks.length).toBe(0);
    });
  });

  describe("summary calculation", () => {
    it("should have correct summary for force mode", async () => {
      const result = await runPreSignalCheck({
        task: "1",
        force: true,
      });

      expect(result.summary).toEqual({
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
      });
    });

    it("should set status to FAILED if blocking check fails", async () => {
      // Don't create the required file - P1 will fail
      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      expect(result.status).toBe("FAILED");
      expect(result.summary.failed).toBeGreaterThan(0);
    });
  });

  describe("TODO detection (P9)", () => {
    it("should detect TODO comments in new files", async () => {
      // tempDir is the repo root (contains .orchestra/)
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, "src", "new-file.ts"),
        `// TODO: implement this\nexport const x = 1;\n`.repeat(5)
      );

      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const p9Check = result.checks.find(
        (c) => c.id === "P9" && c.file === "src/new-file.ts"
      );
      expect(p9Check).toBeDefined();
      expect(p9Check?.passed).toBe(false);
      expect(p9Check?.severity).toBe("WARNING");
    });

    it("should pass P9 for files without TODO comments", async () => {
      // tempDir is the repo root (contains .orchestra/)
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, "src", "new-file.ts"),
        `export const x = 1;\nexport const y = 2;\n`.repeat(5)
      );

      const result = await runPreSignalCheck({
        task: "1",
        skipTests: true,
        skipBuild: true,
      });

      const p9Check = result.checks.find(
        (c) => c.id === "P9" && c.file === "src/new-file.ts"
      );
      expect(p9Check).toBeDefined();
      expect(p9Check?.passed).toBe(true);
    });
  });

  describe("task determination", () => {
    it("should use explicit task ID when provided", async () => {
      const result = await runPreSignalCheck({
        task: "5",
        force: true,
      });

      expect(result.taskId).toBe(5);
    });

    it("should find task in IMPLEMENT status when no explicit ID", async () => {
      const result = await runPreSignalCheck({
        force: true,
      });

      expect(result.taskId).toBe(1);
    });
  });
});
