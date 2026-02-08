/**
 * Tests for bulkReplace tool
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bulkReplaceTool } from "../../../src/agents/tools/coding/bulkReplace.js";
import type { ToolInvocationContext } from "../../../src/agents/tools/types.js";

const { workspace, Range, Position, WorkspaceEdit, Uri } = vi.hoisted(() => {
  const workspace = {
    openTextDocument: vi.fn(),
    applyEdit: vi.fn(),
    findFiles: vi.fn(),
    fs: {
      readFile: vi.fn(),
    },
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

describe("bulkReplace", () => {
  let tempDir: string;
  let context: ToolInvocationContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bulk-replace-test-"));

    context = {
      workspaceRoot: tempDir,
      callId: "test-call-id",
      sessionId: "test-session-id",
      token: {
        isCancellationRequested: false,
      },
    };

    // Reset mocks
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
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;
        return new Position(line, character);
      },
    };

    workspace.openTextDocument.mockResolvedValue(doc);
    return doc;
  }

  function mockBinaryFile() {
    // Mock readFile to return bytes with null byte (binary indicator)
    const binaryData = new Uint8Array([0x00, 0x01, 0x02]);
    workspace.fs.readFile.mockResolvedValue(binaryData);
  }

  function mockTextFile() {
    // Mock readFile to return text bytes (no null bytes)
    const textData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    workspace.fs.readFile.mockResolvedValue(textData);
  }

  describe("Literal Text Replacement (FR-026)", () => {
    it("replaces literal text across multiple files", async () => {
      const file1Path = path.join(tempDir, "file1.txt");
      const file2Path = path.join(tempDir, "file2.txt");

      await fs.writeFile(file1Path, "Hello world\nHello again", "utf-8");
      await fs.writeFile(file2Path, "Hello there", "utf-8");

      const file1Uri = Uri.file(file1Path);
      const file2Uri = Uri.file(file2Path);

      workspace.findFiles.mockResolvedValue([file1Uri, file2Uri]);
      mockTextFile();

      // Mock documents for each file
      workspace.openTextDocument
        .mockResolvedValueOnce(
          mockDocument("Hello world\nHello again", file1Path),
        )
        .mockResolvedValueOnce(mockDocument("Hello there", file2Path));

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "Hello",
          replacement: "Hi",
          is_regex: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.files_scanned).toBe(2);
      expect(resultData.files_modified).toBe(2);
      expect(resultData.total_replacements).toBe(3); // 2 in file1, 1 in file2
      expect(resultData.changes).toHaveLength(2);
    });

    it("escapes special regex characters in literal mode", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "function(x) { return x; }", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("function(x) { return x; }", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "function(",
          replacement: "lambda(",
          is_regex: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.total_replacements).toBe(1);
    });
  });

  describe("Regex Pattern Support (FR-026)", () => {
    it("replaces using regex patterns", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "cat dog cat", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("cat dog cat", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "cat",
          replacement: "bird",
          is_regex: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.total_replacements).toBe(2);
    });

    it("handles invalid regex patterns gracefully", async () => {
      const result = await bulkReplaceTool.invoke(
        {
          pattern: "[invalid(",
          replacement: "test",
          is_regex: true,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });
  });

  describe("Capture Group Replacement (FR-027)", () => {
    it("replaces using regex capture groups", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "firstName: John\nfirstName: Jane", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("firstName: John\nfirstName: Jane", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "(firstName): (\\w+)",
          replacement: "$1 = '$2'",
          is_regex: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.total_replacements).toBe(2);
      // After replacement: "firstName = 'John'\nfirstName = 'Jane'"
    });

    it("supports multiple capture groups", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "2024-01-15", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("2024-01-15", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "(\\d{4})-(\\d{2})-(\\d{2})",
          replacement: "$3/$2/$1",
          is_regex: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.total_replacements).toBe(1);
      // After replacement: "15/01/2024"
    });
  });

  describe("File Glob Pattern Targeting (FR-028)", () => {
    it("processes only files matching include_glob", async () => {
      const tsFile = path.join(tempDir, "test.ts");
      const jsFile = path.join(tempDir, "test.js");
      const txtFile = path.join(tempDir, "test.txt");

      await fs.writeFile(tsFile, "const x = 1;", "utf-8");
      await fs.writeFile(jsFile, "const x = 1;", "utf-8");
      await fs.writeFile(txtFile, "const x = 1;", "utf-8");

      const tsUri = Uri.file(tsFile);
      const jsUri = Uri.file(jsFile);

      // Only return .ts and .js files
      workspace.findFiles.mockResolvedValue([tsUri, jsUri]);
      mockTextFile();

      workspace.openTextDocument
        .mockResolvedValueOnce(mockDocument("const x = 1;", tsFile))
        .mockResolvedValueOnce(mockDocument("const x = 1;", jsFile));

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "const",
          replacement: "let",
          include_glob: "**/*.{ts,js}",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.files_scanned).toBe(2); // Only .ts and .js
    });

    it("excludes files matching exclude_glob", async () => {
      const srcFile = path.join(tempDir, "src/test.ts");
      const testFile = path.join(tempDir, "test/test.ts");

      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "test"), { recursive: true });
      await fs.writeFile(srcFile, "test", "utf-8");
      await fs.writeFile(testFile, "test", "utf-8");

      const srcUri = Uri.file(srcFile);

      // Only return src file (test excluded)
      workspace.findFiles.mockResolvedValue([srcUri]);
      mockTextFile();
      mockDocument("test", srcFile);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "test",
          replacement: "production",
          include_glob: "**/*.ts",
          exclude_glob: "**/test/**",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.files_scanned).toBe(1); // Only src file
    });
  });

  describe("Preview Only Mode", () => {
    it("generates previews without applying changes when preview_only is true", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "Hello world", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("Hello world", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "Hello",
          replacement: "Hi",
          preview_only: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.files_scanned).toBe(1);
      expect(resultData.changes).toHaveLength(1);
      expect(resultData.changes[0].preview).toBeDefined();
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });

    it("applies changes when preview_only is false", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "Hello world", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("Hello world", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "Hello",
          replacement: "Hi",
          preview_only: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(workspace.applyEdit).toHaveBeenCalled();
    });
  });

  describe("Case Sensitivity", () => {
    it("performs case-sensitive matching by default", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "Hello hello HELLO", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("Hello hello HELLO", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "hello",
          replacement: "hi",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.total_replacements).toBe(1); // Only "hello", not "Hello" or "HELLO"
    });

    it("performs case-insensitive matching when case_sensitive is false", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "Hello hello HELLO", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("Hello hello HELLO", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "hello",
          replacement: "hi",
          case_sensitive: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.total_replacements).toBe(3); // All three variants
    });
  });

  describe("Whole Word Matching", () => {
    it("matches whole words only when whole_word is true", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "test testing tested", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("test testing tested", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "test",
          replacement: "exam",
          whole_word: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.total_replacements).toBe(1); // Only "test", not "testing" or "tested"
    });

    it("matches partial words when whole_word is false", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "test testing tested", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("test testing tested", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "test",
          replacement: "exam",
          whole_word: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.total_replacements).toBe(3); // All occurrences
    });
  });

  describe("Limits", () => {
    it("respects max_files limit", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");
      const file3 = path.join(tempDir, "file3.txt");

      await fs.writeFile(file1, "test", "utf-8");
      await fs.writeFile(file2, "test", "utf-8");
      await fs.writeFile(file3, "test", "utf-8");

      const uri1 = Uri.file(file1);
      const uri2 = Uri.file(file2);

      // findFiles already respects max_files limit
      workspace.findFiles.mockResolvedValue([uri1, uri2]);
      mockTextFile();

      workspace.openTextDocument
        .mockResolvedValueOnce(mockDocument("test", file1))
        .mockResolvedValueOnce(mockDocument("test", file2));

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "test",
          replacement: "exam",
          max_files: 2,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.files_scanned).toBe(2);
    });

    it("respects max_replacements limit", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");

      await fs.writeFile(file1, "test test test", "utf-8");
      await fs.writeFile(file2, "test test", "utf-8");

      const uri1 = Uri.file(file1);
      const uri2 = Uri.file(file2);

      workspace.findFiles.mockResolvedValue([uri1, uri2]);
      mockTextFile();

      workspace.openTextDocument
        .mockResolvedValueOnce(mockDocument("test test test", file1))
        .mockResolvedValueOnce(mockDocument("test test", file2));

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "test",
          replacement: "exam",
          max_replacements: 4,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      // Should stop after reaching 4 replacements
      expect(resultData.total_replacements).toBeLessThanOrEqual(4);
    });
  });

  describe("Binary File Handling", () => {
    it("skips binary files with warning", async () => {
      const binaryFile = path.join(tempDir, "binary.bin");
      await fs.writeFile(binaryFile, Buffer.from([0x00, 0x01, 0x02]), "binary");

      const binaryUri = Uri.file(binaryFile);
      workspace.findFiles.mockResolvedValue([binaryUri]);
      mockBinaryFile();

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "test",
          replacement: "exam",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.errors).toHaveLength(1);
      expect(resultData.errors[0].error).toContain("Binary");
    });
  });

  describe("Empty Results", () => {
    it("returns success with zero results when no files match glob", async () => {
      workspace.findFiles.mockResolvedValue([]);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "test",
          replacement: "exam",
          include_glob: "**/*.nonexistent",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.files_scanned).toBe(0);
      expect(resultData.files_modified).toBe(0);
      expect(resultData.total_replacements).toBe(0);
    });

    it("returns success with zero replacements when pattern not found", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "Hello world", "utf-8");

      const fileUri = Uri.file(filePath);
      workspace.findFiles.mockResolvedValue([fileUri]);
      mockTextFile();
      mockDocument("Hello world", filePath);

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "nonexistent",
          replacement: "test",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.files_scanned).toBe(1);
      expect(resultData.files_modified).toBe(0);
      expect(resultData.total_replacements).toBe(0);
    });
  });

  describe("Error Handling", () => {
    it("fails when pattern is empty", async () => {
      const result = await bulkReplaceTool.invoke(
        {
          pattern: "",
          replacement: "test",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });

    it("continues processing other files when one file fails", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");

      await fs.writeFile(file1, "test", "utf-8");
      await fs.writeFile(file2, "test", "utf-8");

      const uri1 = Uri.file(file1);
      const uri2 = Uri.file(file2);

      workspace.findFiles.mockResolvedValue([uri1, uri2]);
      mockTextFile();

      // First file throws error, second succeeds
      workspace.openTextDocument
        .mockRejectedValueOnce(new Error("File read error"))
        .mockResolvedValueOnce(mockDocument("test", file2));

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "test",
          replacement: "exam",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.errors).toHaveLength(1);
      expect(resultData.files_modified).toBe(1); // Second file succeeded
    });
  });

  describe("Cancellation", () => {
    it("stops processing when cancellation is requested", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");

      await fs.writeFile(file1, "test", "utf-8");
      await fs.writeFile(file2, "test", "utf-8");

      const uri1 = Uri.file(file1);
      const uri2 = Uri.file(file2);

      workspace.findFiles.mockResolvedValue([uri1, uri2]);
      mockTextFile();

      // Set cancellation after processing starts
      const cancelContext = {
        ...context,
        token: {
          isCancellationRequested: true,
        },
      };

      const result = await bulkReplaceTool.invoke(
        {
          pattern: "test",
          replacement: "exam",
        },
        cancelContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CANCELLED");
    });
  });
});
