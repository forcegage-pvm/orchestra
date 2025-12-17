/**
 * Tests for PromptBuilder
 *
 * Verifies that PromptBuilder correctly generates structured prompts
 * for workflow stages with proper context and instructions.
 */

import { describe, expect, it } from "vitest";
import {
  PromptBuilder,
  type PromptContext,
  type Sprint,
  type Task,
} from "../../src/prompts/PromptBuilder.js";

describe("PromptBuilder", () => {
  describe("PromptContext interface", () => {
    it("should accept valid context with all required properties", () => {
      const task: Task = {
        task_id: 1,
        title: "Test Task",
        description: "Test description",
      };

      const sprint: Sprint = {
        sprint_id: "001",
        title: "Test Sprint",
      };

      const context: PromptContext = {
        task,
        sprint,
      };

      expect(context.task).toBe(task);
      expect(context.sprint).toBe(sprint);
    });

    it("should accept context with optional properties", () => {
      const task: Task = {
        task_id: 2,
        title: "Full Task",
        category: "feature",
        phase_id: "alpha",
        description: "Full description",
      };

      const sprint: Sprint = {
        sprint_id: "002",
        title: "Full Sprint",
      };

      const context: PromptContext = {
        task,
        sprint,
        handoverPath: "/path/to/handover.md",
        feedbackPath: "/path/to/feedback.md",
        retryCount: 2,
      };

      expect(context.handoverPath).toBe("/path/to/handover.md");
      expect(context.feedbackPath).toBe("/path/to/feedback.md");
      expect(context.retryCount).toBe(2);
    });
  });

  describe("buildPreparePrompt", () => {
    it("should return a string prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("should include task_id in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 42,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("42");
    });

    it("should include task title in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Implement Feature X",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("Implement Feature X");
    });

    it("should include task category when present", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          category: "bugfix",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("bugfix");
      expect(prompt).toContain("Category");
    });

    it("should include task phase when present", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          phase_id: "beta",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("beta");
      expect(prompt).toContain("Phase");
    });

    it("should include task description in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description:
            "This is a detailed task description with specific requirements",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain(
        "This is a detailed task description with specific requirements"
      );
    });

    it("should instruct to use get_task MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("get_task");
    });

    it("should instruct to use prepare_task MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("prepare_task");
    });

    it("should mention acceptance criteria in instructions", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("acceptance criteria");
    });

    it("should mention file operations in instructions", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("File operations");
    });

    it("should mention deliverables in instructions", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("Deliverables");
    });

    it("should include sprint_id in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "003",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("003");
    });

    it("should include sprint title in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Configuration Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("Configuration Sprint");
    });

    it("should remind about hidden verification criteria", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("verification criteria");
      expect(prompt).toContain("implementor CANNOT see");
    });

    it("should remind about test requirements", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("test requirements");
    });

    it("should handle tasks with all optional properties", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 99,
          title: "Complex Task",
          category: "refactoring",
          phase_id: "production",
          description: "A complex task with all properties set",
        },
        sprint: {
          sprint_id: "005",
          title: "Refactoring Sprint",
        },
        handoverPath: "/path/to/handover.md",
        feedbackPath: "/path/to/feedback.md",
        retryCount: 1,
      };

      const prompt = builder.buildPreparePrompt(context);
      expect(prompt).toContain("99");
      expect(prompt).toContain("Complex Task");
      expect(prompt).toContain("refactoring");
      expect(prompt).toContain("production");
      expect(prompt).toContain("A complex task with all properties set");
      expect(prompt).toContain("005");
      expect(prompt).toContain("Refactoring Sprint");
    });
  });

  describe("buildImplementPrompt", () => {
    it("should return a string prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("should include task_id in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 42,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("42");
    });

    it("should include task title in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Implement Feature Y",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("Implement Feature Y");
    });

    it("should instruct to use get_current_task MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("get_current_task");
    });

    it("should instruct to use signal_completion MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("signal_completion");
    });

    it("should include handoverPath when provided", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        handoverPath: "/path/to/task-handover.md",
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("/path/to/task-handover.md");
      expect(prompt).toContain("Handover");
    });

    it("should not show handoverPath placeholder when not provided", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).not.toContain("undefined");
    });

    it("should mention acceptance criteria in instructions", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("acceptance criteria");
      expect(prompt.toLowerCase()).toContain("acceptance criteria");
    });

    it("should mention file operations in instructions", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("File operations");
    });

    it("should mention deliverables in instructions", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("Deliverables");
    });

    it("should mention artifacts in signal_completion instructions", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("artifacts");
    });

    it("should instruct to follow handover specifications", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("Follow the handover");
    });

    it("should remind to test implementation", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("Test your implementation");
    });

    it("should warn about hidden verification criteria", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("verified against criteria you cannot see");
    });

    it("should instruct to signal only when all criteria are met", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("ALL criteria are met");
    });

    it("should handle context with all optional properties", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 99,
          title: "Complex Implementation Task",
          category: "feature",
          phase_id: "beta",
          description: "A complex task with all properties",
        },
        sprint: {
          sprint_id: "005",
          title: "Feature Sprint",
        },
        handoverPath: ".orchestra/implementor/handovers/task-99-handover.md",
        feedbackPath: ".orchestra/implementor/feedback/task-99-feedback.md",
        retryCount: 2,
      };

      const prompt = builder.buildImplementPrompt(context);
      expect(prompt).toContain("99");
      expect(prompt).toContain("Complex Implementation Task");
      expect(prompt).toContain(
        ".orchestra/implementor/handovers/task-99-handover.md"
      );
    });
  });

  describe("buildVerifyPrompt", () => {
    it("should return a string prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("should include task_id in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 42,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("42");
    });

    it("should include task title in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Verify Feature Z",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("Verify Feature Z");
    });

    it("should instruct to use get_signal MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("get_signal");
    });

    it("should explain get_signal retrieves completion signal", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("get_signal");
      expect(prompt).toContain("completion signal");
    });

    it("should instruct to use run_verification_checks MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("run_verification_checks");
    });

    it("should explain run_verification_checks executes automated checks", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("run_verification_checks");
      expect(prompt).toContain("automated verification checks");
    });

    it("should instruct to use submit_verification_judgment MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("submit_verification_judgment");
    });

    it("should explain submit_verification_judgment records PASS or FAIL", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("submit_verification_judgment");
      expect(prompt).toContain("PASS or FAIL");
    });

    it("should mention hidden verification criteria", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("Hidden verification criteria");
    });

    it("should remind that implementor cannot see verification criteria", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("criteria they cannot see");
    });

    it("should mention artifacts in get_signal instructions", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("artifacts");
    });

    it("should mention build and test status", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("Build and test");
    });

    it("should mention file operations verification", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("File operations");
    });

    it("should instruct to provide clear rationale", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("rationale");
    });

    it("should mention providing feedback if verification fails", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("feedback");
      expect(prompt).toContain("verification fails");
    });

    it("should mention acceptance criteria compliance", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("Acceptance criteria");
    });

    it("should handle context with all optional properties", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 99,
          title: "Complex Verification Task",
          category: "verification",
          phase_id: "production",
          description: "A complex verification task",
        },
        sprint: {
          sprint_id: "005",
          title: "Verification Sprint",
        },
        handoverPath: ".orchestra/implementor/handovers/task-99-handover.md",
        feedbackPath: ".orchestra/implementor/feedback/task-99-feedback.md",
        retryCount: 2,
      };

      const prompt = builder.buildVerifyPrompt(context);
      expect(prompt).toContain("99");
      expect(prompt).toContain("Complex Verification Task");
    });
  });

  describe("buildRetryPrompt", () => {
    it("should return a string prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("should include task_id in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 42,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("42");
    });

    it("should include task title in the prompt", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Retry Feature Y",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Retry Feature Y");
    });

    it("should instruct to use get_current_task MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("get_current_task");
    });

    it("should explain get_current_task retrieves handover", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("get_current_task");
      expect(prompt).toContain("handover");
    });

    it("should instruct to use get_feedback MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("get_feedback");
    });

    it("should explain get_feedback retrieves verification failure feedback", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("get_feedback");
      expect(prompt).toContain("verification failure feedback");
    });

    it("should instruct to use signal_completion MCP tool", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("signal_completion");
    });

    it("should explain signal_completion for re-signaling after fixes", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("signal_completion");
      expect(prompt).toContain("Re-signal");
    });

    it("should display retry count from context", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 2,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Retry Attempt 2");
    });

    it("should default to retry count 1 if not provided", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Retry Attempt 1");
    });

    it("should emphasize reading feedback carefully", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("CAREFULLY");
      expect(prompt).toContain("Read");
    });

    it("should emphasize addressing ALL feedback issues", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("ALL");
      expect(prompt).toContain("address");
    });

    it("should include feedback path when provided", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        feedbackPath: ".orchestra/implementor/feedback/task-1-feedback.md",
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain(
        ".orchestra/implementor/feedback/task-1-feedback.md"
      );
      expect(prompt).toContain("Feedback");
    });

    it("should mention what went wrong in feedback description", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("What went wrong");
    });

    it("should mention what worked in feedback description", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("What worked");
    });

    it("should mention guidance on fixing issues", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Guidance");
      expect(prompt).toContain("fix");
    });

    it("should mention artifacts in signal_completion instructions", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("artifacts");
    });

    it("should mention summary of fixes applied", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Summary");
      expect(prompt).toContain("fixes");
    });

    it("should mention build and test status", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Build and test status");
    });

    it("should remind that implementor cannot see verification criteria", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("criteria you cannot see");
    });

    it("should warn about incomplete fixes", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Incomplete fixes");
      expect(prompt).toContain("FAIL");
    });

    it("should instruct not to skip feedback items", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Do not skip");
    });

    it("should mention acceptance criteria", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Acceptance criteria");
    });

    it("should mention file operations", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("File operations");
    });

    it("should mention deliverables", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Deliverables");
    });

    it("should mention context files", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 1,
          title: "Test Task",
          description: "Test description",
        },
        sprint: {
          sprint_id: "001",
          title: "Test Sprint",
        },
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("Context files");
    });

    it("should handle context with all optional properties", () => {
      const builder = new PromptBuilder();
      const context: PromptContext = {
        task: {
          task_id: 99,
          title: "Complex Retry Task",
          category: "bugfix",
          phase_id: "production",
          description: "A complex retry task",
        },
        sprint: {
          sprint_id: "005",
          title: "Retry Sprint",
        },
        handoverPath: ".orchestra/implementor/handovers/task-99-handover.md",
        feedbackPath: ".orchestra/implementor/feedback/task-99-feedback.md",
        retryCount: 3,
      };

      const prompt = builder.buildRetryPrompt(context);
      expect(prompt).toContain("99");
      expect(prompt).toContain("Complex Retry Task");
      expect(prompt).toContain("Retry Attempt 3");
      expect(prompt).toContain(
        ".orchestra/implementor/feedback/task-99-feedback.md"
      );
    });
  });
});
