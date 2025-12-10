/**
 * Orchestra Configuration Settings
 *
 * Typed accessors for VS Code workspace configuration.
 * All orchestra.* settings are accessed through these functions
 * to ensure type safety and consistent defaults.
 */

import * as vscode from "vscode";

/**
 * Log level enumeration matching package.json configuration
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Get the orchestra configuration section
 */
function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("orchestra");
}

/**
 * Get whether to automatically start MCP servers on extension activation
 * @returns boolean - Default: true
 */
export function getAutoStartMCP(): boolean {
  return getConfig().get<boolean>("autoStartMCP", true);
}

/**
 * Get the database update debounce interval in milliseconds
 * @returns number - Default: 500ms
 */
export function getUpdateInterval(): number {
  return getConfig().get<number>("updateInterval", 500);
}

/**
 * Get the logging level for Orchestra output channel
 * @returns LogLevel - Default: "info"
 */
export function getLogLevel(): LogLevel {
  return getConfig().get<LogLevel>("logLevel", "info");
}
