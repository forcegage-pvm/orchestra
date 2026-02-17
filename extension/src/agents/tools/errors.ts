/**
 * Tool Error Codes and Factory Helpers
 *
 * Re-exports from the shared canonical source in src/core/testing/errors.ts.
 * This ensures a single ToolErrorCode enum is used across the entire codebase.
 */
export {
  ToolErrorCode,
  createToolError,
  type ToolError,
} from "../../../../src/core/testing/errors.js";
