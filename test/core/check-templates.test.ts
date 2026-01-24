/**
 * Tests for check-templates.ts
 *
 * Verifies that predefined verification check templates work correctly
 * and produce valid, tested patterns/commands.
 */

import { describe, expect, it } from "vitest";
import {
  detectLanguageFromEnv,
  getTddRedChecks,
  TDD_RED_CHECKS,
  type SupportedLanguage,
} from "../../src/core/check-templates.js";

describe("check-templates", () => {
  describe("TDD_RED_CHECKS structure", () => {
    it("should have templates for all supported languages", () => {
      const languages: SupportedLanguage[] = [
        "dart",
        "typescript",
        "python",
        "rust",
      ];
      for (const lang of languages) {
        expect(TDD_RED_CHECKS[lang]).toBeDefined();
        expect(TDD_RED_CHECKS[lang]!.length).toBeGreaterThan(0);
      }
    });

    it("should have 4 checks per language (2 behavioral + 2 structural)", () => {
      const languages: SupportedLanguage[] = [
        "dart",
        "typescript",
        "python",
        "rust",
      ];
      for (const lang of languages) {
        const checks = TDD_RED_CHECKS[lang]!;
        expect(checks.length).toBe(4);

        const behavioral = checks.filter((c) => c.check_type === "behavioral");
        const structural = checks.filter((c) => c.check_type === "structural");

        expect(behavioral.length).toBe(2);
        expect(structural.length).toBe(2);
      }
    });

    it("should have all checks marked as BLOCKING severity", () => {
      const languages: SupportedLanguage[] = [
        "dart",
        "typescript",
        "python",
        "rust",
      ];
      for (const lang of languages) {
        for (const check of TDD_RED_CHECKS[lang]!) {
          expect(check.severity).toBe("BLOCKING");
        }
      }
    });

    it("should have placeholders in all templates", () => {
      const languages: SupportedLanguage[] = [
        "dart",
        "typescript",
        "python",
        "rust",
      ];
      for (const lang of languages) {
        for (const check of TDD_RED_CHECKS[lang]!) {
          // All descriptions should have TASK_TITLE placeholder
          expect(check.description).toContain("{{TASK_TITLE}}");

          // Behavioral checks should have CD_PREFIX and TEST_COMMAND in command
          if (check.check_type === "behavioral") {
            expect(check.check_config.command).toContain("{{CD_PREFIX}}");
            expect(check.check_config.command).toContain("{{TEST_COMMAND}}");
          }

          // Structural checks should have TEST_FILE_PATTERN in path
          if (check.check_type === "structural") {
            expect(check.check_config.path).toContain("{{TEST_FILE_PATTERN}}");
          }
        }
      }
    });
  });

  describe("getTddRedChecks", () => {
    const testContext = {
      cdPrefix: "",
      testFilePattern: "test/**/*.test.ts",
      taskId: 42,
      taskTitle: "Test Task",
      testCommand: "npm test",
    };

    it("should replace all placeholders in returned checks", () => {
      const checks = getTddRedChecks("typescript", testContext);

      for (const check of checks) {
        // No placeholders should remain
        expect(check.description).not.toContain("{{");
        expect(check.description).toContain("Test Task");

        if (check.check_config.command) {
          expect(check.check_config.command).not.toContain("{{");
          expect(check.check_config.command).toContain("npm test");
        }
        if (check.check_config.path) {
          expect(check.check_config.path).not.toContain("{{");
          expect(check.check_config.path).toBe("test/**/*.test.ts");
        }
        if (check.check_config.pattern) {
          expect(check.check_config.pattern).not.toContain("{{");
        }
      }
    });

    it("should include task ID in task-ID annotation pattern", () => {
      const checks = getTddRedChecks("typescript", testContext);
      const taskIdCheck = checks.find((c) =>
        c.description.includes("Task-ID annotation"),
      );

      expect(taskIdCheck).toBeDefined();
      expect(taskIdCheck!.check_config.pattern).toContain("42");
    });

    it("should prepend cd prefix when provided", () => {
      const checksWithPrefix = getTddRedChecks("dart", {
        ...testContext,
        cdPrefix: "cd subdir; ",
        testCommand: "flutter test",
      });

      const behavioralCheck = checksWithPrefix.find(
        (c) => c.check_type === "behavioral",
      );
      expect(behavioralCheck!.check_config.command).toMatch(/^cd subdir; /);
      expect(behavioralCheck!.check_config.command).toContain("flutter test");
    });

    it("should produce valid regex patterns", () => {
      const languages: SupportedLanguage[] = [
        "dart",
        "typescript",
        "python",
        "rust",
      ];

      const contextWithLang = { ...testContext, testCommand: "npm test" };
      for (const lang of languages) {
        const checks = getTddRedChecks(lang, contextWithLang);

        for (const check of checks) {
          if (check.check_config.pattern) {
            // Pattern should compile without error
            expect(
              () => new RegExp(check.check_config.pattern!, "gms"),
            ).not.toThrow();
          }
        }
      }
    });

    it("should throw for unsupported language", () => {
      expect(() =>
        getTddRedChecks("cobol" as SupportedLanguage, {
          ...testContext,
          testCommand: "npm test",
        }),
      ).toThrow("No TDD red-phase templates for language: cobol");
    });
  });

  describe("detectLanguageFromEnv", () => {
    it("should detect dart from flutter test command", () => {
      expect(detectLanguageFromEnv("flutter test")).toBe("dart");
      expect(detectLanguageFromEnv("flutter test --tags tdd-red")).toBe("dart");
    });

    it("should detect dart from dart test command", () => {
      expect(detectLanguageFromEnv("dart test")).toBe("dart");
    });

    it("should detect typescript from npm test command", () => {
      expect(detectLanguageFromEnv("npm test")).toBe("typescript");
      expect(detectLanguageFromEnv("npm test -- --coverage")).toBe(
        "typescript",
      );
    });

    it("should detect typescript from vitest/jest commands", () => {
      expect(detectLanguageFromEnv("vitest run")).toBe("typescript");
      expect(detectLanguageFromEnv("jest")).toBe("typescript");
    });

    it("should detect python from pytest command", () => {
      expect(detectLanguageFromEnv("pytest")).toBe("python");
      expect(detectLanguageFromEnv("pytest -m tdd_red")).toBe("python");
    });

    it("should detect rust from cargo test command", () => {
      expect(detectLanguageFromEnv("cargo test")).toBe("rust");
    });

    it("should detect from file pattern when command not available", () => {
      expect(detectLanguageFromEnv(undefined, "test/**/*.dart")).toBe("dart");
      expect(detectLanguageFromEnv(undefined, "test/**/*.test.ts")).toBe(
        "typescript",
      );
      expect(detectLanguageFromEnv(undefined, "tests/**/*.py")).toBe("python");
      expect(detectLanguageFromEnv(undefined, "tests/**/*.rs")).toBe("rust");
    });

    it("should return null for unknown patterns", () => {
      expect(detectLanguageFromEnv(undefined, undefined)).toBeNull();
      expect(detectLanguageFromEnv("unknown-runner")).toBeNull();
    });
  });

  describe("TEST_COMMAND substitution", () => {
    it("should substitute TEST_COMMAND in all behavioral checks", () => {
      const languages: SupportedLanguage[] = [
        "dart",
        "typescript",
        "python",
        "rust",
      ];

      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          taskId: 1,
          taskTitle: "Test Task",
          testCommand: "custom-test-runner",
        });

        const behavioralChecks = checks.filter(
          (c) => c.check_type === "behavioral",
        );
        expect(behavioralChecks.length).toBe(2);

        for (const check of behavioralChecks) {
          expect(check.check_config.command).toContain("custom-test-runner");
          expect(check.check_config.command).not.toContain("{{TEST_COMMAND}}");
        }
      }
    });

    it("should not leave TEST_COMMAND placeholder in any behavioral check", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "npm test",
      });

      for (const check of checks) {
        if (check.check_config.command) {
          expect(check.check_config.command).not.toContain("{{TEST_COMMAND}}");
        }
      }
    });

    it("should use exact testCommand value without modification", () => {
      const testCommand = "pnpm vitest --coverage --reporter=json";
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 1,
        taskTitle: "Test",
        testCommand,
      });

      const behavioralChecks = checks.filter(
        (c) => c.check_type === "behavioral",
      );
      for (const check of behavioralChecks) {
        expect(check.check_config.command).toContain(testCommand);
      }
    });

    it("should handle testCommand with special characters", () => {
      const checks = getTddRedChecks("dart", {
        cdPrefix: "",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "flutter test --coverage --reporter=json",
      });

      const behavioralChecks = checks.filter(
        (c) => c.check_type === "behavioral",
      );
      expect(behavioralChecks.length).toBeGreaterThan(0);
      for (const check of behavioralChecks) {
        expect(check.check_config.command).toContain(
          "flutter test --coverage --reporter=json",
        );
        expect(check.check_config.command).toBeDefined();
      }
    });

    it("should combine CD_PREFIX and TEST_COMMAND correctly with scope flags", () => {
      const checks = getTddRedChecks("python", {
        cdPrefix: "cd backend; ",
        testFilePattern: "tests/**/*.py",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "pytest -v",
      });

      const behavioralChecks = checks.filter(
        (c) => c.check_type === "behavioral",
      );

      // First check: tagged tests must fail (runs only tdd_red marked tests)
      const taggedCheck = behavioralChecks.find((c) =>
        c.description.includes("Tagged tests must fail"),
      );
      expect(taggedCheck!.check_config.command).toBe(
        "cd backend; pytest -v -m tdd_red",
      );

      // Second check: non-tagged tests must pass (excludes tdd_red marked tests)
      const nonTaggedCheck = behavioralChecks.find((c) =>
        c.description.includes("Non-tagged tests must pass"),
      );
      expect(nonTaggedCheck!.check_config.command).toBe(
        'cd backend; pytest -v -m "not tdd_red"',
      );
    });
  });

  describe("Pattern validity (regression prevention)", () => {
    it("Dart @Tags pattern should match real Dart syntax", () => {
      const checks = getTddRedChecks("dart", {
        cdPrefix: "",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "flutter test",
      });

      const markerCheck = checks.find((c) =>
        c.description.includes("Red-phase marker"),
      );
      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // Should match real Dart TDD annotations
      expect("@Tags(['tdd-red'])".match(pattern)).toBeTruthy();
      expect("  @Tags(['tdd-red'])".match(pattern)).toBeTruthy();
      expect("tags: ['tdd-red']".match(pattern)).toBeTruthy();
      expect("}, tags: ['tdd-red']);".match(pattern)).toBeTruthy();
    });

    it("TypeScript [tdd-red] pattern should match real test names", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "npm test",
      });

      const markerCheck = checks.find((c) =>
        c.description.includes("Red-phase test marker"),
      );
      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // Should match real TypeScript test markers
      expect(
        "it('[tdd-red] should work', () => {})".match(pattern),
      ).toBeTruthy();
      expect(
        "describe('[tdd-red] feature', () => {})".match(pattern),
      ).toBeTruthy();
    });

    it("Task-ID annotation patterns should match expected format", () => {
      const languages: SupportedLanguage[] = ["dart", "typescript", "rust"];

      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          taskId: 123,
          taskTitle: "Test",
          testCommand: "npm test",
        });

        const taskIdCheck = checks.find((c) =>
          c.description.includes("Task-ID annotation"),
        );
        const pattern = new RegExp(taskIdCheck!.check_config.pattern!, "gms");

        // Should match the task ID annotation
        expect("// @orchestra-task: 123".match(pattern)).toBeTruthy();
        expect("//   @orchestra-task: 123".match(pattern)).toBeTruthy();
      }
    });

    it("Python task-ID annotation uses # comment syntax", () => {
      const checks = getTddRedChecks("python", {
        cdPrefix: "",
        testFilePattern: "tests/**/*.py",
        taskId: 456,
        taskTitle: "Test",
        testCommand: "pytest",
      });

      const taskIdCheck = checks.find((c) =>
        c.description.includes("Task-ID annotation"),
      );
      const pattern = new RegExp(taskIdCheck!.check_config.pattern!, "gms");

      // Python uses # for comments
      expect("# @orchestra-task: 456".match(pattern)).toBeTruthy();
      expect("#   @orchestra-task: 456".match(pattern)).toBeTruthy();
    });
  });
});
