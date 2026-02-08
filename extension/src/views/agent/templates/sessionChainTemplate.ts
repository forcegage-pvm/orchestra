/**
 * HTML template for Session Chain visualization in Agent Panel
 *
 * Displays parent-to-child session relationships as a tree showing depth,
 * stage, attempt number, status, and role for each session.
 */

import { getSessionChainStyles } from "./sessionChainStyles.js";
import type { AgentSession } from "../../../agents/sessions/types.js";

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Get status badge class
 */
function getStatusClass(status: AgentSession["status"]): string {
  switch (status) {
    case "completed":
      return "status-completed";
    case "failed":
      return "status-failed";
    case "running":
      return "status-running";
    case "paused":
      return "status-paused";
    case "cancelled":
      return "status-cancelled";
    default:
      return "status-initializing";
  }
}

/**
 * Get status display label
 */
function getStatusLabel(status: AgentSession["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
}

/**
 * Truncate session ID for display
 */
function truncateId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Get role icon
 */
function getRoleIcon(role: AgentSession["role"]): string {
  switch (role) {
    case "orchestrator":
      return "🎭";
    case "implementor":
      return "🔨";
    case "controller":
      return "📋";
    default:
      return "🤖";
  }
}

/**
 * Calculate depth indicator (indentation)
 */
function getDepthIndicator(depth: number): string {
  if (depth === 0) return "";
  
  const parts: string[] = [];
  for (let i = 0; i < depth; i++) {
    parts.push('<span class="depth-connector"></span>');
  }
  return parts.join("");
}

/**
 * Render a single session node
 */
function renderSessionNode(
  session: AgentSession & { depth?: number },
  isLast: boolean,
): string {
  const depth = session.depth ?? 0;
  const statusClass = getStatusClass(session.status);
  const statusLabel = getStatusLabel(session.status);
  const roleIcon = getRoleIcon(session.role);
  const depthIndicator = getDepthIndicator(depth);
  const nodeClass = `session-node depth-${depth} ${isLast ? "last-child" : ""}`;

  const stageInfo = session.stage
    ? `<span class="node-stage">${escapeHtml(session.stage)}</span>`
    : "";

  const attemptInfo =
    session.attempt !== undefined && session.attempt > 0
      ? `<span class="node-attempt">Attempt ${session.attempt + 1}</span>`
      : "";

  const continuedBadge = session.isContinued
    ? `<span class="continued-badge">↓ Continued</span>`
    : "";

  const durationInfo = session.durationMs
    ? `<span class="node-duration">${Math.round(session.durationMs / 1000)}s</span>`
    : "";

  return `
    <div class="${nodeClass}" data-session-id="${escapeHtml(session.sessionId)}">
      ${depthIndicator}
      <div class="node-content">
        <div class="node-header">
          <span class="node-icon">${roleIcon}</span>
          <span class="node-id">${escapeHtml(truncateId(session.sessionId))}</span>
          <span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
          ${stageInfo}
          ${attemptInfo}
          ${continuedBadge}
          ${durationInfo}
        </div>
        <div class="node-meta">
          <span class="node-role">${escapeHtml(session.role)}</span>
          <span class="node-iteration">Iteration: ${session.iteration}/${session.maxIterations}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate session chain HTML
 */
export function generateSessionChainHtml(
  sessions: Array<AgentSession & { depth?: number }>,
  cspSource: string,
  nonce = "",
): string {
  const style = getSessionChainStyles();
  const scriptNonce = nonce || "1";

  const chainHtml =
    sessions.length > 0
      ? sessions.map((s, idx) => renderSessionNode(s, idx === sessions.length - 1)).join("\n")
      : `<div class="empty-state">No session chain found.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${scriptNonce}';" />
  <title>Session Chain</title>
  <style>${style}</style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="title">Session Chain</div>
      <div class="header-meta">
        <span class="chain-length">${sessions.length} session${sessions.length === 1 ? "" : "s"}</span>
      </div>
    </header>
    <main class="content">
      <div id="chain-list">
        ${chainHtml}
      </div>
    </main>
  </div>
  <script nonce="${scriptNonce}">
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
