/**
 * TaskSummary generation for SprintMemory
 */

import { AgentSession } from "../AgentSession.js";
import { AgentError } from "../errors.js";
import type { FileOperation } from "../types.js";
import {
  TaskSummarySchema,
  type TaskOutcome,
  type TaskSummary,
} from "./types.js";

export type TaskSummaryInput = {
  title: string;
  outcome: TaskOutcome;
  attemptCount: number;
  description: string;
  lessonsLearned?: string[];
  issuesEncountered?: string[];
  completedAt?: string;
};

type FileChangeState = {
  created: boolean;
  modified: boolean;
  lastOperation: FileOperation | null;
};

const emptyState = (): FileChangeState => ({
  created: false,
  modified: false,
  lastOperation: null,
});

const categorizeFileChanges = (
  session: AgentSession,
): {
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
} => {
  const stateByPath = new Map<string, FileChangeState>();

  for (const change of session.fileChanges) {
    const relativePath = change.relativePath;
    const state = stateByPath.get(relativePath) ?? emptyState();

    switch (change.operation) {
      case "create": {
        state.created = true;
        state.lastOperation = "create";
        break;
      }
      case "modify": {
        state.modified = true;
        state.lastOperation = "modify";
        break;
      }
      case "delete": {
        state.lastOperation = "delete";
        break;
      }
      default: {
        break;
      }
    }

    stateByPath.set(relativePath, state);
  }

  const filesCreated: string[] = [];
  const filesModified: string[] = [];
  const filesDeleted: string[] = [];

  for (const [relativePath, state] of stateByPath) {
    if (state.lastOperation === "delete") {
      filesDeleted.push(relativePath);
      continue;
    }

    if (state.created) {
      filesCreated.push(relativePath);
      continue;
    }

    if (state.modified) {
      filesModified.push(relativePath);
    }
  }

  filesCreated.sort();
  filesModified.sort();
  filesDeleted.sort();

  return { filesCreated, filesModified, filesDeleted };
};

export const generateTaskSummary = (
  session: AgentSession,
  input: TaskSummaryInput,
): TaskSummary => {
  if (!session.taskId) {
    throw new AgentError(
      "Cannot generate task summary without taskId",
      "TASK_SUMMARY_INVALID",
      { sessionId: session.id },
    );
  }

  const { filesCreated, filesModified, filesDeleted } =
    categorizeFileChanges(session);

  const summary: TaskSummary = {
    taskId: session.taskId,
    title: input.title,
    outcome: input.outcome,
    attemptCount: input.attemptCount,
    description: input.description,
    lessonsLearned: input.lessonsLearned ?? [],
    issuesEncountered: input.issuesEncountered ?? [],
    filesCreated,
    filesModified,
    filesDeleted,
    completedAt: input.completedAt ?? new Date().toISOString(),
  };

  const parseResult = TaskSummarySchema.safeParse(summary);
  if (!parseResult.success) {
    throw new AgentError(
      "Task summary validation failed",
      "TASK_SUMMARY_INVALID",
      {
        errors: parseResult.error.errors,
      },
    );
  }

  return parseResult.data;
};
