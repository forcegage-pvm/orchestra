/**
 * Tests for insertAtLine and deleteSection tools
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteSectionTool } from "../../../../../src/agents/tools/coding/deleteSection.js";
import { insertAtLineTool } from "../../../../../src/agents/tools/coding/insertAtLine.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

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
    insert = vi.fn();
    delete = vi.fn();

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

describe("insertAtLine", () => {
  let tempDir: string;
  let testFilePath: string;
  let context: ToolInvocationContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "insert-at-line-test-"));
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
    const doc = {
      getText: () => content,
      positionAt: (offset: number) => {
        const lines = content.substring(0, offset).split("\n");
        return new Position(lines.length - 1, lines[lines.length - 1].length);
      },
      uri: Uri.file(filePath),
    };

    workspace.openTextDocument.mockResolvedValue(doc);
    return doc;
  }

  describe("insert before line", () => {
    it("should insert content before line 2", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 2,
          content: "new line",
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.inserted_at).toBe(2);
      expect(parsedResult.lines_inserted).toBe(1);
      expect(workspace.applyEdit).toHaveBeenCalled();
    });

    it("should insert content at beginning of file (line 1)", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 1,
          content: "first line",
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.inserted_at).toBe(1);
    });

    it("should insert multiple lines", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 2,
          content: "new line A\nnew line B\nnew line C",
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.lines_inserted).toBe(3);
    });

    it("should insert at end of file", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 4,
          content: "last line",
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.inserted_at).toBe(4);
    });
  });

  describe("auto_indent", () => {
    it("should match target line indentation when auto_indent=true (default)", async () => {
      const content = [
        "function test() {",
        "  const x = 1;",
        "  const y = 2;",
        "}",
      ].join("\n");

      mockDocument(content, testFilePath);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 3,
          content: "const z = 3;",
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(workspace.applyEdit).toHaveBeenCalled();

      const editCall = WorkspaceEdit.lastInstance?.insert.mock.calls[0];
      expect(editCall).toBeDefined();
      const insertedText = editCall[2];

      // Should have 2-space indent
      expect(insertedText).toContain("  const z = 3;");
    });

    it("should preserve relative indentation in multi-line insert with auto_indent", async () => {
      const content = [
        "class Test {",
        "  method1() {",
        "    return 1;",
        "  }",
        "}",
      ].join("\n");

      mockDocument(content, testFilePath);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 2,
          content: "method2() {\n  return 2;\n}",
          auto_indent: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const editCall = WorkspaceEdit.lastInstance?.insert.mock.calls[0];
      const insertedText = editCall[2];

      // Base indent is 2 spaces (from line 2), relative indent preserved
      expect(insertedText).toContain("  method2()");
      expect(insertedText).toContain("    return 2");
      expect(insertedText).toContain("  }");
    });

    it("should not apply auto_indent when auto_indent=false", async () => {
      const content = [
        "function test() {",
        "  const x = 1;",
        "  const y = 2;",
        "}",
      ].join("\n");

      mockDocument(content, testFilePath);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 3,
          content: "const z = 3;",
          auto_indent: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      const editCall = WorkspaceEdit.lastInstance?.insert.mock.calls[0];
      const insertedText = editCall[2];

      // Should NOT have indent applied
      expect(insertedText).toContain("const z = 3;");
      expect(insertedText).not.toContain("  const z = 3;");
    });
  });

  describe("dry_run mode", () => {
    it("should return diff_preview without applying changes when dry_run=true", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 2,
          content: "inserted line",
          dry_run: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.diff_preview).toBeDefined();
      expect(parsedResult.diff_preview).toContain("+inserted line");

      // Ensure applyEdit was NOT called
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should return error when line is out of bounds", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 10,
          content: "content",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.details?.valid_range).toBe("1-4");
    });

    it("should reject path traversal attempts", async () => {
      const result = await insertAtLineTool.invoke(
        {
          file_path: "../../../etc/passwd",
          line: 1,
          content: "malicious",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PATH_TRAVERSAL");
    });

    it("should return FILE_NOT_FOUND when file does not exist", async () => {
      workspace.openTextDocument.mockRejectedValue(new Error("File not found"));

      const result = await insertAtLineTool.invoke(
        {
          file_path: "nonexistent.ts",
          line: 1,
          content: "content",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FILE_NOT_FOUND");
    });

    it("should return COMMAND_FAILED when applyEdit fails", async () => {
      const content = ["line 1", "line 2"].join("\n");

      mockDocument(content, testFilePath);
      workspace.applyEdit.mockResolvedValue(false);

      const result = await insertAtLineTool.invoke(
        {
          file_path: "test.ts",
          line: 1,
          content: "new content",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("COMMAND_FAILED");
    });
  });
});

describe("deleteSection", () => {
  let tempDir: string;
  let testFilePath: string;
  let context: ToolInvocationContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "delete-section-test-"));
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
    const doc = {
      getText: () => content,
      positionAt: (offset: number) => {
        const lines = content.substring(0, offset).split("\n");
        return new Position(lines.length - 1, lines[lines.length - 1].length);
      },
      uri: Uri.file(filePath),
    };

    workspace.openTextDocument.mockResolvedValue(doc);
    return doc;
  }

  describe("delete line range", () => {
    it("should delete lines 2-3", async () => {
      const content = ["line 1", "line 2", "line 3", "line 4", "line 5"].join(
        "\n",
      );

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 2,
          end_line: 3,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.lines_deleted).toBe(2);
      expect(parsedResult.start_line).toBe(2);
      expect(parsedResult.end_line).toBe(3);
      expect(parsedResult.deleted_content).toBe("line 2\nline 3");
      expect(workspace.applyEdit).toHaveBeenCalled();
    });

    it("should delete single line", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 2,
          end_line: 2,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.lines_deleted).toBe(1);
      expect(parsedResult.deleted_content).toBe("line 2");
    });

    it("should delete first line", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 1,
          end_line: 1,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.lines_deleted).toBe(1);
      expect(parsedResult.deleted_content).toBe("line 1");
    });

    it("should delete last line", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 3,
          end_line: 3,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.lines_deleted).toBe(1);
      expect(parsedResult.deleted_content).toBe("line 3");
    });

    it("should delete all lines", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 1,
          end_line: 3,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.lines_deleted).toBe(3);
      expect(parsedResult.deleted_content).toBe("line 1\nline 2\nline 3");
    });
  });

  describe("deleted_content capture", () => {
    it("should capture deleted content for potential undo", async () => {
      const content = [
        "function test() {",
        "  const x = 1;",
        "  const y = 2;",
        "}",
      ].join("\n");

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 2,
          end_line: 3,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.deleted_content).toBe(
        "  const x = 1;\n  const y = 2;",
      );
    });
  });

  describe("dry_run mode", () => {
    it("should return diff_preview without applying changes when dry_run=true", async () => {
      const content = ["line 1", "line 2", "line 3", "line 4"].join("\n");

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 2,
          end_line: 3,
          dry_run: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const parsedResult = JSON.parse(result.content[0].value);
      expect(parsedResult.diff_preview).toBeDefined();
      expect(parsedResult.diff_preview).toContain("-line 2");
      expect(parsedResult.diff_preview).toContain("-line 3");
      expect(parsedResult.deleted_content).toBe("line 2\nline 3");

      // Ensure applyEdit was NOT called
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should return error when start_line is out of bounds", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 5,
          end_line: 6,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.details?.valid_range).toBe("1-3");
    });

    it("should return error when end_line is out of bounds", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 1,
          end_line: 10,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.details?.valid_range).toBe("1-3");
    });

    it("should return error when start_line > end_line", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 3,
          end_line: 1,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("greater than end_line");
    });

    it("should reject path traversal attempts", async () => {
      const result = await deleteSectionTool.invoke(
        {
          file_path: "../../../etc/passwd",
          start_line: 1,
          end_line: 2,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PATH_TRAVERSAL");
    });

    it("should return FILE_NOT_FOUND when file does not exist", async () => {
      workspace.openTextDocument.mockRejectedValue(new Error("File not found"));

      const result = await deleteSectionTool.invoke(
        {
          file_path: "nonexistent.ts",
          start_line: 1,
          end_line: 2,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FILE_NOT_FOUND");
    });

    it("should return COMMAND_FAILED when applyEdit fails", async () => {
      const content = ["line 1", "line 2", "line 3"].join("\n");

      mockDocument(content, testFilePath);
      workspace.applyEdit.mockResolvedValue(false);

      const result = await deleteSectionTool.invoke(
        {
          file_path: "test.ts",
          start_line: 1,
          end_line: 2,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("COMMAND_FAILED");
    });
  });
});
