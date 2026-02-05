import { describe, expect, it } from "vitest";

import {
  Priority,
  TaskStatus,
  isValidPriority,
  isValidTaskStatus,
  isTask,
} from "./types";

function makeValidTask() {
  return {
    id: "task-1",
    title: "Test Task",
    description: "A task for testing",
    priority: Priority.MEDIUM,
    status: TaskStatus.PENDING,
    dueDate: new Date("2099-12-31"),
    tags: ["testing", "task"],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;
}

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
    expect(isValidPriority(NaN)).toBe(false);
    expect(isValidPriority("HIGH")).toBe(false);
    expect(isValidPriority(null)).toBe(false);
    expect(isValidPriority(undefined)).toBe(false);
  });
});

describe("isValidTaskStatus", () => {
  it("accepts valid statuses", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("rejects invalid statuses", () => {
    expect(isValidTaskStatus("pending")).toBe(false);
    expect(isValidTaskStatus("DONE")).toBe(false);
    expect(isValidTaskStatus(0 as any)).toBe(false);
    expect(isValidTaskStatus(null)).toBe(false);
    expect(isValidTaskStatus(undefined)).toBe(false);
  });
});

describe("isTask", () => {
  it("accepts a valid task object", () => {
    const task = makeValidTask();
    expect(isTask(task)).toBe(true);
  });

  it("accepts null dueDate", () => {
    const task = { ...makeValidTask(), dueDate: null };
    expect(isTask(task)).toBe(true);
  });

  it("rejects when id is missing or wrong type", () => {
    const t1: any = { ...makeValidTask(), id: 123 };
    const t2: any = { ...makeValidTask() };
    delete t2.id;

    expect(isTask(t1)).toBe(false);
    expect(isTask(t2)).toBe(false);
  });

  it("rejects when title/description are wrong types", () => {
    const t1: any = { ...makeValidTask(), title: 10 };
    const t2: any = { ...makeValidTask(), description: null };

    expect(isTask(t1)).toBe(false);
    expect(isTask(t2)).toBe(false);
  });

  it("rejects invalid priority/status", () => {
    const t1: any = { ...makeValidTask(), priority: 99 };
    const t2: any = { ...makeValidTask(), status: "DONE" };

    expect(isTask(t1)).toBe(false);
    expect(isTask(t2)).toBe(false);
  });

  it("rejects invalid tags", () => {
    const t1: any = { ...makeValidTask(), tags: "not-an-array" };
    const t2: any = { ...makeValidTask(), tags: ["ok", 2] };

    expect(isTask(t1)).toBe(false);
    expect(isTask(t2)).toBe(false);
  });

  it("rejects invalid dates", () => {
    const t1: any = { ...makeValidTask(), createdAt: "2020-01-01" };
    const t2: any = { ...makeValidTask(), updatedAt: new Date("invalid") };
    const t3: any = { ...makeValidTask(), dueDate: "2099-01-01" };

    expect(isTask(t1)).toBe(false);
    expect(isTask(t2)).toBe(false);
    expect(isTask(t3)).toBe(false);
  });
});
