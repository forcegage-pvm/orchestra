/**
 * Tests for ensurePromptTemplates function in extension.ts
 *
 * Verifies Task 2: Template directory structure and sync mechanism
 *
 * Tests verify:
 * 1. Directory creation (target, _partials, _schema)
 * 2. File copying from extension bundle to workspace
 * 3. Idempotent behavior on multiple calls
 * 4. Handling of missing source directory
 * 5. Error handling for filesystem operations
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "vscode";
import { ensurePromptTemplates } from "../src/extension.js";

/**
 * These tests exercise the real ensurePromptTemplates implementation by passing
 * a mocked logger and error handler. This avoids needing a full VS Code runtime
 * while keeping coverage on the actual sync logic.
 */

describe("ensurePromptTemplates - Behavior tests", () => {
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
    // Create temporary directories
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ensure-prompt-templates-test-"),
    );
    workspaceRoot = path.join(tempDir, "workspace");
    extensionPath = path.join(tempDir, "extension");

    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(extensionPath, { recursive: true });

    // Reset mocks
    loggerMock = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    showErrorMessage = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createContext = (pathToExtension: string): ExtensionContext =>
    ({ extensionPath: pathToExtension }) as ExtensionContext;

  const runEnsurePromptTemplates = (): void => {
    ensurePromptTemplates(createContext(extensionPath), workspaceRoot, {
      logger: loggerMock,
      showErrorMessage,
    });
  };

  /**
   * Helper to set up source directory structure
   */
  function setupSourceDirectory(): void {
    const sourceDir = path.join(extensionPath, "templates", "prompts");
    const partialsDir = path.join(sourceDir, "_partials");
    const schemaDir = path.join(sourceDir, "_schema");

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(partialsDir, { recursive: true });
    fs.mkdirSync(schemaDir, { recursive: true });
  }

  /**
   * Helper to write a template file in source
   */
  function writeSourceTemplate(name: string, content: string): void {
    const sourceDir = path.join(extensionPath, "templates", "prompts");
    fs.writeFileSync(path.join(sourceDir, `${name}.hbs`), content);
  }

  /**
   * Helper to write a partial file in source
   */
  function writeSourcePartial(name: string, content: string): void {
    const partialsDir = path.join(
      extensionPath,
      "templates",
      "prompts",
      "_partials",
    );
    fs.writeFileSync(path.join(partialsDir, `${name}.hbs`), content);
  }

  /**
   * Helper to write a schema file in source
   */
  function writeSourceSchema(name: string, content: string): void {
    const schemaDir = path.join(
      extensionPath,
      "templates",
      "prompts",
      "_schema",
    );
    fs.writeFileSync(path.join(schemaDir, name), content);
  }

  describe("directory creation", () => {
    it("should create .orchestra/templates/prompts directory", () => {
      setupSourceDirectory();

      runEnsurePromptTemplates();

      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );
      expect(fs.existsSync(targetDir)).toBe(true);
    });

    it("should create _partials subdirectory", () => {
      setupSourceDirectory();

      runEnsurePromptTemplates();

      const partialsDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_partials",
      );
      expect(fs.existsSync(partialsDir)).toBe(true);
    });

    it("should create _schema subdirectory", () => {
      setupSourceDirectory();

      runEnsurePromptTemplates();

      const schemaDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_schema",
      );
      expect(fs.existsSync(schemaDir)).toBe(true);
    });

    it("should log when directories are created", () => {
      setupSourceDirectory();

      runEnsurePromptTemplates();

      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining("Created .orchestra/templates/prompts directory"),
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining("Created _partials directory"),
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining("Created _schema directory"),
      );
    });
  });

  describe("file copying", () => {
    it("should copy .hbs files from source to target", () => {
      setupSourceDirectory();
      writeSourceTemplate("test-template", "Hello {{name}}");

      runEnsurePromptTemplates();

      const targetFile = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "test-template.hbs",
      );
      expect(fs.existsSync(targetFile)).toBe(true);
      expect(fs.readFileSync(targetFile, "utf-8")).toBe("Hello {{name}}");
    });

    it("should copy multiple .hbs files", () => {
      setupSourceDirectory();
      writeSourceTemplate("template1", "Content 1");
      writeSourceTemplate("template2", "Content 2");
      writeSourceTemplate("template3", "Content 3");

      runEnsurePromptTemplates();

      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );
      expect(fs.existsSync(path.join(targetDir, "template1.hbs"))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, "template2.hbs"))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, "template3.hbs"))).toBe(true);
    });

    it("should only copy .hbs files, not other file types", () => {
      setupSourceDirectory();
      writeSourceTemplate("valid", "Valid content");

      // Write non-.hbs file
      const sourceDir = path.join(extensionPath, "templates", "prompts");
      fs.writeFileSync(path.join(sourceDir, "readme.txt"), "Not a template");
      fs.writeFileSync(path.join(sourceDir, "notes.md"), "Also not a template");

      runEnsurePromptTemplates();

      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );
      expect(fs.existsSync(path.join(targetDir, "valid.hbs"))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, "readme.txt"))).toBe(false);
      expect(fs.existsSync(path.join(targetDir, "notes.md"))).toBe(false);
    });

    it("should copy files from _partials directory", () => {
      setupSourceDirectory();
      writeSourcePartial("header", "<header>{{title}}</header>");
      writeSourcePartial("footer", "<footer>{{year}}</footer>");

      runEnsurePromptTemplates();

      const partialsDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_partials",
      );
      expect(fs.existsSync(path.join(partialsDir, "header.hbs"))).toBe(true);
      expect(fs.existsSync(path.join(partialsDir, "footer.hbs"))).toBe(true);
    });

    it("should copy files from _schema directory", () => {
      setupSourceDirectory();
      const schemaContent = JSON.stringify({ type: "object" }, null, 2);
      writeSourceSchema("context.schema.json", schemaContent);

      runEnsurePromptTemplates();

      const schemaDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "_schema",
      );
      const schemaFile = path.join(schemaDir, "context.schema.json");
      expect(fs.existsSync(schemaFile)).toBe(true);
      expect(fs.readFileSync(schemaFile, "utf-8")).toBe(schemaContent);
    });

    it("should log when files are synced", () => {
      setupSourceDirectory();
      writeSourceTemplate("test", "content");
      writeSourcePartial("partial", "partial content");
      writeSourceSchema("schema.json", "{}");

      runEnsurePromptTemplates();

      expect(loggerMock.info).toHaveBeenCalledWith(
        "Synced prompt template: test.hbs",
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Synced partial template: partial.hbs",
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Synced schema file: schema.json",
      );
    });
  });

  describe("idempotent behavior", () => {
    it("should be safe to call multiple times", () => {
      setupSourceDirectory();
      writeSourceTemplate("test", "Original content");

      // Call multiple times
      runEnsurePromptTemplates();
      runEnsurePromptTemplates();
      runEnsurePromptTemplates();

      const targetFile = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "test.hbs",
      );
      expect(fs.existsSync(targetFile)).toBe(true);
      expect(fs.readFileSync(targetFile, "utf-8")).toBe("Original content");
    });

    it("should overwrite existing files with new content", () => {
      setupSourceDirectory();
      writeSourceTemplate("test", "Version 1");

      runEnsurePromptTemplates();

      // Modify source
      writeSourceTemplate("test", "Version 2");

      // Sync again
      runEnsurePromptTemplates();

      const targetFile = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "test.hbs",
      );
      expect(fs.readFileSync(targetFile, "utf-8")).toBe("Version 2");
    });

    it("should not log directory creation on subsequent calls", () => {
      setupSourceDirectory();

      runEnsurePromptTemplates();

      // Clear mocks and call again
      loggerMock.info.mockClear();

      runEnsurePromptTemplates();

      // Should not log "Created" messages since directories already exist
      const createdCalls = loggerMock.info.mock.calls.filter((call) =>
        call[0].includes("Created"),
      );
      expect(createdCalls.length).toBe(0);
    });
  });

  describe("missing source directory handling", () => {
    it("should warn and return early if source directory does not exist", () => {
      // Don't set up source directory

      runEnsurePromptTemplates();

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining("Prompt templates source directory not found:"),
      );
    });

    it("should still create target directories even if source is missing", () => {
      // Don't set up source directory

      runEnsurePromptTemplates();

      // Target directories should be created before checking source
      const targetDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
      );
      expect(fs.existsSync(targetDir)).toBe(true);
    });

    it("should handle missing _partials source directory gracefully", () => {
      // Create source without _partials
      const sourceDir = path.join(extensionPath, "templates", "prompts");
      fs.mkdirSync(sourceDir, { recursive: true });
      writeSourceTemplate("test", "content");

      // Should not throw
      expect(() => {
        runEnsurePromptTemplates();
      }).not.toThrow();
    });

    it("should handle missing _schema source directory gracefully", () => {
      // Create source without _schema
      const sourceDir = path.join(extensionPath, "templates", "prompts");
      fs.mkdirSync(sourceDir, { recursive: true });
      writeSourceTemplate("test", "content");

      // Should not throw
      expect(() => {
        runEnsurePromptTemplates();
      }).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle errors gracefully and show error message", () => {
      setupSourceDirectory();

      const mkdirSpy = vi
        .spyOn(fs, "mkdirSync")
        .mockImplementationOnce(() => {
          throw new Error("Disk full");
        });

      runEnsurePromptTemplates();

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to create .orchestra/templates/prompts directory: Disk full",
        ),
      );
      expect(showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining(
          "Orchestra: Failed to create .orchestra/templates/prompts directory. Disk full",
        ),
      );

      mkdirSpy.mockRestore();
    });
  });

  describe("subdirectory handling", () => {
    it("should not recurse into non-special subdirectories", () => {
      setupSourceDirectory();

      // Create an extra subdirectory with a file
      const extraDir = path.join(
        extensionPath,
        "templates",
        "prompts",
        "extra",
      );
      fs.mkdirSync(extraDir, { recursive: true });
      fs.writeFileSync(path.join(extraDir, "nested.hbs"), "Nested content");

      runEnsurePromptTemplates();

      // The extra directory should not be copied
      const targetExtraDir = path.join(
        workspaceRoot,
        ".orchestra",
        "templates",
        "prompts",
        "extra",
      );
      expect(fs.existsSync(targetExtraDir)).toBe(false);
    });
  });
});
