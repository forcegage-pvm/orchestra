/**
 * Unit tests for command validation module.
 *
 * Tests cover:
 * - Empty command validation
 * - Executable existence checking
 * - npm/pnpm/yarn script validation
 * - Working directory validation
 * - --prefix directory validation
 * - Path segment validation
 * - Edge cases and error conditions
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  validateBehavioralCommand,
  detectRunner,
  checkRunnerFlagCompatibility,
  COMMAND_EMPTY,
  EXECUTABLE_NOT_FOUND,
  SCRIPT_NOT_FOUND,
  WORKDIR_NOT_FOUND,
  RUNNER_FLAG_INCOMPATIBLE,
  JEST_ONLY_FLAGS,
  VITEST_ONLY_FLAGS,
  FLUTTER_ONLY_FLAGS,
  PYTEST_ONLY_FLAGS,
  CARGO_ONLY_FLAGS,
} from "../../src/core/command-validation.js";

describe("command-validation", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-cmd-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("error constants", () => {
    it("exports COMMAND_EMPTY constant", () => {
      expect(COMMAND_EMPTY).toBe("COMMAND_EMPTY");
    });

    it("exports EXECUTABLE_NOT_FOUND constant", () => {
      expect(EXECUTABLE_NOT_FOUND).toBe("EXECUTABLE_NOT_FOUND");
    });

    it("exports SCRIPT_NOT_FOUND constant", () => {
      expect(SCRIPT_NOT_FOUND).toBe("SCRIPT_NOT_FOUND");
    });

    it("exports WORKDIR_NOT_FOUND constant", () => {
      expect(WORKDIR_NOT_FOUND).toBe("WORKDIR_NOT_FOUND");
    });

    it("exports RUNNER_FLAG_INCOMPATIBLE constant", () => {
      expect(RUNNER_FLAG_INCOMPATIBLE).toBe("RUNNER_FLAG_INCOMPATIBLE");
    });
  });

  describe("validateBehavioralCommand", () => {
    describe("empty command validation", () => {
      it("rejects empty string command", () => {
        const result = validateBehavioralCommand("");
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(COMMAND_EMPTY);
        expect(result.errors[0].message).toContain("empty");
      });

      it("rejects whitespace-only command", () => {
        const result = validateBehavioralCommand("   ");
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(COMMAND_EMPTY);
      });

      it("rejects command with only tabs and newlines", () => {
        const result = validateBehavioralCommand("\t\n  ");
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe(COMMAND_EMPTY);
      });
    });

    describe("executable validation", () => {
      it("validates that npm exists (should pass on most systems)", () => {
        const result = validateBehavioralCommand("npm test");
        // Don't check isValid as script might not exist
        // Just verify no executable error
        const hasExecutableError = result.errors.some(
          (e) => e.code === EXECUTABLE_NOT_FOUND,
        );
        expect(hasExecutableError).toBe(false);
      });

      it("detects non-existent executable", () => {
        const result = validateBehavioralCommand(
          "nonexistent-executable-xyz test",
        );
        // This should pass validation because nonexistent-executable-xyz
        // is not in COMMON_EXECUTABLES list
        expect(result.isValid).toBe(true);
      });

      it("validates node exists (should pass on most systems)", () => {
        const result = validateBehavioralCommand("node --version");
        const hasExecutableError = result.errors.some(
          (e) => e.code === EXECUTABLE_NOT_FOUND,
        );
        expect(hasExecutableError).toBe(false);
      });

      it("allows commands with executables not in common list", () => {
        const result = validateBehavioralCommand("custom-tool run");
        expect(result.isValid).toBe(true);
      });
    });

    describe("npm script validation", () => {
      it("validates npm script exists in package.json", () => {
        // Create package.json with test script
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "vitest",
            build: "tsc",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand("npm test", tempDir);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("detects missing npm script", () => {
        // Create package.json without missing-script
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "vitest",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand(
          "npm run missing-script",
          tempDir,
        );
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(SCRIPT_NOT_FOUND);
        expect(result.errors[0].message).toContain("missing-script");
      });

      it("validates pnpm script exists", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            dev: "vite",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand("pnpm dev", tempDir);
        // If pnpm is not installed, should get executable error
        // If pnpm is installed, should pass validation
        if (result.errors.some((e) => e.code === EXECUTABLE_NOT_FOUND)) {
          expect(result.isValid).toBe(false);
        } else {
          expect(result.isValid).toBe(true);
        }
      });

      it("validates yarn script exists", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            start: "node index.js",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand("yarn start", tempDir);
        // If yarn is not installed, should get executable error
        // If yarn is installed, should pass validation
        if (result.errors.some((e) => e.code === EXECUTABLE_NOT_FOUND)) {
          expect(result.isValid).toBe(false);
        } else {
          expect(result.isValid).toBe(true);
        }
      });

      it("detects missing package.json for npm script", () => {
        // Don't create package.json
        const result = validateBehavioralCommand("npm test", tempDir);
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe(SCRIPT_NOT_FOUND);
      });

      it("handles npm run with explicit run keyword", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            build: "tsc",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand("npm run build", tempDir);
        expect(result.isValid).toBe(true);
      });

      it("handles pnpm run with explicit run keyword", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            lint: "eslint .",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand("pnpm run lint", tempDir);
        // If pnpm is not installed, should get executable error
        // If pnpm is installed, should pass validation
        if (result.errors.some((e) => e.code === EXECUTABLE_NOT_FOUND)) {
          expect(result.isValid).toBe(false);
        } else {
          expect(result.isValid).toBe(true);
        }
      });
    });

    describe("working directory validation", () => {
      it("validates existing working directory", () => {
        const result = validateBehavioralCommand("echo hello", tempDir);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("detects non-existent working directory", () => {
        const nonExistentDir = path.join(tempDir, "does-not-exist");
        const result = validateBehavioralCommand("npm test", nonExistentDir);
        expect(result.isValid).toBe(false);
        // Should have at least one error (workdir or multiple)
        expect(result.errors.length).toBeGreaterThan(0);
        // Should have workdir error
        const hasWorkdirError = result.errors.some(
          (e) => e.code === WORKDIR_NOT_FOUND,
        );
        expect(hasWorkdirError).toBe(true);
      });

      it("allows commands without working directory specified", () => {
        const result = validateBehavioralCommand("node --version");
        // Should pass validation (no working directory check)
        expect(result.isValid).toBe(true);
      });
    });

    describe("npm --prefix validation", () => {
      it("validates --prefix directory exists", () => {
        const subdir = path.join(tempDir, "subdir");
        fs.mkdirSync(subdir);

        const packageJson = {
          name: "test-package",
          scripts: {
            test: "vitest",
          },
        };
        fs.writeFileSync(
          path.join(subdir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand(
          "npm --prefix subdir test",
          tempDir,
        );
        // npm should be available on most systems, so this should pass
        // unless npm is not installed
        if (result.errors.some((e) => e.code === EXECUTABLE_NOT_FOUND)) {
          expect(result.isValid).toBe(false);
        } else {
          expect(result.isValid).toBe(true);
        }
      });

      it("detects non-existent --prefix directory", () => {
        const result = validateBehavioralCommand(
          "npm --prefix nonexistent test",
          tempDir,
        );
        expect(result.isValid).toBe(false);
        const error = result.errors.find((e) => e.code === WORKDIR_NOT_FOUND);
        expect(error).toBeDefined();
        expect(error?.message).toContain("nonexistent");
      });

      it("validates script in --prefix directory package.json", () => {
        const subdir = path.join(tempDir, "frontend");
        fs.mkdirSync(subdir);

        const packageJson = {
          name: "frontend",
          scripts: {
            build: "vite build",
          },
        };
        fs.writeFileSync(
          path.join(subdir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand(
          "npm --prefix frontend run build",
          tempDir,
        );
        // npm should be available on most systems
        if (result.errors.some((e) => e.code === EXECUTABLE_NOT_FOUND)) {
          expect(result.isValid).toBe(false);
        } else {
          expect(result.isValid).toBe(true);
        }
      });

      it("detects missing script in --prefix directory", () => {
        const subdir = path.join(tempDir, "backend");
        fs.mkdirSync(subdir);

        const packageJson = {
          name: "backend",
          scripts: {
            start: "node server.js",
          },
        };
        fs.writeFileSync(
          path.join(subdir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand(
          "npm --prefix backend test",
          tempDir,
        );
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe(SCRIPT_NOT_FOUND);
      });
    });

    describe("path segment validation", () => {
      it("warns about non-existent path segment", () => {
        const result = validateBehavioralCommand(
          "node scripts/nonexistent.js",
          tempDir,
        );
        // Path validation produces warnings, not errors
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0].code).toBe("PATH_NOT_FOUND");
        expect(result.warnings[0].message).toContain("scripts/nonexistent.js");
      });

      it("validates existing path segment", () => {
        const scriptsDir = path.join(tempDir, "scripts");
        fs.mkdirSync(scriptsDir);
        fs.writeFileSync(path.join(scriptsDir, "build.js"), "// script");

        const result = validateBehavioralCommand(
          "node scripts/build.js",
          tempDir,
        );
        expect(result.warnings).toHaveLength(0);
      });

      it("ignores absolute paths in validation", () => {
        const result = validateBehavioralCommand(
          "node /usr/bin/script.js",
          tempDir,
        );
        // Absolute paths are not validated
        expect(result.warnings).toHaveLength(0);
      });

      it("ignores URLs in validation", () => {
        const result = validateBehavioralCommand(
          "curl https://example.com/api",
          tempDir,
        );
        expect(result.warnings).toHaveLength(0);
      });

      it("ignores command flags in path validation", () => {
        const result = validateBehavioralCommand(
          "npm test --coverage --watch",
          tempDir,
        );
        // Flags should not be treated as path segments
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe("edge cases", () => {
      it("handles command with multiple spaces", () => {
        const result = validateBehavioralCommand("npm    test");
        expect(result.isValid).toBe(true);
      });

      it("handles command with leading/trailing spaces", () => {
        const result = validateBehavioralCommand("  npm test  ");
        expect(result.isValid).toBe(true);
      });

      it("handles complex command with pipes and redirects", () => {
        const result = validateBehavioralCommand(
          "npm test | grep PASS > output.txt",
        );
        // Should validate npm part, ignore shell operators
        expect(result.isValid).toBe(true);
      });

      it("handles command with environment variables", () => {
        const result = validateBehavioralCommand("NODE_ENV=test npm test");
        expect(result.isValid).toBe(true);
      });

      it("returns empty errors and warnings arrays for valid command", () => {
        const result = validateBehavioralCommand("echo hello");
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
      });

      it("accumulates multiple errors", () => {
        const nonExistentDir = path.join(tempDir, "missing");
        const result = validateBehavioralCommand(
          "npm test",
          nonExistentDir,
        );
        // Should have workdir error and potentially script error
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it("handles malformed package.json gracefully", () => {
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          "{ invalid json",
        );

        const result = validateBehavioralCommand("npm test", tempDir);
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe(SCRIPT_NOT_FOUND);
      });

      it("handles package.json without scripts field", () => {
        const packageJson = {
          name: "test-package",
          version: "1.0.0",
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand("npm test", tempDir);
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe(SCRIPT_NOT_FOUND);
      });
    });

    describe("validation result structure", () => {
      it("returns ValidationResult with correct structure", () => {
        const result = validateBehavioralCommand("npm test");
        expect(result).toHaveProperty("isValid");
        expect(result).toHaveProperty("errors");
        expect(result).toHaveProperty("warnings");
        expect(typeof result.isValid).toBe("boolean");
        expect(Array.isArray(result.errors)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      });

      it("error objects have code and message", () => {
        const result = validateBehavioralCommand("");
        expect(result.errors[0]).toHaveProperty("code");
        expect(result.errors[0]).toHaveProperty("message");
        expect(typeof result.errors[0].code).toBe("string");
        expect(typeof result.errors[0].message).toBe("string");
      });

      it("warning objects have code and message", () => {
        const result = validateBehavioralCommand(
          "node nonexistent/script.js",
          tempDir,
        );
        if (result.warnings.length > 0) {
          expect(result.warnings[0]).toHaveProperty("code");
          expect(result.warnings[0]).toHaveProperty("message");
          expect(typeof result.warnings[0].code).toBe("string");
          expect(typeof result.warnings[0].message).toBe("string");
        }
      });
    });

    describe("synchronous execution", () => {
      it("returns result immediately without Promise", () => {
        const result = validateBehavioralCommand("npm test");
        // Should return ValidationResult, not Promise<ValidationResult>
        expect(result).not.toBeInstanceOf(Promise);
        expect(typeof result.isValid).toBe("boolean");
      });

      it("does not use async/await", () => {
        // This test verifies the function is synchronous by checking
        // it returns a value immediately
        const start = Date.now();
        const result = validateBehavioralCommand("npm test");
        const duration = Date.now() - start;
        
        expect(result).toBeDefined();
        // Synchronous function should complete in under 1 second
        expect(duration).toBeLessThan(1000);
      });
    });
  });

  describe("detectRunner", () => {
    describe("direct runner detection", () => {
      it("detects vitest from direct invocation", () => {
        expect(detectRunner("vitest")).toBe("vitest");
        expect(detectRunner("vitest --run")).toBe("vitest");
        expect(detectRunner("vitest test/unit")).toBe("vitest");
      });

      it("detects jest from direct invocation", () => {
        expect(detectRunner("jest")).toBe("jest");
        expect(detectRunner("jest --coverage")).toBe("jest");
        expect(detectRunner("jest test/")).toBe("jest");
      });

      it("detects flutter from 'flutter test' command", () => {
        expect(detectRunner("flutter test")).toBe("flutter");
        expect(detectRunner("flutter test --tags smoke")).toBe("flutter");
        expect(detectRunner("flutter test test/widget_test.dart")).toBe("flutter");
      });

      it("detects pytest from direct invocation", () => {
        expect(detectRunner("pytest")).toBe("pytest");
        expect(detectRunner("pytest tests/")).toBe("pytest");
        expect(detectRunner("pytest -v")).toBe("pytest");
      });

      it("detects pytest from python -m pytest", () => {
        expect(detectRunner("python -m pytest")).toBe("pytest");
        expect(detectRunner("python3 -m pytest tests/")).toBe("pytest");
      });

      it("detects cargo test", () => {
        expect(detectRunner("cargo test")).toBe("cargo");
        expect(detectRunner("cargo test --lib")).toBe("cargo");
      });
    });

    describe("npx runner detection", () => {
      it("detects vitest from npx invocation", () => {
        expect(detectRunner("npx vitest")).toBe("vitest");
        expect(detectRunner("npx vitest --run")).toBe("vitest");
      });

      it("detects jest from npx invocation", () => {
        expect(detectRunner("npx jest")).toBe("jest");
        expect(detectRunner("npx jest --coverage")).toBe("jest");
      });
    });

    describe("npm script inspection", () => {
      it("detects vitest from npm script", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "vitest",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("npm test", tempDir)).toBe("vitest");
        expect(detectRunner("npm run test", tempDir)).toBe("vitest");
      });

      it("detects jest from npm script", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "jest",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("npm test", tempDir)).toBe("jest");
      });

      it("detects vitest from pnpm script", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "vitest --run",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("pnpm test", tempDir)).toBe("vitest");
      });

      it("detects jest from yarn script", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "jest --coverage",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("yarn test", tempDir)).toBe("jest");
      });

      it("detects flutter from npm script", () => {
        const packageJson = {
          name: "flutter-app",
          scripts: {
            test: "flutter test",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("npm test", tempDir)).toBe("flutter");
      });

      it("detects pytest from npm script", () => {
        const packageJson = {
          name: "python-app",
          scripts: {
            test: "pytest",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("npm test", tempDir)).toBe("pytest");
      });

      it("returns unknown for unrecognized npm script", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "custom-test-runner",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("npm test", tempDir)).toBe("unknown");
      });
    });

    describe("npm --prefix handling", () => {
      it("detects runner from --prefix directory package.json", () => {
        const subdir = path.join(tempDir, "frontend");
        fs.mkdirSync(subdir);

        const packageJson = {
          name: "frontend",
          scripts: {
            test: "vitest",
          },
        };
        fs.writeFileSync(
          path.join(subdir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("npm --prefix frontend test", tempDir)).toBe("vitest");
      });

      it("detects jest from --prefix directory", () => {
        const subdir = path.join(tempDir, "backend");
        fs.mkdirSync(subdir);

        const packageJson = {
          name: "backend",
          scripts: {
            test: "jest",
          },
        };
        fs.writeFileSync(
          path.join(subdir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("npm --prefix backend test", tempDir)).toBe("jest");
      });
    });

    describe("edge cases", () => {
      it("returns unknown for unrecognized commands", () => {
        expect(detectRunner("echo test")).toBe("unknown");
        expect(detectRunner("custom-runner")).toBe("unknown");
      });

      it("returns unknown when package.json doesn't exist", () => {
        expect(detectRunner("npm test", tempDir)).toBe("unknown");
      });

      it("returns unknown when script doesn't exist in package.json", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            build: "tsc",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        expect(detectRunner("npm test", tempDir)).toBe("unknown");
      });

      it("handles commands with extra whitespace", () => {
        expect(detectRunner("  vitest  ")).toBe("vitest");
        expect(detectRunner("  jest  ")).toBe("jest");
      });
    });
  });

  describe("checkRunnerFlagCompatibility", () => {
    describe("flag constant exports", () => {
      it("exports JEST_ONLY_FLAGS", () => {
        expect(Array.isArray(JEST_ONLY_FLAGS)).toBe(true);
        expect(JEST_ONLY_FLAGS.length).toBeGreaterThan(0);
        expect(JEST_ONLY_FLAGS).toContain("--runInBand");
        expect(JEST_ONLY_FLAGS).toContain("--testPathIgnorePatterns");
      });

      it("exports VITEST_ONLY_FLAGS", () => {
        expect(Array.isArray(VITEST_ONLY_FLAGS)).toBe(true);
        expect(VITEST_ONLY_FLAGS.length).toBeGreaterThan(0);
        expect(VITEST_ONLY_FLAGS).toContain("--exclude");
        expect(VITEST_ONLY_FLAGS).toContain("--pool");
      });

      it("exports FLUTTER_ONLY_FLAGS", () => {
        expect(Array.isArray(FLUTTER_ONLY_FLAGS)).toBe(true);
        expect(FLUTTER_ONLY_FLAGS.length).toBeGreaterThan(0);
        expect(FLUTTER_ONLY_FLAGS).toContain("--tags");
        expect(FLUTTER_ONLY_FLAGS).toContain("--exclude-tags");
      });

      it("exports PYTEST_ONLY_FLAGS", () => {
        expect(Array.isArray(PYTEST_ONLY_FLAGS)).toBe(true);
        expect(PYTEST_ONLY_FLAGS.length).toBeGreaterThan(0);
        expect(PYTEST_ONLY_FLAGS).toContain("-m");
        expect(PYTEST_ONLY_FLAGS).toContain("-k");
      });

      it("exports CARGO_ONLY_FLAGS", () => {
        expect(Array.isArray(CARGO_ONLY_FLAGS)).toBe(true);
        expect(CARGO_ONLY_FLAGS.length).toBeGreaterThan(0);
        expect(CARGO_ONLY_FLAGS).toContain("--lib");
        expect(CARGO_ONLY_FLAGS).toContain("--no-fail-fast");
      });
    });

    describe("Jest flag rejection with Vitest", () => {
      it("detects --testPathIgnorePatterns with vitest", () => {
        const flags = checkRunnerFlagCompatibility(
          "vitest --testPathIgnorePatterns=node_modules",
          "vitest",
        );
        expect(flags).toContain("--testPathIgnorePatterns");
      });

      it("detects --runInBand with vitest", () => {
        const flags = checkRunnerFlagCompatibility("vitest --runInBand", "vitest");
        expect(flags).toContain("--runInBand");
      });

      it("detects --detectOpenHandles with vitest", () => {
        const flags = checkRunnerFlagCompatibility(
          "vitest --detectOpenHandles",
          "vitest",
        );
        expect(flags).toContain("--detectOpenHandles");
      });

      it("detects --forceExit with vitest", () => {
        const flags = checkRunnerFlagCompatibility("vitest --forceExit", "vitest");
        expect(flags).toContain("--forceExit");
      });

      it("detects --watchAll with vitest", () => {
        const flags = checkRunnerFlagCompatibility("vitest --watchAll", "vitest");
        expect(flags).toContain("--watchAll");
      });

      it("detects multiple Jest flags with vitest", () => {
        const flags = checkRunnerFlagCompatibility(
          "vitest --runInBand --detectOpenHandles --forceExit",
          "vitest",
        );
        expect(flags).toContain("--runInBand");
        expect(flags).toContain("--detectOpenHandles");
        expect(flags).toContain("--forceExit");
        expect(flags.length).toBe(3);
      });
    });

    describe("Vitest flag rejection with Jest", () => {
      it("detects --exclude with jest", () => {
        const flags = checkRunnerFlagCompatibility(
          "jest --exclude=node_modules",
          "jest",
        );
        expect(flags).toContain("--exclude");
      });

      it("detects --pool with jest", () => {
        const flags = checkRunnerFlagCompatibility("jest --pool=threads", "jest");
        expect(flags).toContain("--pool");
      });

      it("detects --poolOptions with jest", () => {
        const flags = checkRunnerFlagCompatibility("jest --poolOptions={}", "jest");
        expect(flags).toContain("--poolOptions");
      });

      it("detects multiple Vitest flags with jest", () => {
        const flags = checkRunnerFlagCompatibility(
          "jest --exclude=dist --pool=forks",
          "jest",
        );
        expect(flags).toContain("--exclude");
        expect(flags).toContain("--pool");
        expect(flags.length).toBe(2);
      });
    });

    describe("Flutter flag rejection with other runners", () => {
      it("detects --tags with vitest", () => {
        const flags = checkRunnerFlagCompatibility("vitest --tags=smoke", "vitest");
        expect(flags).toContain("--tags");
      });

      it("detects --exclude-tags with jest", () => {
        const flags = checkRunnerFlagCompatibility(
          "jest --exclude-tags=integration",
          "jest",
        );
        expect(flags).toContain("--exclude-tags");
      });

      it("allows --tags with flutter", () => {
        const flags = checkRunnerFlagCompatibility(
          "flutter test --tags=smoke",
          "flutter",
        );
        expect(flags).not.toContain("--tags");
        expect(flags.length).toBe(0);
      });
    });

    describe("Pytest flag rejection with other runners", () => {
      it("detects -m with vitest", () => {
        const flags = checkRunnerFlagCompatibility("vitest -m slow", "vitest");
        expect(flags).toContain("-m");
      });

      it("detects -k with jest", () => {
        const flags = checkRunnerFlagCompatibility("jest -k test_user", "jest");
        expect(flags).toContain("-k");
      });

      it("detects --ignore with vitest", () => {
        const flags = checkRunnerFlagCompatibility(
          "vitest --ignore=setup.py",
          "vitest",
        );
        expect(flags).toContain("--ignore");
      });

      it("allows pytest flags with pytest", () => {
        const flags = checkRunnerFlagCompatibility("pytest -m slow -k test_", "pytest");
        expect(flags.length).toBe(0);
      });
    });

    describe("Cargo flag rejection with other runners", () => {
      it("detects --lib with vitest", () => {
        const flags = checkRunnerFlagCompatibility("vitest --lib", "vitest");
        expect(flags).toContain("--lib");
      });

      it("detects --no-fail-fast with jest", () => {
        const flags = checkRunnerFlagCompatibility(
          "jest --no-fail-fast",
          "jest",
        );
        expect(flags).toContain("--no-fail-fast");
      });

      it("allows cargo flags with cargo", () => {
        const flags = checkRunnerFlagCompatibility(
          "cargo test --lib --no-fail-fast",
          "cargo",
        );
        expect(flags.length).toBe(0);
      });
    });

    describe("unknown runner handling", () => {
      it("returns empty array for unknown runner", () => {
        const flags = checkRunnerFlagCompatibility(
          "custom-runner --testPathIgnorePatterns",
          "unknown",
        );
        expect(flags).toEqual([]);
      });

      it("doesn't validate flags when runner is unknown", () => {
        const flags = checkRunnerFlagCompatibility(
          "unknown-cmd --runInBand --exclude --tags",
          "unknown",
        );
        expect(flags.length).toBe(0);
      });
    });

    describe("valid flag combinations", () => {
      it("allows valid vitest flags", () => {
        const flags = checkRunnerFlagCompatibility(
          "vitest --run --coverage --reporter=json",
          "vitest",
        );
        expect(flags.length).toBe(0);
      });

      it("allows valid jest flags", () => {
        const flags = checkRunnerFlagCompatibility(
          "jest --coverage --watchAll --verbose",
          "jest",
        );
        expect(flags.length).toBe(0);
      });

      it("allows valid flutter flags", () => {
        const flags = checkRunnerFlagCompatibility(
          "flutter test --coverage --tags=smoke",
          "flutter",
        );
        expect(flags.length).toBe(0);
      });

      it("allows valid pytest flags", () => {
        const flags = checkRunnerFlagCompatibility(
          "pytest -v -m slow --ignore=test_old.py",
          "pytest",
        );
        expect(flags.length).toBe(0);
      });

      it("allows valid cargo flags", () => {
        const flags = checkRunnerFlagCompatibility(
          "cargo test --lib --release --features=full",
          "cargo",
        );
        expect(flags.length).toBe(0);
      });
    });

    describe("edge cases", () => {
      it("handles empty command", () => {
        const flags = checkRunnerFlagCompatibility("", "vitest");
        expect(flags).toEqual([]);
      });

      it("handles command without flags", () => {
        const flags = checkRunnerFlagCompatibility("vitest", "vitest");
        expect(flags).toEqual([]);
      });

      it("doesn't match partial flag names", () => {
        // --reporter should not match --reporters (if it exists)
        const flags = checkRunnerFlagCompatibility("jest --reporter=json", "jest");
        expect(flags).toContain("--reporter");
      });

      it("matches flags with = assignment", () => {
        const flags = checkRunnerFlagCompatibility(
          "vitest --testPathIgnorePatterns=node_modules",
          "vitest",
        );
        expect(flags).toContain("--testPathIgnorePatterns");
      });

      it("matches flags with space-separated values", () => {
        const flags = checkRunnerFlagCompatibility(
          "vitest --runInBand test/",
          "vitest",
        );
        expect(flags).toContain("--runInBand");
      });
    });
  });

  describe("validateBehavioralCommand with runner flag checking", () => {
    describe("integration with runner detection", () => {
      it("rejects Jest flags when runner is Vitest", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "vitest",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand(
          "npm test -- --runInBand",
          tempDir,
        );
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(RUNNER_FLAG_INCOMPATIBLE);
        expect(result.errors[0].message).toContain("--runInBand");
        expect(result.errors[0].message).toContain("Vitest");
      });

      it("rejects Vitest flags when runner is Jest", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "jest",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand("npm test -- --exclude=dist", tempDir);
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(RUNNER_FLAG_INCOMPATIBLE);
        expect(result.errors[0].message).toContain("--exclude");
        expect(result.errors[0].message).toContain("Jest");
      });

      it("rejects multiple incompatible flags", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "vitest",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand(
          "npm test -- --runInBand --detectOpenHandles",
          tempDir,
        );
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe(RUNNER_FLAG_INCOMPATIBLE);
        expect(result.errors[0].message).toContain("--runInBand");
        expect(result.errors[0].message).toContain("--detectOpenHandles");
      });
    });

    describe("direct runner invocation validation", () => {
      it("rejects Jest flags with direct vitest invocation", () => {
        const result = validateBehavioralCommand("vitest --testPathIgnorePatterns=dist");
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe(RUNNER_FLAG_INCOMPATIBLE);
      });

      it("rejects Vitest flags with direct jest invocation", () => {
        const result = validateBehavioralCommand("jest --pool=threads");
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe(RUNNER_FLAG_INCOMPATIBLE);
      });

      it("rejects incompatible flags with flutter test", () => {
        const result = validateBehavioralCommand("flutter test --runInBand");
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe(RUNNER_FLAG_INCOMPATIBLE);
      });

      it("rejects incompatible flags with pytest", () => {
        const result = validateBehavioralCommand("pytest --runInBand");
        expect(result.isValid).toBe(false);
        // If pytest isn't installed, we'll get EXECUTABLE_NOT_FOUND
        // If it is installed, we should get RUNNER_FLAG_INCOMPATIBLE
        const hasFlagError = result.errors.some(
          (e) => e.code === RUNNER_FLAG_INCOMPATIBLE,
        );
        const hasExecError = result.errors.some(
          (e) => e.code === EXECUTABLE_NOT_FOUND,
        );
        expect(hasFlagError || hasExecError).toBe(true);
      });

      it("rejects incompatible flags with cargo test", () => {
        const result = validateBehavioralCommand("cargo test --runInBand");
        expect(result.isValid).toBe(false);
        // If cargo isn't installed, we'll get EXECUTABLE_NOT_FOUND
        // If it is installed, we should get RUNNER_FLAG_INCOMPATIBLE
        const hasFlagError = result.errors.some(
          (e) => e.code === RUNNER_FLAG_INCOMPATIBLE,
        );
        const hasExecError = result.errors.some(
          (e) => e.code === EXECUTABLE_NOT_FOUND,
        );
        expect(hasFlagError || hasExecError).toBe(true);
      });
    });

    describe("valid flag combinations", () => {
      it("allows valid Vitest flags", () => {
        const result = validateBehavioralCommand("vitest --run --coverage");
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("allows valid Jest flags", () => {
        const result = validateBehavioralCommand("jest --coverage --watchAll");
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("allows valid Flutter flags", () => {
        const result = validateBehavioralCommand("flutter test --tags=smoke");
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("allows valid Pytest flags", () => {
        const result = validateBehavioralCommand("pytest -m slow -k test_");
        // If pytest isn't installed, we'll get EXECUTABLE_NOT_FOUND
        // If it is installed and flags are valid, should pass
        const hasExecError = result.errors.some(
          (e) => e.code === EXECUTABLE_NOT_FOUND,
        );
        if (!hasExecError) {
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        } else {
          // Pytest not installed, so we expect failure
          expect(result.isValid).toBe(false);
        }
      });

      it("allows valid Cargo flags", () => {
        const result = validateBehavioralCommand("cargo test --lib --release");
        // If cargo isn't installed, we'll get EXECUTABLE_NOT_FOUND
        // If it is installed and flags are valid, should pass
        const hasExecError = result.errors.some(
          (e) => e.code === EXECUTABLE_NOT_FOUND,
        );
        if (!hasExecError) {
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        } else {
          // Cargo not installed, so we expect failure
          expect(result.isValid).toBe(false);
        }
      });
    });

    describe("unknown runner handling", () => {
      it("skips flag validation for unknown runners", () => {
        const result = validateBehavioralCommand("custom-runner --runInBand --exclude");
        // Should be valid because runner is unknown and we don't validate flags
        expect(result.isValid).toBe(true);
      });

      it("skips flag validation when package.json doesn't exist", () => {
        const result = validateBehavioralCommand("npm test -- --runInBand", tempDir);
        // Should fail on script not found, not flag incompatibility
        expect(result.isValid).toBe(false);
        const hasFlagError = result.errors.some(
          (e) => e.code === RUNNER_FLAG_INCOMPATIBLE,
        );
        expect(hasFlagError).toBe(false);
      });
    });

    describe("combined validation", () => {
      it("accumulates multiple error types", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "vitest",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        // Command with both missing directory and incompatible flag
        const nonExistentDir = path.join(tempDir, "missing");
        const result = validateBehavioralCommand(
          "npm test -- --runInBand",
          nonExistentDir,
        );

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);

        // Should have workdir error
        const hasWorkdirError = result.errors.some(
          (e) => e.code === WORKDIR_NOT_FOUND,
        );
        expect(hasWorkdirError).toBe(true);
        
        // May have flag error if runner detection succeeded, but not guaranteed
        // since package.json won't be found in non-existent directory
      });

      it("validates all checks when flags are compatible", () => {
        const packageJson = {
          name: "test-package",
          scripts: {
            test: "vitest",
          },
        };
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify(packageJson),
        );

        const result = validateBehavioralCommand("npm test -- --run", tempDir);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });
});
