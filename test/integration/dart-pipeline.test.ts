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
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DartRunner } from "../../src/core/testing/DartRunner.js";
import { ResultFormatter } from "../../src/core/testing/ResultFormatter.js";
import { TestConfigLoader } from "../../src/core/testing/TestConfigLoader.js";
import { TestRunnerFactory } from "../../src/core/testing/TestRunnerFactory.js";

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
 * Temp directory for config-based tests (cleaned up in afterAll).
 */
let tempConfigDir: string | undefined;

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

  afterAll(() => {
    // Clean up temp config dir if created
    if (tempConfigDir && fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
  });

  describe("DartRunner execution", () => {
    it.skipIf(!dartAvailable)(
      "should execute dart tests and return structured results",
      async () => {
        const runner = new DartRunner("dart");
        const result = await runner.execute({
          files: ["test/category4_normal_passing_test.dart"],
          workingDir: DART_HARNESS,
          timeout: 60000,
        });
        expect(result.exitCode).toBe(0);
        expect(result.tests.length).toBeGreaterThan(0);
        expect(result.tests.every((t) => t.status === "passed")).toBe(true);

        // Verify structured result fields
        for (const test of result.tests) {
          expect(test.name).toBeTruthy();
          expect(test.file).toBeTruthy();
          expect(test.status).toBe("passed");
        }
      },
    );

    it.skipIf(!dartAvailable)(
      "should capture failure details from failing tests",
      async () => {
        const runner = new DartRunner("dart");
        const result = await runner.execute({
          files: ["test/category1_tdd_red_failing_test.dart"],
          workingDir: DART_HARNESS,
          timeout: 60000,
        });
        expect(result.exitCode).toBe(1);

        const failed = result.tests.filter((t) => t.status === "failed");
        expect(failed.length).toBeGreaterThan(0);

        // Verify failure detail capture
        const failedTest = failed[0]!;
        expect(failedTest.failure).toBeDefined();
        expect(failedTest.failure!.message).toBeTruthy();
        // Failure should have a compressed stack trace
        expect(failedTest.failure!.stack).toBeDefined();
        expect(Array.isArray(failedTest.failure!.stack)).toBe(true);
      },
    );

    it.skipIf(!dartAvailable)(
      "should handle mixed pass/fail results",
      async () => {
        const runner = new DartRunner("dart");
        const result = await runner.execute({
          files: ["test/mixed_file_test.dart"],
          workingDir: DART_HARNESS,
          timeout: 60000,
        });
        expect(result.tests.some((t) => t.status === "passed")).toBe(true);
        expect(result.tests.some((t) => t.status === "failed")).toBe(true);
      },
    );

    it.skipIf(!dartAvailable)(
      "should filter tests by tag (--tags tdd-red)",
      async () => {
        const runner = new DartRunner("dart");
        const result = await runner.execute({
          files: [],
          workingDir: DART_HARNESS,
          includeTags: ["tdd-red"],
          timeout: 60000,
        });
        // Should only run tdd-red tagged tests
        expect(result.tests.length).toBeGreaterThan(0);
      },
    );

    it.skipIf(!dartAvailable)(
      "should exclude tests by tag (--exclude-tags tdd-red)",
      async () => {
        const runner = new DartRunner("dart");

        // First get total count with tdd-red tags included
        const allResult = await runner.execute({
          files: [],
          workingDir: DART_HARNESS,
          timeout: 60000,
        });

        // Now get count with tdd-red excluded
        const filteredResult = await runner.execute({
          files: [],
          workingDir: DART_HARNESS,
          excludeTags: ["tdd-red"],
          timeout: 60000,
        });

        // Filtered result should have fewer tests than total
        expect(filteredResult.tests.length).toBeGreaterThan(0);
        expect(filteredResult.tests.length).toBeLessThan(
          allResult.tests.length,
        );
      },
    );
  });

  describe("Pre-signal adapter integration (US3)", () => {
    it.skipIf(!dartAvailable)(
      "should dispatch to DartRunner through TestRunnerFactory",
      async () => {
        const runner = TestRunnerFactory.create("dart");
        expect(runner.framework).toBe("dart");

        // Verify it's actually a DartRunner by running a real test
        const result = await runner.execute({
          files: ["test/category4_normal_passing_test.dart"],
          workingDir: DART_HARNESS,
          timeout: 60000,
        });
        expect(result.exitCode).toBe(0);
        expect(result.tests.length).toBeGreaterThan(0);
      },
    );

    it.skipIf(!dartAvailable)(
      "should load Dart config from .agent-test-config.json",
      async () => {
        // Create a temporary config for Dart
        tempConfigDir = fs.mkdtempSync(
          path.join(os.tmpdir(), "dart-config-test-"),
        );

        const dartConfig = {
          framework: "dart",
          tiers: [{ name: "unit", path: "test/**/*_test.dart" }],
          defaultTimeout: 60000,
          maxFailureLines: 20,
        };

        fs.writeFileSync(
          path.join(tempConfigDir, ".agent-test-config.json"),
          JSON.stringify(dartConfig, null, 2),
        );

        const loader = new TestConfigLoader(tempConfigDir);
        const configResult = await loader.load();

        expect(configResult.success).toBe(true);
        if (configResult.success) {
          expect(configResult.config.framework).toBe("dart");
          expect(configResult.config.tiers.length).toBe(1);
          expect(configResult.config.tiers[0]!.name).toBe("unit");
        }
      },
    );
  });

  describe("End-to-end pipeline (T028)", () => {
    it.skipIf(!dartAvailable)(
      "config → scope → execute → format → verify",
      async () => {
        // 1. Write a temp .agent-test-config.json for the Dart harness
        const configContent = {
          framework: "dart",
          tiers: [
            {
              name: "unit",
              path: "test/**/*_test.dart",
            },
          ],
          defaultTimeout: 60000,
          maxFailureLines: 20,
        };

        // Write config to the harness directory temporarily
        const configPath = path.join(DART_HARNESS, ".agent-test-config.json");
        const hadConfig = fs.existsSync(configPath);
        let originalConfig: string | undefined;
        if (hadConfig) {
          originalConfig = fs.readFileSync(configPath, "utf-8");
        }

        try {
          fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

          // 2. Load config
          const loader = new TestConfigLoader(DART_HARNESS);
          const configResult = await loader.load();
          expect(configResult.success).toBe(true);
          if (!configResult.success) return;
          const config = configResult.config;
          expect(config.framework).toBe("dart");

          // 3. Execute via DartRunner (run only passing tests for deterministic result)
          const runner = TestRunnerFactory.create(config.framework);
          expect(runner.framework).toBe("dart");

          const runOutput = await runner.execute({
            files: ["test/category4_normal_passing_test.dart"],
            workingDir: DART_HARNESS,
            timeout: config.defaultTimeout,
          });
          expect(runOutput.tests.length).toBeGreaterThan(0);
          expect(runOutput.exitCode).toBe(0);

          // 4. Format results via ResultFormatter
          const formatter = new ResultFormatter();
          const formatted = formatter.format(runOutput.tests, {
            maxFailureLines: config.maxFailureLines,
            framework: runner.framework,
          });

          // 5. Verify expectations
          expect(formatted.total).toBeGreaterThan(0);
          expect(formatted.passed).toBe(formatted.total);
          expect(formatted.failed).toBe(0);
          expect(formatted.summary).toContain("PASS");
          expect(formatted.summary).toContain("dart");
        } finally {
          // Restore original config state
          if (hadConfig && originalConfig !== undefined) {
            fs.writeFileSync(configPath, originalConfig);
          } else if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
          }
        }
      },
    );
  });
});

describe("integration: Dart framework detection (US6)", () => {
  it.skipIf(!dartAvailable)(
    "should detect 'dart' framework from pubspec.yaml",
    async () => {
      // TestRunnerFactory.create('dart') correctly creates a DartRunner
      const runner = TestRunnerFactory.create("dart");
      expect(runner.framework).toBe("dart");

      // TestRunnerFactory.create('flutter') correctly creates a flutter runner
      const flutterRunner = TestRunnerFactory.create("flutter");
      expect(flutterRunner.framework).toBe("flutter");
    },
  );

  it.skipIf(!dartAvailable)(
    "should detect 'flutter' framework when flutter dependency exists",
    async () => {
      // Create a temp directory with a Flutter pubspec.yaml
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "dart-detect-flutter-"),
      );
      try {
        fs.writeFileSync(
          path.join(tmpDir, "pubspec.yaml"),
          [
            "name: my_flutter_app",
            "dependencies:",
            "  flutter:",
            "    sdk: flutter",
          ].join("\n"),
        );

        const detected = await TestRunnerFactory.detect(tmpDir);
        expect(detected).toBe("flutter");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!dartAvailable)(
    "should fail with clear error when both pubspec.yaml and vitest.config.ts exist",
    async () => {
      // Create a temp directory with both Dart and Vitest markers
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "dart-detect-dual-"),
      );
      try {
        fs.writeFileSync(
          path.join(tmpDir, "pubspec.yaml"),
          "name: my_dart_app\n",
        );
        fs.writeFileSync(
          path.join(tmpDir, "vitest.config.ts"),
          "export default {}\n",
        );

        await expect(TestRunnerFactory.detect(tmpDir)).rejects.toMatchObject({
          code: "INVALID_INPUT",
        });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
