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
} from "../../../src/core/check-templates.js";

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

    it("should have 3 checks per language (1 test_verification + 2 structural)", () => {
      const languages: SupportedLanguage[] = [
        "dart",
        "typescript",
        "python",
        "rust",
      ];
      for (const lang of languages) {
        const checks = TDD_RED_CHECKS[lang]!;
        expect(checks.length).toBe(3);

        const testVerification = checks.filter(
          (c) => c.check_type === "test_verification",
        );
        const structural = checks.filter((c) => c.check_type === "structural");

        expect(testVerification.length).toBe(1);
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

          // test_verification checks should have tier and expect (no commands/placeholders)
          if (check.check_type === "test_verification") {
            expect(check.check_config.tier).toBeDefined();
            expect(check.check_config.expect).toBeDefined();
          }

          // Structural checks should have TEST_FILE_PATTERN in path (except red-phase file checks which use hardcoded paths)
          if (check.check_type === "structural") {
            const hasPlaceholder = check.check_config.path?.includes(
              "{{TEST_FILE_PATTERN}}",
            );
            const hasHardcodedRedPath =
              check.check_config.path === "test/red/**/*.test.ts" ||
              check.check_config.path === "test/red/**/*_test.dart";
            expect(hasPlaceholder || hasHardcodedRedPath).toBe(true);
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
          // TypeScript red-phase file check uses hardcoded path; others use testFilePattern
          const isRedFileCheck =
            check.check_config.path === "test/red/**/*.test.ts";
          if (!isRedFileCheck) {
            expect(check.check_config.path).toBe("test/**/*.test.ts");
          }
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

    it("should produce test_verification checks with correct tier config", () => {
      const checks = getTddRedChecks("dart", {
        ...testContext,
        cdPrefix: "cd subdir; ",
        testCommand: "flutter test",
      });

      const testVerCheck = checks.find(
        (c) => c.check_type === "test_verification",
      );
      expect(testVerCheck).toBeDefined();
      expect(testVerCheck!.check_config.tier).toBe("red");
      expect(testVerCheck!.check_config.expect).toBe("any_fail");
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

  describe("test_verification check structure", () => {
    it("should produce test_verification checks with tier and expect for all languages", () => {
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

        const testVerChecks = checks.filter(
          (c) => c.check_type === "test_verification",
        );
        expect(testVerChecks.length).toBe(1);

        for (const check of testVerChecks) {
          expect(check.check_config.tier).toBe("red");
          expect(check.check_config.expect).toBe("any_fail");
        }
      }
    });

    it("should not have any behavioral checks in templates", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "npm test",
      });

      const behavioralChecks = checks.filter(
        (c) => c.check_type === "behavioral",
      );
      expect(behavioralChecks.length).toBe(0);
    });

    it("should have success and failure messages on test_verification checks", () => {
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
          taskTitle: "Test",
          testCommand: "npm test",
        });

        const testVerCheck = checks.find(
          (c) => c.check_type === "test_verification",
        );
        expect(testVerCheck!.check_config.success_message).toBeDefined();
        expect(testVerCheck!.check_config.failure_message).toBeDefined();
      }
    });

    it("should replace TASK_TITLE in test_verification descriptions", () => {
      const checks = getTddRedChecks("python", {
        cdPrefix: "cd backend; ",
        testFilePattern: "tests/**/*.py",
        taskId: 1,
        taskTitle: "My Feature",
        testCommand: "pytest -v",
      });

      const testVerCheck = checks.find(
        (c) => c.check_type === "test_verification",
      );
      expect(testVerCheck!.description).toContain("My Feature");
      expect(testVerCheck!.description).not.toContain("{{TASK_TITLE}}");
    });
  });

  describe("Pattern validity (regression prevention)", () => {
    it("Dart red-phase structural check should validate test function presence", () => {
      const checks = getTddRedChecks("dart", {
        cdPrefix: "",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "flutter test",
      });

      const markerCheck = checks.find((c) =>
        c.description.includes("Red-phase test files present"),
      );
      expect(markerCheck).toBeDefined();

      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // Should match Dart test function calls (test/group)
      expect("test('should work', () {})".match(pattern)).toBeTruthy();
      expect("group('feature', () {})".match(pattern)).toBeTruthy();
      expect(markerCheck!.check_config.path).toBe("test/red/**/*_test.dart");
    });

    it("TypeScript red-phase structural check should validate test function presence", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "npm test",
      });

      const markerCheck = checks.find((c) =>
        c.description.includes("Red-phase test files present"),
      );
      expect(markerCheck).toBeDefined();

      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // Should match test function calls (describe/it/test)
      expect("it('should work', () => {})".match(pattern)).toBeTruthy();
      expect("describe('feature', () => {})".match(pattern)).toBeTruthy();
      expect(markerCheck!.check_config.path).toBe("test/red/**/*.test.ts");
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
