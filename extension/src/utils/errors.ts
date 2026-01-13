/**
 * Custom Error Classes
 *
 * Extension-specific error types with context.
 */

/**
 * Base error class with context
 */
export class OrchestraExtensionError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Database operation errors
 */
export class DatabaseError extends OrchestraExtensionError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * Workspace detection/validation errors
 */
export class WorkspaceError extends OrchestraExtensionError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * MCP server lifecycle errors
 */
export class MCPServerError extends OrchestraExtensionError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}
