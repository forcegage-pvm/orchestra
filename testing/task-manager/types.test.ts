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
  it("returns true for each priority enum value", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("rejects non-integers and out-of-range values", () => {
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(4)).toBe(false);
    expect(isValidPriority(1.5)).toBe(false);
    expect(isValidPriority(NaN)).toBe(false);
  });

  it("rejects non-numeric values", () => {
    expect(isValidPriority("HIGH")).toBe(false);
    expect(isValidPriority(null)).toBe(false);
    expect(isValidPriority(undefined)).toBe(false);
  });
});

describe("isValidTaskStatus", () => {
  it("returns true for each task status enum value", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isValidTaskStatus("DONE")).toBe(false);
    expect(isValidTaskStatus(1)).toBe(false);
    expect(isValidTaskStatus(null)).toBe(false);
  });
});

describe("isTask", () => {
  const baseTask: Task = {
    id: "task-1",
    title: "Test task",
    description: "Check guard",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: new Date("2030-01-01T00:00:00Z"),
    tags: ["work", "urgent"],
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-02T00:00:00Z"),
  };

  it("accepts a valid task", () => {
    expect(isTask({ ...baseTask })).toBe(true);
  });

  it("accepts null dueDate", () => {
    expect(isTask({ ...baseTask, dueDate: null })).toBe(true);
  });

  it("rejects invalid enum values", () => {
    expect(isTask({ ...baseTask, priority: 99 })).toBe(false);
    expect(isTask({ ...baseTask, status: "DONE" })).toBe(false);
  });

  it("rejects invalid tags", () => {
    expect(isTask({ ...baseTask, tags: ["ok", 2] })).toBe(false);
    expect(isTask({ ...baseTask, tags: "single" })).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(isTask({ ...baseTask, dueDate: new Date("invalid") })).toBe(
      false
    );
    expect(isTask({ ...baseTask, createdAt: "2024-01-01" })).toBe(false);
    expect(isTask({ ...baseTask, updatedAt: new Date("invalid") })).toBe(
      false
    );
  });

  it("rejects non-object values", () => {
    expect(isTask(null)).toBe(false);
    expect(isTask("task")).toBe(false);
    expect(isTask(1)).toBe(false);
  });
});
