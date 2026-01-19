/**
 * Tests for pattern validation in MCP handlers
 *
 * Validates that verification patterns are checked before saving to database
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VerificationCriteria } from "../../src/core/pattern-validator.js";
import { validateVerificationPatterns } from "../../src/core/pattern-validator.js";

describe("Pattern Validation", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-pattern-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Structural Check Validation", () => {
    it("should warn when glob pattern matches no files", async () => {
      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "src/**/*.nonexistent",
            description: "Check nonexistent files",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true); // No errors, just warnings
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("matches no files");
      expect(result.warnings[0]).toContain("OK if CREATE expected");
    });

    it("should warn when pattern doesn't match file content", async () => {
      // Create a test file
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, "function hello() { return 'world'; }");

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "test.ts",
            pattern: "nonexistent-pattern",
            min_matches: 1,
            description: "Check for nonexistent pattern",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain(
        "Pattern 'nonexistent-pattern' found 0 match(es)",
      );
      expect(result.warnings[0]).toContain("This will FAIL verification");
    });

    it("should warn when pattern matches fewer than min_matches", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, "function hello() { return 'world'; }");

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "test.ts",
            pattern: "function",
            min_matches: 5, // Only 1 match exists
            description: "Check for multiple functions",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("found 1 match(es)");
      expect(result.warnings[0]).toContain("min_matches=5");
    });

    it("should pass when pattern matches successfully", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, "function hello() { return 'world'; }");

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "test.ts",
            pattern: "function",
            min_matches: 1,
            description: "Check for function",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should error when path is a directory without glob", async () => {
      const subDir = path.join(tempDir, "src");
      fs.mkdirSync(subDir);

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "src",
            description: "Check directory",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("is a directory");
      expect(result.errors[0]).toContain("Use a glob pattern");
    });

    it("should error when non-glob path has no file extension", async () => {
      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "some/path",
            description: "Check path without extension",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not a glob pattern");
      expect(result.errors[0]).toContain("has no file extension");
    });

    it("should handle glob patterns across multiple files", async () => {
      // Create multiple files
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, "file1.ts"), "export class Test1 {}");
      fs.writeFileSync(path.join(srcDir, "file2.ts"), "export class Test2 {}");
      fs.writeFileSync(path.join(srcDir, "file3.ts"), "export class Test3 {}");

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "src/**/*.ts",
            pattern: "export class",
            min_matches: 3,
            description: "Check for exported classes",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should handle multiline regex patterns", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(
        testFile,
        `try {
  something();
} catch (error) {
  handle(error);
}`,
      );

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "test.ts",
            pattern: "try.*catch",
            min_matches: 1,
            description: "Check for try-catch block",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should error on invalid regex pattern", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, "some content");

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "test.ts",
            pattern: "[invalid(regex",
            description: "Invalid regex",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Invalid regex pattern");
    });
  });

  describe("Quality Check Validation", () => {
    it("should skip command-based quality checks", async () => {
      const criteria: VerificationCriteria = {
        quality_checks: [
          {
            command: "npm test",
            description: "Run tests",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      // Command-based checks are not validated (can't pre-run them)
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should validate path-based quality checks", async () => {
      const testFile = path.join(tempDir, "quality.ts");
      fs.writeFileSync(testFile, "// TODO: fix this");

      const criteria: VerificationCriteria = {
        quality_checks: [
          {
            path: "quality.ts",
            pattern: "TODO",
            min_matches: 1,
            description: "Check for TODOs",
            severity: "MINOR",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should warn when quality check pattern doesn't match", async () => {
      const testFile = path.join(tempDir, "quality.ts");
      fs.writeFileSync(testFile, "clean code");

      const criteria: VerificationCriteria = {
        quality_checks: [
          {
            path: "quality.ts",
            pattern: "TODO",
            min_matches: 1,
            description: "Check for TODOs",
            severity: "MINOR",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("found 0 match(es)");
    });

    it("should handle glob patterns in quality checks", async () => {
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, "a.ts"), "// Comment");
      fs.writeFileSync(path.join(srcDir, "b.ts"), "// Comment");

      const criteria: VerificationCriteria = {
        quality_checks: [
          {
            path: "src/**/*.ts",
            pattern: "//",
            min_matches: 2,
            description: "Check for comments",
            severity: "MINOR",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("Mixed Check Validation", () => {
    it("should validate multiple check types together", async () => {
      const testFile = path.join(tempDir, "mixed.ts");
      fs.writeFileSync(testFile, "export function test() {}");

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "mixed.ts",
            pattern: "export",
            min_matches: 1,
            description: "Check for exports",
            severity: "BLOCKING",
          },
        ],
        quality_checks: [
          {
            path: "mixed.ts",
            pattern: "function",
            min_matches: 1,
            description: "Check for functions",
            severity: "MAJOR",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should collect warnings from multiple checks", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, "content");

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "test.ts",
            pattern: "missing1",
            description: "Check 1",
            severity: "BLOCKING",
          },
          {
            path: "test.ts",
            pattern: "missing2",
            description: "Check 2",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]).toContain("missing1");
      expect(result.warnings[1]).toContain("missing2");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty verification criteria", async () => {
      const criteria: VerificationCriteria = {};

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle binary/unreadable files gracefully", async () => {
      const binaryFile = path.join(tempDir, "binary.bin");
      fs.writeFileSync(binaryFile, Buffer.from([0x00, 0x01, 0x02, 0xff]));

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "binary.bin",
            pattern: "text",
            description: "Check binary file",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      // Should handle gracefully - no crash, may have warnings
      expect(result.valid).toBe(true);
    });

    it("should handle absolute paths", async () => {
      const testFile = path.join(tempDir, "absolute.ts");
      fs.writeFileSync(testFile, "content");

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: testFile, // Absolute path
            pattern: "content",
            description: "Check absolute path",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should handle pattern without min_matches (defaults to 1)", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, "test");

      const criteria: VerificationCriteria = {
        structural_checks: [
          {
            path: "test.ts",
            pattern: "test",
            // min_matches not specified - should default to 1
            description: "Check with default min_matches",
            severity: "BLOCKING",
          },
        ],
      };

      const result = await validateVerificationPatterns(criteria, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
