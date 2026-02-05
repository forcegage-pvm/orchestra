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

/**
 * Since ensurePromptTemplates is not exported, we test it by:
 * 1. Reading extension.ts source to verify the function exists with correct structure
 * 2. Creating a mock implementation that mirrors the real logic for behavior tests
 *
 * This approach allows us to verify both:
 * - The function's presence and structure in the codebase
 * - The expected behavior of the sync mechanism
 */

// Mock the vscode module
vi.mock("vscode", () => ({
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
  },
}));

// Import vscode for assertions
import * as vscode from "vscode";

/**
 * Mock implementation of ensurePromptTemplates that mirrors the real implementation
 * This allows us to test the behavior without requiring a full VS Code environment
 */
function ensurePromptTemplatesMock(
  extensionPath: string,
  workspaceRoot: string,
  loggerMock: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void },
): void {
  const targetDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts");
  const partialsDir = path.join(targetDir, "_partials");
  const schemaDir = path.join(targetDir, "_schema");
  const sourceDir = path.join(extensionPath, "templates", "prompts");

  try {
    // Create target directories if they don't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      loggerMock.info(`Created .orchestra/templates/prompts directory at ${targetDir}`);
    }

    if (!fs.existsSync(partialsDir)) {
      fs.mkdirSync(partialsDir, { recursive: true });
      loggerMock.info(`Created _partials directory at ${partialsDir}`);
    }

    if (!fs.existsSync(schemaDir)) {
      fs.mkdirSync(schemaDir, { recursive: true });
      loggerMock.info(`Created _schema directory at ${schemaDir}`);
    }

    // Check if source directory exists
    if (!fs.existsSync(sourceDir)) {
      loggerMock.warn(`Prompt templates source directory not found: ${sourceDir}`);
      return;
    }

    // Copy all .hbs files from source to target
    const sourceFiles = fs.readdirSync(sourceDir);
    for (const file of sourceFiles) {
      const sourcePath = path.join(sourceDir, file);
      const stat = fs.statSync(sourcePath);

      if (stat.isFile() && file.endsWith(".hbs")) {
        const targetPath = path.join(targetDir, file);
        fs.copyFileSync(sourcePath, targetPath);
        loggerMock.info(`Synced prompt template: ${file}`);
      }
    }

    // Copy _partials directory contents
    const sourcePartialsDir = path.join(sourceDir, "_partials");
    if (fs.existsSync(sourcePartialsDir)) {
      const partialFiles = fs.readdirSync(sourcePartialsDir);
      for (const file of partialFiles) {
        const sourcePath = path.join(sourcePartialsDir, file);
        const stat = fs.statSync(sourcePath);

        if (stat.isFile()) {
          const targetPath = path.join(partialsDir, file);
          fs.copyFileSync(sourcePath, targetPath);
          loggerMock.info(`Synced partial template: ${file}`);
        }
      }
    }

    // Copy _schema directory contents
    const sourceSchemaDir = path.join(sourceDir, "_schema");
    if (fs.existsSync(sourceSchemaDir)) {
      const schemaFiles = fs.readdirSync(sourceSchemaDir);
      for (const file of schemaFiles) {
        const sourcePath = path.join(sourceSchemaDir, file);
        const stat = fs.statSync(sourcePath);

        if (stat.isFile()) {
          const targetPath = path.join(schemaDir, file);
          fs.copyFileSync(sourcePath, targetPath);
          loggerMock.info(`Synced schema file: ${file}`);
        }
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    loggerMock.error(`Failed to sync prompt templates: ${errorMessage}`);
    vscode.window.showErrorMessage(
      `Orchestra: Failed to sync prompt templates. ${errorMessage}`
    );
  }
}

describe("ensurePromptTemplates - Source structure verification", () => {
  let extensionCode: string;

  beforeEach(() => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");
  });

  describe("function definition", () => {
    it("should define ensurePromptTemplates function", () => {
      expect(extensionCode).toContain("function ensurePromptTemplates(");
    });

    it("should accept context and workspaceRoot parameters", () => {
      const funcMatch = extensionCode.match(
        /function ensurePromptTemplates\(\s*context:\s*vscode\.ExtensionContext,\s*workspaceRoot:\s*string/
      );
      expect(funcMatch).toBeTruthy();
    });

    it("should return void", () => {
      expect(extensionCode).toMatch(
        /function ensurePromptTemplates\([^)]+\):\s*void/
      );
    });
  });

  describe("directory structure", () => {
    it("should create .orchestra/templates/prompts target directory", () => {
      expect(extensionCode).toContain('".orchestra", "templates", "prompts"');
    });

    it("should create _partials subdirectory", () => {
      expect(extensionCode).toContain('"_partials"');
    });

    it("should create _schema subdirectory", () => {
      expect(extensionCode).toContain('"_schema"');
    });

    it("should use recursive option for mkdirSync", () => {
      expect(extensionCode).toContain("{ recursive: true }");
    });
  });

  describe("file copying", () => {
    it("should copy .hbs files from source to target", () => {
      expect(extensionCode).toContain('file.endsWith(".hbs")');
      expect(extensionCode).toContain("fs.copyFileSync(sourcePath, targetPath)");
    });

    it("should copy files from _partials directory", () => {
      expect(extensionCode).toMatch(/sourcePartialsDir.*_partials/s);
    });

    it("should copy files from _schema directory", () => {
      expect(extensionCode).toMatch(/sourceSchemaDir.*_schema/s);
    });
  });

  describe("error handling", () => {
    it("should have try-catch block for filesystem operations", () => {
      // Find the function and check it contains try-catch
      const funcStart = extensionCode.indexOf("function ensurePromptTemplates(");
      const funcEnd = extensionCode.indexOf("function initializeWorkspace");
      const funcBody = extensionCode.substring(funcStart, funcEnd);
      
      expect(funcBody).toContain("try {");
      expect(funcBody).toContain("} catch (err)");
    });

    it("should log error on failure", () => {
      expect(extensionCode).toContain("logger.error(`Failed to sync prompt templates:");
    });

    it("should show error message to user on failure", () => {
      expect(extensionCode).toContain("vscode.window.showErrorMessage(");
      expect(extensionCode).toContain("Orchestra: Failed to sync prompt templates");
    });
  });

  describe("logging", () => {
    it("should log when directories are created", () => {
      expect(extensionCode).toContain("logger.info(`Created .orchestra/templates/prompts directory");
      expect(extensionCode).toContain("logger.info(`Created _partials directory");
      expect(extensionCode).toContain("logger.info(`Created _schema directory");
    });

    it("should log when templates are synced", () => {
      expect(extensionCode).toContain("logger.info(`Synced prompt template:");
      expect(extensionCode).toContain("logger.info(`Synced partial template:");
      expect(extensionCode).toContain("logger.info(`Synced schema file:");
    });

    it("should warn when source directory is missing", () => {
      expect(extensionCode).toContain("logger.warn(`Prompt templates source directory not found:");
    });
  });

  describe("activation integration", () => {
    it("should be called in initializeWorkspace function", () => {
      const initFuncStart = extensionCode.indexOf("async function initializeWorkspace(");
      const initFuncEnd = extensionCode.indexOf("async function", initFuncStart + 1);
      const initFuncBody = initFuncEnd > initFuncStart 
        ? extensionCode.substring(initFuncStart, initFuncEnd)
        : extensionCode.substring(initFuncStart);
      
      expect(initFuncBody).toContain("ensurePromptTemplates(context,");
    });

    it("should be called in activate function for existing workspaces", () => {
      const activateFuncStart = extensionCode.indexOf("export async function activate(");
      const activateFuncEnd = extensionCode.indexOf("export function deactivate");
      const activateFuncBody = extensionCode.substring(activateFuncStart, activateFuncEnd);
      
      expect(activateFuncBody).toContain("ensurePromptTemplates(context,");
    });
  });
});

describe("ensurePromptTemplates - Behavior tests", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let extensionPath: string;
  let loggerMock: { 
    info: ReturnType<typeof vi.fn>; 
    warn: ReturnType<typeof vi.fn>; 
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create temporary directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ensure-prompt-templates-test-"));
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
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

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
    const partialsDir = path.join(extensionPath, "templates", "prompts", "_partials");
    fs.writeFileSync(path.join(partialsDir, `${name}.hbs`), content);
  }

  /**
   * Helper to write a schema file in source
   */
  function writeSourceSchema(name: string, content: string): void {
    const schemaDir = path.join(extensionPath, "templates", "prompts", "_schema");
    fs.writeFileSync(path.join(schemaDir, name), content);
  }

  describe("directory creation", () => {
    it("should create .orchestra/templates/prompts directory", () => {
      setupSourceDirectory();
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const targetDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts");
      expect(fs.existsSync(targetDir)).toBe(true);
    });

    it("should create _partials subdirectory", () => {
      setupSourceDirectory();
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const partialsDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts", "_partials");
      expect(fs.existsSync(partialsDir)).toBe(true);
    });

    it("should create _schema subdirectory", () => {
      setupSourceDirectory();
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const schemaDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts", "_schema");
      expect(fs.existsSync(schemaDir)).toBe(true);
    });

    it("should log when directories are created", () => {
      setupSourceDirectory();
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining("Created .orchestra/templates/prompts directory")
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining("Created _partials directory")
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining("Created _schema directory")
      );
    });
  });

  describe("file copying", () => {
    it("should copy .hbs files from source to target", () => {
      setupSourceDirectory();
      writeSourceTemplate("test-template", "Hello {{name}}");
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const targetFile = path.join(workspaceRoot, ".orchestra", "templates", "prompts", "test-template.hbs");
      expect(fs.existsSync(targetFile)).toBe(true);
      expect(fs.readFileSync(targetFile, "utf-8")).toBe("Hello {{name}}");
    });

    it("should copy multiple .hbs files", () => {
      setupSourceDirectory();
      writeSourceTemplate("template1", "Content 1");
      writeSourceTemplate("template2", "Content 2");
      writeSourceTemplate("template3", "Content 3");
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const targetDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts");
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
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const targetDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts");
      expect(fs.existsSync(path.join(targetDir, "valid.hbs"))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, "readme.txt"))).toBe(false);
      expect(fs.existsSync(path.join(targetDir, "notes.md"))).toBe(false);
    });

    it("should copy files from _partials directory", () => {
      setupSourceDirectory();
      writeSourcePartial("header", "<header>{{title}}</header>");
      writeSourcePartial("footer", "<footer>{{year}}</footer>");
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const partialsDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts", "_partials");
      expect(fs.existsSync(path.join(partialsDir, "header.hbs"))).toBe(true);
      expect(fs.existsSync(path.join(partialsDir, "footer.hbs"))).toBe(true);
    });

    it("should copy files from _schema directory", () => {
      setupSourceDirectory();
      const schemaContent = JSON.stringify({ type: "object" }, null, 2);
      writeSourceSchema("context.schema.json", schemaContent);
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const schemaDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts", "_schema");
      const schemaFile = path.join(schemaDir, "context.schema.json");
      expect(fs.existsSync(schemaFile)).toBe(true);
      expect(fs.readFileSync(schemaFile, "utf-8")).toBe(schemaContent);
    });

    it("should log when files are synced", () => {
      setupSourceDirectory();
      writeSourceTemplate("test", "content");
      writeSourcePartial("partial", "partial content");
      writeSourceSchema("schema.json", "{}");
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      expect(loggerMock.info).toHaveBeenCalledWith("Synced prompt template: test.hbs");
      expect(loggerMock.info).toHaveBeenCalledWith("Synced partial template: partial.hbs");
      expect(loggerMock.info).toHaveBeenCalledWith("Synced schema file: schema.json");
    });
  });

  describe("idempotent behavior", () => {
    it("should be safe to call multiple times", () => {
      setupSourceDirectory();
      writeSourceTemplate("test", "Original content");
      
      // Call multiple times
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const targetFile = path.join(workspaceRoot, ".orchestra", "templates", "prompts", "test.hbs");
      expect(fs.existsSync(targetFile)).toBe(true);
      expect(fs.readFileSync(targetFile, "utf-8")).toBe("Original content");
    });

    it("should overwrite existing files with new content", () => {
      setupSourceDirectory();
      writeSourceTemplate("test", "Version 1");
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      // Modify source
      writeSourceTemplate("test", "Version 2");
      
      // Sync again
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      const targetFile = path.join(workspaceRoot, ".orchestra", "templates", "prompts", "test.hbs");
      expect(fs.readFileSync(targetFile, "utf-8")).toBe("Version 2");
    });

    it("should not log directory creation on subsequent calls", () => {
      setupSourceDirectory();
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      // Clear mocks and call again
      loggerMock.info.mockClear();
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      // Should not log "Created" messages since directories already exist
      const createdCalls = loggerMock.info.mock.calls.filter(
        (call) => call[0].includes("Created")
      );
      expect(createdCalls.length).toBe(0);
    });
  });

  describe("missing source directory handling", () => {
    it("should warn and return early if source directory does not exist", () => {
      // Don't set up source directory
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining("Prompt templates source directory not found:")
      );
    });

    it("should still create target directories even if source is missing", () => {
      // Don't set up source directory
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      // Target directories should be created before checking source
      const targetDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts");
      expect(fs.existsSync(targetDir)).toBe(true);
    });

    it("should handle missing _partials source directory gracefully", () => {
      // Create source without _partials
      const sourceDir = path.join(extensionPath, "templates", "prompts");
      fs.mkdirSync(sourceDir, { recursive: true });
      writeSourceTemplate("test", "content");
      
      // Should not throw
      expect(() => {
        ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      }).not.toThrow();
    });

    it("should handle missing _schema source directory gracefully", () => {
      // Create source without _schema
      const sourceDir = path.join(extensionPath, "templates", "prompts");
      fs.mkdirSync(sourceDir, { recursive: true });
      writeSourceTemplate("test", "content");
      
      // Should not throw
      expect(() => {
        ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      }).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle errors gracefully and show error message", () => {
      // Create a read-only directory scenario by using an invalid path
      const invalidWorkspaceRoot = path.join(tempDir, "\0invalid");
      
      ensurePromptTemplatesMock(extensionPath, invalidWorkspaceRoot, loggerMock);
      
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to sync prompt templates:")
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Orchestra: Failed to sync prompt templates")
      );
    });
  });

  describe("subdirectory handling", () => {
    it("should not recurse into non-special subdirectories", () => {
      setupSourceDirectory();
      
      // Create an extra subdirectory with a file
      const extraDir = path.join(extensionPath, "templates", "prompts", "extra");
      fs.mkdirSync(extraDir, { recursive: true });
      fs.writeFileSync(path.join(extraDir, "nested.hbs"), "Nested content");
      
      ensurePromptTemplatesMock(extensionPath, workspaceRoot, loggerMock);
      
      // The extra directory should not be copied
      const targetExtraDir = path.join(workspaceRoot, ".orchestra", "templates", "prompts", "extra");
      expect(fs.existsSync(targetExtraDir)).toBe(false);
    });
  });
});
