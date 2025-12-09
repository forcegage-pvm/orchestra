/**
 * Validation utilities for Zod schemas
 */

import { ZodError, ZodSchema } from "zod";
import { ErrorResponse, createErrorResponse } from "./errors.js";

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorResponse };

/**
 * Validate input data against a Zod schema
 *
 * Returns either validated data or structured error response
 * with actionable guidance for agents.
 */
export function validateInput<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: createErrorResponse(
          "VALIDATION_ERROR",
          "Input validation failed",
          {
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
              code: issue.code,
            })),
          }
        ),
      };
    }
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Validate output data before returning from tool
 *
 * This ensures the system always returns correctly shaped data.
 * Should not throw - if schema is wrong, it's a system bug.
 */
export function validateOutput<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      // This is a system bug - output schema doesn't match data
      console.error("OUTPUT VALIDATION FAILED:", error.issues);
      throw new Error(`System error: Output validation failed. Check logs.`);
    }
    throw error;
  }
}

/**
 * Safe parse that returns ValidationResult
 * (alias for validateInput for consistency)
 */
export const safeParse = validateInput;
