/**
 * Orchestra Core Error Types
 *
 * Aligned with Orchestra Bible v0.7.0
 * Provides a structured error hierarchy for the Orchestra system.
 */

/**
 * Base error class for all Orchestra errors
 */
export class OrchestraError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "OrchestraError";
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

/**
 * Error thrown when configuration is invalid or missing
 */
export class ConfigurationError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", context);
    this.name = "ConfigurationError";
  }
}

/**
 * Error thrown when manifest operations fail
 */
export class ManifestError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "MANIFEST_ERROR", context);
    this.name = "ManifestError";
  }
}

/**
 * Error thrown when task operations fail
 */
export class TaskError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "TASK_ERROR", context);
    this.name = "TaskError";
  }
}

/**
 * Error thrown when file operations fail
 */
export class FileError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "FILE_ERROR", context);
    this.name = "FileError";
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends OrchestraError {
  constructor(
    message: string,
    public readonly errors: Array<{ path: string; message: string }>,
    context?: Record<string, unknown>
  ) {
    super(message, "VALIDATION_ERROR", context);
    this.name = "ValidationError";
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}

/**
 * Error thrown when git operations fail
 */
export class GitError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "GIT_ERROR", context);
    this.name = "GitError";
  }
}

/**
 * Error thrown when handover operations fail
 */
export class HandoverError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "HANDOVER_ERROR", context);
    this.name = "HandoverError";
  }
}

/**
 * Type guard for OrchestraError
 */
export function isOrchestraError(error: unknown): error is OrchestraError {
  return error instanceof OrchestraError;
}

/**
 * Type guard for ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Wrap unknown errors in OrchestraError
 */
export function wrapError(
  error: unknown,
  code: string = "UNKNOWN_ERROR"
): OrchestraError {
  if (isOrchestraError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new OrchestraError(error.message, code, {
      originalError: error.name,
      stack: error.stack,
    });
  }

  return new OrchestraError(String(error), code);
}
