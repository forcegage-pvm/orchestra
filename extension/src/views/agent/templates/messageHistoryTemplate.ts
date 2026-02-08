/**
 * HTML template for Message History view in Agent Panel
 *
 * Displays conversation messages with role indicators, timestamps, iterations,
 * and support for both plain text and structured MessageContentPart[] content.
 * Includes session statistics and pagination controls.
 */

import { getMessageHistoryStyles } from "./messageHistoryStyles.js";
import type {
  SessionMessage,
  MessageContentPart,
} from "../../../agents/sessions/sessionMessageRepository.js";
import type { SessionMessageStats } from "../../../agents/sessions/sessionMessageRepository.js";

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
 * Serialize data for inline script (prevent injection)
 */
function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Format JSON with proper indentation
 */
function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Render structured message content parts
 */
function renderStructuredContent(parts: MessageContentPart[]): string {
  const htmlParts: string[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      htmlParts.push(
        `<div class="content-part content-text">${escapeHtml(part.value)}</div>`,
      );
    } else if (part.type === "toolCall") {
      htmlParts.push(`
        <div class="content-part content-tool-call">
          <div class="tool-call-header">
            <span class="tool-call-icon">🔧</span>
            <span class="tool-call-name">${escapeHtml(part.name)}</span>
            <span class="tool-call-id">${escapeHtml(part.toolCallId)}</span>
          </div>
          <pre class="tool-call-input">${escapeHtml(formatJson(part.input))}</pre>
        </div>
      `);
    } else if (part.type === "toolResult") {
      htmlParts.push(`
        <div class="content-part content-tool-result">
          <div class="tool-result-header">
            <span class="tool-result-icon">✅</span>
            <span class="tool-result-id">${escapeHtml(part.toolCallId)}</span>
          </div>
          <pre class="tool-result-value">${escapeHtml(part.value)}</pre>
        </div>
      `);
    }
  }

  return htmlParts.join("\n");
}

/**
 * Render a single message
 */
function renderMessage(message: SessionMessage): string {
  const roleClass = `role-${message.role}`;
  const roleLabel = message.role.charAt(0).toUpperCase() + message.role.slice(1);
  const contentHtml =
    typeof message.content === "string"
      ? `<div class="message-text">${escapeHtml(message.content)}</div>`
      : renderStructuredContent(message.content);

  const tokenBadge = message.token_count
    ? `<span class="token-badge">${message.token_count} tokens</span>`
    : "";

  const toolCallsBadge =
    message.toolCallIds && message.toolCallIds.length > 0
      ? `<span class="tool-calls-badge">${message.toolCallIds.length} tool calls</span>`
      : "";

  return `
    <div class="message-item ${roleClass}" data-id="${escapeHtml(message.id)}">
      <div class="message-header">
        <span class="role-pill ${roleClass}">${escapeHtml(roleLabel)}</span>
        <span class="message-iteration">Iteration ${message.iteration}</span>
        <span class="message-timestamp">${escapeHtml(message.timestamp)}</span>
        ${tokenBadge}
        ${toolCallsBadge}
      </div>
      <div class="message-content">
        ${contentHtml}
      </div>
    </div>
  `;
}

/**
 * Render session statistics summary
 */
function renderStats(stats: SessionMessageStats): string {
  const formatTimestamp = (ts: string | null) => {
    if (!ts) return "N/A";
    return new Date(ts).toLocaleString();
  };

  return `
    <div class="stats-container">
      <div class="stats-header">Session Statistics</div>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Total Messages</div>
          <div class="stat-value">${stats.messageCount}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Total Tokens</div>
          <div class="stat-value">${stats.totalTokens.toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">System</div>
          <div class="stat-value">${stats.systemMessageCount}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">User</div>
          <div class="stat-value">${stats.userMessageCount}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Assistant</div>
          <div class="stat-value">${stats.assistantMessageCount}</div>
        </div>
        <div class="stat-item stat-wide">
          <div class="stat-label">First Message</div>
          <div class="stat-value stat-timestamp">${formatTimestamp(stats.firstMessageTimestamp)}</div>
        </div>
        <div class="stat-item stat-wide">
          <div class="stat-label">Last Message</div>
          <div class="stat-value stat-timestamp">${formatTimestamp(stats.lastMessageTimestamp)}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate message history HTML
 */
export function generateMessageHistoryHtml(
  messages: SessionMessage[],
  stats: SessionMessageStats,
  hasMore: boolean,
  cspSource: string,
  nonce = "",
): string {
  const style = getMessageHistoryStyles();
  const scriptNonce = nonce || "1";

  const messagesHtml = messages.map(renderMessage).join("\n");
  const statsHtml = renderStats(stats);
  const emptyState =
    messages.length === 0
      ? `<div class="empty-state">No messages in this session.</div>`
      : "";

  const loadMoreButton = hasMore
    ? `<button id="load-more-btn" class="load-more-button" type="button">Load More Messages</button>`
    : "";

  const initialData = serializeForScript({
    messages,
    stats,
    hasMore,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${scriptNonce}';" />
  <title>Message History</title>
  <style>${style}</style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="title">Message History</div>
      <div class="header-actions">
        <button id="export-markdown-btn" class="action-button" type="button">
          Export Markdown
        </button>
      </div>
    </header>
    ${statsHtml}
    <main class="content">
      <div id="message-list">
        ${messagesHtml}
        ${emptyState}
      </div>
      <div class="pagination-controls">
        ${loadMoreButton}
      </div>
    </main>
  </div>
  <script nonce="${scriptNonce}">
    const vscode = acquireVsCodeApi();
    const state = ${initialData};

    function bindEvents() {
      const loadMoreBtn = document.getElementById('load-more-btn');
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'loadMoreMessages', offset: state.messages.length });
          loadMoreBtn.disabled = true;
          loadMoreBtn.textContent = 'Loading...';
        });
      }

      const exportBtn = document.getElementById('export-markdown-btn');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'exportMarkdown' });
        });
      }
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || !message.type) return;

      if (message.type === 'appendMessages') {
        // Handle pagination response
        state.messages = state.messages.concat(message.messages || []);
        state.hasMore = message.hasMore || false;

        const messageList = document.getElementById('message-list');
        if (messageList) {
          // Re-enable load more button or remove it
          const loadMoreBtn = document.getElementById('load-more-btn');
          if (loadMoreBtn) {
            if (state.hasMore) {
              loadMoreBtn.disabled = false;
              loadMoreBtn.textContent = 'Load More Messages';
            } else {
              loadMoreBtn.remove();
            }
          }
        }
      }
    });

    bindEvents();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
