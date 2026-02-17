/**
 * Unit tests for TaskSummary generation
 */

import { expect, test } from "vitest";
import { AgentSession } from "../../../../src/agents/AgentSession.js";
import {
  TaskSummarySchema,
  generateTaskSummary,
} from "../../../../src/agents/memory/index.js";

const createFileChange = (params: {
  relativePath: string;
  operation: "create" | "modify" | "delete";
}): AgentSession["fileChanges"][number] => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    uri: `file:///tmp/${params.relativePath}`,
    relativePath: params.relativePath,
    operation: params.operation,
    previousContent: params.operation === "create" ? null : "before",
    previousContentHash: params.operation === "create" ? null : "hash-before",
    newContent: params.operation === "delete" ? null : "after",
    newContentHash: params.operation === "delete" ? null : "hash-after",
    toolCallId: crypto.randomUUID(),
    timestamp: now,
    iteration: 0,
    undone: false,
    undoneAt: null,
  };
};

test("generateTaskSummary() creates valid summary and categorizes file changes", () => {
  const session = new AgentSession("implementor", "sprint-100", 42);

  session.fileChanges.push(
    createFileChange({
      relativePath: "src/new.ts",
      operation: "create",
    }),
  );
  session.fileChanges.push(
    createFileChange({
      relativePath: "src/existing.ts",
      operation: "modify",
    }),
  );
  session.fileChanges.push(
    createFileChange({
      relativePath: "src/obsolete.ts",
      operation: "delete",
    }),
  );
  session.fileChanges.push(
    createFileChange({
      relativePath: "src/created-then-modified.ts",
      operation: "create",
    }),
  );
  session.fileChanges.push(
    createFileChange({
      relativePath: "src/created-then-modified.ts",
      operation: "modify",
    }),
  );
  session.fileChanges.push(
    createFileChange({
      relativePath: "src/modified-then-deleted.ts",
      operation: "modify",
    }),
  );
  session.fileChanges.push(
    createFileChange({
      relativePath: "src/modified-then-deleted.ts",
      operation: "delete",
    }),
  );

  const summary = generateTaskSummary(session, {
    title: "Build memory",
    outcome: "success",
    attemptCount: 2,
    description: "Implemented memory storage",
    lessonsLearned: ["Use schemas"],
    issuesEncountered: ["None"],
  });

  expect(summary.taskId).toBe(42);
  expect(summary.outcome).toBe("success");
  expect(summary.filesCreated).toEqual(
    expect.arrayContaining(["src/new.ts", "src/created-then-modified.ts"]),
  );
  expect(summary.filesModified).toEqual(
    expect.arrayContaining(["src/existing.ts"]),
  );
  expect(summary.filesDeleted).toEqual(
    expect.arrayContaining(["src/obsolete.ts", "src/modified-then-deleted.ts"]),
  );
});

test("generateTaskSummary() throws when taskId is missing", () => {
  const session = new AgentSession("orchestrator", "sprint-200");

  expect(() =>
    generateTaskSummary(session, {
      title: "Missing task",
      outcome: "failed",
      attemptCount: 1,
      description: "No task id",
      lessonsLearned: [],
      issuesEncountered: ["Missing task"],
    }),
  ).toThrowError(/taskId/i);
});

test("TaskSummarySchema rejects invalid data", () => {
  const result = TaskSummarySchema.safeParse({
    taskId: -1,
    title: 5,
    outcome: "invalid",
  });

  expect(result.success).toBe(false);
});
