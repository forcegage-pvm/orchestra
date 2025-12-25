/**
 * Database Change Signal File
 *
 * Writes a signal file after database mutations to notify the VS Code extension
 * of changes without requiring polling. The extension watches .orchestra/.signal
 * for instant UI updates (~50ms latency instead of 2-second polling).
 *
 * This solves TD-016: Cross-process change notification for SQLite databases.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "../db/connection.js";

/**
 * Write signal file to notify extension of database changes
 *
 * Writes current timestamp to .orchestra/.signal file. The extension's
 * FileSystemWatcher detects this change and triggers UI refresh.
 *
 * Error handling: Logs errors but does NOT throw - signal file is a
 * convenience mechanism and should never break the main operation.
 *
 * @example
 * ```typescript
 * // In MCP handler after database write:
 * await db.update(tasks).set({ status: 'COMPLETE' });
 * writeSignal(); // Notify extension of change
 * ```
 */
export function writeSignal(): void {
  try {
    const workspacePath = resolveWorkspacePath();
    const orchestraDir = path.join(workspacePath, ".orchestra");
    const signalPath = path.join(orchestraDir, ".signal");

    // Ensure .orchestra directory exists
    if (!fs.existsSync(orchestraDir)) {
      fs.mkdirSync(orchestraDir, { recursive: true });
    }

    // Write timestamp to signal file
    const timestamp = Date.now().toString();
    fs.writeFileSync(signalPath, timestamp, "utf8");
  } catch (error) {
    // Log but don't throw - signal file is convenience, not critical
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(
      `[Orchestra] Failed to write signal file: ${err.message}`,
      err
    );
  }
}
