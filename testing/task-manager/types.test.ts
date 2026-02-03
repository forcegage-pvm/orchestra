import { describe, expect, it } from "vitest";
import {
  Priority,
  TaskStatus,
  isTask,
  isValidPriority,
  isValidTaskStatus,
} from "./types.js";

describe("isValidPriority", () => {
  it("returns true for all Priority enum values", () => {
    const validValues = [
      Priority.LOW,
      Priority.MEDIUM,
      Priority.HIGH,
      Priority.CRITICAL,
    ];

    validValues.forEach((value) => {
      expect(isValidPriority(value)).toBe(true);
    });
  });

  it("returns false for invalid values", () => {
    const invalidValues = [-1, 4, "LOW", null, undefined];

    invalidValues.forEach((value) => {
      expect(isValidPriority(value)).toBe(false);
    });
  });
});

describe("isValidTaskStatus", () => {
  it("returns true for all TaskStatus enum values", () => {
    const validValues = [
      TaskStatus.PENDING,
      TaskStatus.IN_PROGRESS,
      TaskStatus.COMPLETED,
      TaskStatus.CANCELLED,
    ];

    validValues.forEach((value) => {
      expect(isValidTaskStatus(value)).toBe(true);
    });
  });

  it("returns false for invalid values", () => {
    const invalidValues = ["DONE", "", null, undefined];

    invalidValues.forEach((value) => {
      expect(isValidTaskStatus(value)).toBe(false);
    });
  });
});

describe("isTask", () => {
  const baseTask = {
    id: "task-1",
    title: "Write tests",
    description: "Add unit tests for type guards",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: new Date("2024-01-01T00:00:00.000Z"),
    tags: ["testing", "typescript"],
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  };

  it("returns true for a valid Task", () => {
    expect(isTask(baseTask)).toBe(true);
  });

  it("returns true when dueDate is null", () => {
    expect(isTask({ ...baseTask, dueDate: null })).toBe(true);
  });

  it("returns false when required fields are missing", () => {
    const missingTitle = { ...baseTask, title: undefined };
    const missingPriority = { ...baseTask, priority: undefined };
    const missingStatus = { ...baseTask, status: undefined };

    expect(isTask(missingTitle)).toBe(false);
    expect(isTask(missingPriority)).toBe(false);
    expect(isTask(missingStatus)).toBe(false);
  });

  it("returns false for invalid field types", () => {
    const invalidId = { ...baseTask, id: 123 };
    const invalidPriority = { ...baseTask, priority: "HIGH" };
    const invalidStatus = { ...baseTask, status: "DONE" };
    const invalidTags = { ...baseTask, tags: ["ok", 42] };
    const invalidCreatedAt = { ...baseTask, createdAt: "2024-01-01" };
    const invalidUpdatedAt = { ...baseTask, updatedAt: "2024-01-02" };
    const invalidDueDate = { ...baseTask, dueDate: "2024-01-03" };

    expect(isTask(invalidId)).toBe(false);
    expect(isTask(invalidPriority)).toBe(false);
    expect(isTask(invalidStatus)).toBe(false);
    expect(isTask(invalidTags)).toBe(false);
    expect(isTask(invalidCreatedAt)).toBe(false);
    expect(isTask(invalidUpdatedAt)).toBe(false);
    expect(isTask(invalidDueDate)).toBe(false);
  });
});
