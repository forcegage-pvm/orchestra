/**
 * Audit Logging Coverage Tests
 *
 * Verifies that all MCP tool handlers have complete audit logging via logToolExecution.
 * Tests acceptance criteria for Task 9: Complete Audit Logging Coverage.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Audit Logging Coverage", () => {
  const handlersDir = path.join(
    process.cwd(),
    "src",
    "mcp-server",
    "handlers"
  );

  // Utility files that should not have audit logging
  const utilityFiles = ["audit-logging.ts", "handover-validation.ts"];

  // Get all handler files except utilities
  const getHandlerFiles = (): string[] => {
    const allFiles = fs.readdirSync(handlersDir);
    return allFiles.filter(
      (file) => file.endsWith(".ts") && !utilityFiles.includes(file)
    );
  };

  describe("prepare-task.ts audit logging", () => {
    it("should have logToolExecution calls for both success and error paths", () => {
      const filePath = path.join(handlersDir, "prepare-task.ts");
      const content = fs.readFileSync(filePath, "utf-8");

      // Check for import
      expect(content).toContain(
        'import { logToolExecution } from "./audit-logging.js"'
      );

      // Check for success path logging
      expect(content).toMatch(/await logToolExecution\(/);
      expect(content).toMatch(/success: true/);

      // Check for error path logging
      expect(content).toMatch(/success: false/);
      expect(content).toMatch(/errorMessage/);

      // Count occurrences - should have at least 2
      const matches = content.match(/await logToolExecution\(/g);
      expect(matches).toBeDefined();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("complete-task.ts audit logging", () => {
    it("should have logToolExecution calls for both success and error paths", () => {
      const filePath = path.join(handlersDir, "complete-task.ts");
      const content = fs.readFileSync(filePath, "utf-8");

      // Check for import
      expect(content).toContain(
        'import { logToolExecution } from "./audit-logging.js"'
      );

      // Check for success path logging
      expect(content).toMatch(/await logToolExecution\(/);
      expect(content).toMatch(/success: true/);

      // Check for error path logging
      expect(content).toMatch(/success: false/);
      expect(content).toMatch(/errorMessage/);

      // Count occurrences - should have at least 2
      const matches = content.match(/await logToolExecution\(/g);
      expect(matches).toBeDefined();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("run-verification-checks.ts audit logging", () => {
    it("should have logToolExecution calls for both success and error paths", () => {
      const filePath = path.join(handlersDir, "run-verification-checks.ts");
      const content = fs.readFileSync(filePath, "utf-8");

      // Check for import
      expect(content).toContain(
        'import { logToolExecution } from "./audit-logging.js"'
      );

      // Check for success path logging
      expect(content).toMatch(/await logToolExecution\(/);
      expect(content).toMatch(/success: true/);

      // Check for error path logging
      expect(content).toMatch(/success: false/);
      expect(content).toMatch(/errorMessage/);

      // Count occurrences - should have at least 2
      const matches = content.match(/await logToolExecution\(/g);
      expect(matches).toBeDefined();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("All MCP tool handlers", () => {
    it("should have logToolExecution import and usage", () => {
      const handlerFiles = getHandlerFiles();

      // Verify we have the expected number of handlers (26 as per context)
      expect(handlerFiles.length).toBeGreaterThanOrEqual(26);

      const handlersWithoutLogging: string[] = [];
      const handlersWithIncompleteLogging: string[] = [];

      for (const file of handlerFiles) {
        const filePath = path.join(handlersDir, file);
        const content = fs.readFileSync(filePath, "utf-8");

        // Check for import
        const hasImport =
          content.includes('from "./audit-logging.js"') &&
          content.includes("logToolExecution");

        // Check for usage
        const matches = content.match(/await logToolExecution\(/g);
        const hasUsage = matches && matches.length >= 2;

        if (!hasImport) {
          handlersWithoutLogging.push(`${file} (missing import)`);
        } else if (!hasUsage) {
          handlersWithIncompleteLogging.push(
            `${file} (has ${matches?.length || 0} calls, expected ≥2)`
          );
        }
      }

      // Assert no handlers are missing logging
      expect(
        handlersWithoutLogging,
        `Handlers missing logToolExecution import: ${handlersWithoutLogging.join(", ")}`
      ).toHaveLength(0);

      expect(
        handlersWithIncompleteLogging,
        `Handlers with incomplete logging: ${handlersWithIncompleteLogging.join(", ")}`
      ).toHaveLength(0);
    });

    it("should log both success and error paths in all handlers", () => {
      const handlerFiles = getHandlerFiles();
      const handlersWithMissingPaths: string[] = [];

      for (const file of handlerFiles) {
        const filePath = path.join(handlersDir, file);
        const content = fs.readFileSync(filePath, "utf-8");

        const hasSuccessPath = content.includes("success: true");
        const hasErrorPath =
          content.includes("success: false") &&
          (content.includes("errorMessage") || content.includes("error:"));

        if (!hasSuccessPath || !hasErrorPath) {
          const missing = [];
          if (!hasSuccessPath) missing.push("success path");
          if (!hasErrorPath) missing.push("error path");
          handlersWithMissingPaths.push(`${file} (missing: ${missing.join(", ")})`);
        }
      }

      expect(
        handlersWithMissingPaths,
        `Handlers with missing logging paths: ${handlersWithMissingPaths.join(", ")}`
      ).toHaveLength(0);
    });
  });

  describe("Utility files", () => {
    it("should exclude audit-logging.ts and handover-validation.ts from coverage checks", () => {
      // This test verifies our test logic correctly excludes utility files
      const handlerFiles = getHandlerFiles();

      expect(handlerFiles).not.toContain("audit-logging.ts");
      expect(handlerFiles).not.toContain("handover-validation.ts");
    });
  });

  describe("Edge cases", () => {
    it("should verify handlers use the correct tool_name in logging", () => {
      const handlerFiles = getHandlerFiles();
      const handlersWithWrongToolName: string[] = [];

      for (const file of handlerFiles) {
        const filePath = path.join(handlersDir, file);
        const content = fs.readFileSync(filePath, "utf-8");

        // Extract expected tool name from handler function name
        // e.g., handlePrepareTask -> prepare_task
        const handlerMatch = content.match(/export async function handle(\w+)/);
        if (handlerMatch) {
          const functionName = handlerMatch[1];
          // Convert camelCase to snake_case
          const expectedToolName = functionName
            .replace(/([A-Z])/g, "_$1")
            .toLowerCase()
            .slice(1); // Remove leading underscore

          // Check if toolName in logging matches
          const toolNameMatch = content.match(/toolName:\s*["']([^"']+)["']/);
          if (toolNameMatch) {
            const actualToolName = toolNameMatch[1];
            if (actualToolName !== expectedToolName) {
              handlersWithWrongToolName.push(
                `${file} (expected: ${expectedToolName}, got: ${actualToolName})`
              );
            }
          }
        }
      }

      expect(
        handlersWithWrongToolName,
        `Handlers with incorrect tool_name: ${handlersWithWrongToolName.join(", ")}`
      ).toHaveLength(0);
    });

    it("should verify handlers capture taskId when available", () => {
      const handlerFiles = getHandlerFiles();
      const taskscopedHandlers: string[] = [];

      for (const file of handlerFiles) {
        const filePath = path.join(handlersDir, file);
        const content = fs.readFileSync(filePath, "utf-8");

        // Check if handler takes task_id input
        const hasTaskIdInput = content.match(/input\.task_id/);

        if (hasTaskIdInput) {
          taskscopedHandlers.push(file);
          // Verify taskId is passed to logToolExecution
          const hasTaskIdInLog = content.match(/taskId:\s*.*\.task_id/);
          expect(
            hasTaskIdInLog,
            `${file} accepts task_id but doesn't pass it to logToolExecution`
          ).toBeTruthy();
        }
      }

      // Should have at least some task-scoped handlers
      expect(taskscopedHandlers.length).toBeGreaterThan(0);
    });
  });
});
