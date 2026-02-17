/**
 * Tests for smartReplace tool
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartReplaceTool } from "../../../../../src/agents/tools/coding/smartReplace.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

const { workspace, Range, Position, WorkspaceEdit, Uri } = vi.hoisted(() => {
  const workspace = {
    openTextDocument: vi.fn(),
    applyEdit: vi.fn(),
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

describe("smartReplace", () => {
  let tempDir: string;
  let testFilePath: string;
  let context: ToolInvocationContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "smart-replace-test-"));
    testFilePath = path.join(tempDir, "test.txt");

    context = {
      workspaceRoot: tempDir,
      callId: "test-call-id",
      cancellationToken: undefined,
    };

    // Reset mocks
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
        const line = linesBefore.length - 1;
        const character = linesBefore[linesBefore.length - 1].length;
        return new Position(line, character);
      },
      lineAt: (lineNumber: number) => {
        // Calculate start offset for this line
        let startOffset = 0;
        for (let i = 0; i < lineNumber; i++) {
          startOffset += lines[i].length + 1; // +1 for newline
        }
        const lineText = lines[lineNumber] || "";
        const endOffset = startOffset + lineText.length;
        const lineBreakEndOffset =
          lineNumber < lines.length - 1 ? endOffset + 1 : endOffset;

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
    };

    workspace.openTextDocument.mockResolvedValue(doc);
    return doc;
  }

  describe("Match Cascade (FR-011)", () => {
    it("returns EXACT match when text is identical", async () => {
      const content = "line 1\nline 2\nline 3\nline 4";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "line 2",
          new_text: "REPLACED",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.match_type).toBe("EXACT");
      expect(resultData.similarity).toBe(1);
      expect(resultData.lines_changed.start).toBe(2);
      expect(resultData.lines_changed.end).toBe(2);
    });

    it("returns NORMALIZED match when whitespace differs", async () => {
      const content = "line   1\nline    2\nline 3";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "line 2",
          new_text: "REPLACED",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.match_type).toBe("NORMALIZED");
      expect(resultData.similarity).toBe(1);
    });

    it("returns FUZZY match when similarity is above threshold", async () => {
      const content = "kitten\npuppy\nbunny";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "kittens",
          new_text: "REPLACED",
          fuzzy_threshold: 0.8,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.match_type).toBe("FUZZY");
      expect(resultData.similarity).toBeGreaterThanOrEqual(0.8);
    });

    it("fails when no match found below threshold", async () => {
      const content = "alpha\nbeta\ngamma";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "omega",
          new_text: "REPLACED",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NO_MATCH");
    });
  });

  describe("Fuzzy Threshold (FR-012)", () => {
    it("uses default threshold of 0.85", async () => {
      const content = "function testFunction";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "function testFuncton", // typo: missing 'i'
          new_text: "REPLACED",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.similarity).toBeGreaterThanOrEqual(0.85);
    });

    it("respects custom fuzzy_threshold", async () => {
      const content = "kittens";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const strictResult = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "kitten",
          new_text: "REPLACED",
          fuzzy_threshold: 0.95,
        },
        context,
      );

      // Re-mock for second invocation
      mockDocument(content, testFilePath);

      const relaxedResult = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "kitten",
          new_text: "REPLACED",
          fuzzy_threshold: 0.8,
        },
        context,
      );

      expect(strictResult.success).toBe(false);
      expect(relaxedResult.success).toBe(true);
    });
  });

  describe("Start Line Hint (FR-013)", () => {
    it("searches outward from start_line_hint", async () => {
      const content =
        "target\nalpha\nbeta\ngamma\ndelta\nepsilon\nzeta\ntarget";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "target",
          new_text: "REPLACED",
          start_line_hint: 8,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.lines_changed.start).toBe(8);
    });

    it("finds matches near hint faster than distant ones", async () => {
      const content =
        Array(100).fill("filler").join("\n") +
        "\ntarget\n" +
        Array(100).fill("filler").join("\n");
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "target",
          new_text: "REPLACED",
          start_line_hint: 101,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.lines_changed.start).toBe(101);
    });
  });

  describe("Occurrence Parameter (FR-014)", () => {
    it("replaces first occurrence by default", async () => {
      const content = "match\nother\nmatch\nmore";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "match",
          new_text: "REPLACED",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.lines_changed.start).toBe(1);
      expect(workspace.applyEdit).toHaveBeenCalled();
    });

    it("replaces Nth occurrence when specified", async () => {
      const content = "match\nother\nmatch\nmore\nmatch";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "match",
          new_text: "REPLACED",
          occurrence: 2,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.lines_changed.start).toBe(3);
      expect(workspace.applyEdit).toHaveBeenCalled();
    });

    it("fails when occurrence exceeds match count", async () => {
      const content = "match\nother\nmatch";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "match",
          new_text: "REPLACED",
          occurrence: 5,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NO_MATCH");
    });

    it("fails when occurrence is less than 1", async () => {
      const content = "match";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "match",
          new_text: "REPLACED",
          occurrence: 0,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
    });
  });

  describe("Dry Run Mode (FR-020)", () => {
    it("returns preview without modifying file when dry_run is true", async () => {
      const originalContent = "line 1\nline 2\nline 3";
      await fs.writeFile(testFilePath, originalContent, "utf-8");
      mockDocument(originalContent, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "line 2",
          new_text: "REPLACED",
          dry_run: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.diff_preview).toBeDefined();
      expect(resultData.diff_preview).toContain("-line 2");
      expect(resultData.diff_preview).toContain("+REPLACED");
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });

    it("applies edit when dry_run is false", async () => {
      const content = "line 1\nline 2\nline 3";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "line 2",
          new_text: "REPLACED",
          dry_run: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(workspace.applyEdit).toHaveBeenCalled();
    });
  });

  describe("Result Structure", () => {
    it("includes all required fields in SmartReplaceResult", async () => {
      const content = "line 1\nline 2\nline 3";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "line 2",
          new_text: "REPLACED",
          dry_run: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);

      expect(resultData).toHaveProperty("success");
      expect(resultData).toHaveProperty("file_path");
      expect(resultData).toHaveProperty("match_type");
      expect(resultData).toHaveProperty("similarity");
      expect(resultData).toHaveProperty("lines_changed");
      expect(resultData).toHaveProperty("diff_preview");

      expect(resultData.lines_changed).toHaveProperty("start");
      expect(resultData.lines_changed).toHaveProperty("end");
      expect(resultData.lines_changed).toHaveProperty("count");
    });

    it("includes diff_preview in unified diff format", async () => {
      const content = "line 1\nline 2\nline 3\nline 4\nline 5";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "line 3",
          new_text: "REPLACED",
          dry_run: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);

      expect(resultData.diff_preview).toContain("@@");
      expect(resultData.diff_preview).toContain("-line 3");
      expect(resultData.diff_preview).toContain("+REPLACED");
    });
  });

  describe("Path Validation (SEC-001)", () => {
    it("rejects paths outside workspace", async () => {
      const result = await smartReplaceTool.invoke(
        {
          file_path: "../../../etc/passwd",
          old_text: "test",
          new_text: "REPLACED",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PATH_TRAVERSAL");
    });

    it("rejects absolute paths outside workspace", async () => {
      const result = await smartReplaceTool.invoke(
        {
          file_path: "/etc/passwd",
          old_text: "test",
          new_text: "REPLACED",
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PATH_TRAVERSAL");
    });
  });

  describe("Multi-line Matching", () => {
    it("matches and replaces multi-line old_text", async () => {
      const content = "line 1\nline 2\nline 3\nline 4";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "line 2\nline 3",
          new_text: "REPLACED",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      expect(resultData.lines_changed.start).toBe(2);
      expect(resultData.lines_changed.end).toBe(3);
      expect(resultData.lines_changed.count).toBe(2);
      expect(workspace.applyEdit).toHaveBeenCalled();
    });
  });

  describe("Integration with FuzzyMatcher", () => {
    it("delegates matching logic to FuzzyMatcher", async () => {
      const content = "hello   world\ntest";
      await fs.writeFile(testFilePath, content, "utf-8");
      mockDocument(content, testFilePath);

      const result = await smartReplaceTool.invoke(
        {
          file_path: "test.txt",
          old_text: "hello world",
          new_text: "REPLACED",
        },
        context,
      );

      expect(result.success).toBe(true);
      const resultData = JSON.parse(result.content[0].value);
      // FuzzyMatcher should detect this as NORMALIZED match
      expect(resultData.match_type).toBe("NORMALIZED");
    });
  });
});
