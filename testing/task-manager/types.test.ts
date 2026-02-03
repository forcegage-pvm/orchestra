import { describe, expect, it } from "vitest";

import {
  isTask,
  isValidPriority,
  isValidTaskStatus,
  Priority,
  TaskStatus,
} from "./types";

describe("isValidPriority", () => {
  it("accepts valid enum values", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(4)).toBe(false);
    expect(isValidPriority(1.5)).toBe(false);
    expect(isValidPriority("HIGH")).toBe(false);
    expect(isValidPriority(null)).toBe(false);
  });
});

describe("isValidTaskStatus", () => {
  it("accepts valid enum values", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isValidTaskStatus("WAITING")).toBe(false);
    expect(isValidTaskStatus("pending")).toBe(false);
    expect(isValidTaskStatus(0)).toBe(false);
    expect(isValidTaskStatus(null)).toBe(false);
  });
});

describe("isTask", () => {
  const baseTask = {
    id: "task-1",
    title: "Test task",
    description: "Check task guards",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: new Date("2030-01-01T00:00:00.000Z"),
    tags: ["a", "b"],
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  };

  it("accepts valid task objects", () => {
    expect(isTask(baseTask)).toBe(true);
    expect(isTask({ ...baseTask, dueDate: null })).toBe(true);
  });

  it("rejects non-object values", () => {
    expect(isTask(null)).toBe(false);
    expect(isTask("task")).toBe(false);
  });

  it("rejects tasks with missing fields", () => {
    const { title, ...withoutTitle } = baseTask;

    expect(isTask(withoutTitle)).toBe(false);
  });

  it("rejects tasks with invalid priority or status", () => {
    expect(isTask({ ...baseTask, priority: 10 })).toBe(false);
    expect(isTask({ ...baseTask, status: "DONE" })).toBe(false);
  });

  it("rejects tasks with invalid tags", () => {
    expect(isTask({ ...baseTask, tags: "tag" })).toBe(false);
    expect(isTask({ ...baseTask, tags: ["valid", 3] })).toBe(false);
  });

  it("rejects tasks with invalid dates", () => {
    expect(isTask({ ...baseTask, createdAt: new Date("invalid") })).toBe(false);
    expect(isTask({ ...baseTask, updatedAt: new Date("invalid") })).toBe(false);
    expect(isTask({ ...baseTask, dueDate: new Date("invalid") })).toBe(false);
    expect(isTask({ ...baseTask, dueDate: "2024-01-01" })).toBe(false);
  });
});
