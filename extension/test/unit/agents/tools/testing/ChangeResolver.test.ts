/**
 * ChangeResolver unit tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import type { ToolError } from "../../../../../src/agents/tools/types.js";
import { ChangeResolver, type ChangeResult } from "../../../../../../src/core/testing/ChangeResolver.js";

// Mock child_process module
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// Import after mock setup
const { execSync } = await import("node:child_process");

describe("ChangeResolver", () => {
  let resolver: ChangeResolver;
  const workspaceRoot = "/mock/workspace";

  beforeEach(() => {
    resolver = new ChangeResolver(workspaceRoot);
    vi.mocked(execSync).mockReset();
  });

  describe("fromWorkingTree()", () => {
    it("should detect unstaged changes via git diff", () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === "git diff --name-only") {
          return "src/file1.ts\nsrc/file2.ts\n";
        }
        if (cmd === "git diff --staged --name-only") {
          return "";
        }
        if (cmd === "git ls-files --others --exclude-standard") {
          return "";
        }
        return "";
      });

      const result = resolver.fromWorkingTree();

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      expect(changeResult.files).toContain("src/file1.ts");
      expect(changeResult.files).toContain("src/file2.ts");
    });

    it("should detect staged changes via git diff --staged", () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === "git diff --name-only") {
          return "";
        }
        if (cmd === "git diff --staged --name-only") {
          return "src/staged.ts\n";
        }
        if (cmd === "git ls-files --others --exclude-standard") {
          return "";
        }
        return "";
      });

      const result = resolver.fromWorkingTree();

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      expect(changeResult.files).toContain("src/staged.ts");
    });

    it("should detect untracked files", () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === "git diff --name-only") {
          return "";
        }
        if (cmd === "git diff --staged --name-only") {
          return "";
        }
        if (cmd === "git ls-files --others --exclude-standard") {
          return "src/new-file.ts\n";
        }
        return "";
      });

      const result = resolver.fromWorkingTree();

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      expect(changeResult.files).toContain("src/new-file.ts");
    });

    it("should combine and deduplicate all changes", () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === "git diff --name-only") {
          return "src/file1.ts\nsrc/common.ts\n";
        }
        if (cmd === "git diff --staged --name-only") {
          return "src/file2.ts\nsrc/common.ts\n"; // common.ts appears in both
        }
        if (cmd === "git ls-files --others --exclude-standard") {
          return "src/file3.ts\n";
        }
        return "";
      });

      const result = resolver.fromWorkingTree();

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      expect(changeResult.files).toHaveLength(4); // Deduplicated
      expect(changeResult.files).toContain("src/file1.ts");
      expect(changeResult.files).toContain("src/file2.ts");
      expect(changeResult.files).toContain("src/file3.ts");
      expect(changeResult.files).toContain("src/common.ts");
    });

    it("should return NO_CHANGES_DETECTED when no changes found", () => {
      vi.mocked(execSync).mockImplementation(() => "");

      const result = resolver.fromWorkingTree();

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.NO_CHANGES_DETECTED);
      expect(error.message).toContain("No changes found");
    });

    it("should return COMMAND_FAILED when git command fails", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("fatal: not a git repository");
      });

      const result = resolver.fromWorkingTree();

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.COMMAND_FAILED);
      expect(error.message).toContain("Failed to detect changes");
    });
  });

  describe("fromCommitRange()", () => {
    it("should detect changes in commit range", () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === "git diff main..HEAD --name-only") {
          return "src/changed1.ts\nsrc/changed2.ts\n";
        }
        return "";
      });

      const result = resolver.fromCommitRange("main..HEAD");

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      expect(changeResult.files).toContain("src/changed1.ts");
      expect(changeResult.files).toContain("src/changed2.ts");
    });

    it("should return NO_CHANGES_DETECTED when no changes in range", () => {
      vi.mocked(execSync).mockImplementation(() => "");

      const result = resolver.fromCommitRange("abc123..def456");

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.NO_CHANGES_DETECTED);
      expect(error.message).toContain("abc123..def456");
    });

    it("should return COMMAND_FAILED for invalid commit range", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("fatal: bad revision 'invalid..range'");
      });

      const result = resolver.fromCommitRange("invalid..range");

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.COMMAND_FAILED);
      expect(error.message).toContain("invalid..range");
    });
  });

  describe("fromFileList()", () => {
    it("should return provided files as changed files (pass-through)", () => {
      const files = ["src/file1.ts", "src/file2.ts", "test/file1.test.ts"];

      const result = resolver.fromFileList(files);

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      expect(changeResult.files).toEqual(files);
    });

    it("should return NO_CHANGES_DETECTED when file list is empty", () => {
      const result = resolver.fromFileList([]);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.NO_CHANGES_DETECTED);
      expect(error.message).toContain("No files provided");
    });

    it("should create a copy of the input array", () => {
      const files = ["src/file1.ts"];

      const result = resolver.fromFileList(files);

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      
      // Modify original array
      files.push("src/file2.ts");
      
      // Result should not be affected
      expect(changeResult.files).toHaveLength(1);
    });
  });

  describe("resolve()", () => {
    it("should route to fromWorkingTree for 'working-tree' source", () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === "git diff --name-only") {
          return "src/file.ts\n";
        }
        return "";
      });

      const result = resolver.resolve("working-tree");

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      expect(changeResult.files).toContain("src/file.ts");
    });

    it("should route to fromCommitRange for 'commit-range' source", () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === "git diff main..HEAD --name-only") {
          return "src/file.ts\n";
        }
        return "";
      });

      const result = resolver.resolve("commit-range", "main..HEAD");

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      expect(changeResult.files).toContain("src/file.ts");
    });

    it("should return error when commit_range missing for 'commit-range' source", () => {
      const result = resolver.resolve("commit-range");

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toContain("Missing commit_range");
    });

    it("should route to fromFileList for 'file-list' source", () => {
      const result = resolver.resolve("file-list", undefined, ["src/file.ts"]);

      expect(result).not.toHaveProperty("code");
      const changeResult = result as ChangeResult;
      expect(changeResult.files).toContain("src/file.ts");
    });

    it("should return error when file_list missing for 'file-list' source", () => {
      const result = resolver.resolve("file-list");

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toContain("Missing file_list");
    });

    it("should return error when file_list is empty for 'file-list' source", () => {
      const result = resolver.resolve("file-list", undefined, []);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
    });
  });

  describe("static union()", () => {
    it("should merge multiple ChangeResult objects", () => {
      const result1: ChangeResult = { files: ["file1.ts", "file2.ts"] };
      const result2: ChangeResult = { files: ["file3.ts", "file4.ts"] };

      const merged = ChangeResolver.union(result1, result2);

      expect(merged.files).toHaveLength(4);
      expect(merged.files).toContain("file1.ts");
      expect(merged.files).toContain("file2.ts");
      expect(merged.files).toContain("file3.ts");
      expect(merged.files).toContain("file4.ts");
    });

    it("should deduplicate file paths", () => {
      const result1: ChangeResult = { files: ["file1.ts", "common.ts"] };
      const result2: ChangeResult = { files: ["file2.ts", "common.ts"] };

      const merged = ChangeResolver.union(result1, result2);

      expect(merged.files).toHaveLength(3); // file1, file2, common (deduplicated)
      expect(merged.files.filter((f) => f === "common.ts")).toHaveLength(1);
    });

    it("should filter out empty strings", () => {
      const result1: ChangeResult = { files: ["file1.ts", "", "file2.ts"] };
      const result2: ChangeResult = { files: ["  ", "file3.ts"] };

      const merged = ChangeResolver.union(result1, result2);

      expect(merged.files).toHaveLength(3);
      expect(merged.files).not.toContain("");
      expect(merged.files).not.toContain("  ");
    });

    it("should handle empty input arrays", () => {
      const result1: ChangeResult = { files: [] };
      const result2: ChangeResult = { files: ["file1.ts"] };

      const merged = ChangeResolver.union(result1, result2);

      expect(merged.files).toHaveLength(1);
      expect(merged.files).toContain("file1.ts");
    });

    it("should handle single input", () => {
      const result1: ChangeResult = { files: ["file1.ts", "file2.ts"] };

      const merged = ChangeResolver.union(result1);

      expect(merged.files).toHaveLength(2);
    });

    it("should handle no inputs", () => {
      const merged = ChangeResolver.union();

      expect(merged.files).toHaveLength(0);
    });
  });
});
