/**
 * Task Manager - Core Types and Interfaces
 *
 * Defines the core data structures for the Task Manager module.
 */

// =============================================================================
// Enums
// =============================================================================

/**
 * Priority levels for tasks.
 */
export enum Priority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Status values for task lifecycle.
 */
export enum TaskStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

// =============================================================================
// Interfaces
// =============================================================================

/**
 * Core Task entity.
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: Date | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new task.
 */
export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: Date | null;
  tags?: string[];
}

/**
 * Input for updating an existing task.
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: Date | null;
  tags?: string[];
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Checks if a value is a valid Priority enum value.
 */
export function isValidPriority(value: unknown): value is Priority {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Object.values(Priority).includes(value)
  );
}

/**
 * Checks if a value is a valid TaskStatus enum value.
 */
export function isValidTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && Object.values(TaskStatus).includes(value);
}

/**
 * Checks if a value is a valid Task object.
 */
export function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const task = value as Task;

  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.description === "string" &&
    isValidPriority(task.priority) &&
    isValidTaskStatus(task.status) &&
    Array.isArray(task.tags) &&
    task.tags.every((tag) => typeof tag === "string") &&
    isValidDate(task.createdAt) &&
    isValidDate(task.updatedAt) &&
    (task.dueDate === null || isValidDate(task.dueDate))
  );
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
