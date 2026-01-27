/**
 * Memory type definitions for SprintMemory and TaskSummary
 *
 * Follows "Types from Zod" pattern: define schemas, infer types via z.output<typeof Schema>
 */

import { z } from "zod";

// ============================================================================
// Architecture Decisions
// ============================================================================

export const ArchitectureDecisionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  decision: z.string(),
  rationale: z.string(),
  taskId: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
});
export type ArchitectureDecision = z.output<typeof ArchitectureDecisionSchema>;

// ============================================================================
// Implementor Patterns
// ============================================================================

export const ImplementorPatternSchema = z.object({
  id: z.string().uuid(),
  pattern: z.enum(["positive", "negative"]),
  description: z.string(),
  taskId: z.number().int().positive(),
  example: z.string().optional(),
  frequency: z.number().int().positive().default(1),
});
export type ImplementorPattern = z.output<typeof ImplementorPatternSchema>;

// ============================================================================
// Task Summary
// ============================================================================

export const TaskOutcomeSchema = z.enum([
  "success",
  "partial",
  "failed",
  "escalated",
]);
export type TaskOutcome = z.output<typeof TaskOutcomeSchema>;

export const TaskSummarySchema = z.object({
  taskId: z.number().int().positive(),
  title: z.string(),
  outcome: TaskOutcomeSchema,
  attemptCount: z.number().int().positive(),
  description: z.string(),
  lessonsLearned: z.array(z.string()),
  issuesEncountered: z.array(z.string()),
  filesCreated: z.array(z.string()),
  filesModified: z.array(z.string()),
  filesDeleted: z.array(z.string()),
  completedAt: z.string().datetime(),
});
export type TaskSummary = z.output<typeof TaskSummarySchema>;

// ============================================================================
// Sprint Memory
// ============================================================================

export const SprintMemorySchema = z.object({
  version: z.literal("1.0"),
  sprintId: z.string(),
  sprintName: z.string(),
  goals: z.array(z.string()),
  architectureDecisions: z.array(ArchitectureDecisionSchema),
  taskSummaries: z.array(TaskSummarySchema),
  implementorPatterns: z.array(ImplementorPatternSchema),
  compactionCount: z.number().int().nonnegative().default(0),
  lastCompactedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SprintMemory = z.output<typeof SprintMemorySchema>;
