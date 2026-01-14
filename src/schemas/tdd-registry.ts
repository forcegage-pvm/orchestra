/**
 * TDD Red Registry tool schemas
 *
 * Tools: register_tdd_red_test, get_tdd_registry_entry
 */

import { z } from "zod";
import { SuccessResponseSchema } from "./errors.js";

// ============================================================================
// Enums
// ============================================================================

/**
 * TDD registry status enum
 *
 * Tracks progression of a red test through its lifecycle:
 * - REGISTERED: Test created and registered during red phase
 * - VALIDATED: Test verified as properly failing
 * - PENDING_GREEN: Assigned to a green-phase task
 * - GREEN: Test passing after implementation
 */
export const TddRegistryStatusSchema = z.enum([
  "REGISTERED",
  "VALIDATED",
  "PENDING_GREEN",
  "GREEN",
]);

export type TddRegistryStatus = z.output<typeof TddRegistryStatusSchema>;

// ============================================================================
// register_tdd_red_test
// ============================================================================

/**
 * Input schema for registering a red test
 */
export const RegisterTddRedTestInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  test_identifier: z
    .string()
    .min(1, "Test identifier is required")
    .describe('Format: "file::group::test"'),
  description: z.string().optional(),
  marker_type: z
    .string()
    .optional()
    .describe('e.g., "it.skip", "test.todo"'),
});

export type RegisterTddRedTestInput = z.output<
  typeof RegisterTddRedTestInputSchema
>;

/**
 * Output schema for registering a red test
 */
export const RegisterTddRedTestOutputSchema = SuccessResponseSchema.extend({
  registry_id: z.number().int().positive(),
  test_identifier: z.string(),
  status: z.literal("REGISTERED"),
  next_step: z.string(),
});

export type RegisterTddRedTestOutput = z.output<
  typeof RegisterTddRedTestOutputSchema
>;

// ============================================================================
// TDD Registry Entry (complete database record)
// ============================================================================

/**
 * Complete TDD registry entry schema
 *
 * Represents a full record from the tdd_red_registry table
 */
export const TddRegistryEntrySchema = z.object({
  id: z.number().int().positive(),
  sprint_id: z.string().min(1, "Sprint ID is required"),
  red_task_id: z.number().int().positive(),
  test_identifier: z
    .string()
    .min(1, "Test identifier is required")
    .describe('Format: "file::group::test"'),
  description: z.string().optional(),
  marker_type: z.string().optional(),
  status: TddRegistryStatusSchema,
  green_task_id: z.number().int().positive().optional(),
  created_at: z.string().describe("ISO 8601 timestamp"),
  validated_at: z.string().optional().describe("ISO 8601 timestamp"),
  assigned_at: z.string().optional().describe("ISO 8601 timestamp"),
  greened_at: z.string().optional().describe("ISO 8601 timestamp"),
});

export type TddRegistryEntry = z.output<typeof TddRegistryEntrySchema>;
