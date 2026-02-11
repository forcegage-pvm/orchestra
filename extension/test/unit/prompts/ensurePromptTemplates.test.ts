/**
 * Tests for ensurePromptTemplates template sync mechanism
 *
 * Validates that ensurePromptTemplates copies all expected templates,
 * partials, and schema files from the extension bundle to workspace.
 *
 * This is the final validation for template sync completeness.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "vscode";
import { ensurePromptTemplates } from "../../../src/prompts/ensurePromptTemplates.js";

/**
 * All 13 prompt templates that must be synced from the extension bundle.
 */
const ALL_TEMPLATES = [
  "prepare",
  "implement",
  "verify",
  "retry",
  "sprint-review",
  "handover-review",
  "handover-fix",
  "code-review",
  "code-review-bulk",
  "code-review-re-review",
  "code-review-fix",
  "code-review-fix-prepare",
  "code-review-fix-implement",
] as const;

/**
 * All 3 shared partials expected in _partials/.
 */
const ALL_PARTIALS = [
  "stub-hunter-mode",
  "spec-protocol",
  "task-header",
] as const;

/**
 * Schema files expected in _schema/.
 */
const ALL_SCHEMA_FILES = ["context.schema.json"] as const;

describe("ensurePromptTemplates - Template Sync", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let extensionPath: string;
  let loggerMock: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let showErrorMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-"));
    workspaceRoot = path.join(tempDir, "workspace");
    extensionPath = path.join(tempDir, "extension");

    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(extensionPath, { recursive: true });

    loggerMock = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    showErrorMessage = vi.fn();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createContext = (): ExtensionContext =>
    ({ extensionPath }) as ExtensionContext;

  const runSync = (): void => {
    ensurePromptTemplates(createContext(), workspaceRoot, {
      logger: loggerMock,
      showErrorMessage,
    });
  };

  /**
   * Set up a source directory structure that mirrors the real extension bundle
   * with all 13 templates, 3 partials, and 1 schema file.
   */
  function setupFullSourceBundle(): void {
    const sourceDir = path.join(extensionPath, "templates", "prompts");
    const partialsDir = path.join(sourceDir, "_partials");
    const schemaDir = path.join(sourceDir, "_schema");

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(partialsDir, { recursive: true });
    fs.mkdirSync(schemaDir, { recursive: true });

    // Write all 13 templates
    for (const template of ALL_TEMPLATES) {
      fs.writeFileSync(
        path.join(sourceDir, `${template}.hbs`),
        `Template content for ${template}`,
      );
    }

    // Write all 3 partials
    for (const partial of ALL_PARTIALS) {
      fs.writeFileSync(
        path.join(partialsDir, `${partial}.hbs`),
        `Partial content for ${partial}`,
      );
    }

    // Write schema file
    for (const schema of ALL_SCHEMA_FILES) {
      fs.writeFileSync(
        path.join(schemaDir, schema),
        JSON.stringify({ type: "object", description: schema }, null, 2),
      );
    }
  }

  describe("all 13 templates are synced", () => {
    it("should copy all 13 .hbs template files to workspace", () => {
      setupFullSourceBundle();

      runSync();

      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );

      for (const template of ALL_TEMPLATES) {
        const targetFile = path.join(targetDir, `${template}.hbs`);
        expect(
          fs.existsSync(targetFile),
          `Template "${template}.hbs" not found at ${targetFile}`,
        ).toBe(true);
      }
    });

    it("should preserve template content during copy", () => {
      setupFullSourceBundle();

      runSync();

      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );

      for (const template of ALL_TEMPLATES) {
        const expected = `Template content for ${template}`;
        const actual = fs.readFileSync(
          path.join(targetDir, `${template}.hbs`),
          "utf-8",
        );
        expect(actual, `Content mismatch for ${template}.hbs`).toBe(expected);
      }
    });

    it("should log each template sync", () => {
      setupFullSourceBundle();

      runSync();

      for (const template of ALL_TEMPLATES) {
        expect(loggerMock.info).toHaveBeenCalledWith(
          `Synced prompt template: ${template}.hbs`,
        );
      }
    });

    it("should have exactly 13 template files", () => {
      expect(ALL_TEMPLATES.length).toBe(13);
    });
  });

  describe("_partials directory contents are synced", () => {
    it("should copy stub-hunter-mode.hbs to _partials", () => {
      setupFullSourceBundle();

      runSync();

      const partialsDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_partials",
      );

      expect(
        fs.existsSync(path.join(partialsDir, "stub-hunter-mode.hbs")),
      ).toBe(true);
    });

    it("should copy spec-protocol.hbs to _partials", () => {
      setupFullSourceBundle();

      runSync();

      const partialsDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_partials",
      );

      expect(fs.existsSync(path.join(partialsDir, "spec-protocol.hbs"))).toBe(
        true,
      );
    });

    it("should copy task-header.hbs to _partials", () => {
      setupFullSourceBundle();

      runSync();

      const partialsDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_partials",
      );

      expect(fs.existsSync(path.join(partialsDir, "task-header.hbs"))).toBe(
        true,
      );
    });

    it("should copy all 3 partials to _partials directory", () => {
      setupFullSourceBundle();

      runSync();

      const partialsDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_partials",
      );

      for (const partial of ALL_PARTIALS) {
        const targetFile = path.join(partialsDir, `${partial}.hbs`);
        expect(
          fs.existsSync(targetFile),
          `Partial "${partial}.hbs" not found at ${targetFile}`,
        ).toBe(true);
      }
    });

    it("should preserve partial content during copy", () => {
      setupFullSourceBundle();

      runSync();

      const partialsDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_partials",
      );

      for (const partial of ALL_PARTIALS) {
        const expected = `Partial content for ${partial}`;
        const actual = fs.readFileSync(
          path.join(partialsDir, `${partial}.hbs`),
          "utf-8",
        );
        expect(actual, `Content mismatch for partial ${partial}.hbs`).toBe(
          expected,
        );
      }
    });

    it("should log each partial sync", () => {
      setupFullSourceBundle();

      runSync();

      for (const partial of ALL_PARTIALS) {
        expect(loggerMock.info).toHaveBeenCalledWith(
          `Synced partial template: ${partial}.hbs`,
        );
      }
    });

    it("should preserve existing user-modified partials", () => {
      setupFullSourceBundle();

      // First sync
      runSync();

      const partialsDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_partials",
      );

      // User modifies a partial
      fs.writeFileSync(
        path.join(partialsDir, "stub-hunter-mode.hbs"),
        "User-customized stub-hunter-mode content",
      );

      loggerMock.info.mockClear();

      // Sync again
      runSync();

      // User's modification should be preserved
      expect(
        fs.readFileSync(
          path.join(partialsDir, "stub-hunter-mode.hbs"),
          "utf-8",
        ),
      ).toBe("User-customized stub-hunter-mode content");

      // Should log a skip message
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Skipped existing partial template (preserving user modifications): stub-hunter-mode.hbs",
      );
    });
  });

  describe("_schema directory contents are synced", () => {
    it("should copy context.schema.json to _schema", () => {
      setupFullSourceBundle();

      runSync();

      const schemaDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_schema",
      );

      expect(fs.existsSync(path.join(schemaDir, "context.schema.json"))).toBe(
        true,
      );
    });

    it("should preserve schema file content during copy", () => {
      setupFullSourceBundle();

      runSync();

      const schemaDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_schema",
      );

      const expected = JSON.stringify(
        { type: "object", description: "context.schema.json" },
        null,
        2,
      );
      const actual = fs.readFileSync(
        path.join(schemaDir, "context.schema.json"),
        "utf-8",
      );
      expect(actual).toBe(expected);
    });

    it("should log schema file sync", () => {
      setupFullSourceBundle();

      runSync();

      expect(loggerMock.info).toHaveBeenCalledWith(
        "Synced schema file: context.schema.json",
      );
    });
  });

  describe("complete sync validation", () => {
    it("should sync all templates, partials, and schema in a single call", () => {
      setupFullSourceBundle();

      runSync();

      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );
      const partialsDir = path.join(targetDir, "_partials");
      const schemaDir = path.join(targetDir, "_schema");

      // Verify all 13 templates
      const templateFiles = fs
        .readdirSync(targetDir)
        .filter((f) => f.endsWith(".hbs"));
      expect(templateFiles.length).toBe(13);

      // Verify all 3 partials
      const partialFiles = fs
        .readdirSync(partialsDir)
        .filter((f) => f.endsWith(".hbs"));
      expect(partialFiles.length).toBe(3);

      // Verify schema file
      const schemaFiles = fs.readdirSync(schemaDir);
      expect(schemaFiles).toContain("context.schema.json");
    });

    it("should preserve existing user-modified templates and not overwrite them", () => {
      setupFullSourceBundle();

      // First sync - populates all templates
      runSync();

      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );

      // User modifies a template
      const targetFile = path.join(targetDir, "prepare.hbs");
      fs.writeFileSync(targetFile, "User-customized prepare content");

      // Update the source (simulating an extension update)
      const sourceDir = path.join(extensionPath, "templates", "prompts");
      fs.writeFileSync(
        path.join(sourceDir, "prepare.hbs"),
        "Updated prepare content v2",
      );

      // Reset logger so we can check new calls
      loggerMock.info.mockClear();

      // Sync again
      runSync();

      // User's modification should be preserved, NOT overwritten
      expect(fs.readFileSync(targetFile, "utf-8")).toBe(
        "User-customized prepare content",
      );
    });

    it("should log skip messages for existing templates", () => {
      setupFullSourceBundle();

      // First sync
      runSync();
      loggerMock.info.mockClear();

      // Second sync - all templates already exist
      runSync();

      // Should log skip messages instead of sync messages
      for (const template of ALL_TEMPLATES) {
        expect(loggerMock.info).toHaveBeenCalledWith(
          `Skipped existing prompt template (preserving user modifications): ${template}.hbs`,
        );
      }
    });

    it("should copy new templates that don't exist yet in workspace", () => {
      setupFullSourceBundle();

      // First sync
      runSync();

      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );

      // Remove one template from workspace (simulating it being missing)
      fs.unlinkSync(path.join(targetDir, "prepare.hbs"));

      // Add a new template to source (simulating extension update with new template)
      const sourceDir = path.join(extensionPath, "templates", "prompts");
      fs.writeFileSync(
        path.join(sourceDir, "new-template.hbs"),
        "New template content",
      );

      loggerMock.info.mockClear();

      // Sync again
      runSync();

      // The missing 'prepare.hbs' should be re-copied
      expect(fs.existsSync(path.join(targetDir, "prepare.hbs"))).toBe(true);

      // The new template should be copied
      expect(fs.existsSync(path.join(targetDir, "new-template.hbs"))).toBe(
        true,
      );

      // Existing templates should NOT have been re-synced (should show skip)
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Synced prompt template: prepare.hbs",
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Synced prompt template: new-template.hbs",
      );
    });

    it("should not produce errors during normal sync operation", () => {
      setupFullSourceBundle();

      runSync();

      expect(loggerMock.error).not.toHaveBeenCalled();
      expect(showErrorMessage).not.toHaveBeenCalled();
    });
  });

  describe("sync from real extension bundle", () => {
    it("should verify real extension bundle has all 13 templates", () => {
      // Use the real extension/templates/prompts/ directory
      const realSourceDir = path.resolve(
        __dirname,
        "../../..",
        "templates",
        "prompts",
      );

      const files = fs
        .readdirSync(realSourceDir)
        .filter((f) => f.endsWith(".hbs"));
      const templateNames = files.map((f) => f.replace(".hbs", ""));

      for (const expected of ALL_TEMPLATES) {
        expect(
          templateNames,
          `Missing template "${expected}.hbs" in extension bundle`,
        ).toContain(expected);
      }
    });

    it("should verify real extension bundle has all 3 partials", () => {
      const realPartialsDir = path.resolve(
        __dirname,
        "../../..",
        "templates",
        "prompts",
        "_partials",
      );

      const files = fs
        .readdirSync(realPartialsDir)
        .filter((f) => f.endsWith(".hbs"));
      const partialNames = files.map((f) => f.replace(".hbs", ""));

      for (const expected of ALL_PARTIALS) {
        expect(
          partialNames,
          `Missing partial "${expected}.hbs" in extension bundle`,
        ).toContain(expected);
      }
    });

    it("should verify real extension bundle has context.schema.json", () => {
      const realSchemaDir = path.resolve(
        __dirname,
        "../../..",
        "templates",
        "prompts",
        "_schema",
      );

      expect(
        fs.existsSync(path.join(realSchemaDir, "context.schema.json")),
      ).toBe(true);
    });

    it("should successfully sync from real extension bundle to temp workspace", () => {
      // Use the real extension path
      const realExtensionPath = path.resolve(__dirname, "../../..");
      const ctx = { extensionPath: realExtensionPath } as ExtensionContext;

      ensurePromptTemplates(ctx, workspaceRoot, {
        logger: loggerMock,
        showErrorMessage,
      });

      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );
      const partialsDir = path.join(targetDir, "_partials");
      const schemaDir = path.join(targetDir, "_schema");

      // All 13 templates copied
      for (const template of ALL_TEMPLATES) {
        expect(
          fs.existsSync(path.join(targetDir, `${template}.hbs`)),
          `Real sync: missing template ${template}.hbs`,
        ).toBe(true);
      }

      // All 3 partials copied
      for (const partial of ALL_PARTIALS) {
        expect(
          fs.existsSync(path.join(partialsDir, `${partial}.hbs`)),
          `Real sync: missing partial ${partial}.hbs`,
        ).toBe(true);
      }

      // Schema copied
      expect(fs.existsSync(path.join(schemaDir, "context.schema.json"))).toBe(
        true,
      );

      // README copied to .orchestra/templates/
      const readmeTarget = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "README.md",
      );
      expect(
        fs.existsSync(readmeTarget),
        "Real sync: missing README.md in .orchestra/templates/",
      ).toBe(true);

      // No errors
      expect(loggerMock.error).not.toHaveBeenCalled();
      expect(showErrorMessage).not.toHaveBeenCalled();
    });
  });

  describe("README.md sync", () => {
    it("should copy README.md from templates/ root to .orchestra/templates/", () => {
      setupFullSourceBundle();

      // Add README to source templates directory
      const readmeSource = path.join(extensionPath, "templates", "README.md");
      fs.writeFileSync(readmeSource, "# Template README");

      runSync();

      const readmeTarget = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "README.md",
      );
      expect(fs.existsSync(readmeTarget)).toBe(true);
      expect(fs.readFileSync(readmeTarget, "utf-8")).toBe("# Template README");
    });

    it("should preserve existing user-modified README.md", () => {
      setupFullSourceBundle();

      const readmeSource = path.join(extensionPath, "templates", "README.md");
      fs.writeFileSync(readmeSource, "# Original README");

      // First sync
      runSync();

      const readmeTarget = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "README.md",
      );

      // User modifies README
      fs.writeFileSync(readmeTarget, "# User-customized README");

      loggerMock.info.mockClear();

      // Sync again
      runSync();

      // User modification preserved
      expect(fs.readFileSync(readmeTarget, "utf-8")).toBe(
        "# User-customized README",
      );

      // Skip message logged
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Skipped existing templates README.md (preserving user modifications)",
      );
    });

    it("should not error when README.md does not exist in bundle", () => {
      setupFullSourceBundle();
      // No README.md in source — should not error

      runSync();

      expect(loggerMock.error).not.toHaveBeenCalled();
      expect(showErrorMessage).not.toHaveBeenCalled();
    });
  });
});
