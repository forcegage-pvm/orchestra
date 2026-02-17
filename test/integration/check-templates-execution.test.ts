/**
 * End-to-end tests for check-templates verification format.
 *
 * These tests validate that check templates produce correct test_verification
 * configs (declarative format executed via runTestsCore) and structural patterns
 * that work against real test harnesses.
 *
 * TDD red-phase checks no longer use behavioral shell commands. Instead they
 * use test_verification format with { tier: "red", expect: "any_fail" } which
 * is resolved by the ScopeResolver and executed by runTestsCore().
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { getTddRedChecks } from "../../src/core/check-templates.js";

const HARNESS_ROOT = path.join(process.cwd(), "testing", "tdd-test-harness");

describe("check-templates test_verification format validation", () => {
  describe("TypeScript harness structural validation", () => {
    const tsHarness = path.join(HARNESS_ROOT, "typescript");
    const tsTestDir = path.join(tsHarness, "test");

    it("should produce test_verification check for red tier (not behavioral command)", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        testCommand: "npm test",
        taskId: 1,
        taskTitle: "Test",
      });

      // Get the red-phase test_verification check
      const redCheck = checks.find(
        (c) =>
          c.check_type === "test_verification" &&
          c.description.includes("must fail"),
      );
      expect(redCheck).toBeDefined();
      expect(redCheck!.check_config.tier).toBe("red");
      expect(redCheck!.check_config.expect).toBe("any_fail");

      // Should NOT have command or exit_code (those are behavioral properties)
      expect(redCheck!.check_config.command).toBeUndefined();
      expect(redCheck!.check_config.expect_exit_code).toBeUndefined();
    });

    it("should produce structural checks that match real test files", () => {
      if (!fs.existsSync(tsTestDir)) {
        console.log("Skipping: TypeScript harness not found");
        return;
      }

      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        testCommand: "npm test",
        taskId: 3,
        taskTitle: "Test",
      });

      // Task-ID annotation should match files with @orchestra-task: 3
      const taskIdCheck = checks.find((c) =>
        c.description.includes("Task-ID annotation"),
      );
      expect(taskIdCheck).toBeDefined();
      expect(taskIdCheck!.check_type).toBe("structural");

      const pattern = new RegExp(taskIdCheck!.check_config.pattern!, "gms");
      const category1Path = path.join(
        tsTestDir,
        "category1_tdd_red_failing.test.ts",
      );
      if (fs.existsSync(category1Path)) {
        const content = fs.readFileSync(category1Path, "utf-8");
        expect(content.match(pattern)).toBeTruthy();
      }
    });
  });

  describe("test_verification format validation per language", () => {
    it("TypeScript checks should use test_verification with red tier", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "npm test",
      });

      const testVer = checks.filter(
        (c) => c.check_type === "test_verification",
      );
      const behavioral = checks.filter((c) => c.check_type === "behavioral");

      expect(testVer.length).toBe(1);
      expect(behavioral.length).toBe(0);
      expect(testVer[0].check_config.tier).toBe("red");
      expect(testVer[0].check_config.expect).toBe("any_fail");
    });

    it("Dart checks should use test_verification with red tier", () => {
      const checks = getTddRedChecks("dart", {
        cdPrefix: "",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "flutter test",
      });

      const testVer = checks.filter(
        (c) => c.check_type === "test_verification",
      );
      const behavioral = checks.filter((c) => c.check_type === "behavioral");

      expect(testVer.length).toBe(1);
      expect(behavioral.length).toBe(0);
      expect(testVer[0].check_config.tier).toBe("red");
      expect(testVer[0].check_config.expect).toBe("any_fail");
    });

    it("Python checks should use test_verification with red tier", () => {
      const checks = getTddRedChecks("python", {
        cdPrefix: "",
        testFilePattern: "tests/**/*.py",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "pytest",
      });

      const testVer = checks.filter(
        (c) => c.check_type === "test_verification",
      );
      const behavioral = checks.filter((c) => c.check_type === "behavioral");

      expect(testVer.length).toBe(1);
      expect(behavioral.length).toBe(0);
      expect(testVer[0].check_config.tier).toBe("red");
    });

    it("Rust checks should use test_verification with red tier", () => {
      const checks = getTddRedChecks("rust", {
        cdPrefix: "",
        testFilePattern: "tests/**/*.rs",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "cargo test",
      });

      const testVer = checks.filter(
        (c) => c.check_type === "test_verification",
      );
      const behavioral = checks.filter((c) => c.check_type === "behavioral");

      expect(testVer.length).toBe(1);
      expect(behavioral.length).toBe(0);
      expect(testVer[0].check_config.tier).toBe("red");
    });
  });

  describe("Pattern escaping validation", () => {
    it("should not have problematic bracket escaping", () => {
      const languages = ["dart", "typescript", "python", "rust"] as const;

      for (const lang of languages) {
        const checks = getTddRedChecks(lang, {
          cdPrefix: "",
          testFilePattern: "test/**/*",
          testCommand: "npm test",
          taskId: 42,
          taskTitle: "Test",
        });

        for (const check of checks) {
          if (check.check_config.pattern) {
            expect(check.check_config.pattern).not.toMatch(/\\\[.*'\\\]/);
            expect(() => {
              new RegExp(check.check_config.pattern!, "gms");
            }).not.toThrow();
          }
        }
      }
    });

    it("Dart pattern should validate test function presence in red directory", () => {
      const checks = getTddRedChecks("dart", {
        cdPrefix: "",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Test",
      });

      const markerCheck = checks.find((c) =>
        c.description.includes("Red-phase test files present"),
      );

      expect(markerCheck!.check_config.pattern).toBe("(?:test|group)\\s*\\(");
      expect(markerCheck!.check_config.path).toBe("test/red/**/*_test.dart");

      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");
      expect("test('should work', () {})".match(pattern)).toBeTruthy();
      expect("group('feature', () {})".match(pattern)).toBeTruthy();
      expect("class Foo {}".match(pattern)).toBeNull();
    });
  });
});
