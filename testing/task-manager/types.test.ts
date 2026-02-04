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
  it("accepts all Priority enum values", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("rejects values outside valid range", () => {
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(4)).toBe(false);
  });

  it("rejects non-integer and non-numeric values", () => {
    expect(isValidPriority(1.5)).toBe(false);
    expect(isValidPriority(Number.NaN)).toBe(false);
    expect(isValidPriority("HIGH")).toBe(false);
    expect(isValidPriority(null)).toBe(false);
    expect(isValidPriority(undefined)).toBe(false);
  });
});

describe("isValidTaskStatus", () => {
  it("accepts all TaskStatus enum values", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("rejects invalid status values", () => {
    expect(isValidTaskStatus("DONE")).toBe(false);
    expect(isValidTaskStatus(0)).toBe(false);
    expect(isValidTaskStatus({ status: "PENDING" })).toBe(false);
    expect(isValidTaskStatus(null)).toBe(false);
    expect(isValidTaskStatus(undefined)).toBe(false);
  });
});

describe("isTask", () => {
  const buildTask = (overrides: Partial<Task> = {}): Task => ({
    id: "task-1",
    title: "Write tests",
    description: "Ensure coverage",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: new Date("2030-01-01T00:00:00Z"),
    tags: ["qa", "vitest"],
    createdAt: new Date("2029-12-31T00:00:00Z"),
    updatedAt: new Date("2029-12-31T01:00:00Z"),
    ...overrides,
  });

  it("accepts a valid Task object", () => {
    expect(isTask(buildTask())).toBe(true);
    expect(isTask(buildTask({ dueDate: null }))).toBe(true);
  });

  it("rejects non-object values", () => {
    expect(isTask("task")).toBe(false);
    expect(isTask(null)).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { id, ...rest } = buildTask();
    const { title, ...missingTitle } = buildTask();

    expect(isTask(rest)).toBe(false);
    expect(isTask(missingTitle)).toBe(false);
  });

  it("rejects invalid priority and status values", () => {
    expect(isTask(buildTask({ priority: 5 as Priority }))).toBe(false);
    expect(isTask(buildTask({ status: "DONE" as TaskStatus }))).toBe(false);
  });

  it("rejects invalid date values", () => {
    expect(isTask(buildTask({ createdAt: new Date("invalid") }))).toBe(false);
    expect(
      isTask(buildTask({ updatedAt: "2029-12-31" as unknown as Date }))
    ).toBe(false);
    expect(isTask(buildTask({ dueDate: new Date("invalid") }))).toBe(false);
    expect(
      isTask(buildTask({ dueDate: "soon" as unknown as Date }))
    ).toBe(false);
  });

  it("rejects invalid tag values", () => {
    expect(isTask(buildTask({ tags: "qa" as unknown as string[] }))).toBe(false);
    expect(
      isTask(buildTask({ tags: ["qa", 42] as unknown as string[] }))
    ).toBe(false);
  });
});
