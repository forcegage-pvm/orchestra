import { describe, expect, it } from "vitest";

import {
  Priority,
  TaskStatus,
  isTask,
  isValidPriority,
  isValidTaskStatus,
} from "./types.js";
import type { Task } from "./types.js";
// =============================================================================
// Helpers
// =============================================================================

/** Builds a valid Task object for testing. Override individual fields as needed. */
function makeValidTask(overrides: Partial<Record<keyof Task, unknown>> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: "task-1",
    title: "Test Task",
    description: "A test task description",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: null,
    tags: ["test", "unit"],
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-02T00:00:00Z"),
  };
  return { ...base, ...overrides };
}

// =============================================================================
// isValidPriority
// =============================================================================

describe("isValidPriority", () => {
  describe("valid Priority enum values", () => {
    it("returns true for Priority.LOW (0)", () => {
      expect(isValidPriority(Priority.LOW)).toBe(true);
    });

    it("returns true for Priority.MEDIUM (1)", () => {
      expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    });

    it("returns true for Priority.HIGH (2)", () => {
      expect(isValidPriority(Priority.HIGH)).toBe(true);
    });

    it("returns true for Priority.CRITICAL (3)", () => {
      expect(isValidPriority(Priority.CRITICAL)).toBe(true);
    });

    it("returns true for numeric literal 0", () => {
      expect(isValidPriority(0)).toBe(true);
    });

    it("returns true for numeric literal 3", () => {
      expect(isValidPriority(3)).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("returns false for negative numbers", () => {
      expect(isValidPriority(-1)).toBe(false);
      expect(isValidPriority(-100)).toBe(false);
    });

    it("returns false for numbers greater than 3", () => {
      expect(isValidPriority(4)).toBe(false);
      expect(isValidPriority(5)).toBe(false);
      expect(isValidPriority(999)).toBe(false);
    });

    it("returns false for non-integer numbers", () => {
      expect(isValidPriority(1.5)).toBe(false);
      expect(isValidPriority(0.1)).toBe(false);
      expect(isValidPriority(2.999)).toBe(false);
    });

    it("returns false for strings", () => {
      expect(isValidPriority("0")).toBe(false);
      expect(isValidPriority("LOW")).toBe(false);
      expect(isValidPriority("MEDIUM")).toBe(false);
      expect(isValidPriority("")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isValidPriority(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isValidPriority(undefined)).toBe(false);
    });

    it("returns false for booleans", () => {
      expect(isValidPriority(true)).toBe(false);
      expect(isValidPriority(false)).toBe(false);
    });

    it("returns false for objects", () => {
      expect(isValidPriority({})).toBe(false);
      expect(isValidPriority({ value: 1 })).toBe(false);
    });

    it("returns false for arrays", () => {
      expect(isValidPriority([])).toBe(false);
      expect(isValidPriority([1])).toBe(false);
    });

    it("returns false for NaN", () => {
      expect(isValidPriority(NaN)).toBe(false);
    });

    it("returns false for Infinity", () => {
      expect(isValidPriority(Infinity)).toBe(false);
      expect(isValidPriority(-Infinity)).toBe(false);
    });
  });
});

// =============================================================================
// isValidTaskStatus
// =============================================================================

describe("isValidTaskStatus", () => {
  describe("valid TaskStatus enum values", () => {
    it("returns true for TaskStatus.PENDING", () => {
      expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    });

    it("returns true for TaskStatus.IN_PROGRESS", () => {
      expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    });

    it("returns true for TaskStatus.COMPLETED", () => {
      expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    });

    it("returns true for TaskStatus.CANCELLED", () => {
      expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
    });

    it("returns true for string literal 'PENDING'", () => {
      expect(isValidTaskStatus("PENDING")).toBe(true);
    });

    it("returns true for string literal 'IN_PROGRESS'", () => {
      expect(isValidTaskStatus("IN_PROGRESS")).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("returns false for invalid strings", () => {
      expect(isValidTaskStatus("DONE")).toBe(false);
      expect(isValidTaskStatus("ACTIVE")).toBe(false);
      expect(isValidTaskStatus("STARTED")).toBe(false);
    });

    it("returns false for wrong-case strings", () => {
      expect(isValidTaskStatus("pending")).toBe(false);
      expect(isValidTaskStatus("in_progress")).toBe(false);
      expect(isValidTaskStatus("Completed")).toBe(false);
      expect(isValidTaskStatus("cancelled")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidTaskStatus("")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isValidTaskStatus(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isValidTaskStatus(undefined)).toBe(false);
    });

    it("returns false for numbers", () => {
      expect(isValidTaskStatus(0)).toBe(false);
      expect(isValidTaskStatus(1)).toBe(false);
    });

    it("returns false for booleans", () => {
      expect(isValidTaskStatus(true)).toBe(false);
      expect(isValidTaskStatus(false)).toBe(false);
    });

    it("returns false for objects", () => {
      expect(isValidTaskStatus({})).toBe(false);
      expect(isValidTaskStatus({ status: "PENDING" })).toBe(false);
    });

    it("returns false for arrays", () => {
      expect(isValidTaskStatus([])).toBe(false);
      expect(isValidTaskStatus(["PENDING"])).toBe(false);
    });
  });
});

// =============================================================================
// isTask
// =============================================================================

describe("isTask", () => {
  describe("valid Task objects", () => {
    it("returns true for a fully valid Task object", () => {
      const task = makeValidTask();
      expect(isTask(task)).toBe(true);
    });

    it("returns true when dueDate is null", () => {
      const task = makeValidTask({ dueDate: null });
      expect(isTask(task)).toBe(true);
    });

    it("returns true when dueDate is a valid Date", () => {
      const task = makeValidTask({ dueDate: new Date("2025-06-01T00:00:00Z") });
      expect(isTask(task)).toBe(true);
    });

    it("returns true with empty tags array", () => {
      const task = makeValidTask({ tags: [] });
      expect(isTask(task)).toBe(true);
    });

    it("returns true with all Priority values", () => {
      for (const priority of [Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL]) {
        const task = makeValidTask({ priority });
        expect(isTask(task)).toBe(true);
      }
    });

    it("returns true with all TaskStatus values", () => {
      for (const status of [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.CANCELLED]) {
        const task = makeValidTask({ status });
        expect(isTask(task)).toBe(true);
      }
    });
  });

  describe("null, undefined, and primitives", () => {
    it("returns false for null", () => {
      expect(isTask(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isTask(undefined)).toBe(false);
    });

    it("returns false for a string", () => {
      expect(isTask("task")).toBe(false);
    });

    it("returns false for a number", () => {
      expect(isTask(42)).toBe(false);
    });

    it("returns false for a boolean", () => {
      expect(isTask(true)).toBe(false);
    });
  });

  describe("missing required fields", () => {
    const requiredFields: (keyof Task)[] = [
      "id",
      "title",
      "description",
      "priority",
      "status",
      "dueDate",
      "tags",
      "createdAt",
      "updatedAt",
    ];

    for (const field of requiredFields) {
      it(`returns false when '${field}' is missing`, () => {
        const task = makeValidTask();
        delete task[field];
        expect(isTask(task)).toBe(false);
      });
    }
  });

  describe("invalid field types", () => {
    it("returns false when id is a number instead of string", () => {
      expect(isTask(makeValidTask({ id: 123 }))).toBe(false);
    });

    it("returns false when title is a number instead of string", () => {
      expect(isTask(makeValidTask({ title: 456 }))).toBe(false);
    });

    it("returns false when description is a boolean instead of string", () => {
      expect(isTask(makeValidTask({ description: true }))).toBe(false);
    });

    it("returns false when priority is a string instead of number", () => {
      expect(isTask(makeValidTask({ priority: "HIGH" }))).toBe(false);
    });

    it("returns false when priority is an invalid number", () => {
      expect(isTask(makeValidTask({ priority: 99 }))).toBe(false);
    });

    it("returns false when status is a number instead of string", () => {
      expect(isTask(makeValidTask({ status: 0 }))).toBe(false);
    });

    it("returns false when status is an invalid string", () => {
      expect(isTask(makeValidTask({ status: "DONE" }))).toBe(false);
    });

    it("returns false when tags is a string instead of array", () => {
      expect(isTask(makeValidTask({ tags: "test" }))).toBe(false);
    });

    it("returns false when tags contains non-string elements", () => {
      expect(isTask(makeValidTask({ tags: [1, 2, 3] }))).toBe(false);
    });

    it("returns false when tags contains mixed types", () => {
      expect(isTask(makeValidTask({ tags: ["valid", 42] }))).toBe(false);
    });

    it("returns false when createdAt is a string instead of Date", () => {
      expect(isTask(makeValidTask({ createdAt: "2024-01-01" }))).toBe(false);
    });

    it("returns false when updatedAt is a number instead of Date", () => {
      expect(isTask(makeValidTask({ updatedAt: 1704067200000 }))).toBe(false);
    });

    it("returns false when createdAt is an invalid Date", () => {
      expect(isTask(makeValidTask({ createdAt: new Date("invalid") }))).toBe(false);
    });

    it("returns false when updatedAt is an invalid Date", () => {
      expect(isTask(makeValidTask({ updatedAt: new Date("not-a-date") }))).toBe(false);
    });

    it("returns false when dueDate is a string instead of Date or null", () => {
      expect(isTask(makeValidTask({ dueDate: "2024-12-31" }))).toBe(false);
    });

    it("returns false when dueDate is an invalid Date", () => {
      expect(isTask(makeValidTask({ dueDate: new Date("invalid") }))).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for an empty object", () => {
      expect(isTask({})).toBe(false);
    });

    it("returns false for an array", () => {
      expect(isTask([])).toBe(false);
    });

    it("returns true for a Task with extra properties", () => {
      const task = makeValidTask();
      (task as Record<string, unknown>)["extraField"] = "extra";
      expect(isTask(task)).toBe(true);
    });
  });
});
