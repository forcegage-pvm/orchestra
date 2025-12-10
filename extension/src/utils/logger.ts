/**
 * Structured Logger
 *
 * Logs to VS Code output channel with configurable log levels.
 */

import * as vscode from "vscode";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class OrchestraLogger {
  private readonly channel: vscode.OutputChannel;
  private readonly logLevel: LogLevel;

  constructor() {
    this.channel = vscode.window.createOutputChannel("Orchestra");

    const config = vscode.workspace.getConfiguration("orchestra");
    this.logLevel = config.get<LogLevel>("logLevel", "info");
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: unknown): void {
    if (this.shouldLog("debug")) {
      this.log("DEBUG", message, context);
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: unknown): void {
    if (this.shouldLog("info")) {
      this.log("INFO", message, context);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: unknown): void {
    if (this.shouldLog("warn")) {
      this.log("WARN", message, context);
    }
  }

  /**
   * Log error message
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
   * Show output channel
   */
  show(): void {
    this.channel.show(true);
  }

  /**
   * Internal log method
   */
  private log(level: string, message: string, context?: unknown): void {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : "";
    this.channel.appendLine(`[${timestamp}] ${level}: ${message}${contextStr}`);
  }

  /**
   * Check if message should be logged based on level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Dispose output channel
   */
  dispose(): void {
    this.channel.dispose();
  }
}
