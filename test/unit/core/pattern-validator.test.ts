import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateVerificationPatterns } from "../../../src/core/pattern-validator.js";

describe("pattern-validator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pattern-validator-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("structural checks", () => {
    it("should pass when path exists and pattern matches", async () => {
      const file = path.join(tempDir, "test.ts");
      fs.writeFileSync(file, "export class Logger {}");

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "test.ts",
              pattern: "class Logger",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should warn when path matches no files (CREATE expected)", async () => {
      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "nonexistent.ts",
              pattern: "class Logger",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("does not exist yet");
      expect(result.warnings[0]).toContain("OK if CREATE expected");
    });

    it("should warn when pattern matches no content", async () => {
      const file = path.join(tempDir, "test.ts");
      fs.writeFileSync(file, "export class Logger {}");

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "test.ts",
              pattern: "class Database", // Won't match
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Pattern");
      expect(result.warnings[0]).toContain("found 0 match(es)");
      expect(result.warnings[0]).toContain("This will FAIL verification");
    });

    it("should warn when pattern matches fewer than min_matches", async () => {
      const file = path.join(tempDir, "test.ts");
      fs.writeFileSync(file, "export class Logger {}");

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "test.ts",
              pattern: "class Logger",
              min_matches: 3,
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("found 1 match(es)");
      expect(result.warnings[0]).toContain("but min_matches=3");
    });

    it("should error when path is a directory without glob", async () => {
      const dir = path.join(tempDir, "subdir");
      fs.mkdirSync(dir);

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "subdir",
              pattern: "class Logger",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("is a directory");
      expect(result.errors[0]).toContain("glob pattern");
    });

    it("should handle glob patterns correctly", async () => {
      fs.writeFileSync(path.join(tempDir, "a.ts"), "class A {}");
      fs.writeFileSync(path.join(tempDir, "b.ts"), "class B {}");

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "*.ts",
              pattern: "class",
              min_matches: 2,
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should error on invalid regex pattern", async () => {
      const file = path.join(tempDir, "test.ts");
      fs.writeFileSync(file, "export class Logger {}");

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "test.ts",
              pattern: "[invalid(regex", // Invalid regex
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Invalid regex pattern");
    });

    it("should pass when glob matches files without pattern check", async () => {
      fs.writeFileSync(path.join(tempDir, "a.ts"), "content");
      fs.writeFileSync(path.join(tempDir, "b.ts"), "content");

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "*.ts",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("behavioral checks", () => {
    it("should error for bash && syntax (fails on Windows)", async () => {
      const result = await validateVerificationPatterns(
        {
          behavioral_checks: [
            {
              type: "behavioral",
              command: "echo hello && echo world",
            },
          ],
        },
        tempDir,
      );

      // && syntax is now an ERROR (will fail on PowerShell/Windows)
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("&&");
    });

    it("should pass for commands without bash-only syntax or test commands", async () => {
      const result = await validateVerificationPatterns(
        {
          behavioral_checks: [
            {
              type: "behavioral",
              command: "npx tsc --noEmit",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    describe("test command rejection (FR-039)", () => {
      it("should reject 'npm test' commands", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "npm test",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
        expect(result.errors[0]).toContain("test_verification");
      });

      it("should reject 'npx vitest' commands", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "npx vitest run",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
      });

      it("should reject 'npx jest' commands", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "npx jest --coverage",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
      });

      it("should reject 'flutter test' commands", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "flutter test --tags unit",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
      });

      it("should reject 'pytest' commands", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "pytest -v tests/",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
      });

      it("should reject 'cargo test' commands", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "cargo test --lib",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
      });

      it("should reject 'go test' commands", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "go test ./...",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
      });

      it("should reject 'yarn test' commands", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "yarn test",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
      });

      it("should reject 'pnpm test' commands", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "pnpm test",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
      });

      it("should reject commands with --testNamePattern flag", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "node script.js --testNamePattern 'foo'",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("test execution command");
      });

      it("should allow non-test commands in behavioral_checks", async () => {
        const result = await validateVerificationPatterns(
          {
            behavioral_checks: [
              {
                type: "behavioral",
                command: "npx tsc --noEmit",
              },
              {
                type: "behavioral",
                command: "npm run lint",
              },
              {
                type: "behavioral",
                command: "node scripts/validate.js",
              },
            ],
          },
          tempDir,
        );

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });
  describe("quality checks - command-based", () => {
    it("should pass for command-based quality checks", async () => {
      const result = await validateVerificationPatterns(
        {
          quality_checks: [
            {
              type: "quality",
              command: "npm run lint && npm run typecheck",
            },
          ],
        },
        tempDir,
      );

      // Pattern validator doesn't validate commands
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("quality checks - pattern-based", () => {
    it("should warn when path matches no files", async () => {
      const result = await validateVerificationPatterns(
        {
          quality_checks: [
            {
              type: "quality",
              path: "src/**/*.ts",
              pattern: "TODO",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("matches no files");
    });

    it("should warn when pattern matches no content", async () => {
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "test.ts"), "clean code");

      const result = await validateVerificationPatterns(
        {
          quality_checks: [
            {
              type: "quality",
              path: "src/**/*.ts",
              pattern: "TODO",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("found 0 match(es)");
    });

    it("should pass when pattern matches content", async () => {
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "test.ts"), "// TODO: fix");

      const result = await validateVerificationPatterns(
        {
          quality_checks: [
            {
              type: "quality",
              path: "src/**/*.ts",
              pattern: "TODO",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should error when path is a directory without glob", async () => {
      const dir = path.join(tempDir, "src");
      fs.mkdirSync(dir);

      const result = await validateVerificationPatterns(
        {
          quality_checks: [
            {
              type: "quality",
              path: "src",
              pattern: "TODO",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("no file extension");
    });
  });

  describe("multiple checks", () => {
    it("should aggregate warnings and errors from all checks", async () => {
      const file = path.join(tempDir, "test.ts");
      fs.writeFileSync(file, "export class Logger {}");

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "test.ts",
              pattern: "class Database", // Won't match - warning
            },
          ],
          behavioral_checks: [
            {
              type: "behavioral",
              command: "npx tsc --noEmit", // Valid command without bash syntax or test commands
            },
          ],          quality_checks: [
            {
              type: "quality",
              path: "nonexistent/**/*.ts",
              pattern: "TODO", // No files - warning
            },
          ],
        },
        tempDir,
      );

      // Should be valid but with warnings (no files found)
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should pass when all checks are valid", async () => {
      fs.writeFileSync(path.join(tempDir, "test.ts"), "export class Logger {}");

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "test.ts",
              pattern: "class Logger",
            },
          ],
          behavioral_checks: [
            {
              type: "behavioral",
              command: "npx tsc --noEmit",
            },
          ],
          quality_checks: [
            {
              type: "quality",
              command: "npm run lint",
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });  });

  describe("edge cases", () => {
    it("should handle empty checks gracefully", async () => {
      const result = await validateVerificationPatterns({}, tempDir);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle undefined optional properties", async () => {
      const result = await validateVerificationPatterns(
        {
          structural_checks: undefined,
          behavioral_checks: undefined,
          quality_checks: undefined,
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle checks without optional fields", async () => {
      fs.writeFileSync(path.join(tempDir, "test.ts"), "content");

      const result = await validateVerificationPatterns(
        {
          structural_checks: [
            {
              type: "structural",
              path: "test.ts",
              // No pattern, no min_matches
            },
          ],
        },
        tempDir,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
