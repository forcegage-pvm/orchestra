// TR001 - Type Guard Tests
import { describe, expect, it } from "vitest";

import {
  Priority,
  TaskStatus,
  isValidPriority,
  isValidTaskStatus,
  isTask,
} from "./types";

describe("TR001 - isValidPriority", () => {
  it("accepts valid Priority enum values", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("rejects non-integers, out-of-range numbers, and non-number inputs", () => {
    expect(isValidPriority(1.5)).toBe(false);
    expect(isValidPriority(NaN)).toBe(false);
    expect(isValidPriority(Infinity)).toBe(false);
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(4)).toBe(false);
    expect(isValidPriority("1" as unknown)).toBe(false);
    expect(isValidPriority(null)).toBe(false);
    expect(isValidPriority(undefined)).toBe(false);
    expect(isValidPriority({})).toBe(false);
  });
});

describe("TR001 - isValidTaskStatus", () => {
  it("accepts all TaskStatus string values", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("rejects invalid strings and null/undefined", () => {
    expect(isValidTaskStatus("pending")).toBe(false);
    expect(isValidTaskStatus("")).toBe(false);
    expect(isValidTaskStatus("UNKNOWN")).toBe(false);
    expect(isValidTaskStatus(null)).toBe(false);
    expect(isValidTaskStatus(undefined)).toBe(false);
    expect(isValidTaskStatus(123 as unknown)).toBe(false);
  });
});

describe("TR001 - isTask", () => {
  const now = new Date();
  const validTask = {
    id: "task-1",
    title: "Do stuff",
    description: "Some work",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: new Date("2025-01-01"),
    tags: ["alpha", "beta"],
    createdAt: now,
    updatedAt: now,
  };

  it("returns true for a fully valid Task object", () => {
    expect(isTask(validTask)).toBe(true);
  });

  it("accepts null dueDate", () => {
    const t = { ...validTask, dueDate: null };
    expect(isTask(t)).toBe(true);
  });

  it("returns false for missing fields", () => {
    const { id, ...noId } = validTask as any;
    expect(isTask(noId)).toBe(false);

    const { title, ...noTitle } = validTask as any;
    expect(isTask(noTitle)).toBe(false);

    const { description, ...noDesc } = validTask as any;
    expect(isTask(noDesc)).toBe(false);
  });

  it("returns false for invalid field types", () => {
    expect(isTask({ ...validTask, id: 123 as any })).toBe(false);
    expect(isTask({ ...validTask, title: null as any })).toBe(false);
    expect(isTask({ ...validTask, description: 5 as any })).toBe(false);
  });

  it("validates priority and status enums", () => {
    expect(isTask({ ...validTask, priority: 99 as any })).toBe(false);
    expect(isTask({ ...validTask, status: "DONE" as any })).toBe(false);
  });

  it("validates dates and rejects invalid Date objects", () => {
    expect(isTask({ ...validTask, createdAt: new Date("invalid") })).toBe(false);
    expect(isTask({ ...validTask, updatedAt: "2020-01-01" as any })).toBe(false);
    expect(isTask({ ...validTask, dueDate: "2020-01-01" as any })).toBe(false);
  });

  it("validates tags array and contents", () => {
    expect(isTask({ ...validTask, tags: "not-an-array" as any })).toBe(false);
    expect(isTask({ ...validTask, tags: ["ok", 2 as any] })).toBe(false);
  });
});
