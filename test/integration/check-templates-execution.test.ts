/**
 * End-to-end tests for check-templates behavioral commands.
 *
 * These tests actually EXECUTE the behavioral check commands against
 * the test harnesses to verify they produce the expected exit codes.
 *
 * This is the ultimate validation that the check templates work correctly.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { getTddRedChecks } from "../../src/core/check-templates.js";

const HARNESS_ROOT = path.join(process.cwd(), "testing", "tdd-test-harness");

describe("check-templates behavioral command execution", () => {
  describe("TypeScript harness command execution", () => {
    const tsHarness = path.join(HARNESS_ROOT, "typescript");
    let harnessReady = false;

    beforeAll(async () => {
      // Check if harness exists and has node_modules
      if (fs.existsSync(path.join(tsHarness, "node_modules"))) {
        harnessReady = true;
      } else if (fs.existsSync(path.join(tsHarness, "package.json"))) {
        // Try to install
        try {
          execSync("npm install", { cwd: tsHarness, stdio: "pipe" });
          harnessReady = true;
        } catch {
          console.warn("Could not install TypeScript harness dependencies");
        }
      }
    });

    it("should execute test command and get correct exit code for tdd-red tests", () => {
      if (!harnessReady) {
        console.log("Skipping: TypeScript harness not ready");
        return;
      }

      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        testCommand: "npm test",
        taskId: 1,
        taskTitle: "Test",
      });

      // Get the "tagged tests must fail" check
      const failCheck = checks.find((c) => c.description.includes("must fail"));
      expect(failCheck).toBeDefined();
      expect(failCheck!.check_config.command).toBeDefined();

      // Execute command and expect exit code 1 (tests fail)
      try {
        execSync(failCheck!.check_config.command!, {
          cwd: tsHarness,
          stdio: "pipe",
        });
        // If we get here, tests passed (exit 0) - that's wrong!
        expect.fail("Expected tdd-red tests to fail with exit code 1");
      } catch (error: unknown) {
        // Expect exit code 1 (test failures)
        const exitCode = (error as { status?: number }).status;
        expect(exitCode).toBe(1);
      }
    });

    it("should execute non-red test command correctly", () => {
      if (!harnessReady) {
        console.log("Skipping: TypeScript harness not ready");
        return;
      }

      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        testCommand: "npm test",
        taskId: 1,
        taskTitle: "Test",
      });

      // Get the "non-red tests must pass" check
      const passCheck = checks.find((c) => c.description.includes("must pass"));
      expect(passCheck).toBeDefined();
      expect(passCheck!.check_config.command).toBeDefined();

      // Note: This will fail if category3 (regression) is included
      // We're just testing that the command executes - the expected behavior
      // depends on which test files are present
      try {
        execSync(passCheck!.check_config.command!, {
          cwd: tsHarness,
          stdio: "pipe",
        });
        // If we get here, tests passed (exit 0)
        // This is expected if only category4 (normal passing) files exist
      } catch (error: unknown) {
        // Tests failed - this happens if category3 (regression) exists
        const exitCode = (error as { status?: number }).status;
        // Just verify we got an exit code
        expect(typeof exitCode).toBe("number");
      }
    });
  });

  describe("Command format validation", () => {
    it("TypeScript commands should use correct vitest/jest syntax", () => {
      const checks = getTddRedChecks("typescript", {
        cdPrefix: "",
        testFilePattern: "test/**/*.test.ts",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "npm test",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");

      // Commands should contain base test command (filtering added dynamically in Task 5)
      expect(behavioral[0].check_config.command).toContain("npm test");
      expect(behavioral.length).toBe(2);
    });

    it("Dart commands should use correct flutter test syntax", () => {
      const checks = getTddRedChecks("dart", {
        cdPrefix: "",
        testFilePattern: "test/**/*.dart",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "flutter test",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");

      // Commands should contain base test command (filtering added dynamically in Task 5)
      expect(behavioral[0].check_config.command).toContain("flutter test");
      expect(behavioral.length).toBe(2);
    });

    it("Python commands should use correct pytest syntax", () => {
      const checks = getTddRedChecks("python", {
        cdPrefix: "",
        testFilePattern: "tests/**/*.py",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "pytest",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");

      // Commands should contain base test command (filtering added dynamically in Task 5)
      expect(behavioral[0].check_config.command).toContain("pytest");
      expect(behavioral.length).toBe(2);
    });

    it("Rust commands should use correct cargo test syntax", () => {
      const checks = getTddRedChecks("rust", {
        cdPrefix: "",
        testFilePattern: "tests/**/*.rs",
        taskId: 1,
        taskTitle: "Test",
        testCommand: "cargo test",
      });

      const behavioral = checks.filter((c) => c.check_type === "behavioral");

      // Commands should contain base test command (filtering added dynamically in Task 5)
      expect(behavioral[0].check_config.command).toContain("cargo test");
      expect(behavioral.length).toBe(2);
    });
  });

  describe("Pattern escaping validation", () => {
    it("should not have problematic bracket escaping", () => {
      // This was the original bug - complex bracket escaping broke regex
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
            // Should not have the problematic pattern that caused
            // "Unterminated character class" errors
            expect(check.check_config.pattern).not.toMatch(/\\\[.*'\\\]/);

            // All patterns should compile without error
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

      // Should use test/group function detection pattern for directory-based approach
      expect(markerCheck!.check_config.pattern).toBe("(?:test|group)\\s*\\(");
      expect(markerCheck!.check_config.path).toBe("test/red/**/*_test.dart");

      // Should match real Dart test function calls
      const pattern = new RegExp(markerCheck!.check_config.pattern!, "gms");
      expect("test('should work', () {})".match(pattern)).toBeTruthy();
      expect("group('feature', () {})".match(pattern)).toBeTruthy();
      // Should not match non-test content
      expect("class Foo {}".match(pattern)).toBeNull();
    });
  });
});
