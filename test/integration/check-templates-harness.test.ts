/**
 * Integration tests for check-templates against real test harnesses.
 *
 * These tests validate that the predefined check templates produce
 * patterns/commands that work correctly against real test files.
 *
 * Uses:
 * - testing/tdd-test-harness/dart/ - Dart/Flutter test fixtures
 * - testing/tdd-test-harness/typescript/ - TypeScript test fixtures
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import {
  getTddRedChecks,
  type SupportedLanguage,
} from "../../src/core/check-templates.js";

const HARNESS_ROOT = path.join(process.cwd(), "testing", "tdd-test-harness");

describe("check-templates integration with test harnesses", () => {
  describe("Dart harness validation", () => {
    const dartHarness = path.join(HARNESS_ROOT, "dart");
    const dartTestDir = path.join(dartHarness, "test");

    it("should have dart test harness available", () => {
      expect(fs.existsSync(dartHarness)).toBe(true);
      expect(fs.existsSync(dartTestDir)).toBe(true);
    });

    it("Task-ID annotation pattern should match real Dart files", () => {
      const checks = getTddRedChecks("dart", {
        cdPrefix: "",
        testFilePattern: "test/**/*.dart",
        taskId: 3,
        taskTitle: "Test",
        testCommand: "flutter test",
      });

      const taskIdCheck = checks.find((c) =>
        c.description.includes("Task-ID annotation"),
      );
      expect(taskIdCheck).toBeDefined();

      const pattern = new RegExp(taskIdCheck!.check_config.pattern!, "gms");

      // Read category1 file which has task ID 3
      const category1Path = path.join(
        dartTestDir,
        "category1_tdd_red_failing_test.dart",
      );
      const content = fs.readFileSync(category1Path, "utf-8");

      const matches = content.match(pattern);
      expect(matches).toBeTruthy();
      expect(matches!.length).toBeGreaterThanOrEqual(1);
    });

    it("Red-phase marker pattern should match @Tags annotation", () => {
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
      expect(markerCheck).toBeDefined();

      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // Read category1 file which has @Tags(['tdd-red'])
      const category1Path = path.join(
        dartTestDir,
        "category1_tdd_red_failing_test.dart",
      );
      const content = fs.readFileSync(category1Path, "utf-8");

      const matches = content.match(pattern);
      expect(matches).toBeTruthy();
    });

    it("Red-phase marker pattern should match inline tags parameter", () => {
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

      // Inline tags format
      const inlineContent = "test('foo', () {}, tags: ['tdd-red']);";
      expect(inlineContent.match(pattern)).toBeTruthy();
    });

    it("should find TDD markers in all expected Dart files", () => {
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

      // Files that should have TDD markers
      const expectedFiles = [
        "category1_tdd_red_failing_test.dart",
        "category2_tdd_red_passing_violation_test.dart",
        "mixed_file_test.dart",
      ];

      for (const fileName of expectedFiles) {
        const filePath = path.join(dartTestDir, fileName);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const matches = content.match(pattern);
          expect(matches, `Expected TDD marker in ${fileName}`).toBeTruthy();
        }
      }
    });

    it("should NOT find TDD markers in normal test files", () => {
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

      // Files that should NOT have TDD markers
      const normalFiles = [
        "category3_normal_failing_regression_test.dart",
        "category4_normal_passing_test.dart",
      ];

      for (const fileName of normalFiles) {
        const filePath = path.join(dartTestDir, fileName);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const matches = content.match(pattern);
          expect(matches, `Unexpected TDD marker in ${fileName}`).toBeNull();
        }
      }
    });
  });

  describe("TypeScript harness validation", () => {
    const tsHarness = path.join(HARNESS_ROOT, "typescript");
    const tsTestDir = path.join(tsHarness, "test");

    it("should have typescript test harness available", () => {
      expect(fs.existsSync(tsHarness)).toBe(true);
      expect(fs.existsSync(tsTestDir)).toBe(true);
    });

    it("Task-ID annotation pattern should match real TypeScript files", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 3,
        taskTitle: "Test",
        testCommand: "npm test",
      });

      const taskIdCheck = checks.find((c) =>
        c.description.includes("Task-ID annotation"),
      );
      expect(taskIdCheck).toBeDefined();

      const pattern = new RegExp(taskIdCheck!.check_config.pattern!, "gms");

      // Read category1 file which has task ID 3
      const category1Path = path.join(
        tsTestDir,
        "category1_tdd_red_failing.test.ts",
      );
      const content = fs.readFileSync(category1Path, "utf-8");

      const matches = content.match(pattern);
      expect(matches).toBeTruthy();
      expect(matches!.length).toBeGreaterThanOrEqual(1);
    });

    it("Red-phase marker pattern should match [tdd-red] in test names", () => {
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
      expect(markerCheck).toBeDefined();

      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // Read category1 file which has [tdd-red] markers
      const category1Path = path.join(
        tsTestDir,
        "category1_tdd_red_failing.test.ts",
      );
      const content = fs.readFileSync(category1Path, "utf-8");

      const matches = content.match(pattern);
      expect(matches).toBeTruthy();
    });

    it("should find [tdd-red] markers in all expected TypeScript files", () => {
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

      // Files that should have TDD markers
      const expectedFiles = [
        "category1_tdd_red_failing.test.ts",
        "category2_tdd_red_passing_violation.test.ts",
        "mixed_file.test.ts",
      ];

      for (const fileName of expectedFiles) {
        const filePath = path.join(tsTestDir, fileName);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const matches = content.match(pattern);
          expect(
            matches,
            `Expected [tdd-red] marker in ${fileName}`,
          ).toBeTruthy();
        }
      }
    });

    it("should NOT find [tdd-red] markers in normal test files", () => {
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

      // Files that should NOT have TDD markers
      const normalFiles = [
        "category3_normal_failing_regression.test.ts",
        "category4_normal_passing.test.ts",
      ];

      for (const fileName of normalFiles) {
        const filePath = path.join(tsTestDir, fileName);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const matches = content.match(pattern);
          expect(
            matches,
            `Unexpected [tdd-red] marker in ${fileName}`,
          ).toBeNull();
        }
      }
    });
  });

  describe("Cross-language pattern consistency", () => {
    const languages: SupportedLanguage[] = [
      "dart",
      "typescript",
      "python",
      "rust",
    ];

    it("all languages should produce exactly 4 checks", () => {
      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          taskId: 1,
          taskTitle: "Test",
          testCommand: "npm test",
        });
        expect(checks.length, `${lang} should have 4 checks`).toBe(4);
      }
    });

    it("all languages should have 2 behavioral + 2 structural checks", () => {
      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          taskId: 1,
          taskTitle: "Test",
          testCommand: "npm test",
        });

        const behavioral = checks.filter((c) => c.check_type === "behavioral");
        const structural = checks.filter((c) => c.check_type === "structural");

        expect(behavioral.length, `${lang} behavioral`).toBe(2);
        expect(structural.length, `${lang} structural`).toBe(2);
      }
    });

    it("behavioral checks should have correct exit codes", () => {
      const expectedExitCodes: Record<
        SupportedLanguage,
        { fail: number; pass: number }
      > = {
        dart: { fail: 1, pass: 0 },
        typescript: { fail: 1, pass: 0 },
        python: { fail: 1, pass: 0 },
        rust: { fail: 101, pass: 0 }, // Rust uses 101 for test failures
      };

      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          taskId: 1,
          taskTitle: "Test",
          testCommand: "npm test",
        });

        const behavioral = checks.filter((c) => c.check_type === "behavioral");

        // First behavioral check: tests must FAIL
        expect(
          behavioral[0].check_config.expect_exit_code,
          `${lang} fail check`,
        ).toBe(expectedExitCodes[lang].fail);

        // Second behavioral check: non-tagged tests must PASS
        expect(
          behavioral[1].check_config.expect_exit_code,
          `${lang} pass check`,
        ).toBe(expectedExitCodes[lang].pass);
      }
    });

    it("all patterns should be valid regex", () => {
      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          taskId: 123,
          taskTitle: "Test",
          testCommand: "npm test",
        });

        for (const check of checks) {
          if (check.check_config.pattern) {
            expect(() => {
              new RegExp(check.check_config.pattern!, "gms");
            }, `${lang}: ${check.description}`).not.toThrow();
          }
        }
      }
    });
  });

  describe("cdPrefix handling", () => {
    it("should correctly prepend cd prefix to commands", () => {
      const checksWithPrefix = getTddRedChecks("dart", {
        cdPrefix: "cd packages/app; ",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "flutter test",
      });

      const behavioral = checksWithPrefix.filter(
        (c) => c.check_type === "behavioral",
      );

      for (const check of behavioral) {
        expect(check.check_config.command).toMatch(/^cd packages\/app; /);
      }
    });

    it("should have no prefix when cdPrefix is empty", () => {
      const checksNoPrefix = getTddRedChecks("dart", {
        cdPrefix: "",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "flutter test",
      });

      const behavioral = checksNoPrefix.filter(
        (c) => c.check_type === "behavioral",
      );

      for (const check of behavioral) {
        expect(check.check_config.command).not.toMatch(/^cd /);
      }
    });
  });

  describe("environment-driven testCommand substitution", () => {
    it("should substitute testCommand for Dart/Flutter", () => {
      const checks = getTddRedChecks("dart", {
        cdPrefix: "",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Feature Test",
        testCommand: "flutter test --tags tdd-red",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");
      expect(behavioral.length).toBeGreaterThan(0);

      for (const check of behavioral) {
        expect(check.check_config.command).toBe("flutter test --tags tdd-red");
      }
    });

    it("should substitute testCommand for TypeScript/Vitest", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 1,
        taskTitle: "Feature Test",
        testCommand: "npm test -- --testNamePattern='\\[tdd-red\\]'",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");
      expect(behavioral.length).toBeGreaterThan(0);

      for (const check of behavioral) {
        expect(check.check_config.command).toBe(
          "npm test -- --testNamePattern='\\[tdd-red\\]'",
        );
      }
    });

    it("should substitute testCommand for Python/Pytest", () => {
      const checks = getTddRedChecks("python", {
        cdPrefix: "",
        testFilePattern: "test/**/*.py",
        taskId: 1,
        taskTitle: "Feature Test",
        testCommand: "pytest -m tdd_red",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");
      expect(behavioral.length).toBeGreaterThan(0);

      for (const check of behavioral) {
        expect(check.check_config.command).toBe("pytest -m tdd_red");
      }
    });

    it("should substitute testCommand for Rust/Cargo", () => {
      const checks = getTddRedChecks("rust", {
        cdPrefix: "",
        testFilePattern: "tests/**/*.rs",
        taskId: 1,
        taskTitle: "Feature Test",
        testCommand: "cargo test tdd_red_",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");
      expect(behavioral.length).toBeGreaterThan(0);

      for (const check of behavioral) {
        expect(check.check_config.command).toBe("cargo test tdd_red_");
      }
    });

    it("should support custom test commands with flags", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 1,
        taskTitle: "Feature Test",
        testCommand: "npm run test:ci -- --run --reporter=verbose",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");
      expect(behavioral.length).toBeGreaterThan(0);

      for (const check of behavioral) {
        expect(check.check_config.command).toBe(
          "npm run test:ci -- --run --reporter=verbose",
        );
      }
    });

    it("should combine cdPrefix with testCommand", () => {
      const checks = getTddRedChecks("dart", {
        cdPrefix: "cd packages/app; ",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Feature Test",
        testCommand: "flutter test --tags tdd-red",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");
      expect(behavioral.length).toBeGreaterThan(0);

      for (const check of behavioral) {
        expect(check.check_config.command).toBe(
          "cd packages/app; flutter test --tags tdd-red",
        );
      }
    });
  });
});
