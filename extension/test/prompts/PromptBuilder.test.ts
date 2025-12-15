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
});
