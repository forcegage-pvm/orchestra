/**
 * Handover Validation Tests
 *
 * Tests for handover-validation.ts module that enforces information isolation
 * between Orchestrator and Implementor.
 */

import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PATTERNS,
  validateContextFiles,
  validateHandoverContext,
  validateHandoverIsolation,
} from "../../src/mcp-server/handlers/handover-validation.js";

describe("handover-validation", () => {
  describe("FORBIDDEN_PATTERNS", () => {
    it("should export pattern categories", () => {
      expect(FORBIDDEN_PATTERNS).toHaveProperty("SPEC_REFERENCES");
      expect(FORBIDDEN_PATTERNS).toHaveProperty("TASK_REFERENCES");
      expect(FORBIDDEN_PATTERNS).toHaveProperty("SPRINT_REFERENCES");
      expect(FORBIDDEN_PATTERNS).toHaveProperty("FORBIDDEN_PATHS");
    });

    it("should have array of regex patterns for each category", () => {
      expect(Array.isArray(FORBIDDEN_PATTERNS.SPEC_REFERENCES)).toBe(true);
      expect(FORBIDDEN_PATTERNS.SPEC_REFERENCES.length).toBeGreaterThan(0);
      expect(FORBIDDEN_PATTERNS.SPEC_REFERENCES[0]).toBeInstanceOf(RegExp);
    });
  });

  describe("validateHandoverContext", () => {
    describe("valid contexts", () => {
      it("should accept undefined context", () => {
        const result = validateHandoverContext(undefined);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it("should accept clean context without forbidden content", () => {
        const context =
          "This task implements the logging system for error tracking. " +
          "We need structured logging with different severity levels. " +
          "The implementation should follow the existing patterns in the codebase.";

        const result = validateHandoverContext(context);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it("should accept context with technical terms that are not violations", () => {
        const context =
          "Create a specification parser that reads TypeScript files. " +
          "The task involves parsing source code. " +
          "Sprint planning is out of scope for this module.";

        const result = validateHandoverContext(context);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });
    });

    describe("spec file references", () => {
      it("should reject context with 'from spec lines N'", () => {
        const context =
          "According to the requirements from spec lines 133-140, we need to implement validation.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations[0]).toContain("spec file reference");
      });

      it("should reject context with 'see spec/file.md'", () => {
        const context =
          "For detailed requirements, see spec/implementation-plan.md section 3.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with 'per specification'", () => {
        const context = "Per specification document, add error handling.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with 'spec document'", () => {
        const context =
          "The spec document outlines the validation requirements.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with direct spec file path references", () => {
        const context =
          "Requirements are in spec/architecture.md and spec/design.md";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });
    });

    describe("task references", () => {
      it("should reject context with 'Task 6'", () => {
        const context =
          "This depends on Task 6 which implements the database layer.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations[0]).toContain("task reference");
      });

      it("should reject context with 'Task #4'", () => {
        const context = "Wait for Task #4 to be completed first.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with 'task-005'", () => {
        const context = "After task-005 is done, implement this feature.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with 'see Task 3'", () => {
        const context = "For the pattern, see Task 3 implementation.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with task status indicators", () => {
        const context = "Task 5 (not started) defines the schema.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with '(pending)' status", () => {
        const context = "The authentication module (pending) will handle this.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should ALLOW @orchestra-task: N format", () => {
        const context =
          "Add // @orchestra-task: 3 comment at the top of the file. " +
          "This links the file to the task for TDD tracking.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it("should ALLOW TDD marker format tdd-red", () => {
        const context =
          "Use [tdd-red] in test name or @Tags(['tdd-red']) annotation. " +
          "The // @orchestra-task: N comment links to the task.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });
    });

    describe("sprint structure references", () => {
      it("should reject context with 'Sprint 003'", () => {
        const context = "This is part of Sprint 003 infrastructure phase.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations[0]).toContain("sprint structure reference");
      });

      it("should reject context with 'after sprint-004'", () => {
        const context = "This feature is scheduled after sprint-004.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with 'in sprint 5'", () => {
        const context = "We're implementing this in sprint 5.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with 'current sprint'", () => {
        const context = "The current sprint focuses on database work.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject context with 'sprint_004'", () => {
        const context = "Part of sprint_004 technical debt resolution.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });
    });

    describe("multiple violations", () => {
      it("should detect multiple violations in same context", () => {
        const context =
          "From spec lines 50-60, see Task 6 for Sprint 003 implementation.";
        const result = validateHandoverContext(context);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(2); // Should catch all three types
      });
    });
  });

  describe("validateContextFiles", () => {
    describe("valid file lists", () => {
      it("should accept undefined context_files", () => {
        const result = validateContextFiles(undefined);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it("should accept empty context_files array", () => {
        const result = validateContextFiles([]);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it("should accept source code files", () => {
        const files = [
          "src/core/logger.ts",
          "src/db/schema.ts",
          "extension/src/utils/helpers.ts",
        ];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it("should accept documentation files (not in spec/)", () => {
        const files = ["README.md", "docs/architecture.md", "CONTRIBUTING.md"];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });
    });

    describe("forbidden file paths", () => {
      it("should reject files in spec/ directory", () => {
        const files = ["spec/implementation-plan.md"];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations[0]).toContain("spec/implementation-plan.md");
      });

      it("should reject tasks.md file", () => {
        const files = ["tasks.md"];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject task-breakdown files", () => {
        const files = ["task-breakdown.md", "task_breakdown.md"];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBe(2);
      });

      it("should reject manifest.yaml", () => {
        const files = [".orchestra/manifest.yaml"];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject progress.yaml", () => {
        const files = [".orchestra/progress.yaml"];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject .orchestrator-only directory files", () => {
        const files = [
          ".orchestra/orchestrator/.orchestrator-only/task-1.yaml",
        ];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it("should reject implementation-plan files", () => {
        const files = ["implementation-plan.md", "implementation_plan.md"];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBe(2);
      });

      it("should reject sprint definition files", () => {
        const files = ["spec/sprint-003.md", "spec/sprint_004.md"];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      });
    });

    describe("mixed valid and invalid files", () => {
      it("should reject array with some forbidden files", () => {
        const files = [
          "src/core/logger.ts", // Valid
          "spec/architecture.md", // Forbidden
          "README.md", // Valid
          "tasks.md", // Forbidden
        ];
        const result = validateContextFiles(files);
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBe(2);
      });
    });
  });

  describe("validateHandoverIsolation", () => {
    it("should not throw for valid inputs", () => {
      const context =
        "This task implements the logging system. We need structured logging.";
      const contextFiles = ["src/core/logger.ts", "src/db/schema.ts"];

      expect(() => {
        validateHandoverIsolation(context, contextFiles);
      }).not.toThrow();
    });

    it("should throw error for invalid context", () => {
      const context = "From spec lines 50-60, implement validation.";
      const contextFiles = ["src/core/logger.ts"];

      expect(() => {
        validateHandoverIsolation(context, contextFiles);
      }).toThrow(/Information isolation violation/);
    });

    it("should throw error for invalid context_files", () => {
      const context =
        "This task implements the logging system. We need structured logging.";
      const contextFiles = ["src/core/logger.ts", "spec/architecture.md"];

      expect(() => {
        validateHandoverIsolation(context, contextFiles);
      }).toThrow(/Information isolation violation/);
    });

    it("should throw error with detailed violation list", () => {
      const context = "See Task 6 and Sprint 003.";
      const contextFiles = ["tasks.md"];

      try {
        validateHandoverIsolation(context, contextFiles);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain("Information isolation violation");
        expect(message).toContain("TRUST BOUNDARY");
        expect(message).toContain("Violations:");
        expect(message).toContain("task reference");
        expect(message).toContain("tasks.md");
      }
    });

    it("should include all violations in error message", () => {
      const context = "From spec lines 50-60, see Task 6 for Sprint 003.";
      const contextFiles = [
        "spec/architecture.md",
        "tasks.md",
        "manifest.yaml",
      ];

      try {
        validateHandoverIsolation(context, contextFiles);
        expect(true).toBe(false);
      } catch (error) {
        const message = (error as Error).message;
        // Should have violations from both context and files
        expect(message).toContain("spec");
        expect(message).toContain("task");
        expect(message).toContain("sprint");
        expect(message).toContain("tasks.md");
        expect(message).toContain("manifest.yaml");
      }
    });

    it("should provide actionable guidance in error message", () => {
      const context = "From spec lines 50-60.";

      try {
        validateHandoverIsolation(context, undefined);
        expect(true).toBe(false);
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("ACTION REQUIRED");
        expect(message).toContain(
          "Extract relevant content into the context field",
        );
      }
    });
  });
});
