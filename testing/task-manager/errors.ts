/**
 * Task Manager - Custom Error Classes
 *
 * STUB: Error classes are defined but need proper implementation.
 * The agent must ensure error classes work correctly with instanceof checks.
 */

// TODO: Implement ValidationError class
// - Must extend Error
// - Must have 'field' and 'value' readonly properties
// - Must set name to "ValidationError"
// - Constructor takes: message, field, value
export class ValidationError extends Error {
  public readonly field: string = "";
  public readonly value: unknown = undefined;

  constructor(_message: string, _field: string, _value: unknown) {
    super("Not implemented");
    this.name = "ValidationError";
  }
}

// TODO: Implement TaskNotFoundError class
// - Must extend Error
// - Must have 'taskId' readonly property
// - Must set name to "TaskNotFoundError"
// - Message format: "Task not found: {taskId}"
export class TaskNotFoundError extends Error {
  public readonly taskId: string = "";

  constructor(_taskId: string) {
    super("Not implemented");
    this.name = "TaskNotFoundError";
  }
}

// TODO: Implement DuplicateTaskError class
// - Must extend Error
// - Must have 'taskId' readonly property
// - Must set name to "DuplicateTaskError"
// - Message format: "Task already exists: {taskId}"
export class DuplicateTaskError extends Error {
  public readonly taskId: string = "";

  constructor(_taskId: string) {
    super("Not implemented");
    this.name = "DuplicateTaskError";
  }
}
