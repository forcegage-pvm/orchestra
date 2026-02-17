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

    it("Red-phase test file pattern should match Dart test functions", () => {
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

      // Read category1 file which has test() and group() calls
      const category1Path = path.join(
        dartTestDir,
        "category1_tdd_red_failing_test.dart",
      );
      const content = fs.readFileSync(category1Path, "utf-8");

      const matches = content.match(pattern);
      expect(matches).toBeTruthy();
    });

    it("Red-phase test file pattern should match Dart test/group calls", () => {
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
      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // Should match Dart test function calls
      expect("test('foo', () {})".match(pattern)).toBeTruthy();
      expect("group('bar', () {})".match(pattern)).toBeTruthy();
      // Should not match non-test content
      expect("class Foo {}".match(pattern)).toBeNull();
    });

    it("should find test functions in all expected Dart test files", () => {
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
      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // All Dart test files should contain test() or group() calls
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
          expect(matches, `Expected test function in ${fileName}`).toBeTruthy();
        }
      }
    });

    it("should NOT match non-test Dart files with the red-phase check", () => {
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
      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // Content without test() or group() should not match
      const nonTestContent = `
import 'package:test/test.dart';

// This file has no test or group calls
class MyHelper {
  void doSomething() {}
}
`;
      expect(nonTestContent.match(pattern)).toBeNull();
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

    it("Red-phase structural check should validate test function presence in test/red/ files", () => {
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

      // New directory-based approach: structural check validates test function calls
      expect(markerCheck!.check_config.path).toBe("test/red/**/*.test.ts");
      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // Pattern should match describe/it/test function calls in test files
      const category1Path = path.join(
        tsTestDir,
        "category1_tdd_red_failing.test.ts",
      );
      const content = fs.readFileSync(category1Path, "utf-8");

      const matches = content.match(pattern);
      expect(matches).toBeTruthy();
    });

    it("should match test function calls in TypeScript test files", () => {
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
      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");

      // All test files should contain describe/it/test calls
      const testFiles = [
        "category1_tdd_red_failing.test.ts",
        "category2_tdd_red_passing_violation.test.ts",
        "mixed_file.test.ts",
      ];

      for (const fileName of testFiles) {
        const filePath = path.join(tsTestDir, fileName);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const matches = content.match(pattern);
          expect(
            matches,
            `Expected test function call in ${fileName}`,
          ).toBeTruthy();
        }
      }
    });

    it("structural check should use test/red/ directory path for TypeScript", () => {
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

      // New directory-based approach: the structural check path restricts to test/red/
      // so only files in that directory are validated (not all test files)
      expect(markerCheck!.check_config.path).toBe("test/red/**/*.test.ts");
      expect(markerCheck!.check_config.pattern).toBe(
        "(?:describe|it|test)\\s*\\(",
      );
      expect(markerCheck!.check_config.min_matches).toBe(1);
    });
  });

  describe("Cross-language pattern consistency", () => {
    const languages: SupportedLanguage[] = [
      "dart",
      "typescript",
      "python",
      "rust",
    ];

    it("all languages should produce exactly 3 checks", () => {
      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          taskId: 1,
          taskTitle: "Test",
          testCommand: "npm test",
        });
        expect(checks.length, `${lang} should have 3 checks`).toBe(3);
      }
    });

    it("all languages should have 1 test_verification + 2 structural checks", () => {
      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          taskId: 1,
          taskTitle: "Test",
          testCommand: "npm test",
        });

        const testVer = checks.filter(
          (c) => c.check_type === "test_verification",
        );
        const structural = checks.filter((c) => c.check_type === "structural");

        expect(testVer.length, `${lang} test_verification`).toBe(1);
        expect(structural.length, `${lang} structural`).toBe(2);
      }
    });

    it("test_verification checks should have correct tier and expect config", () => {
      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          taskId: 1,
          taskTitle: "Test",
          testCommand: "npm test",
        });

        const testVer = checks.filter(
          (c) => c.check_type === "test_verification",
        );

        // test_verification check: red tier tests must fail
        expect(testVer[0].check_config.tier, `${lang} tier`).toBe("red");
        expect(testVer[0].check_config.expect, `${lang} expect`).toBe(
          "any_fail",
        );
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

  describe("test_verification check format consistency", () => {
    it("all languages should use declarative test_verification with red tier", () => {
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
          taskTitle: "Feature Test",
          testCommand: "npm test",
        });

        const testVerChecks = checks.filter(
          (c) => c.check_type === "test_verification",
        );
        expect(
          testVerChecks.length,
          `${lang} should have 1 test_verification check`,
        ).toBe(1);

        // All test_verification checks should use the "red" tier with "any_fail" expectation.
        // The runTestsCore() pipeline handles tier resolution via ScopeResolver — no shell commands needed.
        expect(testVerChecks[0].check_config.tier).toBe("red");
        expect(testVerChecks[0].check_config.expect).toBe("any_fail");
        expect(testVerChecks[0].check_config.success_message).toBeDefined();
        expect(testVerChecks[0].check_config.failure_message).toBeDefined();
      }
    });

    it("no language should produce behavioral checks", () => {
      const languages: SupportedLanguage[] = [
        "dart",
        "typescript",
        "python",
        "rust",
      ];

      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "cd packages/app; ",
          testFilePattern: "test/**/*",
          taskId: 1,
          taskTitle: "Feature Test",
          testCommand: "npm test",
        });

        const behavioral = checks.filter((c) => c.check_type === "behavioral");
        expect(
          behavioral.length,
          `${lang} should not produce behavioral checks`,
        ).toBe(0);
      }
    });

    it("test_verification checks should not contain shell commands", () => {
      const languages: SupportedLanguage[] = [
        "dart",
        "typescript",
        "python",
        "rust",
      ];

      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "cd packages/app; ",
          testFilePattern: "test/**/*",
          taskId: 1,
          taskTitle: "Feature Test",
          testCommand: "flutter test",
        });

        const testVerChecks = checks.filter(
          (c) => c.check_type === "test_verification",
        );

        for (const check of testVerChecks) {
          // test_verification checks are declarative — no commands or exit codes
          expect(check.check_config.command).toBeUndefined();
          expect(check.check_config.expect_exit_code).toBeUndefined();
        }
      }
    });
  });
});
