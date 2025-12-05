/**
 * Init Command Tests
 *
 * Tests for the orchestra init command.
 * TDD approach: tests written first, implementation follows.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand, runInit } from "../../src/commands/init.js";

describe("init command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-test-"));

    // Spy on console and process.exit
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Restore mocks
    vi.restoreAllMocks();
  });

  describe("directory creation", () => {
    it("should create .orchestra directory", async () => {
      await runInit({ orchestraRoot: tempDir });

      const orchestraDir = path.join(tempDir, ".orchestra");
      expect(fs.existsSync(orchestraDir)).toBe(true);
      expect(fs.statSync(orchestraDir).isDirectory()).toBe(true);
    });

    it("should create all default folders", async () => {
      await runInit({ orchestraRoot: tempDir });

      // NOTE: No scripts folders - CLI commands ARE the implementation
      // See Bible Section 7.3 "CLI Command Mapping"
      // No subfolders in handover - signal.md and feedback.md are transient files
      const expectedFolders = [
        ".orchestra/common/templates",
        ".orchestra/orchestrator/.orchestrator-only/verification",
        ".orchestra/orchestrator/.orchestrator-only/preflight",
        ".orchestra/orchestrator/processes",
        ".orchestra/orchestrator/results",
        ".orchestra/handover",
        ".orchestra/implementor/artifacts",
      ];

      for (const folder of expectedFolders) {
        const folderPath = path.join(tempDir, folder);
        expect(fs.existsSync(folderPath), `Expected ${folder} to exist`).toBe(
          true
        );
        expect(
          fs.statSync(folderPath).isDirectory(),
          `Expected ${folder} to be a directory`
        ).toBe(true);
      }
    });
  });

  describe("config file creation", () => {
    it("should create config file", async () => {
      await runInit({ orchestraRoot: tempDir });

      const configPath = path.join(tempDir, ".orchestra", "orchestra.yaml");
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it("should create valid YAML config with defaults", async () => {
      await runInit({ orchestraRoot: tempDir });

      const configPath = path.join(tempDir, ".orchestra", "orchestra.yaml");
      const content = fs.readFileSync(configPath, "utf-8");

      // Should contain expected structure
      expect(content).toContain("version");
      expect(content).toContain("paths");
    });
  });

  describe("template files", () => {
    it("should create template files", async () => {
      await runInit({ orchestraRoot: tempDir });

      const templateDir = path.join(
        tempDir,
        ".orchestra",
        "common",
        "templates"
      );
      expect(fs.existsSync(templateDir)).toBe(true);
      expect(fs.readdirSync(templateDir).length).toBeGreaterThan(0);
    });

    it("should create current-task.md.hbs template", async () => {
      await runInit({ orchestraRoot: tempDir });

      const templatePath = path.join(
        tempDir,
        ".orchestra",
        "common",
        "templates",
        "current-task.md.hbs"
      );
      expect(fs.existsSync(templatePath)).toBe(true);
    });

    it("should create completion-signal.md.hbs template", async () => {
      await runInit({ orchestraRoot: tempDir });

      const templatePath = path.join(
        tempDir,
        ".orchestra",
        "common",
        "templates",
        "completion-signal.md.hbs"
      );
      expect(fs.existsSync(templatePath)).toBe(true);
    });

    it("should create task-context.md.hbs template", async () => {
      await runInit({ orchestraRoot: tempDir });

      const templatePath = path.join(
        tempDir,
        ".orchestra",
        "common",
        "templates",
        "task-context.md.hbs"
      );
      expect(fs.existsSync(templatePath)).toBe(true);
    });
  });

  describe("already initialized", () => {
    it("should fail if already initialized without force", async () => {
      // First init
      await runInit({ orchestraRoot: tempDir });

      // Second init should fail
      await expect(runInit({ orchestraRoot: tempDir })).rejects.toThrow(
        "process.exit(1)"
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should output error message when already initialized", async () => {
      // First init
      await runInit({ orchestraRoot: tempDir });

      // Reset spies
      consoleSpy.mockClear();
      consoleErrorSpy.mockClear();

      // Second init should show error
      await expect(runInit({ orchestraRoot: tempDir })).rejects.toThrow(
        "process.exit(1)"
      );

      const allOutput = [
        ...consoleSpy.mock.calls.map((c) => c[0]),
        ...consoleErrorSpy.mock.calls.map((c) => c[0]),
      ].join("\n");

      expect(allOutput.toLowerCase()).toMatch(/already|initialized|exists/);
    });
  });

  describe("force flag", () => {
    it("should reinitialize with force flag", async () => {
      // First init
      await runInit({ orchestraRoot: tempDir });

      // Add a marker file to verify overwrite
      const markerPath = path.join(tempDir, ".orchestra", "test-marker.txt");
      fs.writeFileSync(markerPath, "marker");

      // Second init with force should succeed
      await expect(
        runInit({ force: true, orchestraRoot: tempDir })
      ).resolves.not.toThrow();

      // .orchestra should still exist
      expect(fs.existsSync(path.join(tempDir, ".orchestra"))).toBe(true);
    });
  });

  describe("dry run", () => {
    it("should show dry run without creating files", async () => {
      await runInit({ dryRun: true, orchestraRoot: tempDir });

      const orchestraDir = path.join(tempDir, ".orchestra");
      expect(fs.existsSync(orchestraDir)).toBe(false);
    });

    it("should output what would be created in dry run", async () => {
      await runInit({ dryRun: true, orchestraRoot: tempDir });

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output.toLowerCase()).toMatch(/would|dry/);
    });
  });

  describe("JSON output", () => {
    it("should output JSON when requested", async () => {
      await runInit({ json: true, orchestraRoot: tempDir });

      // Find the JSON output call
      const jsonOutput = consoleSpy.mock.calls.find((c) => {
        try {
          JSON.parse(c[0]);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput![0]);
      expect(parsed.success).toBe(true);
    });

    it("should include path in JSON output", async () => {
      await runInit({ json: true, orchestraRoot: tempDir });

      const jsonOutput = consoleSpy.mock.calls.find((c) => {
        try {
          JSON.parse(c[0]);
          return true;
        } catch {
          return false;
        }
      });

      const parsed = JSON.parse(jsonOutput![0]);
      expect(parsed.path).toContain(".orchestra");
    });

    it("should include folders and files in JSON output", async () => {
      await runInit({ json: true, orchestraRoot: tempDir });

      const jsonOutput = consoleSpy.mock.calls.find((c) => {
        try {
          JSON.parse(c[0]);
          return true;
        } catch {
          return false;
        }
      });

      const parsed = JSON.parse(jsonOutput![0]);
      expect(parsed.folders).toBeDefined();
      expect(Array.isArray(parsed.folders)).toBe(true);
      expect(parsed.files).toBeDefined();
      expect(Array.isArray(parsed.files)).toBe(true);
    });

    it("should output JSON error when already initialized", async () => {
      // First init
      await runInit({ orchestraRoot: tempDir });

      // Reset spies
      consoleSpy.mockClear();

      // Second init with JSON should output JSON error
      await expect(
        runInit({ json: true, orchestraRoot: tempDir })
      ).rejects.toThrow("process.exit(1)");

      const jsonOutput = consoleSpy.mock.calls.find((c) => {
        try {
          JSON.parse(c[0]);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput![0]);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });
  });

  describe("complete folder structure", () => {
    it("should create all default folders and files", async () => {
      await runInit({ orchestraRoot: tempDir });

      // Check all required folders exist
      // NOTE: No scripts folders - CLI commands ARE the implementation
      // See Bible Section 7.3 "CLI Command Mapping"
      // No subfolders in handover - signal.md and feedback.md are transient files
      const requiredFolders = [
        ".orchestra",
        ".orchestra/common",
        ".orchestra/common/templates",
        ".orchestra/orchestrator",
        ".orchestra/orchestrator/.orchestrator-only",
        ".orchestra/orchestrator/.orchestrator-only/verification",
        ".orchestra/orchestrator/.orchestrator-only/preflight",
        ".orchestra/orchestrator/processes",
        ".orchestra/orchestrator/results",
        ".orchestra/handover",
        ".orchestra/implementor",
        ".orchestra/implementor/artifacts",
      ];

      for (const folder of requiredFolders) {
        const folderPath = path.join(tempDir, folder);
        expect(fs.existsSync(folderPath), `Missing folder: ${folder}`).toBe(
          true
        );
      }

      // Check required files exist
      const requiredFiles = [
        ".orchestra/orchestra.yaml",
        ".orchestra/common/templates/current-task.md.hbs",
        ".orchestra/common/templates/completion-signal.md.hbs",
        ".orchestra/common/templates/task-context.md.hbs",
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(tempDir, file);
        expect(fs.existsSync(filePath), `Missing file: ${file}`).toBe(true);
      }
    });
  });

  describe("exit codes", () => {
    it("should exit with code 0 on success (implicit)", async () => {
      // If runInit completes without throwing, it's a success
      await expect(runInit({ orchestraRoot: tempDir })).resolves.not.toThrow();
    });

    it("should exit with code 1 on failure", async () => {
      // First init
      await runInit({ orchestraRoot: tempDir });

      // Second init should fail with exit code 1
      await expect(runInit({ orchestraRoot: tempDir })).rejects.toThrow(
        "process.exit(1)"
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("command definition", () => {
    it("should have correct command name", () => {
      const command = initCommand();
      expect(command.name()).toBe("init");
    });

    it("should have description", () => {
      const command = initCommand();
      expect(command.description()).toBeTruthy();
    });

    it("should have force option", () => {
      const command = initCommand();
      const forceOpt = command.options.find(
        (o) => o.long === "--force" || o.short === "-f"
      );
      expect(forceOpt).toBeDefined();
    });

    it("should have json option", () => {
      const command = initCommand();
      const jsonOpt = command.options.find((o) => o.long === "--json");
      expect(jsonOpt).toBeDefined();
    });

    it("should have dry-run option", () => {
      const command = initCommand();
      const dryRunOpt = command.options.find((o) => o.long === "--dry-run");
      expect(dryRunOpt).toBeDefined();
    });

    it("should have git-stage option", () => {
      const command = initCommand();
      const gitStageOpt = command.options.find((o) => o.long === "--git-stage");
      expect(gitStageOpt).toBeDefined();
    });

    it("should have git-commit option", () => {
      const command = initCommand();
      const gitCommitOpt = command.options.find(
        (o) => o.long === "--git-commit"
      );
      expect(gitCommitOpt).toBeDefined();
    });
  });
});
