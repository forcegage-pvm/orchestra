import { describe, expect, it } from "vitest";

import {
  isTask,
  isValidPriority,
  isValidTaskStatus,
  Priority,
  Task,
  TaskStatus,
} from "./types";

describe("isValidPriority", () => {
  it("accepts valid enum values", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("rejects non-integers and out-of-range values", () => {
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(4)).toBe(false);
    expect(isValidPriority(1.5)).toBe(false);
    expect(isValidPriority("1")).toBe(false);
    expect(isValidPriority(Number.NaN)).toBe(false);
    expect(isValidPriority(null)).toBe(false);
  });
});

describe("isValidTaskStatus", () => {
  it("accepts valid status values", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("rejects invalid or non-string values", () => {
    expect(isValidTaskStatus("DONE")).toBe(false);
    expect(isValidTaskStatus(1)).toBe(false);
    expect(isValidTaskStatus(null)).toBe(false);
  });
});

describe("isTask", () => {
  const baseTask: Task = {
    id: "task-1",
    title: "Test task",
    description: "Test description",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: new Date("2030-01-01"),
    tags: ["work", "urgent"],
    createdAt: new Date("2023-01-01"),
    updatedAt: new Date("2023-01-02"),
  };

  it("accepts a valid task", () => {
    expect(isTask(baseTask)).toBe(true);
  });

  it("rejects non-object inputs", () => {
    expect(isTask(null)).toBe(false);
    expect(isTask("task")).toBe(false);
    expect(isTask(123)).toBe(false);
  });

  it("rejects missing or invalid fields", () => {
    expect(isTask({ ...baseTask, id: 123 })).toBe(false);
    expect(isTask({ ...baseTask, title: 123 })).toBe(false);
    expect(isTask({ ...baseTask, description: 123 })).toBe(false);
    expect(isTask({ ...baseTask, priority: 5 })).toBe(false);
    expect(isTask({ ...baseTask, status: "DONE" })).toBe(false);
    expect(isTask({ ...baseTask, tags: "tag" })).toBe(false);
    expect(isTask({ ...baseTask, tags: ["ok", 1] })).toBe(false);
    expect(isTask({ ...baseTask, createdAt: "2023-01-01" })).toBe(false);
    expect(isTask({ ...baseTask, updatedAt: "2023-01-02" })).toBe(false);
    expect(isTask({ ...baseTask, dueDate: "2030-01-01" })).toBe(false);
  });

  it("accepts null dueDate", () => {
    expect(isTask({ ...baseTask, dueDate: null })).toBe(true);
  });

  it("rejects invalid Date instances", () => {
    const invalidDate = new Date("invalid");

    expect(isTask({ ...baseTask, createdAt: invalidDate })).toBe(false);
    expect(isTask({ ...baseTask, updatedAt: invalidDate })).toBe(false);
    expect(isTask({ ...baseTask, dueDate: invalidDate })).toBe(false);
  });
});
