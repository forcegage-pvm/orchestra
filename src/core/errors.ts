/**
 * Orchestra Error Types
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

export class ConfigurationError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", context);
    this.name = "ConfigurationError";
  }
}

export class ManifestError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "MANIFEST_ERROR", context);
    this.name = "ManifestError";
  }
}

export class TaskError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "TASK_ERROR", context);
    this.name = "TaskError";
  }
}

export class FileError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "FILE_ERROR", context);
    this.name = "FileError";
  }
}

export class ValidationError extends OrchestraError {
  constructor(
    message: string,
    public readonly errors: Array<{ path: string; message: string }>,
    context?: Record<string, unknown>
  ) {
    super(message, "VALIDATION_ERROR", context);
    this.name = "ValidationError";
  }
}

export class GitError extends OrchestraError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "GIT_ERROR", context);
    this.name = "GitError";
  }
}

/**
 * Type guard for OrchestraError
 */
export function isOrchestraError(error: unknown): error is OrchestraError {
  return error instanceof OrchestraError;
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
    });
  }

  return new OrchestraError(String(error), code);
}
