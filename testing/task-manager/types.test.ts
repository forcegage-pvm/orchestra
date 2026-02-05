import { describe, expect, it } from "vitest";

import {
  Priority,
  TaskStatus,
  isValidPriority,
  isValidTaskStatus,
  isTask,
} from "./types";

describe("isValidPriority", () => {
  it("accepts valid enum numeric values", () => {
    expect(isValidPriority(Priority.LOW)).toBe(true);
    expect(isValidPriority(Priority.MEDIUM)).toBe(true);
    expect(isValidPriority(Priority.HIGH)).toBe(true);
    expect(isValidPriority(Priority.CRITICAL)).toBe(true);
  });

  it("rejects out-of-range and non-integer numbers", () => {
    expect(isValidPriority(4)).toBe(false);
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(1.5)).toBe(false);
    expect(isValidPriority(NaN)).toBe(false);
  });

  it("rejects non-number types", () => {
    expect(isValidPriority("1")).toBe(false as any);
    expect(isValidPriority(null)).toBe(false as any);
    expect(isValidPriority(undefined)).toBe(false as any);
    expect(isValidPriority({})).toBe(false as any);
  });
});

describe("isValidTaskStatus", () => {
  it("accepts valid enum string values", () => {
    expect(isValidTaskStatus(TaskStatus.PENDING)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(isValidTaskStatus(TaskStatus.CANCELLED)).toBe(true);
  });

  it("rejects unknown strings and non-string types", () => {
    expect(isValidTaskStatus("pending")).toBe(false as any);
    expect(isValidTaskStatus("DONE")).toBe(false as any);
    expect(isValidTaskStatus(0 as any)).toBe(false as any);
    expect(isValidTaskStatus(null)).toBe(false as any);
  });
});

describe("isTask", () => {
  const now = new Date();

  it("validates a well-formed Task object", () => {
    const task = {
      id: "task-1",
      title: "Test task",
      description: "A task for testing",
      priority: Priority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      dueDate: new Date("2023-01-01T00:00:00.000Z"),
      tags: ["foo", "bar"],
      createdAt: now,
      updatedAt: now,
    };

    expect(isTask(task)).toBe(true);
  });

  it("accepts null dueDate", () => {
    const task = {
      id: "task-2",
      title: "No due date",
      description: "",
      priority: Priority.LOW,
      status: TaskStatus.PENDING,
      dueDate: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };

    expect(isTask(task)).toBe(true);
  });

  it("rejects when required fields are missing or wrong types", () => {
    const missingId = {
      // id missing
      title: "Missing id",
      description: "",
      priority: Priority.LOW,
      status: TaskStatus.PENDING,
      dueDate: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as any;

    expect(isTask(missingId)).toBe(false);

    const badTags = {
      id: "task-3",
      title: "Bad tags",
      description: "",
      priority: Priority.LOW,
      status: TaskStatus.PENDING,
      dueDate: null,
      tags: ["ok", 2],
      createdAt: now,
      updatedAt: now,
    } as any;

    expect(isTask(badTags)).toBe(false);

    const missingUpdatedAt = {
      id: "task-4",
      title: "Missing updatedAt",
      description: "",
      priority: Priority.LOW,
      status: TaskStatus.PENDING,
      dueDate: null,
      tags: [],
      createdAt: now,
      // updatedAt missing
    } as any;

    expect(isTask(missingUpdatedAt)).toBe(false);
  });

  it("rejects invalid dates", () => {
    const invalidCreatedAt = {
      id: "task-5",
      title: "Invalid createdAt",
      description: "",
      priority: Priority.LOW,
      status: TaskStatus.PENDING,
      dueDate: null,
      tags: [],
      createdAt: new Date("invalid"),
      updatedAt: now,
    } as any;

    expect(isTask(invalidCreatedAt)).toBe(false);

    const invalidDueDate = {
      id: "task-6",
      title: "Invalid dueDate",
      description: "",
      priority: Priority.LOW,
      status: TaskStatus.PENDING,
      dueDate: new Date("invalid"),
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as any;

    expect(isTask(invalidDueDate)).toBe(false);
  });

  it("rejects invalid priority and status values", () => {
    const badPriority = {
      id: "task-7",
      title: "Bad priority",
      description: "",
      priority: 1.5,
      status: TaskStatus.PENDING,
      dueDate: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as any;

    expect(isTask(badPriority)).toBe(false);

    const badStatus = {
      id: "task-8",
      title: "Bad status",
      description: "",
      priority: Priority.LOW,
      status: "DONE",
      dueDate: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as any;

    expect(isTask(badStatus)).toBe(false);
  });
});
