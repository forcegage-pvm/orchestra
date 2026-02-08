/**
 * Markdown Conversation Exporter
 *
 * Exports session messages to formatted Markdown with role headers,
 * timestamps, iteration numbers, and content formatting.
 */

import type {
  SessionMessage,
  MessageContent,
  MessageContentPart,
} from "../../agents/sessions/sessionMessageRepository.js";
import type { AgentSession } from "../../agents/sessions/types.js";
/**
 * Format a timestamp as readable string
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Get role header with emoji
 */
function getRoleHeader(role: SessionMessage["role"]): string {
  switch (role) {
    case "system":
      return "## 🎯 System";
    case "user":
      return "## 👤 User";
    case "assistant":
      return "## 🤖 Assistant";
    default:
      return "## Message";
  }
}

/**
 * Format structured content part to Markdown
 */
function formatContentPart(part: MessageContentPart): string {
  if (part.type === "text") {
    return part.value;
  }

  if (part.type === "toolCall") {
    const formattedInput = JSON.stringify(part.input, null, 2);
    return `**Tool Call: ${part.name}**
- Call ID: \`${part.toolCallId}\`
- Arguments:
\`\`\`json
${formattedInput}
\`\`\``;
  }

  if (part.type === "toolResult") {
    return `**Tool Result**
- Call ID: \`${part.toolCallId}\`
- Result:
\`\`\`
${part.value}
\`\`\``;
  }

  return "";
}

/**
 * Format message content to Markdown
 */
function formatContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }

  // Structured content array
  return content.map(formatContentPart).join("\n\n");
}

/**
 * Format a single message to Markdown
 */
function formatMessage(message: SessionMessage): string {
  const header = getRoleHeader(message.role);
  const timestamp = formatTimestamp(message.timestamp);
  const content = formatContent(message.content);

  const parts: string[] = [
    header,
    `**Iteration:** ${message.iteration}`,
    `**Timestamp:** ${timestamp}`,
  ];

  if (message.token_count) {
    parts.push(`**Tokens:** ${message.token_count}`);
  }

  if (message.toolCallIds && message.toolCallIds.length > 0) {
    parts.push(`**Tool Calls:** ${message.toolCallIds.length}`);
  }

  parts.push(""); // Blank line before content
  parts.push(content);
  parts.push(""); // Blank line after content

  return parts.join("\n");
}

/**
 * Export session messages to Markdown format
 *
 * @param messages Array of session messages
 * @param session Optional session metadata
 * @returns Formatted Markdown string
 */
export function exportConversationMarkdown(
  messages: SessionMessage[],
  session?: AgentSession,
): string {
  const lines: string[] = [];

  // Header
  lines.push("# Agent Conversation");
  lines.push("");

  // Session metadata if provided
  if (session) {
    lines.push("## Session Information");
    lines.push("");
    lines.push(`- **Session ID:** \`${session.sessionId}\``);
    lines.push(`- **Role:** ${session.role}`);
    lines.push(`- **Status:** ${session.status}`);
    
    if (session.taskNumber !== undefined) {
      lines.push(`- **Task:** ${session.taskNumber}${session.taskTitle ? ` - ${session.taskTitle}` : ""}`);
    }
    
    lines.push(`- **Started:** ${formatTimestamp(session.startedAt)}`);
    
    if (session.endedAt) {
      lines.push(`- **Ended:** ${formatTimestamp(session.endedAt)}`);
    }

    if (session.durationMs) {
      const durationSec = Math.round(session.durationMs / 1000);
      lines.push(`- **Duration:** ${durationSec}s`);
    }

    lines.push(`- **Iteration:** ${session.iteration}/${session.maxIterations}`);
    lines.push(`- **Tool Calls:** ${session.toolCallCount} (${session.successfulToolCalls} successful, ${session.failedToolCalls} failed)`);
    
    if (session.filesModified.length > 0) {
      lines.push(`- **Files Modified:** ${session.filesModified.length}`);
    }

    if (session.stage) {
      lines.push(`- **Stage:** ${session.stage}`);
    }

    if (session.attempt !== undefined && session.attempt > 0) {
      lines.push(`- **Attempt:** ${session.attempt + 1}`);
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Messages section
  lines.push("## Messages");
  lines.push("");

  if (messages.length === 0) {
    lines.push("*No messages in this session.*");
  } else {
    for (const [index, message] of messages.entries()) {
      lines.push(`### Message ${index + 1}`);
      lines.push("");
      lines.push(formatMessage(message));
      lines.push("---");
      lines.push("");
    }
  }

  // Footer
  lines.push("");
  lines.push("---");
  lines.push(`*Exported at: ${formatTimestamp(new Date().toISOString())}*`);

  return lines.join("\n");
}
