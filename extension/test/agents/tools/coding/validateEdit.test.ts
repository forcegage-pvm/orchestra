/**
 * Tests for validateEdit tool
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type {
  ToolInvocationContext,
  ValidateEditInput,
} from "../../../../src/agents/tools/types.js";
import { validateEditTool } from "../../../../src/agents/tools/coding/validateEdit.js";

const {
  workspace,
  languages,
  Uri,
  Diagnostic,
  Range,
  Position,
  DiagnosticSeverity,
  diagnosticsMap,
} = vi.hoisted(() => {
  // Use a Map that will be shared across the hoisted scope
  const diagnosticsMap = new Map<string, any[]>();

  const workspace = {
    openTextDocument: vi.fn(),
  };

  const languages = {
    getDiagnostics: vi.fn((uri: any) => {
      return diagnosticsMap.get(uri.toString()) || [];
    }),
  };

  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
  }

  class Range {
    constructor(
      public start: Position,
      public end: Position,
    ) {}
  }

  enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
  }

  class Diagnostic {
    constructor(
      public range: Range,
      public message: string,
      public severity: DiagnosticSeverity,
    ) {
      this.source = "typescript";
    }
    source: string;
  }

  class Uri {
    static file(path: string): Uri {
      const uri = new Uri();
      uri.fsPath = path;
      uri._value = `file:///${path}`;
      return uri;
    }

    static parse(value: string): Uri {
      const uri = new Uri();
      uri._value = value;
      return uri;
    }

    fsPath!: string;
    private _value!: string;

    toString(): string {
      return this._value;
    }
  }

  return {
    workspace,
    languages,
    Uri,
    Diagnostic,
    Range,
    Position,
    DiagnosticSeverity,
    diagnosticsMap,
  };
});

// Mock vscode module
vi.mock("vscode", () => ({
  workspace,
  languages,
  Uri,
  Diagnostic,
  Range,
  Position,
  DiagnosticSeverity,
}));

describe("validateEdit", () => {
  let context: ToolInvocationContext;
  const workspaceRoot = "/workspace";

  beforeEach(() => {
    context = {
      workspaceRoot,
      sessionId: "test-session-id",
      token: undefined as any,
    };

    vi.clearAllMocks();
    diagnosticsMap.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockDocument(content: string, language: string, uri: string) {
    const doc = {
      getText: () => content,
      languageId: language,
      uri: Uri.parse(uri),
    };

    workspace.openTextDocument.mockResolvedValue(doc);
    return doc;
  }

  function setDiagnostics(uri: string, diagnostics: any[]) {
    diagnosticsMap.set(uri, diagnostics);
  }

  describe("Valid Content (FR-018)", () => {
    it("returns syntax_valid: true for valid TypeScript content", async () => {
      const content = `function test() {\n  return 42;\n}`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.syntax_valid).toBe(true);
      expect(resultData.errors).toEqual([]);
      expect(resultData.warnings).toEqual([]);
    });

    it("returns syntax_valid: true for valid JavaScript content", async () => {
      const content = `const x = 10;\nconsole.log(x);`;
      const uri = "untitled:test.js";
      mockDocument(content, "javascript", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.js",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.syntax_valid).toBe(true);
    });

    it("returns syntax_valid: true for valid Python content", async () => {
      const content = `def hello():\n    return "world"`;
      const uri = "untitled:test.py";
      mockDocument(content, "python", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.py",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.syntax_valid).toBe(true);
    });
  });

  describe("Syntax Errors (FR-018, FR-019)", () => {
    it("returns syntax_valid: false with error details for missing closing brace", async () => {
      const content = `function test() {\n  return 42;\n`; // Missing }
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostic = new Diagnostic(
        new Range(new Position(2, 0), new Position(2, 0)),
        "'}' expected.",
        DiagnosticSeverity.Error,
      );
      setDiagnostics(uri, [diagnostic]);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.syntax_valid).toBe(false);
      expect(resultData.errors).toHaveLength(1);
      expect(resultData.errors[0]).toMatchObject({
        line: 3, // 1-based
        column: 1, // 1-based
        message: "'}' expected.",
        severity: "error",
      });
    });

    it("returns syntax_valid: false with error details for undefined variable", async () => {
      const content = `function test() {\n  console.log(undefinedVar);\n}`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostic = new Diagnostic(
        new Range(new Position(1, 14), new Position(1, 26)),
        "Cannot find name 'undefinedVar'.",
        DiagnosticSeverity.Error,
      );
      setDiagnostics(uri, [diagnostic]);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.syntax_valid).toBe(false);
      expect(resultData.errors).toHaveLength(1);
      expect(resultData.errors[0]).toMatchObject({
        line: 2,
        column: 15,
        message: "Cannot find name 'undefinedVar'.",
        severity: "error",
      });
    });

    it("returns multiple errors when content has multiple syntax errors", async () => {
      const content = `function test() {\n  return 42\n`; // Missing semicolon and closing brace
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostics = [
        new Diagnostic(
          new Range(new Position(1, 11), new Position(1, 11)),
          "';' expected.",
          DiagnosticSeverity.Error,
        ),
        new Diagnostic(
          new Range(new Position(2, 0), new Position(2, 0)),
          "'}' expected.",
          DiagnosticSeverity.Error,
        ),
      ];
      setDiagnostics(uri, diagnostics);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.syntax_valid).toBe(false);
      expect(resultData.errors).toHaveLength(2);
    });
  });

  describe("Warnings (FR-018)", () => {
    it("separates warnings from errors", async () => {
      const content = `let x = 10;\nlet y = 20;\nconsole.log(x);`; // y is unused
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostics = [
        new Diagnostic(
          new Range(new Position(1, 4), new Position(1, 5)),
          "'y' is declared but its value is never read.",
          DiagnosticSeverity.Warning,
        ),
      ];
      setDiagnostics(uri, diagnostics);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.syntax_valid).toBe(true); // No errors, only warnings
      expect(resultData.errors).toHaveLength(0);
      expect(resultData.warnings).toHaveLength(1);
      expect(resultData.warnings[0]).toMatchObject({
        line: 2,
        column: 5,
        message: "'y' is declared but its value is never read.",
        severity: "warning",
      });
    });

    it("returns syntax_valid: true even with warnings", async () => {
      const content = `function test() {\n  let unused = 42;\n  return 10;\n}`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostic = new Diagnostic(
        new Range(new Position(1, 6), new Position(1, 12)),
        "'unused' is declared but its value is never read.",
        DiagnosticSeverity.Warning,
      );
      setDiagnostics(uri, [diagnostic]);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.syntax_valid).toBe(true);
      expect(resultData.warnings).toHaveLength(1);
    });
  });

  describe("Actionable Error Messages (FR-019)", () => {
    it("provides fix suggestion for missing closing brace", async () => {
      const content = `function test() {\n  return 42;\n`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostic = new Diagnostic(
        new Range(new Position(2, 0), new Position(2, 0)),
        "'}' expected.",
        DiagnosticSeverity.Error,
      );
      setDiagnostics(uri, [diagnostic]);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.suggestions).toBeDefined();
      expect(resultData.suggestions).toContain(
        "Missing closing brace - add } at line 3",
      );
    });

    it("provides fix suggestion for missing semicolon", async () => {
      const content = `let x = 10\nconsole.log(x);`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostic = new Diagnostic(
        new Range(new Position(0, 10), new Position(0, 10)),
        "';' expected.",
        DiagnosticSeverity.Error,
      );
      setDiagnostics(uri, [diagnostic]);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.suggestions).toContain(
        "Missing semicolon - add ; at line 1",
      );
    });

    it("provides fix suggestion for undefined variable", async () => {
      const content = `console.log(undefinedVar);`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostic = new Diagnostic(
        new Range(new Position(0, 12), new Position(0, 24)),
        "Cannot find name 'undefinedVar'.",
        DiagnosticSeverity.Error,
      );
      setDiagnostics(uri, [diagnostic]);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.suggestions).toContain(
        "Undefined variable or missing import at line 1",
      );
    });

    it("provides fix suggestion for duplicate identifier", async () => {
      const content = `let x = 10;\nlet x = 20;`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostic = new Diagnostic(
        new Range(new Position(1, 4), new Position(1, 5)),
        "Duplicate identifier 'x'.",
        DiagnosticSeverity.Error,
      );
      setDiagnostics(uri, [diagnostic]);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.suggestions).toContain(
        "Duplicate declaration at line 2 - rename or remove one",
      );
    });

    it("provides multiple suggestions for multiple errors", async () => {
      const content = `function test() {\n  return 42\n`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostics = [
        new Diagnostic(
          new Range(new Position(1, 11), new Position(1, 11)),
          "';' expected.",
          DiagnosticSeverity.Error,
        ),
        new Diagnostic(
          new Range(new Position(2, 0), new Position(2, 0)),
          "'}' expected.",
          DiagnosticSeverity.Error,
        ),
      ];
      setDiagnostics(uri, diagnostics);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.suggestions).toHaveLength(2);
      expect(resultData.suggestions).toContain(
        "Missing semicolon - add ; at line 2",
      );
      expect(resultData.suggestions).toContain(
        "Missing closing brace - add } at line 3",
      );
    });
  });

  describe("Language Detection", () => {
    it("detects TypeScript from .ts extension", async () => {
      const content = `const x: number = 42;`;
      const uri = "untitled:test.ts";
      const doc = mockDocument(content, "typescript", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      await validateEditTool.invoke(input, context);

      expect(workspace.openTextDocument).toHaveBeenCalledWith({
        content,
        language: "typescript",
      });
    });

    it("detects JavaScript from .js extension", async () => {
      const content = `const x = 42;`;
      const uri = "untitled:test.js";
      mockDocument(content, "javascript", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.js",
        new_content: content,
      };

      await validateEditTool.invoke(input, context);

      expect(workspace.openTextDocument).toHaveBeenCalledWith({
        content,
        language: "javascript",
      });
    });

    it("detects Python from .py extension", async () => {
      const content = `def test():\n    pass`;
      const uri = "untitled:test.py";
      mockDocument(content, "python", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.py",
        new_content: content,
      };

      await validateEditTool.invoke(input, context);

      expect(workspace.openTextDocument).toHaveBeenCalledWith({
        content,
        language: "python",
      });
    });
  });

  describe("Error Handling", () => {
    it("returns error when file path is outside workspace", async () => {
      const input: ValidateEditInput = {
        file_path: "../../outside/test.ts",
        new_content: "const x = 42;",
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PATH_TRAVERSAL");
    });

    it("handles workspace.openTextDocument failure gracefully", async () => {
      workspace.openTextDocument.mockRejectedValue(
        new Error("Failed to open document"),
      );

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: "const x = 42;",
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("COMMAND_FAILED");
      expect(result.content[0].value).toContain("Failed to validate content");
    });
  });

  describe("Timeout Handling", () => {
    it("respects custom timeout_ms parameter", async () => {
      const content = `const x = 42;`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
        timeout_ms: 1000,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
    });

    it("uses default timeout when not specified", async () => {
      const content = `const x = 42;`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
    });
  });

  describe("Result Structure", () => {
    it("includes all required fields in ValidateEditResult", async () => {
      const content = `function test() {\n  return 42;\n}`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData).toHaveProperty("syntax_valid");
      expect(resultData).toHaveProperty("errors");
      expect(resultData).toHaveProperty("warnings");
      expect(Array.isArray(resultData.errors)).toBe(true);
      expect(Array.isArray(resultData.warnings)).toBe(true);
    });

    it("includes metadata in tool result", async () => {
      const content = `const x = 42;`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);
      setDiagnostics(uri, []);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.metadata).toMatchObject({
        toolName: "validate_edit",
        callId: "test-session-id",
        durationMs: expect.any(Number),
      });
    });

    it("includes source field in diagnostics when available", async () => {
      const content = `const x: string = 42;`;
      const uri = "untitled:test.ts";
      mockDocument(content, "typescript", uri);

      const diagnostic = new Diagnostic(
        new Range(new Position(0, 18), new Position(0, 20)),
        "Type 'number' is not assignable to type 'string'.",
        DiagnosticSeverity.Error,
      );
      diagnostic.source = "typescript";
      setDiagnostics(uri, [diagnostic]);

      const input: ValidateEditInput = {
        file_path: "test.ts",
        new_content: content,
      };

      const result = await validateEditTool.invoke(input, context);

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.errors[0]).toMatchObject({
        source: "typescript",
      });
    });
  });
});
