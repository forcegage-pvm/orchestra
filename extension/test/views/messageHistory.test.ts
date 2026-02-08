/**
 * Tests for message history in Agent Panel
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMessageHistoryHtml } from "../../src/views/agent/templates/messageHistoryTemplate.js";
import { generateSessionChainHtml } from "../../src/views/agent/templates/sessionChainTemplate.js";
import { exportConversationMarkdown } from "../../src/views/agent/messageHistoryExporter.js";
import type {
  SessionMessage,
  SessionMessageStats,
  MessageContentPart,
} from "../../src/agents/sessions/sessionMessageRepository.js";
import type { AgentSession } from "../../src/agents/sessions/types.js";describe("Message History Template", () => {
  const mockStats: SessionMessageStats = {
    messageCount: 5,
    totalTokens: 1500,
    systemMessageCount: 1,
    userMessageCount: 2,
    assistantMessageCount: 2,
    firstMessageTimestamp: "2026-01-01T00:00:00Z",
    lastMessageTimestamp: "2026-01-01T00:05:00Z",
  };

  it("should render system message correctly", () => {
    const messages: SessionMessage[] = [
      {
        id: "msg-1",
        session_id: "session-1",
        message_index: 0,
        role: "system",
        content: "You are a helpful assistant.",
        token_count: 10,
        timestamp: "2026-01-01T00:00:00Z",
        iteration: 0,
      },
    ];

    const html = generateMessageHistoryHtml(
      messages,
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("role-system");
    expect(html).toContain("System");
    expect(html).toContain("You are a helpful assistant.");
    expect(html).toContain("10 tokens");
  });

  it("should render user message correctly", () => {
    const messages: SessionMessage[] = [
      {
        id: "msg-2",
        session_id: "session-1",
        message_index: 1,
        role: "user",
        content: "Tell me about TypeScript.",
        token_count: 15,
        timestamp: "2026-01-01T00:01:00Z",
        iteration: 1,
      },
    ];

    const html = generateMessageHistoryHtml(
      messages,
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("role-user");
    expect(html).toContain("User");
    expect(html).toContain("Tell me about TypeScript.");
  });

  it("should render assistant message correctly", () => {
    const messages: SessionMessage[] = [
      {
        id: "msg-3",
        session_id: "session-1",
        message_index: 2,
        role: "assistant",
        content: "TypeScript is a superset of JavaScript.",
        token_count: 20,
        timestamp: "2026-01-01T00:02:00Z",
        iteration: 1,
      },
    ];

    const html = generateMessageHistoryHtml(
      messages,
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("role-assistant");
    expect(html).toContain("Assistant");
    expect(html).toContain("TypeScript is a superset of JavaScript.");
  });

  it("should render structured content with text parts", () => {
    const contentParts: MessageContentPart[] = [
      {
        type: "text",
        value: "Here is the answer:",
      },
    ];

    const messages: SessionMessage[] = [
      {
        id: "msg-4",
        session_id: "session-1",
        message_index: 3,
        role: "assistant",
        content: contentParts,
        token_count: 25,
        timestamp: "2026-01-01T00:03:00Z",
        iteration: 2,
      },
    ];

    const html = generateMessageHistoryHtml(
      messages,
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("content-text");
    expect(html).toContain("Here is the answer:");
  });

  it("should render structured content with toolCall parts", () => {
    const contentParts: MessageContentPart[] = [
      {
        type: "toolCall",
        toolCallId: "call-123",
        name: "get_current_task",
        input: { foo: "bar" },
      },
    ];

    const messages: SessionMessage[] = [
      {
        id: "msg-5",
        session_id: "session-1",
        message_index: 4,
        role: "assistant",
        content: contentParts,
        token_count: 30,
        timestamp: "2026-01-01T00:04:00Z",
        iteration: 3,
      },
    ];

    const html = generateMessageHistoryHtml(
      messages,
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("content-tool-call");
    expect(html).toContain("get_current_task");
    expect(html).toContain("call-123");
  });

  it("should render structured content with toolResult parts", () => {
    const contentParts: MessageContentPart[] = [
      {
        type: "toolResult",
        toolCallId: "call-123",
        value: "Task details here",
      },
    ];

    const messages: SessionMessage[] = [
      {
        id: "msg-6",
        session_id: "session-1",
        message_index: 5,
        role: "assistant",
        content: contentParts,
        token_count: 35,
        timestamp: "2026-01-01T00:05:00Z",
        iteration: 3,
      },
    ];

    const html = generateMessageHistoryHtml(
      messages,
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("content-tool-result");
    expect(html).toContain("call-123");
    expect(html).toContain("Task details here");
  });

  it("should include session statistics", () => {
    const html = generateMessageHistoryHtml(
      [],
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("Session Statistics");
    // toLocaleString() format varies: "1,500" or "1 500" (non-breaking space \u00A0)
    expect(html).toMatch(/1[, \u00A0]500/);
    expect(html).toContain(String(mockStats.systemMessageCount));
    expect(html).toContain(String(mockStats.userMessageCount));
    expect(html).toContain(String(mockStats.assistantMessageCount));
  });  it("should show load more button when hasMore is true", () => {
    const html = generateMessageHistoryHtml(
      [],
      mockStats,
      true,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("load-more-btn");
    expect(html).toContain("Load More Messages");
  });

  it("should not show load more button when hasMore is false", () => {
    const html = generateMessageHistoryHtml(
      [],
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).not.toContain('<button id="load-more-btn"');
  });
  it("should show empty state when no messages", () => {
    const html = generateMessageHistoryHtml(
      [],
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("empty-state");
    expect(html).toContain("No messages in this session");
  });

  it("should use VS Code CSS variables", () => {
    const html = generateMessageHistoryHtml(
      [],
      mockStats,
      false,
      "vscode-resource://test",
      "nonce",
    );

    // Should have at least 3 --vscode-* variables
    const vscodeVarMatches = html.match(/--vscode-/g);
    expect(vscodeVarMatches).toBeDefined();
    expect(vscodeVarMatches!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Session Chain Template", () => {
  it("should render a single session node", () => {
    const sessions: Array<AgentSession & { depth?: number }> = [
      {
        sessionId: "session-1",
        role: "implementor",
        taskId: 1,
        taskNumber: undefined,
        taskTitle: undefined,
        sprintId: "sprint-1",
        startedAt: "2026-01-01T00:00:00Z",
        lastActivityAt: "2026-01-01T00:05:00Z",
        endedAt: "2026-01-01T00:05:00Z",
        status: "completed",
        statusMessage: undefined,
        iteration: 5,
        maxIterations: 10,
        toolCallCount: 20,
        successfulToolCalls: 18,
        failedToolCalls: 2,
        warningCount: 0,
        filesModified: [],
        durationMs: 300000,        depth: 0,
      },
    ];

    const html = generateSessionChainHtml(
      sessions,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("session-1".slice(0, 8));
    expect(html).toContain("implementor");
    expect(html).toContain("status-completed");
    expect(html).toContain("300s"); // durationMs / 1000
  });

  it("should render session chain with depth indicators", () => {
    const sessions: Array<AgentSession & { depth?: number }> = [
      {
        sessionId: "session-1",
        role: "implementor",
        taskId: 1,
        taskNumber: undefined,
        taskTitle: undefined,
        sprintId: "sprint-1",
        startedAt: "2026-01-01T00:00:00Z",
        lastActivityAt: "2026-01-01T00:01:00Z",
        endedAt: undefined,
        status: "running",
        statusMessage: undefined,
        iteration: 2,
        maxIterations: 10,
        toolCallCount: 5,
        successfulToolCalls: 5,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
        depth: 0,
      },
      {
        sessionId: "session-2",
        role: "implementor",
        taskId: 1,
        taskNumber: undefined,
        taskTitle: undefined,
        sprintId: "sprint-1",
        startedAt: "2026-01-01T00:02:00Z",
        lastActivityAt: "2026-01-01T00:03:00Z",
        endedAt: undefined,
        status: "paused",
        statusMessage: undefined,
        iteration: 1,
        maxIterations: 10,
        toolCallCount: 2,
        successfulToolCalls: 2,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
        depth: 1,
        parentSessionId: "session-1",
        attempt: 1,
      },
    ];

    const html = generateSessionChainHtml(
      sessions,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("depth-0");
    expect(html).toContain("depth-1");
    expect(html).toContain("depth-connector");
    expect(html).toContain("Attempt 2"); // attempt + 1
  });

  it("should show stage information when present", () => {
    const sessions: Array<AgentSession & { depth?: number }> = [
      {
        sessionId: "session-1",
        role: "implementor",
        taskId: 1,
        taskNumber: undefined,
        taskTitle: undefined,
        sprintId: "sprint-1",
        startedAt: "2026-01-01T00:00:00Z",
        lastActivityAt: "2026-01-01T00:01:00Z",
        endedAt: undefined,
        status: "running",
        statusMessage: undefined,
        iteration: 1,
        maxIterations: 10,
        toolCallCount: 3,
        successfulToolCalls: 3,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
        stage: "IMPLEMENT_FIX",
        depth: 0,
      },
    ];

    const html = generateSessionChainHtml(
      sessions,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("IMPLEMENT_FIX");
    expect(html).toContain("node-stage");
  });

  it("should show continued badge when session is continued", () => {
    const sessions: Array<AgentSession & { depth?: number }> = [
      {
        sessionId: "session-1",
        role: "implementor",
        taskId: 1,
        taskNumber: undefined,
        taskTitle: undefined,
        sprintId: "sprint-1",
        startedAt: "2026-01-01T00:00:00Z",
        lastActivityAt: "2026-01-01T00:01:00Z",
        endedAt: undefined,
        status: "completed",
        statusMessage: undefined,
        iteration: 5,
        maxIterations: 10,
        toolCallCount: 10,
        successfulToolCalls: 10,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: 60000,
        isContinued: true,
        continuedAt: "2026-01-01T00:02:00Z",
        continuationCount: 1,
        depth: 0,
      },
    ];

    const html = generateSessionChainHtml(
      sessions,
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("continued-badge");
    expect(html).toContain("Continued");
  });

  it("should show empty state when no sessions", () => {
    const html = generateSessionChainHtml(
      [],
      "vscode-resource://test",
      "nonce",
    );

    expect(html).toContain("empty-state");
    expect(html).toContain("No session chain found");
  });

  it("should use VS Code CSS variables", () => {
    const html = generateSessionChainHtml(
      [],
      "vscode-resource://test",
      "nonce",
    );

    // Should have at least 3 --vscode-* variables
    const vscodeVarMatches = html.match(/--vscode-/g);
    expect(vscodeVarMatches).toBeDefined();
    expect(vscodeVarMatches!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Markdown Exporter", () => {
  it("should export plain text messages to Markdown", () => {
    const messages: SessionMessage[] = [
      {
        id: "msg-1",
        session_id: "session-1",
        message_index: 0,
        role: "system",
        content: "You are a helpful assistant.",
        token_count: 10,
        timestamp: "2026-01-01T00:00:00Z",
        iteration: 0,
      },
      {
        id: "msg-2",
        session_id: "session-1",
        message_index: 1,
        role: "user",
        content: "Hello!",
        token_count: 5,
        timestamp: "2026-01-01T00:01:00Z",
        iteration: 1,
      },
    ];

    const markdown = exportConversationMarkdown(messages);

    expect(markdown).toContain("# Agent Conversation");
    expect(markdown).toContain("## 🎯 System");
    expect(markdown).toContain("You are a helpful assistant.");
    expect(markdown).toContain("## 👤 User");
    expect(markdown).toContain("Hello!");
    expect(markdown).toContain("**Iteration:** 0");
    expect(markdown).toContain("**Iteration:** 1");
  });

  it("should include session metadata when provided", () => {
    const session: AgentSession = {
      sessionId: "session-abc123",
      role: "implementor",
      taskId: 5,
      taskNumber: 3,
      taskTitle: "Add feature X",
      sprintId: "sprint-001",
      startedAt: "2026-01-01T00:00:00Z",
      lastActivityAt: "2026-01-01T00:10:00Z",
      endedAt: "2026-01-01T00:10:00Z",
      status: "completed",
      statusMessage: undefined,
      iteration: 5,
      maxIterations: 10,
      toolCallCount: 20,
      successfulToolCalls: 18,
      failedToolCalls: 2,
      warningCount: 1,
      filesModified: ["file1.ts", "file2.ts"],
      durationMs: 600000,
    };

    const markdown = exportConversationMarkdown([], session);

    expect(markdown).toContain("## Session Information");
    expect(markdown).toContain("session-abc123");
    expect(markdown).toContain("implementor");
    expect(markdown).toContain("completed");
    expect(markdown).toContain("3 - Add feature X");
    expect(markdown).toContain("600s");
  });

  it("should format structured content with tool calls", () => {
    const contentParts: MessageContentPart[] = [
      {
        type: "toolCall",
        toolCallId: "call-123",
        name: "get_current_task",
        input: { taskId: 5 },
      },
    ];

    const messages: SessionMessage[] = [
      {
        id: "msg-1",
        session_id: "session-1",
        message_index: 0,
        role: "assistant",
        content: contentParts,
        token_count: 20,
        timestamp: "2026-01-01T00:00:00Z",
        iteration: 1,
      },
    ];

    const markdown = exportConversationMarkdown(messages);

    expect(markdown).toContain("**Tool Call: get_current_task**");
    expect(markdown).toContain("call-123");
    expect(markdown).toContain("```json");
  });

  it("should format structured content with tool results", () => {
    const contentParts: MessageContentPart[] = [
      {
        type: "toolResult",
        toolCallId: "call-123",
        value: "Task completed successfully",
      },
    ];

    const messages: SessionMessage[] = [
      {
        id: "msg-1",
        session_id: "session-1",
        message_index: 0,
        role: "assistant",
        content: contentParts,
        token_count: 15,
        timestamp: "2026-01-01T00:00:00Z",
        iteration: 1,
      },
    ];

    const markdown = exportConversationMarkdown(messages);

    expect(markdown).toContain("**Tool Result**");
    expect(markdown).toContain("call-123");
    expect(markdown).toContain("Task completed successfully");
  });

  it("should include export timestamp in footer", () => {
    const markdown = exportConversationMarkdown([]);

    expect(markdown).toContain("*Exported at:");
  });
});
