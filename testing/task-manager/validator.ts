/**
 * Task Manager - Input Validation Utilities
 */

import {
  CreateTaskInput,
  Priority,
  TaskStatus,
  UpdateTaskInput,
  isValidPriority,
  isValidTaskStatus,
} from "./types";
import { ValidationError } from "./errors";

const TITLE_REQUIRED_MESSAGE = "Title is required.";
const TITLE_MAX_LENGTH_MESSAGE = "Title must be at most 100 characters.";
const DESCRIPTION_MAX_LENGTH_MESSAGE =
  "Description must be at most 1000 characters.";
const TAGS_MAX_COUNT_MESSAGE = "Tags must not exceed 10.";
const TAG_EMPTY_MESSAGE = "Tags cannot be empty.";
const TAG_MAX_LENGTH_MESSAGE = "Tags must be at most 30 characters.";
const DUE_DATE_INVALID_MESSAGE = "Due date must be a valid date.";
const DUE_DATE_PAST_MESSAGE = "Due date must be today or in the future.";
const PRIORITY_INVALID_MESSAGE = "Priority must be a valid value.";
const STATUS_INVALID_MESSAGE = "Status must be a valid value.";

export function validateTitle(title: string): string {
  if (typeof title !== "string") {
    throw new ValidationError(TITLE_REQUIRED_MESSAGE, "title", title);
  }

  const trimmedTitle = title.trim();

  if (trimmedTitle.length === 0) {
    throw new ValidationError(TITLE_REQUIRED_MESSAGE, "title", title);
  }

  if (trimmedTitle.length > 100) {
    throw new ValidationError(TITLE_MAX_LENGTH_MESSAGE, "title", title);
  }

  return trimmedTitle;
}

export function validateDescription(description: string): string {
  if (typeof description !== "string") {
    throw new ValidationError(
      DESCRIPTION_MAX_LENGTH_MESSAGE,
      "description",
      description
    );
  }

  if (description.length > 1000) {
    throw new ValidationError(
      DESCRIPTION_MAX_LENGTH_MESSAGE,
      "description",
      description
    );
  }

  return description;
}

export function validateTags(tags?: string[] | null): string[] {
  if (!tags || tags.length === 0) {
    return [];
  }

  if (!Array.isArray(tags)) {
    throw new ValidationError(TAG_EMPTY_MESSAGE, "tags", tags);
  }

  const normalizedTags: string[] = [];

  for (const tag of tags) {
    if (typeof tag !== "string") {
      throw new ValidationError(TAG_EMPTY_MESSAGE, "tags", tags);
    }

    const trimmedTag = tag.trim();

    if (trimmedTag.length === 0) {
      throw new ValidationError(TAG_EMPTY_MESSAGE, "tags", tags);
    }

    if (trimmedTag.length > 30) {
      throw new ValidationError(TAG_MAX_LENGTH_MESSAGE, "tags", tags);
    }

    if (!normalizedTags.includes(trimmedTag)) {
      normalizedTags.push(trimmedTag);
    }
  }

  if (normalizedTags.length > 10) {
    throw new ValidationError(TAGS_MAX_COUNT_MESSAGE, "tags", tags);
  }

  return normalizedTags;
}

export function validateDueDate(dueDate: Date | null): Date | null {
  if (dueDate === null) {
    return null;
  }

  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
    throw new ValidationError(DUE_DATE_INVALID_MESSAGE, "dueDate", dueDate);
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (dueDate.getTime() < startOfToday.getTime()) {
    throw new ValidationError(DUE_DATE_PAST_MESSAGE, "dueDate", dueDate);
  }

  return dueDate;
}

export function validateCreateInput(input: CreateTaskInput): {
  title: string;
  description: string;
  priority: Priority;
  dueDate: Date | null;
  tags: string[];
} {
  const title = validateTitle(input.title);
  const description = validateDescription(input.description ?? "");
  const priority = input.priority ?? Priority.MEDIUM;

  if (!isValidPriority(priority)) {
    throw new ValidationError(PRIORITY_INVALID_MESSAGE, "priority", input);
  }

  const dueDate = validateDueDate(input.dueDate ?? null);
  const tags = validateTags(input.tags ?? []);

  return {
    title,
    description,
    priority,
    dueDate,
    tags,
  };
}

export function validateUpdateInput(input: UpdateTaskInput): UpdateTaskInput {
  const validated: UpdateTaskInput = {};

  if (input.title !== undefined) {
    validated.title = validateTitle(input.title);
  }

  if (input.description !== undefined) {
    validated.description = validateDescription(input.description);
  }

  if (input.priority !== undefined) {
    if (!isValidPriority(input.priority)) {
      throw new ValidationError(PRIORITY_INVALID_MESSAGE, "priority", input);
    }
    validated.priority = input.priority;
  }

  if (input.status !== undefined) {
    if (!isValidTaskStatus(input.status)) {
      throw new ValidationError(STATUS_INVALID_MESSAGE, "status", input);
    }
    validated.status = input.status;
  }

  if (input.dueDate !== undefined) {
    validated.dueDate = validateDueDate(input.dueDate);
  }

  if (input.tags !== undefined) {
    validated.tags = validateTags(input.tags);
  }

  return validated;
}
