import { describe, expect, it } from "vitest";

import {
  isTask,
  isValidPriority,
  isValidTaskStatus,
  Priority,
  TaskStatus,
} from "./types";

describe("isValidPriority", () => {
  it("returns true for all Priority enum values", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("returns false for negative numbers", () => {
    expect(isValidPriority(-1)).toBe(false);
  });

  it("returns false for numbers greater than 3", () => {
    expect(isValidPriority(4)).toBe(false);
  });

  it("returns false for strings", () => {
    expect(isValidPriority("LOW")).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isValidPriority(null)).toBe(false);
    expect(isValidPriority(undefined)).toBe(false);
  });
});

describe("isValidTaskStatus", () => {
  it("returns true for all TaskStatus enum values", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isValidTaskStatus("INVALID")).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isValidTaskStatus(null)).toBe(false);
    expect(isValidTaskStatus(undefined)).toBe(false);
  });
});

describe("isTask", () => {
  it("returns true for a fully valid Task object", () => {
    const now = new Date();

    const task = {
      id: "task-1",
      title: "Write tests",
      description: "Ensure type guards are covered",
      priority: Priority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      dueDate: null,
      tags: ["testing", "types"],
      createdAt: now,
      updatedAt: now,
    };

    expect(isTask(task)).toBe(true);
  });

  it("returns false for objects missing required fields", () => {
    const now = new Date();

    const taskMissingTitle = {
      id: "task-2",
      description: "Missing title",
      priority: Priority.LOW,
      status: TaskStatus.PENDING,
      dueDate: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };

    expect(isTask(taskMissingTitle)).toBe(false);
  });

  it("returns false for invalid field types", () => {
    const now = new Date();

    const taskWithInvalidTypes = {
      id: "task-3",
      title: "Invalid types",
      description: "Incorrect fields",
      priority: Priority.MEDIUM,
      status: TaskStatus.COMPLETED,
      dueDate: "2024-01-01",
      tags: ["valid"],
      createdAt: now,
      updatedAt: now,
    };

    const taskWithInvalidDates = {
      id: "task-4",
      title: "Invalid dates",
      description: "Incorrect date fields",
      priority: Priority.MEDIUM,
      status: TaskStatus.COMPLETED,
      dueDate: null,
      tags: ["valid"],
      createdAt: "2024-01-01",
      updatedAt: now,
    };

    expect(isTask(taskWithInvalidTypes)).toBe(false);
    expect(isTask(taskWithInvalidDates)).toBe(false);
  });
});
