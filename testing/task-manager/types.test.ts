import { describe, expect, it } from "vitest";

import {
  Priority,
  TaskStatus,
  isValidPriority,
  isValidTaskStatus,
  isTask,
} from "./types";

describe("isValidPriority", () => {
  it("returns true for all defined Priority enum values", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("returns false for invalid numbers and non-number types", () => {
    expect(isValidPriority(999)).toBe(false);
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority("HIGH" as any)).toBe(false);
    expect(isValidPriority(null)).toBe(false);
    expect(isValidPriority(undefined)).toBe(false);
  });
});

describe("isValidTaskStatus", () => {
  it("returns true for all defined TaskStatus values", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("returns false for invalid strings and non-string types", () => {
    expect(isValidTaskStatus("DONE" as any)).toBe(false);
    expect(isValidTaskStatus(123 as any)).toBe(false);
    expect(isValidTaskStatus(null)).toBe(false);
    expect(isValidTaskStatus(undefined)).toBe(false);
  });
});

function makeValidTask(overrides: Partial<any> = {}) {
  const now = new Date();
  const base = {
    id: "task-1",
    title: "Test Task",
    description: "A task for testing",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: null as Date | null,
    tags: ["test", "unit"],
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, ...overrides };
}

describe("isTask", () => {
  it("returns true for a valid Task object with null dueDate", () => {
    const t = makeValidTask();
    expect(isTask(t)).toBe(true);
  });

  it("returns true for a valid Task object with a Date dueDate", () => {
    const t = makeValidTask({ dueDate: new Date(Date.now() + 1000 * 60 * 60) });
    expect(isTask(t)).toBe(true);
  });

  it("rejects when id is not a string", () => {
    const t = makeValidTask({ id: 123 } as any);
    expect(isTask(t)).toBe(false);
  });

  it("rejects when tags contain non-string values", () => {
    const t = makeValidTask({ tags: ["ok", 123] } as any);
    expect(isTask(t)).toBe(false);
  });

  it("rejects when createdAt or updatedAt are invalid dates", () => {
    const t1 = makeValidTask({ createdAt: new Date("invalid") });
    const t2 = makeValidTask({ updatedAt: "2020-01-01" } as any);
    expect(isTask(t1)).toBe(false);
    expect(isTask(t2)).toBe(false);
  });

  it("rejects when priority or status are invalid", () => {
    const t1 = makeValidTask({ priority: 999 } as any);
    const t2 = makeValidTask({ status: "DONE" } as any);
    expect(isTask(t1)).toBe(false);
    expect(isTask(t2)).toBe(false);
  });

  it("rejects non-object and null values", () => {
    expect(isTask(null)).toBe(false);
    expect(isTask("not an object")).toBe(false);
  });
});
