/**
 * Tests for editLines tool
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { editLinesTool } from "../../../src/agents/tools/coding/editLines.js";
import type { ToolInvocationContext } from "../../../src/agents/tools/types.js";

const { workspace, Range, Position, WorkspaceEdit, Uri } = vi.hoisted(() => {
  const workspace = {
    openTextDocument: vi.fn(),
    applyEdit: vi.fn(),
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

  class WorkspaceEdit {
    static lastInstance: WorkspaceEdit | undefined;
    replace = vi.fn();

    constructor() {
      WorkspaceEdit.lastInstance = this;
    }
  }

  class Uri {
    static file(path: string): Uri {
      const uri = new Uri();
      uri.fsPath = path;
      return uri;
    }

    fsPath!: string;
  }

  return {
    workspace,
    Position,
    Range,
    WorkspaceEdit,
    Uri,
  };
});

vi.mock("vscode", () => ({
  workspace,
  Position,
  Range,
  WorkspaceEdit,
  Uri,
}));

describe("editLines", () => {
  let tempDir: string;
  let testFilePath: string;
  let context: ToolInvocationContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "edit-lines-test-"));
    testFilePath = path.join(tempDir, "test.ts");

    context = {
      workspaceRoot: tempDir,
      callId: "test-call-id",
      cancellationToken: undefined,
    };

    vi.clearAllMocks();
    workspace.applyEdit.mockResolvedValue(true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function mockDocument(content: string, filePath: string) {
    const lines = content.split("\n");

    const doc = {
      getText: () => content,
      positionAt: (offset: number) => {
        const textBefore = content.substring(0, offset);
        const linesBefore = textBefore.split("\n");
        return new Position(
          linesBefore.length - 1,
          linesBefore[linesBefore.length - 1].length,
        );
      },
      lineAt: (lineNumber: number) => {
        const lineText = lines[lineNumber] || "";

        return {
          text: lineText,
          lineNumber,
          range: new Range(
            new Position(lineNumber, 0),
            new Position(lineNumber, lineText.length),
          ),
          rangeIncludingLineBreak: new Range(
            new Position(lineNumber, 0),
            lineNumber < lines.length - 1
              ? new Position(lineNumber + 1, 0)
              : new Position(lineNumber, lineText.length),
          ),
        };
      },
      uri: Uri.file(filePath),
    };

    workspace.openTextDocument.mockResolvedValue(doc);
    return doc;
  }

  describe("valid line range edit", () => {
    it("should replace lines 3-5 with new content", async () => {
      const content = [
        "line 1",
        "line 2",
        "line 3",
        "line 4",
        "line 5",
        "line 6",
      ].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 3,
          end_line: 5,
          new_content: "replaced line",
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].type).toBe("json");
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.lines_replaced).toBe(3);
      expect(parsedResult.new_line_count).toBe(1);
      expect(parsedResult.file_path).toBe("test.ts");
    });

    it("should handle single line replacement", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 2,
          end_line: 2,
          new_content: "new line 2",
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.lines_replaced).toBe(1);
      expect(parsedResult.new_line_count).toBe(1);
    });

    it("should replace multiple lines with multiple new lines", async () => {
      const content = ["line 1", "line 2", "line 3", "line 4"].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 2,
          end_line: 3,
          new_content: "new line A\nnew line B\nnew line C",
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.lines_replaced).toBe(2);
      expect(parsedResult.new_line_count).toBe(3);
    });
  });

  describe("preserve_indentation", () => {
    it("should match indentation of previous line when preserve_indentation=true", async () => {
      const content = [
        "function test() {",
        "  const x = 1;",
        "  const y = 2;",
        "  const z = 3;",
        "}",
      ].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 2,
          end_line: 3,
          new_content: "const a = 10;\nconst b = 20;",
          preserve_indentation: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(workspace.applyEdit).toHaveBeenCalled();

      const editCall = WorkspaceEdit.lastInstance?.replace.mock.calls[0];
      expect(editCall).toBeDefined();
      const replacementText = editCall[2];

      // Should have 2-space indent
      expect(replacementText).toContain("  const a = 10;");
      expect(replacementText).toContain("  const b = 20;");
    });

    it("should match indentation of next line when no previous line", async () => {
      const content = [
        "function test() {",
        "  const x = 1;",
        "  const y = 2;",
        "}",
      ].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 1,
          end_line: 1,
          new_content: "function newTest() {",
          preserve_indentation: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      // No indent expected at the function level
    });

    it("should preserve relative indentation within new_content", async () => {
      const content = [
        "class Test {",
        "  method1() {",
        "    return 1;",
        "  }",
        "}",
      ].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 2,
          end_line: 3,
          new_content: "method2() {\n  if (true) {\n    return 2;\n  }\n}",
          preserve_indentation: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const editCall = WorkspaceEdit.lastInstance?.replace.mock.calls[0];
      const replacementText = editCall[2];

      // Base indent should be 2 spaces, relative indent preserved
      expect(replacementText).toContain("  method2()");
      expect(replacementText).toContain("    if (true)");
      expect(replacementText).toContain("      return 2");
    });
  });

  describe("invalid line range errors", () => {
    it("should return error when start_line is out of bounds", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 5,
          end_line: 6,
          new_content: "new content",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.details?.start_line).toBe(5);
      expect(result.error?.details?.file_has_lines).toBe(3);
    });

    it("should return error when end_line is out of bounds", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 1,
          end_line: 10,
          new_content: "new content",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.details?.end_line).toBe(10);
      expect(result.error?.details?.file_has_lines).toBe(3);
    });

    it("should return error when start_line > end_line", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 3,
          end_line: 1,
          new_content: "new content",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("greater than end_line");
    });

    it("should return error when start_line is less than 1", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 0,
          end_line: 2,
          new_content: "new content",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });
  });

  describe("dry_run mode", () => {
    it("should return diff_preview without applying changes when dry_run=true", async () => {
      const content = ["line 1", "line 2", "line 3", "line 4"].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 2,
          end_line: 3,
          new_content: "replaced",
          dry_run: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.diff_preview).toBeDefined();
      expect(parsedResult.diff_preview).toContain("-line 2");
      expect(parsedResult.diff_preview).toContain("-line 3");
      expect(parsedResult.diff_preview).toContain("+replaced");

      // Ensure applyEdit was NOT called
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });

    it("should include context lines in diff preview", async () => {
      const content = [
        "line 1",
        "line 2",
        "line 3",
        "line 4",
        "line 5",
        "line 6",
        "line 7",
      ].join("\n");

      mockDocument(content, testFilePath);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 4,
          end_line: 4,
          new_content: "new line 4",
          dry_run: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      const diff = parsedResult.diff_preview;

      // Should include 3 lines of context before and after
      expect(diff).toContain(" line 1");
      expect(diff).toContain(" line 2");
      expect(diff).toContain(" line 3");
      expect(diff).toContain("-line 4");
      expect(diff).toContain("+new line 4");
      expect(diff).toContain(" line 5");
      expect(diff).toContain(" line 6");
      expect(diff).toContain(" line 7");
    });
  });

  describe("file not found", () => {
    it("should return FILE_NOT_FOUND error when file does not exist", async () => {
      workspace.openTextDocument.mockRejectedValue(new Error("File not found"));

      const result = await editLinesTool.invoke(
        {
          file_path: "nonexistent.ts",
          start_line: 1,
          end_line: 2,
          new_content: "content",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FILE_NOT_FOUND");
    });
  });

  describe("path security", () => {
    it("should reject path traversal attempts", async () => {
      const result = await editLinesTool.invoke(
        {
          file_path: "../../../etc/passwd",
          start_line: 1,
          end_line: 1,
          new_content: "malicious",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PATH_TRAVERSAL");
    });
  });

  describe("apply edit failure", () => {
    it("should return COMMAND_FAILED when applyEdit fails", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);
      workspace.applyEdit.mockResolvedValue(false);

      const result = await editLinesTool.invoke(
        {
          file_path: "test.ts",
          start_line: 1,
          end_line: 2,
          new_content: "new content",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("COMMAND_FAILED");
    });
  });
});
