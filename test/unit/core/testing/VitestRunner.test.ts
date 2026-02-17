/**
 * VitestRunner Unit Tests
 *
 * Tests for interface compliance (TestRunner contract), buildCommand(),
 * and regression safety after the TestRunner abstraction refactor.
 *
 * Per FR-019 / Lesson 7: Mock runners MUST implement TestRunner explicitly
 * (class MockRunner implements TestRunner) so TypeScript catches interface drift.
 */

import { describe, expect, it } from "vitest";

import type {
  NormalizedTestOutcome,
  TestFramework,
  TestRunOptions,
  TestRunOutput,
  TestRunner,
} from "../../../../src/core/testing/TestRunner.js";
import { VitestRunner } from "../../../../src/core/testing/VitestRunner.js";

// ============================================================================
// FR-019: Mock runners MUST implement TestRunner explicitly
// ============================================================================

/**
 * MockRunner implementing TestRunner interface explicitly.
 * Per FR-019 / Lesson 7, this ensures TypeScript catches interface drift
 * if the TestRunner contract changes.
 */
class MockRunner implements TestRunner {
  readonly framework: TestFramework = "vitest";

  private readonly _results: NormalizedTestOutcome[];

  constructor(results: NormalizedTestOutcome[] = []) {
    this._results = results;
  }

  async execute(options: TestRunOptions): Promise<TestRunOutput> {
    return {
      exitCode: this._results.some((r) => r.status === "failed") ? 1 : 0,
      duration: 100,
      tests: this._results,
    };
  }

  buildCommand(options: TestRunOptions): string[] {
    return ["mock", "run", ...options.files];
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("VitestRunner", () => {
  describe("interface compliance", () => {
    it("should have framework property set to 'vitest'", () => {
      const runner = new VitestRunner();
      expect(runner.framework).toBe("vitest");
    });

    it("should have framework as a readonly property", () => {
      const runner = new VitestRunner();
      // Verify it's the string literal, not just any string
      const framework: "vitest" = runner.framework;
      expect(framework).toBe("vitest");
    });

    it("should have execute method that returns Promise<TestRunOutput>", () => {
      const runner = new VitestRunner();
      expect(typeof runner.execute).toBe("function");
    });

    it("should have buildCommand method that returns string[]", () => {
      const runner = new VitestRunner();
      expect(typeof runner.buildCommand).toBe("function");
    });

    it("should be assignable to TestRunner interface", () => {
      const runner: TestRunner = new VitestRunner();
      expect(runner.framework).toBe("vitest");
      expect(typeof runner.execute).toBe("function");
      expect(typeof runner.buildCommand).toBe("function");
    });
  });

  describe("buildCommand()", () => {
    it("should return an array of strings", () => {
      const runner = new VitestRunner();
      const options: TestRunOptions = {
        files: ["test/unit/foo.test.ts"],
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      expect(Array.isArray(command)).toBe(true);
      for (const part of command) {
        expect(typeof part).toBe("string");
      }
    });

    it("should include vitest run command", () => {
      const runner = new VitestRunner();
      const options: TestRunOptions = {
        files: ["test/unit/foo.test.ts"],
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      expect(command[0]).toBe("vitest");
      expect(command[1]).toBe("run");
    });

    it("should include --reporter=json flag", () => {
      const runner = new VitestRunner();
      const options: TestRunOptions = {
        files: ["test/unit/foo.test.ts"],
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      expect(command).toContain("--reporter=json");
    });

    it("should include --outputFile flag", () => {
      const runner = new VitestRunner();
      const options: TestRunOptions = {
        files: ["test/unit/foo.test.ts"],
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      const outputFileArg = command.find((arg) =>
        arg.startsWith("--outputFile="),
      );
      expect(outputFileArg).toBeDefined();
    });

    it("should include test files at end of command", () => {
      const runner = new VitestRunner();
      const files = ["test/unit/foo.test.ts", "test/unit/bar.test.ts"];
      const options: TestRunOptions = {
        files,
        workingDir: "/workspace",
      };
      const command = runner.buildCommand(options);
      expect(command.at(-2)).toBe(files[0]);
      expect(command.at(-1)).toBe(files[1]);
    });

    it("should include -t flag when pattern is provided", () => {
      const runner = new VitestRunner();
      const options: TestRunOptions = {
        files: ["test/unit/foo.test.ts"],
        workingDir: "/workspace",
        pattern: "should handle error",
      };
      const command = runner.buildCommand(options);
      const tIndex = command.indexOf("-t");
      expect(tIndex).toBeGreaterThan(-1);
      expect(command[tIndex + 1]).toBe("should handle error");
    });

    it("should include --testTimeout when timeout is provided", () => {
      const runner = new VitestRunner();
      const options: TestRunOptions = {
        files: ["test/unit/foo.test.ts"],
        workingDir: "/workspace",
        timeout: 60000,
      };
      const command = runner.buildCommand(options);
      const timeoutIndex = command.indexOf("--testTimeout");
      expect(timeoutIndex).toBeGreaterThan(-1);
      expect(command[timeoutIndex + 1]).toBe("60000");
    });

    it("should use vitest related when relatedFiles provided", () => {
      const runner = new VitestRunner();
      const options: TestRunOptions = {
        files: [],
        workingDir: "/workspace",
        relatedFiles: ["src/core/foo.ts", "src/core/bar.ts"],
      };
      const command = runner.buildCommand(options);
      expect(command[0]).toBe("vitest");
      expect(command[1]).toBe("related");
      expect(command).toContain("--run");
      expect(command).toContain("src/core/foo.ts");
      expect(command).toContain("src/core/bar.ts");
    });
  });
});

describe("MockRunner (FR-019 compliance)", () => {
  it("should implement TestRunner interface explicitly", () => {
    const mock: TestRunner = new MockRunner();
    expect(mock.framework).toBe("vitest");
    expect(typeof mock.execute).toBe("function");
    expect(typeof mock.buildCommand).toBe("function");
  });

  it("should return TestRunOutput from execute()", async () => {
    const testOutcomes: NormalizedTestOutcome[] = [
      {
        name: "test 1",
        file: "test/foo.test.ts",
        status: "passed",
        duration: 50,
      },
      {
        name: "test 2",
        file: "test/foo.test.ts",
        status: "failed",
        duration: 30,
        failure: {
          message: "Expected true but got false",
          expected: "true",
          actual: "false",
          stack: ["at test/foo.test.ts:10"],
        },
      },
    ];

    const mock = new MockRunner(testOutcomes);
    const options: TestRunOptions = {
      files: ["test/foo.test.ts"],
      workingDir: "/workspace",
    };
    const output = await mock.execute(options);

    expect(output.exitCode).toBe(1);
    expect(output.duration).toBe(100);
    expect(output.tests).toHaveLength(2);
    expect(output.tests[0]?.status).toBe("passed");
    expect(output.tests[1]?.status).toBe("failed");
    expect(output.tests[1]?.failure?.message).toBe(
      "Expected true but got false",
    );
  });

  it("should return string[] from buildCommand()", () => {
    const mock = new MockRunner();
    const options: TestRunOptions = {
      files: ["test/a.test.ts"],
      workingDir: "/workspace",
    };
    const command = mock.buildCommand(options);
    expect(Array.isArray(command)).toBe(true);
    expect(command[0]).toBe("mock");
  });

  it("should use all TestRunner interface members", () => {
    // This ensures the MockRunner is complete — TypeScript will error
    // if any TestRunner member is missing from MockRunner
    const mock = new MockRunner();
    const runner: TestRunner = mock;

    // Verify all three required members exist
    expect(runner.framework).toBeDefined();
    expect(runner.execute).toBeDefined();
    expect(runner.buildCommand).toBeDefined();
  });
});
