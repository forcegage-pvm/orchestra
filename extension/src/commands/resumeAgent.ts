/**
 * Resume Agent Command
 *
 * Presents recoverable sessions and resumes the selected session.
 */

import * as vscode from "vscode";
import { SessionStorage } from "../agents/SessionStorage.js";
import type { SessionMetadata } from "../agents/types.js";
import { getAgentRunner } from "../extension.js";

export type ResumeSessionPick = vscode.QuickPickItem & {
  sessionId: string;
};

function formatSessionLabel(session: SessionMetadata): string {
  const roleLabel =
    session.role.charAt(0).toUpperCase() + session.role.slice(1);
  const taskLabel = session.taskId ? `Task ${session.taskId}` : "No Task";
  return `${roleLabel} (${taskLabel})`;
}

export function buildSessionQuickPickItems(
  sessions: SessionMetadata[],
): ResumeSessionPick[] {
  return sessions.map((session) => ({
    label: formatSessionLabel(session),
    description: `Last active: ${session.lastActivityAt}`,
    detail: `Session ${session.id} • Sprint ${session.sprintId}`,
    sessionId: session.id,
  }));
}

export async function handleResumeAgent(workspaceRoot: string): Promise<void> {
  const storage = SessionStorage.getInstance(workspaceRoot);
  const sessions = await storage.getRecoverableSessions();

  if (sessions.length === 0) {
    vscode.window.showInformationMessage(
      "Orchestra: No recoverable sessions found.",
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

  await runner.resumeFromStorage(selected.sessionId);
  vscode.window.showInformationMessage(
    `Orchestra: Resumed session ${selected.sessionId}`,
  );
}
