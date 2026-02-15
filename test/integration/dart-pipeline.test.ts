/**
 * Dart Pipeline Integration Tests
 *
 * End-to-end tests that execute real Dart tests against the test harness.
 * These tests require Dart SDK to be installed and will be skipped if unavailable.
 *
 * @see specs/015-dart-flutter-test-runner/tasks.md - T027, T028
 * @see specs/_base/013-test-tools/test-runner-tools-design-phase2-dart.md
 */

import { execSync } from "node:child_process";
import * as path from "node:path";

import { beforeAll, describe, it } from "vitest";

// TODO: Import once modules are implemented
// import { DartRunner } from "../../src/core/testing/DartRunner.js";
// import { TestRunnerFactory } from "../../src/core/testing/TestRunnerFactory.js";
// import { TestConfigLoader } from "../../src/core/testing/TestConfigLoader.js";
// import { ResultFormatter } from "../../src/core/testing/ResultFormatter.js";

/**
 * Path to the Dart test harness containing real Dart tests.
 * Tests MUST run from this directory (contains pubspec.yaml).
 */
const DART_HARNESS = path.resolve(
  process.cwd(),
  "testing/tdd-test-harness/dart",
);

/**
 * Flag indicating whether Dart SDK is available.
 * Tests are conditionally skipped when Dart is not installed.
 */
let dartAvailable = false;

/**
 * Check if Dart SDK is installed and dependencies are resolved.
 */
async function setupDartEnvironment(): Promise<boolean> {
  try {
    // Check Dart is available
    execSync("dart --version", { stdio: "pipe" });

    // Ensure dependencies are resolved (MUST run from pubspec.yaml directory)
    execSync("dart pub get", { cwd: DART_HARNESS, stdio: "pipe" });

    return true;
  } catch {
    console.warn(
      "Dart SDK not available - integration tests will be skipped. " +
        "Install Dart SDK ^3.0.0 to enable these tests.",
    );
    return false;
  }
}

describe("integration: Dart pipeline", () => {
  beforeAll(async () => {
    dartAvailable = await setupDartEnvironment();
  });

  describe("DartRunner execution", () => {
    it.skipIf(!dartAvailable)(
      "should execute dart tests and return structured results",
      async () => {
        // TODO: Implement once DartRunner exists
        // const runner = new DartRunner("dart");
        // const result = await runner.execute({
        //   files: ["test/category4_normal_passing_test.dart"],
        //   workingDir: DART_HARNESS,
        //   timeout: 60000,
        // });
        // expect(result.exitCode).toBe(0);
        // expect(result.tests.length).toBeGreaterThan(0);
        // expect(result.tests.every((t) => t.status === "passed")).toBe(true);
      },
    );

    it.skipIf(!dartAvailable)(
      "should capture failure details from failing tests",
      async () => {
        // TODO: Implement once DartRunner exists
        // const runner = new DartRunner("dart");
        // const result = await runner.execute({
        //   files: ["test/category1_tdd_red_failing_test.dart"],
        //   workingDir: DART_HARNESS,
        //   timeout: 60000,
        // });
        // expect(result.exitCode).toBe(1);
        // expect(result.tests.some((t) => t.status === "failed")).toBe(true);
        // const failed = result.tests.find((t) => t.status === "failed");
        // expect(failed?.failure).toBeDefined();
        // expect(failed?.failure?.message).toBeTruthy();
      },
    );

    it.skipIf(!dartAvailable)(
      "should handle mixed pass/fail results",
      async () => {
        // TODO: Implement once DartRunner exists
        // const runner = new DartRunner("dart");
        // const result = await runner.execute({
        //   files: ["test/mixed_file_test.dart"],
        //   workingDir: DART_HARNESS,
        //   timeout: 60000,
        // });
        // expect(result.tests.some((t) => t.status === "passed")).toBe(true);
        // expect(result.tests.some((t) => t.status === "failed")).toBe(true);
      },
    );

    it.skipIf(!dartAvailable)(
      "should filter tests by tag (--tags tdd-red)",
      async () => {
        // TODO: Implement once DartRunner exists
        // const runner = new DartRunner("dart");
        // const result = await runner.execute({
        //   files: [],  // Run all tests
        //   workingDir: DART_HARNESS,
        //   includeTags: ["tdd-red"],
        //   timeout: 60000,
        // });
        // // Should only run tdd-red tagged tests
        // expect(result.tests.length).toBeGreaterThan(0);
      },
    );

    it.skipIf(!dartAvailable)(
      "should exclude tests by tag (--exclude-tags tdd-red)",
      async () => {
        // TODO: Implement once DartRunner exists
        // const runner = new DartRunner("dart");
        // const result = await runner.execute({
        //   files: [],  // Run all tests
        //   workingDir: DART_HARNESS,
        //   excludeTags: ["tdd-red"],
        //   timeout: 60000,
        // });
        // // Should exclude tdd-red tagged tests
        // expect(result.tests.length).toBeGreaterThan(0);
      },
    );
  });

  describe("Pre-signal adapter integration (US3)", () => {
    it.skipIf(!dartAvailable)(
      "should dispatch to DartRunner through TestRunnerFactory",
      async () => {
        // TODO: Implement once TestRunnerFactory supports Dart
        // const factory = TestRunnerFactory.create("dart");
        // expect(factory.framework).toBe("dart");
      },
    );

    it.skipIf(!dartAvailable)(
      "should load Dart config from .agent-test-config.json",
      async () => {
        // TODO: Test config loading with framework: "dart"
      },
    );
  });

  describe("End-to-end pipeline (T028)", () => {
    it.skipIf(!dartAvailable)(
      "config → scope → execute → format → verify",
      async () => {
        // TODO: Full pipeline test
        // 1. Load config with framework: "dart"
        // 2. Resolve scope to test files
        // 3. Execute via DartRunner
        // 4. Format results via ResultFormatter
        // 5. Verify expectations (all_pass, any_fail)
      },
    );
  });
});

describe("integration: Dart framework detection (US6)", () => {
  it.skipIf(!dartAvailable)(
    "should detect 'dart' framework from pubspec.yaml",
    async () => {
      // TODO: Implement once TestRunnerFactory.detect() exists
      // const detected = await TestRunnerFactory.detect(DART_HARNESS);
      // expect(detected).toBe("dart");
    },
  );

  it.todo("should detect 'flutter' framework when flutter dependency exists");

  it.todo(
    "should fail with clear error when both pubspec.yaml and vitest.config.ts exist",
  );
});
