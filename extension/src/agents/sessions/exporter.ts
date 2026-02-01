/**
 * Agent Session Exporter
 *
 * Exports session data and events to JSON format for debugging, sharing, or archival.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 10
 */

import type { SessionExport } from "./types.js";
import { getSession } from "./sessionRepository.js";
import { getEventsForSession } from "./eventRepository.js";

/**
 * Export a session and its events to SessionExport format
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID to export
 * @returns SessionExport object with session metadata and all events
 * @throws Error if session is not found
 */
export function exportSession(
  workspaceRoot: string,
  sessionId: string,
): SessionExport {
  // Fetch session from database
  const session = getSession(workspaceRoot, sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Fetch all events for the session
  const events = getEventsForSession(workspaceRoot, sessionId);

  // Build SessionExport object
  const exportData: SessionExport = {
    exportedAt: new Date().toISOString(),
    version: "1.0",
    session,
    events,
  };

  return exportData;
}
