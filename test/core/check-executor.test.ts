/**
 * Check Executor Tests
 *
 * TDD tests for the verification check executor that runs
 * structural, behavioral, and quality checks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeCheck,
  executeStructuralCheck,
  executeBehavioralCheck,
  executeQualityCheck,
  CheckConfig,
  CheckResult,
} from "../../src/core/check-executor.js";
import * as commandExecutor from "../../src/core/command-executor.js";

// Mock the command executor
vi.mock("../../src/core/command-executor.js", () => ({
  executeCommand: vi.fn(),
}));

describe("Check Executor", () => {
  const mockExecuteCommand = vi.mocked(commandExecutor.executeCommand);
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "check-exec-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("executeStructuralCheck", () => {
    it("should pass when file exists", async () => {
      const filePath = path.join(tempDir, "test.ts");
      fs.writeFileSync(filePath, "export const foo = 1;");

      const config: CheckConfig = {
        type: "structural",
        subtype: "file_exists",
        path: filePath,
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.message).toContain("exists");
    });

    it("should fail when file does not exist", async () => {
      const config: CheckConfig = {
        type: "structural",
        subtype: "file_exists",
        path: path.join(tempDir, "nonexistent.ts"),
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("should check file contains expected export", async () => {
      const filePath = path.join(tempDir, "module.ts");
      fs.writeFileSync(filePath, "export function myFunction() {}");

      const config: CheckConfig = {
        type: "structural",
        subtype: "exports",
        path: filePath,
        exports: ["myFunction"],
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should fail when export is missing", async () => {
      const filePath = path.join(tempDir, "module.ts");
      fs.writeFileSync(filePath, "export function otherFunction() {}");

      const config: CheckConfig = {
        type: "structural",
        subtype: "exports",
        path: filePath,
        exports: ["myFunction"],
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("myFunction");
    });

    it("should validate JSON schema", async () => {
      const filePath = path.join(tempDir, "config.json");
      fs.writeFileSync(filePath, JSON.stringify({ name: "test", version: "1.0" }));

      const config: CheckConfig = {
        type: "structural",
        subtype: "json_schema",
        path: filePath,
        required_fields: ["name", "version"],
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should fail JSON schema when field missing", async () => {
      const filePath = path.join(tempDir, "config.json");
      fs.writeFileSync(filePath, JSON.stringify({ name: "test" }));

      const config: CheckConfig = {
        type: "structural",
        subtype: "json_schema",
        path: filePath,
        required_fields: ["name", "version"],
      };

      const result = await executeStructuralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("version");
    });
  });

  describe("executeBehavioralCheck", () => {
    it("should run test command and pass", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "10 tests passed",
        stderr: "",
        duration: 2000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        subtype: "tests",
        command: "npm test",
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(true);
      expect(result.output).toContain("10 tests passed");
      expect(mockExecuteCommand).toHaveBeenCalledWith("npm test", expect.any(Object));
    });

    it("should fail when tests fail", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "FAIL: expected true, got false",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        subtype: "tests",
        command: "npm test",
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.output).toContain("FAIL");
    });

    it("should check coverage threshold", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Coverage: 85%",
        stderr: "",
        duration: 3000,
      });

      const config: CheckConfig = {
        type: "behavioral",
        subtype: "coverage",
        command: "npm run test:coverage",
        threshold: 80,
      };

      const result = await executeBehavioralCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });
  });

  describe("executeQualityCheck", () => {
    it("should run lint command and pass", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "No lint errors",
        stderr: "",
        duration: 1000,
      });

      const config: CheckConfig = {
        type: "quality",
        subtype: "lint",
        command: "npm run lint",
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should fail when lint errors exist", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Error: unused variable 'x'",
        duration: 500,
      });

      const config: CheckConfig = {
        type: "quality",
        subtype: "lint",
        command: "npm run lint",
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.output).toContain("unused variable");
    });

    it("should run typecheck command", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        duration: 2000,
      });

      const config: CheckConfig = {
        type: "quality",
        subtype: "typecheck",
        command: "npm run typecheck",
      };

      const result = await executeQualityCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });
  });

  describe("executeCheck (dispatcher)", () => {
    it("should dispatch to structural check", async () => {
      const filePath = path.join(tempDir, "file.ts");
      fs.writeFileSync(filePath, "content");

      const config: CheckConfig = {
        type: "structural",
        subtype: "file_exists",
        path: filePath,
      };

      const result = await executeCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should dispatch to behavioral check", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "OK",
        stderr: "",
        duration: 100,
      });

      const config: CheckConfig = {
        type: "behavioral",
        subtype: "tests",
        command: "npm test",
      };

      const result = await executeCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should dispatch to quality check", async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "OK",
        stderr: "",
        duration: 100,
      });

      const config: CheckConfig = {
        type: "quality",
        subtype: "lint",
        command: "npm run lint",
      };

      const result = await executeCheck(config, tempDir);

      expect(result.passed).toBe(true);
    });

    it("should return error for unknown check type", async () => {
      const config = {
        type: "unknown",
        subtype: "test",
      } as unknown as CheckConfig;

      const result = await executeCheck(config, tempDir);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Unknown check type");
    });

    it("should include duration in result", async () => {
      const filePath = path.join(tempDir, "file.ts");
      fs.writeFileSync(filePath, "content");

      const config: CheckConfig = {
        type: "structural",
        subtype: "file_exists",
        path: filePath,
      };

      const result = await executeCheck(config, tempDir);

      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
