import { describe, expect, it } from "vitest";

import {
  DuplicateTaskError,
  TaskNotFoundError,
  ValidationError,
} from "./errors";

describe("ValidationError", () => {
  it("sets message, name, field, and value", () => {
    const error = new ValidationError("Invalid title", "title", "");

    expect(error.message).toBe("Invalid title");
    expect(error.name).toBe("ValidationError");
    expect(error.field).toBe("title");
    expect(error.value).toBe("");
  });

  it("preserves instanceof checks", () => {
    const error = new ValidationError("Invalid priority", "priority", 4);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("TaskNotFoundError", () => {
  it("sets message, name, and taskId", () => {
    const error = new TaskNotFoundError("task-42");

    expect(error.message).toBe("Task not found: task-42");
    expect(error.name).toBe("TaskNotFoundError");
    expect(error.taskId).toBe("task-42");
  });

  it("preserves instanceof checks", () => {
    const error = new TaskNotFoundError("task-43");

    expect(error).toBeInstanceOf(TaskNotFoundError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("DuplicateTaskError", () => {
  it("sets message, name, and taskId", () => {
    const error = new DuplicateTaskError("task-7");

    expect(error.message).toBe("Task already exists: task-7");
    expect(error.name).toBe("DuplicateTaskError");
    expect(error.taskId).toBe("task-7");
  });

  it("preserves instanceof checks", () => {
    const error = new DuplicateTaskError("task-8");

    expect(error).toBeInstanceOf(DuplicateTaskError);
    expect(error).toBeInstanceOf(Error);
  });
});
