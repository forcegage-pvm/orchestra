/**
 * TDD Red Registry tool schemas
 *
 * Tools: register_tdd_red_test, get_tdd_registry_entry
 */

import { z } from "zod";
import { SuccessResponseSchema } from "./errors.js";

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
  test_file: z.string().optional(),
  created_at: z.string().describe("ISO 8601 timestamp"),
});

export type TddRegistryEntry = z.output<typeof TddRegistryEntrySchema>;
