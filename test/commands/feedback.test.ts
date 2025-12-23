/**
 * Tests for Feedback Command
 *
 * Verifies:
 * - createFeedbackCommand exports Command
 * - Command has correct options (--task, --json)
 * - Command structure is correct
 */

import { Command } from "commander";
import { describe, expect, test } from "vitest";
import { createFeedbackCommand } from "../../src/commands/feedback.js";

describe("Feedback Command", () => {
  describe("createFeedbackCommand", () => {
    test("returns a Commander Command instance", () => {
      const command = createFeedbackCommand();
      expect(command).toBeInstanceOf(Command);
    });

    test("command has correct name", () => {
      const command = createFeedbackCommand();
      expect(command.name()).toBe("feedback");
    });

    test("command has correct description", () => {
      const command = createFeedbackCommand();
      const description = command.description();
      expect(description).toContain("feedback");
      expect(description).toContain("implementor");
      expect(description).toContain("verification failure");
    });

    test("command has --task option", () => {
      const command = createFeedbackCommand();
      const taskOption = command.options.find((opt) =>
        opt.flags.includes("--task")
      );
      expect(taskOption).toBeDefined();
      expect(taskOption?.flags).toContain("-t");
    });

    test("command has --json option", () => {
      const command = createFeedbackCommand();
      const jsonOption = command.options.find((opt) =>
        opt.flags.includes("--json")
      );
      expect(jsonOption).toBeDefined();
    });
  });

  describe("imports", () => {
    test("command can be imported and instantiated", () => {
      // This test verifies that all imports work correctly
      const command = createFeedbackCommand();
      expect(command).toBeDefined();
      expect(command.name()).toBe("feedback");
    });
  });
});
