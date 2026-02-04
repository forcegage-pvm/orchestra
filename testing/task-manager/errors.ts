/**
 * Task Manager - Custom Error Classes
 */

export class ValidationError extends Error {
  public readonly field: string;
  public readonly value: unknown;

  constructor(message: string, field: string, value: unknown) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TaskNotFoundError extends Error {
  public readonly taskId: string;

  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = "TaskNotFoundError";
    this.taskId = taskId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DuplicateTaskError extends Error {
  public readonly taskId: string;

  constructor(taskId: string) {
    super(`Task already exists: ${taskId}`);
    this.name = "DuplicateTaskError";
    this.taskId = taskId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
