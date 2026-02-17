/**
 * VitestRunner unit tests
 *
 * Updated to match the refactored TestRunner interface.
 * VitestRunner.execute() now returns TestRunOutput (not VitestRunResult | ToolError).
 * Errors are thrown instead of returned as ToolError.
 */

import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  VitestRunner,
  type VitestRunOptions,
} from "../../../../../../src/core/testing/VitestRunner.js";
import type { TestRunOutput } from "../../../../../../src/core/testing/TestRunner.js";

// Mock child_process.spawn
vi.mock("node:child_process");

// Mock fs/promises
vi.mock("node:fs/promises");

describe("VitestRunner", () => {
  let runner: VitestRunner;

  beforeEach(() => {
    runner = new VitestRunner();
    vi.clearAllMocks();
  });

  describe("buildCommand()", () => {
    it("should build basic vitest command with JSON reporter", () => {
      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
      };

      const command = runner.buildCommand(options);

      expect(command[0]).toBe("vitest");
      expect(command[1]).toBe("run");
      expect(command).toContain("--reporter=json");
      expect(command.some((arg) => arg.startsWith("--outputFile="))).toBe(true);
      expect(command).toContain("test/example.test.ts");
    });

    it("should add -t flag when pattern is provided", () => {
      const options: VitestRunOptions = {
        files: ["test/**/*.test.ts"],
        pattern: "should handle auth",
        workingDir: "/workspace",
      };

      const command = runner.buildCommand(options);

      expect(command).toContain("-t");
      const tIndex = command.indexOf("-t");
      expect(command[tIndex + 1]).toBe("should handle auth");
    });

    it("should add --testTimeout flag when timeout is provided", () => {
      const options: VitestRunOptions = {
        files: ["test/**/*.test.ts"],
        timeout: 60000,
        workingDir: "/workspace",
      };

      const command = runner.buildCommand(options);

      expect(command).toContain("--testTimeout");
      const timeoutIndex = command.indexOf("--testTimeout");
      expect(command[timeoutIndex + 1]).toBe("60000");
    });

    it("should use 'vitest related' subcommand when relatedFiles are provided (US4)", () => {
      const options: VitestRunOptions = {
        files: [],
        relatedFiles: ["src/core/yaml.ts", "src/core/templates.ts"],
        workingDir: "/workspace",
      };

      const command = runner.buildCommand(options);

      // Should use `vitest related --run` subcommand, not `vitest run --related`
      expect(command[0]).toBe("vitest");
      expect(command[1]).toBe("related");
      // Must include --run to prevent watch mode (vitest related defaults to watch)
      expect(command).toContain("--run");
      expect(command).not.toContain("--related");
      // Related source files should be positional args at the end
      const lastTwo = command.slice(-2);
      expect(lastTwo).toEqual(["src/core/yaml.ts", "src/core/templates.ts"]);
      // Files should NOT be appended when using related subcommand
      expect(command).not.toContain("test/**/*.test.ts");
    });

    it("should omit files array when using relatedFiles (US4)", () => {
      const options: VitestRunOptions = {
        files: ["test/**/*.test.ts"], // These should be ignored
        relatedFiles: ["src/file.ts"],
        workingDir: "/workspace",
      };

      const command = runner.buildCommand(options);

      // Should use `vitest related --run` subcommand
      expect(command[1]).toBe("related");
      expect(command).toContain("--run");
      // Related file should be positional, not via --related flag
      expect(command).not.toContain("--related");
      expect(command[command.length - 1]).toBe("src/file.ts");
      // files array should not be appended (vitest discovers tests via module graph)
      expect(command).not.toContain("test/**/*.test.ts");
    });

    it("should not include pool flags (removed for Vitest 4.x compatibility)", () => {
      const options: VitestRunOptions = {
        files: ["test/unit/**/*.test.ts"],
        workingDir: "/workspace",
      };

      const command = runner.buildCommand(options);

      // Pool flags removed - Vitest 4.x CLI parser doesn't handle nested dot notation
      expect(command).not.toContain("--pool=forks");
      expect(command).not.toContain("--poolOptions.forks.singleFork");
      expect(command).not.toContain("--pool.forks.singleFork=true");
    });

    it("should append file paths at the end", () => {
      const options: VitestRunOptions = {
        files: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
        workingDir: "/workspace",
      };

      const command = runner.buildCommand(options);

      const lastTwoArgs = command.slice(-2);
      expect(lastTwoArgs).toEqual([
        "test/unit/**/*.test.ts",
        "test/integration/**/*.test.ts",
      ]);
    });

    it("should build command with pattern and timeout combined", () => {
      const options: VitestRunOptions = {
        files: ["test/**/*.test.ts"],
        pattern: "auth tests",
        timeout: 45000,
        workingDir: "/workspace",
      };

      const command = runner.buildCommand(options);

      expect(command).toContain("vitest");
      expect(command).toContain("run");
      expect(command).toContain("--reporter=json");
      expect(command).toContain("-t");
      expect(command).toContain("auth tests");
      expect(command).toContain("--testTimeout");
      expect(command).toContain("45000");
      expect(command).toContain("test/**/*.test.ts");
    });
  });

  describe("execute()", () => {
    it("should spawn vitest process and return TestRunOutput on success", async () => {
      const mockVitestJson = {
        numTotalTests: 10,
        numPassedTests: 10,
        numFailedTests: 0,
        testResults: [],
      };

      // Mock spawn to simulate successful process
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === "exit") {
            setTimeout(() => callback(0), 10);
          }
          return mockChild;
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      // Mock readFile to return JSON output
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockVitestJson));

      // Mock unlink (cleanup)
      vi.mocked(unlink).mockResolvedValue(undefined);

      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
      };

      const result = await runner.execute(options);

      // Result should be TestRunOutput
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.tests)).toBe(true);
    });

    it("should return non-zero exit code for failed tests", async () => {
      const mockVitestJson = {
        numTotalTests: 10,
        numPassedTests: 8,
        numFailedTests: 2,
        testResults: [],
      };

      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === "exit") {
            setTimeout(() => callback(1), 10);
          }
          return mockChild;
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockVitestJson));
      vi.mocked(unlink).mockResolvedValue(undefined);

      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
      };

      const result = await runner.execute(options);

      expect(result.exitCode).toBe(1);
    });

    it("should throw on timeout", async () => {
      const mockChild = {
        on: vi.fn((event, _callback) => {
          // Never call exit callback to simulate hang
          return mockChild;
        }),
        kill: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      vi.mocked(unlink).mockResolvedValue(undefined);

      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
        timeout: 100, // Very short timeout for test
      };

      await expect(runner.execute(options)).rejects.toThrow(/timed out/);
    });

    it("should throw on spawn failure (ENOENT)", async () => {
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === "error") {
            const error = new Error("spawn npx ENOENT");
            (error as any).code = "ENOENT";
            setTimeout(() => callback(error), 10);
          }
          return mockChild;
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      vi.mocked(unlink).mockResolvedValue(undefined);

      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
      };

      await expect(runner.execute(options)).rejects.toThrow(/vitest/i);
    });

    it("should throw when JSON output file is missing", async () => {
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === "exit") {
            setTimeout(() => callback(0), 10);
          }
          return mockChild;
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      // Mock readFile to throw ENOENT error
      const fileError = new Error("ENOENT: no such file");
      (fileError as any).code = "ENOENT";
      vi.mocked(readFile).mockRejectedValue(fileError);

      vi.mocked(unlink).mockResolvedValue(undefined);

      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
      };

      await expect(runner.execute(options)).rejects.toThrow(
        /output file not found/i,
      );
    });

    it("should throw when JSON output is corrupt", async () => {
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === "exit") {
            setTimeout(() => callback(0), 10);
          }
          return mockChild;
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      // Mock readFile to return invalid JSON
      vi.mocked(readFile).mockResolvedValue("{ invalid json");

      vi.mocked(unlink).mockResolvedValue(undefined);

      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
      };

      await expect(runner.execute(options)).rejects.toThrow(
        /Failed to parse JSON/i,
      );
    });

    it("should clean up temp file after successful execution", async () => {
      const mockVitestJson = { numTotalTests: 5, numPassedTests: 5, testResults: [] };

      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === "exit") {
            setTimeout(() => callback(0), 10);
          }
          return mockChild;
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockVitestJson));
      vi.mocked(unlink).mockResolvedValue(undefined);

      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
      };

      await runner.execute(options);

      // Verify unlink was called for cleanup
      expect(unlink).toHaveBeenCalled();
    });

    it("should clean up temp file even after errors", async () => {
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === "error") {
            setTimeout(() => callback(new Error("spawn error")), 10);
          }
          return mockChild;
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      vi.mocked(unlink).mockResolvedValue(undefined);

      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
      };

      try {
        await runner.execute(options);
      } catch {
        // Expected to throw
      }

      // Verify cleanup still happens
      expect(unlink).toHaveBeenCalled();
    });
  });

  describe("interface conformance", () => {
    it("should return TestRunOutput with correct structure", async () => {
      const mockVitestJson = {
        numTotalTests: 3,
        numPassedTests: 3,
        testResults: [],
      };

      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === "exit") {
            setTimeout(() => callback(0), 10);
          }
          return mockChild;
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockVitestJson));
      vi.mocked(unlink).mockResolvedValue(undefined);

      const options: VitestRunOptions = {
        files: ["test/example.test.ts"],
        workingDir: "/workspace",
      };

      const result: TestRunOutput = await runner.execute(options);

      // Verify TestRunOutput interface
      expect(result).toHaveProperty("exitCode");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("tests");
      expect(typeof result.exitCode).toBe("number");
      expect(typeof result.duration).toBe("number");
      expect(Array.isArray(result.tests)).toBe(true);
    });

    it("should have framework property set to vitest", () => {
      expect(runner.framework).toBe("vitest");
    });
  });
});
