/**
 * Core Types Tests
 */

import { describe, expect, it } from "vitest";
import {
  TaskSchema,
  TaskStatusSchema,
  type Task,
  type TaskStatus,
} from "../src/core/types.js";

describe("TaskStatusSchema", () => {
  it("should validate valid status values", () => {
    const validStatuses: TaskStatus[] = [
      "pending",
      "in-progress",
      "completed",
      "blocked",
      "skipped",
    ];

    for (const status of validStatuses) {
      expect(() => TaskStatusSchema.parse(status)).not.toThrow();
    }
  });

  it("should reject invalid status values", () => {
    expect(() => TaskStatusSchema.parse("invalid")).toThrow();
    expect(() => TaskStatusSchema.parse("")).toThrow();
    expect(() => TaskStatusSchema.parse(123)).toThrow();
  });
});

describe("TaskSchema", () => {
  it("should validate a minimal valid task", () => {
    const minimalTask = {
      id: "task-1",
      title: "Test Task",
      description: "A test task",
      status: "pending",
    };

    const result = TaskSchema.parse(minimalTask);
    expect(result.id).toBe("task-1");
    expect(result.title).toBe("Test Task");
    expect(result.status).toBe("pending");
  });

  it("should validate a complete task", () => {
    const completeTask: Task = {
      id: "task-1",
      title: "Complete Task",
      description: "A complete test task",
      status: "in-progress",
      priority: "high",
      dependencies: ["task-0"],
      verification: [
        {
          type: "file-exists",
          path: "src/test.ts",
        },
      ],
      files: {
        create: ["src/new.ts"],
        modify: ["src/existing.ts"],
        delete: ["src/old.ts"],
      },
      acceptanceCriteria: ["Code compiles", "Tests pass"],
      estimatedEffort: "medium",
      assignee: "ai-agent",
      tags: ["core", "setup"],
    };

    const result = TaskSchema.parse(completeTask);
    expect(result.id).toBe("task-1");
    expect(result.priority).toBe("high");
    expect(result.dependencies).toHaveLength(1);
    expect(result.verification).toHaveLength(1);
  });

  it("should reject task without required fields", () => {
    expect(() => TaskSchema.parse({})).toThrow();
    expect(() => TaskSchema.parse({ id: "task-1" })).toThrow();
    expect(() => TaskSchema.parse({ id: "task-1", title: "Test" })).toThrow();
  });
});
