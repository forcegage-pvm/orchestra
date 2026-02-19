/**
 * DartRunner Unit Tests
 *
 * Tests for the DartRunner class using NDJSON fixtures from
 * testing/tdd-test-harness/dart/fixtures/.
 *
 * Per FR-019 / Lesson 7: Mock runners MUST implement TestRunner explicitly
 * (class MockRunner implements TestRunner) so TypeScript catches interface drift.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  compressStackTrace,
  DartRunner,
  eventsToOutcomes,
  extractExpectedActual,
  extractJsonEvents,
  fileUrlToPath,
} from "../../../../src/core/testing/DartRunner.js";
import type {
  NormalizedTestOutcome,
  TestFramework,
  TestRunner,
  TestRunOptions,
  TestRunOutput,
} from "../../../../src/core/testing/TestRunner.js";
import { TestRunnerFactory } from "../../../../src/core/testing/TestRunnerFactory.js";

// ============================================================================
// FR-019: Mock runners MUST implement TestRunner explicitly
// ============================================================================

/**
 * MockDartRunner implementing TestRunner interface explicitly.
 * Per FR-019 / Lesson 7, this ensures TypeScript catches interface drift.
 */
class MockDartRunner implements TestRunner {
  readonly framework: TestFramework = "dart";

  private readonly _results: NormalizedTestOutcome[];

  constructor(results: NormalizedTestOutcome[] = []) {
    this._results = results;
  }

  async execute(_options: TestRunOptions): Promise<TestRunOutput> {
    return {
      exitCode: this._results.some((r) => r.status === "failed") ? 1 : 0,
      duration: 100,
      tests: this._results,
    };
  }

  buildCommand(options: TestRunOptions): string[] {
    return ["dart", "test", ...options.files];
  }
}

// ============================================================================
// Fixture Helpers
// ============================================================================

const FIXTURES_DIR = path.join(
  process.cwd(),
  "testing/tdd-test-harness/dart/fixtures",
);

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
}

// ============================================================================
// Tests
// ============================================================================

describe("DartRunner", () => {
  describe("interface compliance", () => {
    it("should have framework property set to 'dart' for Dart runner", () => {
      const runner = new DartRunner("dart");
      expect(runner.framework).toBe("dart");
    });

    it("should have framework property set to 'flutter' for Flutter runner", () => {
      const runner = new DartRunner("flutter");
      expect(runner.framework).toBe("flutter");
    });

    it("should be assignable to TestRunner interface", () => {
      const runner: TestRunner = new DartRunner("dart");
      expect(runner.framework).toBe("dart");
      expect(typeof runner.execute).toBe("function");
      expect(typeof runner.buildCommand).toBe("function");
    });
  });

  describe("buildCommand()", () => {
    it("should generate 'dart test --reporter=json' for pure Dart", () => {
      const runner = new DartRunner("dart");
      const options: TestRunOptions = {
        files: ["test/foo_test.dart"],
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      expect(command[0]).toBe("dart");
      expect(command[1]).toBe("test");
      expect(command).toContain("--reporter=json");
      expect(command).not.toContain("--no-pub");
      expect(command).toContain("test/foo_test.dart");
    });

    it("should generate 'flutter test --reporter=json --no-pub' for Flutter", () => {
      const runner = new DartRunner("flutter");
      const options: TestRunOptions = {
        files: ["test/widget_test.dart"],
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      expect(command[0]).toBe("flutter");
      expect(command[1]).toBe("test");
      expect(command).toContain("--reporter=json");
      expect(command).toContain("--no-pub");
      expect(command).toContain("test/widget_test.dart");
    });

    it("should include --name flag when pattern is provided", () => {
      const runner = new DartRunner("dart");
      const options: TestRunOptions = {
        files: [],
        workingDir: "/workspace",
        pattern: "should handle error",
      };
      const command = runner.buildCommand(options);
      const nameIndex = command.indexOf("--name");
      expect(nameIndex).toBeGreaterThan(-1);
      expect(command[nameIndex + 1]).toBe("should handle error");
    });

    it("should include --tags for includeTags", () => {
      const runner = new DartRunner("dart");
      const options: TestRunOptions = {
        files: [],
        workingDir: "/workspace",
        includeTags: ["unit", "fast"],
      };
      const command = runner.buildCommand(options);
      const tagsIndex = command.indexOf("--tags");
      expect(tagsIndex).toBeGreaterThan(-1);
      expect(command[tagsIndex + 1]).toBe("unit,fast");
    });

    it("should include --exclude-tags for excludeTags", () => {
      const runner = new DartRunner("dart");
      const options: TestRunOptions = {
        files: [],
        workingDir: "/workspace",
        excludeTags: ["tdd-red", "slow"],
      };
      const command = runner.buildCommand(options);
      const excludeIndex = command.indexOf("--exclude-tags");
      expect(excludeIndex).toBeGreaterThan(-1);
      expect(command[excludeIndex + 1]).toBe("tdd-red,slow");
    });

    it("should include --timeout when timeout is provided", () => {
      const runner = new DartRunner("dart");
      const options: TestRunOptions = {
        files: [],
        workingDir: "/workspace",
        timeout: 60000,
      };
      const command = runner.buildCommand(options);
      const timeoutIndex = command.indexOf("--timeout");
      expect(timeoutIndex).toBeGreaterThan(-1);
      expect(command[timeoutIndex + 1]).toBe("60000ms");
    });

    it("should include multiple test files at end of command", () => {
      const runner = new DartRunner("dart");
      const files = ["test/a_test.dart", "test/b_test.dart"];
      const options: TestRunOptions = {
        files,
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      expect(command.at(-2)).toBe(files[0]);
      expect(command.at(-1)).toBe(files[1]);
    });

    it("should generate command without file paths when files is empty", () => {
      const runner = new DartRunner("dart");
      const options: TestRunOptions = {
        files: [],
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      expect(command).toEqual(["dart", "test", "--reporter=json"]);
    });

    it("should include --no-pub for pure Dart when dartNoPub is true", () => {
      const runner = new DartRunner("dart");
      const options: TestRunOptions = {
        files: ["test/foo_test.dart"],
        workingDir: "/workspace",
        dartNoPub: true,
      };
      const command = runner.buildCommand(options);
      expect(command[0]).toBe("dart");
      expect(command).toContain("--no-pub");
    });

    it("should NOT include --no-pub for pure Dart when dartNoPub is not set", () => {
      const runner = new DartRunner("dart");
      const options: TestRunOptions = {
        files: ["test/foo_test.dart"],
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      expect(command[0]).toBe("dart");
      expect(command).not.toContain("--no-pub");
    });
  });

  describe("extractJsonEvents()", () => {
    it("should parse passing tests NDJSON fixture", () => {
      const raw = loadFixture("passing-tests.ndjson");
      const events = extractJsonEvents(raw);
      expect(events.length).toBeGreaterThan(0);

      // Should have start, suite, testStart, testDone, done events
      const types = events.map((e) => e.type);
      expect(types).toContain("start");
      expect(types).toContain("suite");
      expect(types).toContain("testStart");
      expect(types).toContain("testDone");
      expect(types).toContain("done");
    });

    it("should filter Flutter engine logs from flutter-with-noise fixture", () => {
      const raw = loadFixture("flutter-with-noise.ndjson");
      const events = extractJsonEvents(raw);

      // All events should be valid parsed objects with a type field
      for (const event of events) {
        expect(event).toHaveProperty("type");
        expect(typeof event.type).toBe("string");
      }

      // Should have extracted real events, not engine log lines
      const types = events.map((e) => e.type);
      expect(types).toContain("start");
      expect(types).toContain("suite");
      expect(types).toContain("testDone");
      expect(types).toContain("done");

      // Engine log text should NOT appear as events
      const eventStrings = JSON.stringify(events);
      expect(eventStrings).not.toContain("Flutter 3.19.0");
      expect(eventStrings).not.toContain('Running "flutter test"');
    });

    it("should handle empty suite fixture", () => {
      const raw = loadFixture("empty-suite.ndjson");
      const events = extractJsonEvents(raw);
      expect(events.length).toBeGreaterThan(0);

      const types = events.map((e) => e.type);
      expect(types).toContain("start");
      expect(types).toContain("done");
    });

    it("should handle concatenated JSON objects on single line", () => {
      // The passing-tests fixture has concatenated JSON on a single line
      const raw = loadFixture("passing-tests.ndjson");
      const events = extractJsonEvents(raw);

      // Should parse all events despite being on one line
      const testStarts = events.filter((e) => e.type === "testStart");
      expect(testStarts.length).toBeGreaterThan(0);
    });
  });

  describe("eventsToOutcomes()", () => {
    it("should produce 5 passed outcomes from passing-tests fixture", () => {
      const raw = loadFixture("passing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      expect(outcomes).toHaveLength(5);
      for (const outcome of outcomes) {
        expect(outcome.status).toBe("passed");
      }
    });

    it("should produce 2 failed outcomes from failing-tests fixture", () => {
      const raw = loadFixture("failing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      expect(outcomes).toHaveLength(2);
      for (const outcome of outcomes) {
        expect(outcome.status).toBe("failed");
        expect(outcome.failure).toBeDefined();
      }
    });

    it("should produce 3 passed and 2 failed from mixed-results fixture", () => {
      const raw = loadFixture("mixed-results.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      expect(outcomes).toHaveLength(5);
      const passed = outcomes.filter((o) => o.status === "passed");
      const failed = outcomes.filter((o) => o.status === "failed");
      expect(passed).toHaveLength(3);
      expect(failed).toHaveLength(2);
    });

    it("should exclude hidden/loading tests", () => {
      const raw = loadFixture("passing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      // No outcome should be a "loading ..." test
      for (const outcome of outcomes) {
        expect(outcome.name).not.toMatch(/^loading /);
      }
    });

    it("should set test name from testStart event", () => {
      const raw = loadFixture("passing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      expect(outcomes[0]?.name).toBe(
        "String utilities should capitalize first letter",
      );
    });

    it("should set file path from test URL", () => {
      const raw = loadFixture("passing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      // All tests in this fixture should have the same file
      for (const outcome of outcomes) {
        expect(outcome.file).toContain("category4_normal_passing_test.dart");
      }
    });

    it("should set line number from testStart event", () => {
      const raw = loadFixture("passing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      // First test should have line 16
      expect(outcomes[0]?.line).toBe(16);
    });

    it("should return empty array for empty suite", () => {
      const raw = loadFixture("empty-suite.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      expect(outcomes).toHaveLength(0);
    });

    it("should handle partial timeout output — returns completed tests only", () => {
      const raw = loadFixture("partial-timeout.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      // Two tests completed (fast test 1, fast test 2), one started but never finished
      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]?.name).toBe("fast test 1");
      expect(outcomes[0]?.status).toBe("passed");
      expect(outcomes[1]?.name).toBe("fast test 2");
      expect(outcomes[1]?.status).toBe("passed");
    });

    it("should parse Flutter tests with engine noise filtered out", () => {
      const raw = loadFixture("flutter-with-noise.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      // Should have 2 real test outcomes (Counter widget increments, Counter widget decrements)
      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]?.name).toBe("Counter widget increments");
      expect(outcomes[1]?.name).toBe("Counter widget decrements");
      for (const outcome of outcomes) {
        expect(outcome.status).toBe("passed");
      }
    });

    it("should handle all-tests fixture with multiple suites", () => {
      const raw = loadFixture("all-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      // Should have tests from all categories (excluding hidden/loading)
      expect(outcomes.length).toBeGreaterThan(0);

      const passed = outcomes.filter((o) => o.status === "passed");
      const failed = outcomes.filter((o) => o.status === "failed");
      expect(passed.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);
    });

    it("should prefer suite path over shared URL for file attribution", () => {
      const events = [
        {
          type: "suite",
          time: 0,
          suite: { id: 1, platform: "vm", path: "test/red/unit/a_test.dart" },
        },
        {
          type: "suite",
          time: 0,
          suite: { id: 2, platform: "vm", path: "test/red/unit/b_test.dart" },
        },
        {
          type: "testStart",
          time: 1,
          test: {
            id: 11,
            name: "a passes",
            suiteID: 1,
            groupIDs: [],
            metadata: { skip: false, skipReason: null },
            line: 10,
            column: 1,
            url: "file:///tmp/shared_entrypoint.dart",
          },
        },
        {
          type: "testStart",
          time: 1,
          test: {
            id: 12,
            name: "b passes",
            suiteID: 2,
            groupIDs: [],
            metadata: { skip: false, skipReason: null },
            line: 12,
            column: 1,
            url: "file:///tmp/shared_entrypoint.dart",
          },
        },
        {
          type: "testDone",
          time: 2,
          testID: 11,
          result: "success",
          skipped: false,
          hidden: false,
        },
        {
          type: "testDone",
          time: 2,
          testID: 12,
          result: "success",
          skipped: false,
          hidden: false,
        },
      ] as any;

      const outcomes = eventsToOutcomes(events);
      expect(outcomes).toHaveLength(2);

      const files = new Set(outcomes.map((o) => o.file));
      expect(files).toEqual(
        new Set(["test/red/unit/a_test.dart", "test/red/unit/b_test.dart"]),
      );
    });
  });

  describe("failure compression", () => {
    it("should extract expected/actual from Dart assertion errors", () => {
      const raw = loadFixture("failing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      // First failure: "Expected: false\n  Actual: <true>"
      const first = outcomes[0];
      expect(first?.failure).toBeDefined();
      expect(first?.failure?.expected).toBeDefined();
      expect(first?.failure?.actual).toBeDefined();
    });

    it("should compress stack traces filtering out test framework frames", () => {
      const raw = loadFixture("failing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      for (const outcome of outcomes) {
        if (outcome.failure) {
          // Stack should not contain package:matcher frames
          for (const frame of outcome.failure.stack) {
            expect(frame).not.toContain("package:matcher");
            expect(frame).not.toContain("package:test/");
            expect(frame).not.toContain("package:test_api/");
          }
        }
      }
    });

    it("should include error message in failure details", () => {
      const raw = loadFixture("failing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      for (const outcome of outcomes) {
        if (outcome.failure) {
          expect(outcome.failure.message.length).toBeGreaterThan(0);
        }
      }
    });

    it("should extract expected/actual from print events when error is generic", () => {
      // Flutter widget tests emit assertion details via print events,
      // with the error event containing only "Test failed. See exception logs above."
      const raw = loadFixture("flutter-print-failure.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      // Should have 2 outcomes: 1 failed, 1 passed
      expect(outcomes).toHaveLength(2);
      const failed = outcomes.find((o) => o.status === "failed");
      expect(failed).toBeDefined();
      expect(failed?.failure).toBeDefined();

      // expected/actual should be extracted from print messages, not the generic error
      expect(failed?.failure?.expected).toBe("not null");
      expect(failed?.failure?.actual).toBe("<null>");

      // message should NOT be the generic "Test failed. See exception logs above."
      expect(failed?.failure?.message).not.toContain(
        "See exception logs above",
      );
      // It should use the first meaningful line from print messages
      expect(failed?.failure?.message).toBe("Expected: not null");
    });

    it("should still work with direct error events (non-print pattern)", () => {
      // Existing pattern where assertion details are in the error event directly
      const raw = loadFixture("failing-tests.ndjson");
      const events = extractJsonEvents(raw);
      const outcomes = eventsToOutcomes(events);

      const first = outcomes[0];
      expect(first?.failure?.expected).toBe("false");
      expect(first?.failure?.actual).toBe("<true>");
      expect(first?.failure?.message).toBe("Expected: false");
    });
  });

  describe("fileUrlToPath()", () => {
    it("should convert file:// URL with Windows drive letter to path with uppercase drive", () => {
      const result = fileUrlToPath(
        "file:///x:/repositories/project/test/foo_test.dart",
      );
      expect(result).toBe("X:/repositories/project/test/foo_test.dart");
    });

    it("should normalize uppercase drive letter", () => {
      const result = fileUrlToPath(
        "file:///X:/repositories/project/test/foo_test.dart",
      );
      expect(result).toBe("X:/repositories/project/test/foo_test.dart");
    });

    it("should handle Unix file:// URLs", () => {
      const result = fileUrlToPath(
        "file:///home/user/project/test/foo_test.dart",
      );
      expect(result).toBe("/home/user/project/test/foo_test.dart");
    });

    it("should return non-file:// URLs unchanged", () => {
      const result = fileUrlToPath("test/foo_test.dart");
      expect(result).toBe("test/foo_test.dart");
    });

    it("should handle lowercase drive letter normalization", () => {
      const result = fileUrlToPath("file:///c:/Users/dev/project/test.dart");
      expect(result).toBe("C:/Users/dev/project/test.dart");
    });
  });

  describe("extractExpectedActual()", () => {
    it("should extract expected and actual from Dart error format", () => {
      const { expected, actual } = extractExpectedActual(
        "Expected: false\n  Actual: <true>\n",
      );
      expect(expected).toBe("false");
      expect(actual).toBe("<true>");
    });

    it("should extract numeric expected/actual", () => {
      const { expected, actual } = extractExpectedActual(
        "Expected: <5>\n  Actual: <6>\n",
      );
      expect(expected).toBe("<5>");
      expect(actual).toBe("<6>");
    });

    it("should return empty object for non-assertion errors", () => {
      const result = extractExpectedActual("Some random error\n");
      expect(result.expected).toBeUndefined();
      expect(result.actual).toBeUndefined();
    });

    it("should handle expected only", () => {
      const result = extractExpectedActual("Expected: true\nSome other text");
      expect(result.expected).toBe("true");
      expect(result.actual).toBeUndefined();
    });
  });

  describe("compressStackTrace()", () => {
    it("should filter out package:matcher frames", () => {
      const trace =
        "package:matcher                                expect\ntest\\\\foo_test.dart 28:7  main.<fn>.<fn>\n";
      const result = compressStackTrace(trace);
      expect(result.every((f) => !f.includes("package:matcher"))).toBe(true);
    });

    it("should filter out package:test/ frames", () => {
      const trace =
        "package:test/some_file.dart\ntest\\\\foo_test.dart 28:7  main.<fn>.<fn>\n";
      const result = compressStackTrace(trace);
      expect(result.every((f) => !f.includes("package:test/"))).toBe(true);
    });

    it("should filter out dart: SDK frames", () => {
      const trace =
        "dart:core                        int.~/\ntest\\\\foo_test.dart 53:31  divide\n";
      const result = compressStackTrace(trace);
      expect(result.every((f) => !f.startsWith("dart:"))).toBe(true);
    });

    it("should keep project-relevant frames", () => {
      const trace =
        "package:matcher  expect\ntest\\\\foo_test.dart 28:7  main.<fn>.<fn>\n";
      const result = compressStackTrace(trace);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain("foo_test.dart");
    });

    it("should limit to max 5 frames", () => {
      const lines = Array.from(
        { length: 10 },
        (_, i) => `test/file${i}.dart:${i}  fn${i}`,
      ).join("\n");
      const result = compressStackTrace(lines);
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe("missing executable error handling", () => {
    it("should produce descriptive error for dart ENOENT", async () => {
      const runner = new DartRunner("dart");
      const options: TestRunOptions = {
        files: ["test/foo_test.dart"],
        workingDir: "/nonexistent/path",
      };

      try {
        await runner.execute(options);
        // If we reach here, the test should fail — we expect an error
        expect.unreachable("Should have thrown an error");
      } catch (error: unknown) {
        // The error should mention the missing executable
        const errorObj = error as { message: string };
        expect(errorObj.message).toContain("dart");
      }
    });

    it("should produce descriptive error for flutter ENOENT", async () => {
      const runner = new DartRunner("flutter");
      const options: TestRunOptions = {
        files: ["test/widget_test.dart"],
        workingDir: "/nonexistent/path",
      };

      try {
        await runner.execute(options);
        expect.unreachable("Should have thrown an error");
      } catch (error: unknown) {
        const errorObj = error as { message: string };
        expect(errorObj.message).toContain("flutter");
      }
    });
  });
});

describe("TestRunnerFactory - DartRunner integration", () => {
  it("should create DartRunner('dart') for framework 'dart'", () => {
    const runner = TestRunnerFactory.create("dart");
    expect(runner).toBeInstanceOf(DartRunner);
    expect(runner.framework).toBe("dart");
  });

  it("should create DartRunner('flutter') for framework 'flutter'", () => {
    const runner = TestRunnerFactory.create("flutter");
    expect(runner).toBeInstanceOf(DartRunner);
    expect(runner.framework).toBe("flutter");
  });
});

describe("MockDartRunner (FR-019 compliance)", () => {
  it("should implement TestRunner interface explicitly", () => {
    const mock: TestRunner = new MockDartRunner();
    expect(mock.framework).toBe("dart");
    expect(typeof mock.execute).toBe("function");
    expect(typeof mock.buildCommand).toBe("function");
  });

  it("should return TestRunOutput from execute()", async () => {
    const testOutcomes: NormalizedTestOutcome[] = [
      {
        name: "test 1",
        file: "test/foo_test.dart",
        status: "passed",
        duration: 50,
      },
      {
        name: "test 2",
        file: "test/foo_test.dart",
        status: "failed",
        duration: 30,
        failure: {
          message: "Expected: true\n  Actual: <false>",
          expected: "true",
          actual: "<false>",
          stack: ["test\\foo_test.dart 10:5  main.<fn>.<fn>"],
        },
      },
    ];

    const mock = new MockDartRunner(testOutcomes);
    const options: TestRunOptions = {
      files: ["test/foo_test.dart"],
      workingDir: "/workspace",
    };
    const output = await mock.execute(options);

    expect(output.exitCode).toBe(1);
    expect(output.duration).toBe(100);
    expect(output.tests).toHaveLength(2);
    expect(output.tests[0]?.status).toBe("passed");
    expect(output.tests[1]?.status).toBe("failed");
    expect(output.tests[1]?.failure?.message).toBe(
      "Expected: true\n  Actual: <false>",
    );
  });

  it("should return string[] from buildCommand()", () => {
    const mock = new MockDartRunner();
    const options: TestRunOptions = {
      files: ["test/a_test.dart"],
      workingDir: "/workspace",
    };
    const command = mock.buildCommand(options);
    expect(Array.isArray(command)).toBe(true);
    expect(command[0]).toBe("dart");
  });
});
