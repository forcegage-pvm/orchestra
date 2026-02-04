/**
 * Resume Agent Command
 *
 * Presents recoverable sessions and resumes the selected session.
 */

import * as vscode from "vscode";
import { getRecentSessions } from "../agents/sessions/sessionRepository.js";
import type { AgentSession } from "../agents/sessions/types.js";
import { getAgentRunner } from "../extension.js";

export type ResumeSessionPick = vscode.QuickPickItem & {
  sessionId: string;
};

function formatSessionLabel(session: AgentSession): string {
  const roleLabel =
    session.role.charAt(0).toUpperCase() + session.role.slice(1);
  const taskLabel = session.taskNumber
    ? `Task ${session.taskNumber}`
    : session.taskId
      ? `Task ID ${session.taskId}`
      : "No Task";
  return `${roleLabel} (${taskLabel})`;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function buildSessionQuickPickItems(
  sessions: AgentSession[],
): ResumeSessionPick[] {
  return sessions.map((session) => ({
    label: formatSessionLabel(session),
    description: `${session.status} • ${formatTimestamp(session.lastActivityAt)}`,
    detail: `Session ${session.sessionId} • Sprint ${session.sprintId} • Iteration ${session.iteration}/${session.maxIterations}`,
    sessionId: session.sessionId,
  }));
}

export async function handleResumeAgent(workspaceRoot: string): Promise<void> {
  // Get recent sessions from database (limit to last 20)
  const allSessions = getRecentSessions(workspaceRoot, 20);

  // Filter to only recoverable sessions (paused or stopped)
  const sessions = allSessions.filter(
    (s) => s.status === "paused" || s.status === "stopped",
  );

  if (sessions.length === 0) {
    vscode.window.showInformationMessage(
      "Orchestra: No recoverable sessions found. Only paused or stopped sessions can be resumed.",
    );
    return;
  }

  const items = buildSessionQuickPickItems(sessions);
  const selected = await vscode.window.showQuickPick(items, {
    title: "Resume Agent Session",
    placeHolder: "Select a session to resume",
    ignoreFocusOut: true,
  });

  if (!selected) {
    return;
  }

  const runner = getAgentRunner();
  if (runner.getSession()?.status === "running") {
    vscode.window.showErrorMessage(
      "Orchestra: Agent is already running. Stop or pause it before resuming a session.",
    );
    return;
  }

  // TODO: Implement database-based resume functionality
  // For now, inform user that resume is not yet implemented with new architecture
  vscode.window.showWarningMessage(
    `Orchestra: Resume functionality is being reworked to use database instead of file storage. This will be available in a future update.`,
  );
}
