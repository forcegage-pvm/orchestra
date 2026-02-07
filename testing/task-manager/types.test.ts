import { describe, expect, it } from "vitest";

import {
  Priority,
  TaskStatus,
  isValidPriority,
  isValidTaskStatus,
  isTask,
} from "./types";

describe("isValidPriority", () => {
  it("returns true for all Priority enum values", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("returns false for invalid numeric values and non-number values", () => {
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(4)).toBe(false);
    expect(isValidPriority(1.5)).toBe(false);
    expect(isValidPriority(NaN)).toBe(false);
    expect(isValidPriority("1")).toBe(false as unknown as boolean);
    expect(isValidPriority(null)).toBe(false as unknown as boolean);
    expect(isValidPriority(undefined)).toBe(false as unknown as boolean);
    expect(isValidPriority({})).toBe(false as unknown as boolean);
  });
});

describe("isValidTaskStatus", () => {
  it("returns true for all TaskStatus enum values", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("returns false for invalid strings and non-strings", () => {
    expect(isValidTaskStatus("pending")).toBe(false);
    expect(isValidTaskStatus("")) .toBe(false);
    expect(isValidTaskStatus("DONE")).toBe(false);
    expect(isValidTaskStatus(null)).toBe(false as unknown as boolean);
    expect(isValidTaskStatus(undefined)).toBe(false as unknown as boolean);
    expect(isValidTaskStatus(123)).toBe(false as unknown as boolean);
  });
});

describe("isTask", () => {
  const baseTask = {
    id: "task-1",
    title: "Test task",
    description: "A task for testing",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: null,
    tags: ["testing", "unit"],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("validates a well-formed Task object", () => {
    expect(isTask(baseTask)).toBe(true);
  });

  it("rejects when required fields are missing or of wrong type", () => {
    expect(isTask(null)).toBe(false);
    expect(isTask(undefined)).toBe(false);
    expect(isTask(42)).toBe(false);

    const missingId = { ...baseTask } as any;
    delete missingId.id;
    expect(isTask(missingId)).toBe(false);

    const wrongIdType = { ...baseTask, id: 123 } as any;
    expect(isTask(wrongIdType)).toBe(false);

    const wrongTags = { ...baseTask, tags: ["ok", 1] } as any;
    expect(isTask(wrongTags)).toBe(false);

    const wrongPriority = { ...baseTask, priority: 99 } as any;
    expect(isTask(wrongPriority)).toBe(false);

    const wrongStatus = { ...baseTask, status: "DONE" } as any;
    expect(isTask(wrongStatus)).toBe(false);

    const invalidCreatedAt = { ...baseTask, createdAt: new Date("invalid") } as any;
    expect(isTask(invalidCreatedAt)).toBe(false);

    const invalidDueDate = { ...baseTask, dueDate: "2020-01-01" } as any;
    expect(isTask(invalidDueDate)).toBe(false);
  });
});
