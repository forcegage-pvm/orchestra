/**
 * Error response schemas for MCP tools
 */

import { z } from "zod";

/**
 * Error codes used throughout Orchestra
 */
export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "DEPENDENCY_ERROR",
  "STATE_ERROR",
  "PERMISSION_ERROR",
  "BUSINESS_LOGIC_ERROR",
  "DATABASE_ERROR",
  "GIT_ERROR",
  "SYSTEM_ERROR",
]);

export type ErrorCode = z.output<typeof ErrorCodeSchema>;

/**
 * Structured error response
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string().min(1, 'Error message is required'),
    details: z.record(z.unknown()).optional(),
    suggestions: z.array(z.string()).optional(),
  }),
});

export type ErrorResponse = z.output<typeof ErrorResponseSchema>;

/**
 * Standard success response (no data)
 */
export const SuccessResponseSchema = z.object({
  success: z.literal(true),
});

export type SuccessResponse = z.output<typeof SuccessResponseSchema>;

/**
 * Error message templates with actionable guidance
 */
export const ERROR_TEMPLATES = {
  VALIDATION_ERROR: {
    message: "Input validation failed",
    suggestions: [
      "Check the input parameters against the schema",
      "Ensure all required fields are provided",
      "Verify data types match expected types",
    ],
  },

  NOT_FOUND: {
    message: (resource: string, id: string | number) =>
      `${resource} not found: ${id}`,
    suggestions: [
      "Verify the ID is correct",
      "Check if the resource has been created",
      "Use get_tasks or get_sprint_status to list available resources",
    ],
  },

  DEPENDENCY_ERROR: {
    message: "Dependency validation failed",
    suggestions: [
      "Ensure all dependency task IDs exist",
      "Check for circular dependencies",
      "Verify dependencies are in correct order",
    ],
  },

  STATE_ERROR: {
    message: "Invalid state transition",
    suggestions: [
      "Check current task status with get_task",
      "Review workflow step requirements",
      "Ensure prerequisites are complete",
    ],
  },

  PERMISSION_ERROR: {
    message: "Role-based access control violation",
    suggestions: [
      "Verify your role (orchestrator/implementor)",
      "Check tool permissions for your role",
      "Some operations require orchestrator privileges",
    ],
  },

  BUSINESS_LOGIC_ERROR: {
    message: "Business rule violation",
    suggestions: [
      "Check retry count limits",
      "Verify task prerequisites",
      "Review sprint configuration",
    ],
  },

  DATABASE_ERROR: {
    message: "Database operation failed",
    suggestions: [
      "Check database connection",
      "Verify data integrity",
      "Contact system administrator if persists",
    ],
  },

  GIT_ERROR: {
    message: "Git operation failed",
    suggestions: [
      "Ensure git repository is initialized",
      "Check git configuration",
      "Verify write permissions",
    ],
  },

  SYSTEM_ERROR: {
    message: "Internal system error",
    suggestions: [
      "Check system logs for details",
      "Retry the operation",
      "Contact system administrator if persists",
    ],
  },
} as const;

/**
 * Helper to create structured error responses
 */
export function createErrorResponse(
  code: ErrorCode,
  message?: string,
  details?: Record<string, unknown>,
  suggestions?: string[]
): ErrorResponse {
  const template = ERROR_TEMPLATES[code];

  return {
    success: false,
    error: {
      code,
      message:
        message ||
        (typeof template.message === "string"
          ? template.message
          : "An error occurred"),
      details,
      suggestions: suggestions || [...template.suggestions],
    },
  };
}
