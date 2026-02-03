import { describe, expect, it } from "vitest";
import {
  isTask,
  isValidPriority,
  isValidTaskStatus,
  Priority,
  TaskStatus,
  type Task,
} from "./types.js";

describe("isValidPriority", () => {
  it("returns true for all Priority enum values", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("returns false for non-priority values", () => {
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(4)).toBe(false);
    expect(isValidPriority(1.5)).toBe(false);
    expect(isValidPriority("LOW")).toBe(false);
    expect(isValidPriority(null)).toBe(false);
  });
});

describe("isValidTaskStatus", () => {
  it("returns true for all TaskStatus enum values", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("returns false for non-status values", () => {
    expect(isValidTaskStatus("pending")).toBe(false);
    expect(isValidTaskStatus("DONE")).toBe(false);
    expect(isValidTaskStatus(1)).toBe(false);
    expect(isValidTaskStatus(null)).toBe(false);
    expect(isValidTaskStatus({})).toBe(false);
  });
});

describe("isTask", () => {
  const baseTask: Task = {
    id: "task-1",
    title: "Write tests",
    description: "Add coverage for type guards",
    priority: Priority.HIGH,
    status: TaskStatus.IN_PROGRESS,
    dueDate: new Date("2024-01-01T00:00:00Z"),
    tags: ["testing", "type-guards"],
    createdAt: new Date("2023-12-01T00:00:00Z"),
    updatedAt: new Date("2023-12-02T00:00:00Z"),
  };

  it("returns true for a valid Task object", () => {
    expect(isTask(baseTask)).toBe(true);
  });

  it("returns true when dueDate is null", () => {
    expect(isTask({ ...baseTask, dueDate: null })).toBe(true);
  });

  it("returns false for non-object inputs", () => {
    expect(isTask(null)).toBe(false);
    expect(isTask(undefined)).toBe(false);
    expect(isTask("task")).toBe(false);
    expect(isTask(123)).toBe(false);
  });

  it("returns false when required fields are missing", () => {
    const { title, ...missingTitle } = baseTask;
    expect(isTask(missingTitle)).toBe(false);
  });

  it("returns false for invalid priority or status", () => {
    expect(isTask({ ...baseTask, priority: 99 })).toBe(false);
    expect(isTask({ ...baseTask, status: "DONE" })).toBe(false);
  });

  it("returns false for invalid tags", () => {
    expect(isTask({ ...baseTask, tags: ["ok", 2] })).toBe(false);
    expect(isTask({ ...baseTask, tags: "tag" })).toBe(false);
  });

  it("returns false for invalid dates", () => {
    expect(isTask({ ...baseTask, createdAt: "2024-01-01" })).toBe(false);
    expect(isTask({ ...baseTask, updatedAt: new Date("invalid") })).toBe(false);
    expect(isTask({ ...baseTask, dueDate: "2024-01-01" })).toBe(false);
  });
});
