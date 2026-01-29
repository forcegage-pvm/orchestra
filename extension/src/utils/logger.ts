/**
 * Structured logger for the Orchestra extension.
 *
 * Creates and manages a VS Code output channel, applies a configurable
 * log level, and formats entries with a timestamp and optional context.
 *
 * @example
 * const logger = new OrchestraLogger();
 * logger.info("Extension activated", { version: "1.0.0" });
 */

import * as vscode from "vscode";

/**
 * Supported logging levels for the Orchestra logger.
 *
 * @remarks
 * Messages are emitted when their level is equal to or higher than the
 * configured level.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Logger for writing structured messages to the Orchestra output channel.
 *
 * @example
 * const logger = new OrchestraLogger();
 * logger.warn("Slow response detected", { durationMs: 1250 });
 */
export class OrchestraLogger {
  private readonly channel: vscode.OutputChannel;
  private readonly logLevel: LogLevel;

  /**
   * Create a new logger instance.
   *
   * Initializes the VS Code output channel and reads the log level from
   * the `orchestra.logLevel` configuration setting.
   *
   * @returns Nothing.
   */
  constructor() {
    this.channel = vscode.window.createOutputChannel("Orchestra");

    const config = vscode.workspace.getConfiguration("orchestra");
    this.logLevel = config.get<LogLevel>("logLevel", "info");
  }

  /**
   * Log a debug message when the configured level allows it.
   *
   * @param message - Human-readable message to include in the log entry.
   * @param context - Optional context object serialized as JSON.
   * @returns Nothing.
   * @example
   * logger.debug("Fetched cache entry", { key: "session" });
   */
  debug(message: string, context?: unknown): void {
    if (this.shouldLog("debug")) {
      this.log("DEBUG", message, context);
    }
  }

  /**
   * Log an informational message when the configured level allows it.
   *
   * @param message - Human-readable message to include in the log entry.
   * @param context - Optional context object serialized as JSON.
   * @returns Nothing.
   * @example
   * logger.info("Workspace initialized", { folders: 2 });
   */
  info(message: string, context?: unknown): void {
    if (this.shouldLog("info")) {
      this.log("INFO", message, context);
    }
  }

  /**
   * Log a warning message when the configured level allows it.
   *
   * @param message - Human-readable message to include in the log entry.
   * @param context - Optional context object serialized as JSON.
   * @returns Nothing.
   * @example
   * logger.warn("Slow response detected", { durationMs: 1250 });
   */
  warn(message: string, context?: unknown): void {
    if (this.shouldLog("warn")) {
      this.log("WARN", message, context);
    }
  }

  /**
   * Log an error message when the configured level allows it.
   *
   * @param message - Human-readable message to include in the log entry.
   * @param error - Error object or context to serialize with the message.
   * @returns Nothing.
   * @example
   * logger.error("Failed to connect", new Error("Timeout"));
   */
  error(message: string, error?: unknown): void {
    if (this.shouldLog("error")) {
      const errorContext =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error;
      this.log("ERROR", message, errorContext);
    }
  }

  /**
   * Show the Orchestra output channel to the user.
   *
   * @returns Nothing.
   * @example
   * logger.show();
   */
  show(): void {
    this.channel.show(true);
  }

  /**
   * Format and append a log entry to the output channel.
   *
   * @param level - Label used in the log entry (for example, "INFO").
   * @param message - Human-readable message to include in the log entry.
   * @param context - Optional context object serialized as JSON.
   * @returns Nothing.
   */
  private log(level: string, message: string, context?: unknown): void {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : "";
    this.channel.appendLine(`[${timestamp}] ${level}: ${message}${contextStr}`);
  }

  /**
   * Determine if a message should be logged for the configured level.
   *
   * @param level - The level of the message being logged.
   * @returns `true` when the message level is at or above the configured level.
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Dispose of the output channel and release its resources.
   *
   * @returns Nothing.
   * @example
   * logger.dispose();
   */
  dispose(): void {
    this.channel.dispose();
  }
}
