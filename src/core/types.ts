/**
 * Orchestra Core Type Definitions
 */

import { z } from "zod";

// =============================================================================
// Task Status
// =============================================================================

export const TaskStatusSchema = z.enum([
  "not-started",
  "in-progress",
  "blocked",
  "completed",
  "failed",
  "skipped",
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// =============================================================================
// Task
// =============================================================================

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: TaskStatusSchema.default("not-started"),
  depends_on: z.array(z.string()).optional().default([]),
  acceptance_criteria: z.array(z.string()).optional().default([]),
  assignee: z.string().optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  attempt_count: z.number().int().min(0).default(0),
  max_attempts: z.number().int().min(1).default(3),
  notes: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

// =============================================================================
// Manifest
// =============================================================================

export const ManifestMetadataSchema = z.object({
  feature_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  agent: z.string().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  target_files: z.array(z.string()).optional().default([]),
});

export type ManifestMetadata = z.infer<typeof ManifestMetadataSchema>;

export const ManifestSchema = z.object({
  version: z.string().default("1.0.0"),
  metadata: ManifestMetadataSchema,
  tasks: z.array(TaskSchema).min(1),
});

export type Manifest = z.infer<typeof ManifestSchema>;

// =============================================================================
// Progress
// =============================================================================

export const ProgressEntrySchema = z.object({
  task_id: z.string(),
  status: TaskStatusSchema,
  timestamp: z.string().datetime(),
  agent: z.string().optional(),
  notes: z.string().optional(),
  duration_ms: z.number().optional(),
});

export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;

export const ProgressLogSchema = z.object({
  manifest_id: z.string(),
  entries: z.array(ProgressEntrySchema),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type ProgressLog = z.infer<typeof ProgressLogSchema>;

// =============================================================================
// Configuration
// =============================================================================

export const OrchestraConfigSchema = z.object({
  version: z.string().default("1.0.0"),
  orchestra_dir: z.string().default(".orchestra"),
  templates_dir: z.string().optional(),
  retry: z
    .object({
      max_attempts: z.number().int().min(1).default(3),
      backoff_enabled: z.boolean().default(false),
    })
    .optional(),
  notifications: z
    .object({
      enabled: z.boolean().default(false),
      channels: z.array(z.string()).optional(),
    })
    .optional(),
  defaults: z
    .object({
      agent: z.string().optional(),
      assignee: z.string().optional(),
    })
    .optional(),
  git: z
    .object({
      auto_commit: z.boolean().default(false),
      commit_prefix: z.string().default("orchestra"),
    })
    .optional(),
});

export type OrchestraConfig = z.infer<typeof OrchestraConfigSchema>;

// =============================================================================
// Verification
// =============================================================================

export const VerificationSeveritySchema = z.enum([
  "blocking",
  "major",
  "minor",
  "info",
]);

export type VerificationSeverity = z.infer<typeof VerificationSeveritySchema>;

export const VerificationCheckSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum([
    "file_exists",
    "file_contains",
    "command",
    "test_count",
    "pattern_match",
    "custom",
  ]),
  severity: VerificationSeveritySchema,
  params: z.record(z.unknown()).optional(),
});

export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

export interface CheckResult {
  id: string;
  description: string;
  severity: VerificationSeverity;
  passed: boolean;
  message?: string;
  actual?: string;
}

export interface VerificationResult {
  taskId: string;
  passed: boolean;
  checks: CheckResult[];
  timestamp: string;
}
