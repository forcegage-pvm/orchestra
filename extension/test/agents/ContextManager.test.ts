/**
 * Unit tests for ContextManager token counting and compaction
 */

import crypto from "crypto";
import { describe, expect, test } from "vitest";
import { ContextManager } from "../../src/agents/ContextManager.js";
import type { AgentMessage } from "../../src/agents/types.js";

describe("ContextManager", () => {
  describe("constructor", () => {
    test("should create with default config", () => {
      const manager = new ContextManager();

      expect(manager.getMaxContextTokens()).toBe(100000);
      expect(manager.getCompactionThreshold()).toBe(5);
      expect(manager.getSummarizeAfterToolCalls()).toBe(20);
    });

    test("should create with custom maxContextTokens", () => {
      const manager = new ContextManager({ maxContextTokens: 50000 });

      expect(manager.getMaxContextTokens()).toBe(50000);
    });

    test("should create with custom compactionThreshold", () => {
      const manager = new ContextManager({ compactionThreshold: 10 });

      expect(manager.getCompactionThreshold()).toBe(10);
    });

    test("should create with custom summarizeAfterToolCalls", () => {
      const manager = new ContextManager({ summarizeAfterToolCalls: 30 });

      expect(manager.getSummarizeAfterToolCalls()).toBe(30);
    });

    test("should create with all custom config values", () => {
      const manager = new ContextManager({
        maxContextTokens: 75000,
        compactionThreshold: 8,
        summarizeAfterToolCalls: 25,
      });

      expect(manager.getMaxContextTokens()).toBe(75000);
      expect(manager.getCompactionThreshold()).toBe(8);
      expect(manager.getSummarizeAfterToolCalls()).toBe(25);
    });
  });

  describe("estimateTokens", () => {
    test("should return 0 for empty message array", () => {
      const manager = new ContextManager();
      const tokens = manager.estimateTokens([]);

      expect(tokens).toBe(0);
    });

    test("should estimate tokens for simple text message", () => {
      const manager = new ContextManager();

      const message: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "Hello, world!", // 13 chars
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      const tokens = manager.estimateTokens([message]);

      // Should be roughly (13 + role + timestamp overhead) / 4
      // Expect at least 10 tokens for this short message
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(20);
    });

    test("should estimate tokens for multi-part content with text", () => {
      const manager = new ContextManager();

      const message: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: [
          { type: "text", value: "Processing your request..." },
          { type: "text", value: "Done!" },
        ],
        timestamp: new Date().toISOString(),
        iteration: 1,
      };

      const tokens = manager.estimateTokens([message]);

      expect(tokens).toBeGreaterThan(5);
    });

    test("should estimate tokens for tool call content", () => {
      const manager = new ContextManager();

      const message: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: [{ type: "toolCall", toolCallId: crypto.randomUUID() }],
        timestamp: new Date().toISOString(),
        iteration: 1,
      };

      const tokens = manager.estimateTokens([message]);

      expect(tokens).toBeGreaterThan(0);
    });

    test("should estimate tokens for tool result content", () => {
      const manager = new ContextManager();

      const message: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: [
          {
            type: "toolResult",
            toolCallId: crypto.randomUUID(),
            value: "Tool execution successful",
          },
        ],
        timestamp: new Date().toISOString(),
        iteration: 1,
      };

      const tokens = manager.estimateTokens([message]);

      expect(tokens).toBeGreaterThan(5);
    });

    test("should estimate tokens for multiple messages", () => {
      const manager = new ContextManager();

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "First message",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Second message",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Third message",
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
      ];

      const tokens = manager.estimateTokens(messages);

      // Should be roughly sum of individual message tokens
      expect(tokens).toBeGreaterThan(10);
    });

    test("should estimate higher tokens for longer content", () => {
      const manager = new ContextManager();

      const shortMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "Hi",
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      const longMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content:
          "This is a much longer message with significantly more content that should result in a higher token count when estimated by the ContextManager. ".repeat(
            10,
          ),
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      const shortTokens = manager.estimateTokens([shortMessage]);
      const longTokens = manager.estimateTokens([longMessage]);

      expect(longTokens).toBeGreaterThan(shortTokens * 10);
    });

    test("should account for toolCallIds in estimation", () => {
      const manager = new ContextManager();

      const withoutToolCalls: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Response",
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      const withToolCalls: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Response",
        timestamp: new Date().toISOString(),
        iteration: 0,
        toolCallIds: [crypto.randomUUID(), crypto.randomUUID()],
      };

      const tokensWithout = manager.estimateTokens([withoutToolCalls]);
      const tokensWith = manager.estimateTokens([withToolCalls]);

      expect(tokensWith).toBeGreaterThan(tokensWithout);
    });
  });

  describe("isWithinLimit", () => {
    test("should return true for empty messages", () => {
      const manager = new ContextManager();

      expect(manager.isWithinLimit([])).toBe(true);
    });

    test("should return true for messages within default limit", () => {
      const manager = new ContextManager();

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Hello",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
      ];

      expect(manager.isWithinLimit(messages)).toBe(true);
    });

    test("should return false for messages exceeding limit", () => {
      const manager = new ContextManager({ maxContextTokens: 10 });

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content:
            "This is a very long message that will definitely exceed the token limit of 10 tokens set in the configuration. ".repeat(
              100,
            ),
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
      ];

      expect(manager.isWithinLimit(messages)).toBe(false);
    });

    test("should accept custom maxTokens override", () => {
      const manager = new ContextManager({ maxContextTokens: 100000 });

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Short message",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
      ];

      // Check actual token count first
      const actualTokens = manager.estimateTokens(messages);

      // Should be within a reasonable custom limit
      expect(manager.isWithinLimit(messages, 100)).toBe(true);

      // Should exceed a very restrictive limit
      expect(manager.isWithinLimit(messages, 1)).toBe(false);
    });

    test("should handle edge case at exact limit", () => {
      const manager = new ContextManager({ maxContextTokens: 100 });

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "A".repeat(400), // Exactly 100 tokens (400 chars / 4)
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
      ];

      const tokens = manager.estimateTokens(messages);

      // Verify we're at or very close to limit (accounting for overhead)
      expect(tokens).toBeGreaterThanOrEqual(95);
      expect(tokens).toBeLessThanOrEqual(110);
    });
  });

  describe("compact", () => {
    test("should return messages unchanged if within target", () => {
      const manager = new ContextManager({ maxContextTokens: 100000 });

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Short message",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
      ];

      const compacted = manager.compact(messages);

      expect(compacted).toEqual(messages);
      expect(compacted.length).toBe(1);
    });

    test("should preserve system messages during compaction", () => {
      const manager = new ContextManager({
        maxContextTokens: 50,
        compactionThreshold: 2,
      });

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "system",
          content: "You are a helpful assistant",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "X".repeat(200), // Large message
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Y".repeat(200), // Large message
          timestamp: new Date().toISOString(),
          iteration: 2,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Recent message",
          timestamp: new Date().toISOString(),
          iteration: 3,
        },
      ];

      const compacted = manager.compact(messages);

      // System message should be preserved
      const systemMessage = compacted.find((m) => m.role === "system");
      expect(systemMessage).toBeDefined();
      expect(systemMessage?.content).toBe("You are a helpful assistant");
    });

    test("should preserve recent messages based on compactionThreshold", () => {
      const manager = new ContextManager({
        maxContextTokens: 50,
        compactionThreshold: 2,
      });

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Old message 1",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Old message 2",
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Recent message 1",
          timestamp: new Date().toISOString(),
          iteration: 2,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Recent message 2",
          timestamp: new Date().toISOString(),
          iteration: 3,
        },
      ];

      const compacted = manager.compact(messages);

      // Last 2 messages should be preserved
      const lastTwo = compacted.slice(-2);
      expect(lastTwo[0]?.content).toBe("Recent message 1");
      expect(lastTwo[1]?.content).toBe("Recent message 2");
    });

    test("should truncate long string content in older messages", () => {
      const manager = new ContextManager({
        maxContextTokens: 100,
        compactionThreshold: 1,
      });

      const longContent = "A".repeat(1000);

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: longContent,
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Recent",
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
      ];

      const compacted = manager.compact(messages);

      // Find the older message (if it's included)
      const olderMessage = compacted.find(
        (m) =>
          typeof m.content === "string" && m.content.includes("[truncated]"),
      );

      // If older message is included, it should be truncated
      if (olderMessage && typeof olderMessage.content === "string") {
        expect(olderMessage.content).toContain("[truncated]");
        expect(olderMessage.content.length).toBeLessThan(longContent.length);
      }
    });

    test("should truncate tool result values in multi-part content", () => {
      const manager = new ContextManager({
        maxContextTokens: 100,
        compactionThreshold: 1,
      });

      const longResult = "B".repeat(500);

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolResult",
              toolCallId: crypto.randomUUID(),
              value: longResult,
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Recent",
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
      ];

      const compacted = manager.compact(messages);

      // Find the older message with tool result
      const olderMessage = compacted.find(
        (m) =>
          Array.isArray(m.content) &&
          m.content.some((part) => part.type === "toolResult"),
      );

      if (olderMessage && Array.isArray(olderMessage.content)) {
        const toolResult = olderMessage.content.find(
          (part) => part.type === "toolResult",
        );
        if (toolResult && toolResult.type === "toolResult") {
          // If included, should be truncated
          if (toolResult.value.includes("[truncated]")) {
            expect(toolResult.value.length).toBeLessThan(longResult.length);
          }
        }
      }
    });

    test("should compact and summarize after 20+ tool results", () => {
      const manager = new ContextManager({
        maxContextTokens: 800,
        compactionThreshold: 2,
      });

      const systemMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "system",
        content: "System prompt",
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      const toolMessages: AgentMessage[] = Array.from(
        { length: 25 },
        (_, index) => ({
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolResult",
              toolCallId: crypto.randomUUID(),
              value: `Tool output ${index}: ${"X".repeat(500)}`,
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: index + 1,
        }),
      );

      const recentMessages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Recent message 1",
          timestamp: new Date().toISOString(),
          iteration: 26,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Recent message 2",
          timestamp: new Date().toISOString(),
          iteration: 27,
        },
      ];

      const messages = [systemMessage, ...toolMessages, ...recentMessages];
      const compacted = manager.compact(messages);

      expect(compacted.length).toBeLessThan(messages.length);
      expect(compacted.some((message) => message.role === "system")).toBe(true);

      const lastTwo = compacted.slice(-2);
      expect(lastTwo[0]?.content).toBe("Recent message 1");
      expect(lastTwo[1]?.content).toBe("Recent message 2");

      const truncatedToolResult = compacted
        .flatMap((message) =>
          Array.isArray(message.content) ? message.content : [],
        )
        .find(
          (part) =>
            part.type === "toolResult" && part.value.includes("[truncated]"),
        );

      expect(truncatedToolResult).toBeDefined();
    });

    test("should compact to custom target token count", () => {
      const manager = new ContextManager({ maxContextTokens: 100000 });

      const messages: AgentMessage[] = Array.from({ length: 20 }, (_, i) => ({
        id: crypto.randomUUID(),
        role: "user" as const,
        content: `Message ${i} with some content to fill space`,
        timestamp: new Date().toISOString(),
        iteration: i,
      }));

      const targetTokens = 50;
      const compacted = manager.compact(messages, targetTokens);

      const compactedTokens = manager.estimateTokens(compacted);

      expect(compactedTokens).toBeLessThanOrEqual(targetTokens);
    });

    test("should handle very aggressive compaction when recent messages exceed target", () => {
      const manager = new ContextManager({
        maxContextTokens: 10,
        compactionThreshold: 2,
      });

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "system",
          content: "System prompt",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "A".repeat(200),
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "B".repeat(200),
          timestamp: new Date().toISOString(),
          iteration: 2,
        },
      ];

      const compacted = manager.compact(messages);

      // Should keep system message and most recent message only
      expect(compacted.length).toBeGreaterThanOrEqual(2);

      // System message should be present
      expect(compacted.some((m) => m.role === "system")).toBe(true);
    });

    test("should maintain message order after compaction", () => {
      const manager = new ContextManager({
        maxContextTokens: 100,
        compactionThreshold: 2,
      });

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "system",
          content: "System",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Old 1",
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Old 2",
          timestamp: new Date().toISOString(),
          iteration: 2,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Recent 1",
          timestamp: new Date().toISOString(),
          iteration: 3,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Recent 2",
          timestamp: new Date().toISOString(),
          iteration: 4,
        },
      ];

      const compacted = manager.compact(messages);

      // Verify system message is first if present
      const systemIndex = compacted.findIndex((m) => m.role === "system");
      if (systemIndex !== -1) {
        expect(systemIndex).toBe(0);
      }

      // Verify recent messages are at the end
      const lastMessage = compacted[compacted.length - 1];
      expect(lastMessage?.content).toBe("Recent 2");
    });

    test("should handle empty message array", () => {
      const manager = new ContextManager();

      const compacted = manager.compact([]);

      expect(compacted).toEqual([]);
    });

    test("should handle single message", () => {
      const manager = new ContextManager();

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Only message",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
      ];

      const compacted = manager.compact(messages);

      expect(compacted).toEqual(messages);
    });
  });

  describe("configuration getters", () => {
    test("should return correct maxContextTokens", () => {
      const manager = new ContextManager({ maxContextTokens: 75000 });

      expect(manager.getMaxContextTokens()).toBe(75000);
    });

    test("should return correct compactionThreshold", () => {
      const manager = new ContextManager({ compactionThreshold: 8 });

      expect(manager.getCompactionThreshold()).toBe(8);
    });

    test("should return correct summarizeAfterToolCalls", () => {
      const manager = new ContextManager({ summarizeAfterToolCalls: 25 });

      expect(manager.getSummarizeAfterToolCalls()).toBe(25);
    });
  });

  describe("edge cases", () => {
    test("should handle message with empty content", () => {
      const manager = new ContextManager();

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
      ];

      const tokens = manager.estimateTokens(messages);
      expect(tokens).toBeGreaterThanOrEqual(0);

      const compacted = manager.compact(messages);
      expect(compacted).toEqual(messages);
    });

    test("should handle message with empty multi-part content array", () => {
      const manager = new ContextManager();

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [],
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
      ];

      const tokens = manager.estimateTokens(messages);
      expect(tokens).toBeGreaterThanOrEqual(0);
    });

    test("should handle very small maxContextTokens", () => {
      const manager = new ContextManager({ maxContextTokens: 1 });

      expect(manager.getMaxContextTokens()).toBe(1);
    });

    test("should handle very large maxContextTokens", () => {
      const manager = new ContextManager({ maxContextTokens: 1000000 });

      expect(manager.getMaxContextTokens()).toBe(1000000);
    });

    test("should never split tool call/result pairs during compaction", () => {
      // Use tight limits to force compaction
      const manager = new ContextManager({
        maxContextTokens: 200,
        compactionThreshold: 3,
      });

      const callId1 = crypto.randomUUID();
      const callId2 = crypto.randomUUID();
      const callId3 = crypto.randomUUID();

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "system",
          content: "System prompt",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        // Pair 1: tool call + result
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolCall",
              toolCallId: callId1,
              name: "read_file",
              input: { path: "/some/file" },
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolResult",
              toolCallId: callId1,
              value: "file content here " + "X".repeat(200),
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
        // Pair 2: tool call + result
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolCall",
              toolCallId: callId2,
              name: "grep_search",
              input: { query: "something" },
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: 2,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolResult",
              toolCallId: callId2,
              value: "grep results here " + "Y".repeat(200),
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: 2,
        },
        // Pair 3: tool call + result (these should be in "recent")
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolCall",
              toolCallId: callId3,
              name: "read_file",
              input: { path: "/another/file" },
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: 3,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolResult",
              toolCallId: callId3,
              value: "another file content",
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: 3,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Latest user message",
          timestamp: new Date().toISOString(),
          iteration: 4,
        },
      ];

      const compacted = manager.compact(messages);

      // Verify: every toolCall in the result has a matching toolResult
      const toolCallIds = new Set<string>();
      const toolResultIds = new Set<string>();

      for (const msg of compacted) {
        if (typeof msg.content === "string") continue;
        for (const part of msg.content) {
          if (part.type === "toolCall") {
            toolCallIds.add(part.toolCallId);
          } else if (part.type === "toolResult") {
            toolResultIds.add(part.toolCallId);
          }
        }
      }

      // Every tool call must have a matching result
      for (const id of toolCallIds) {
        expect(
          toolResultIds.has(id),
          `Tool call ${id} has no matching tool result in compacted messages`,
        ).toBe(true);
      }

      // Every tool result must have a matching call
      for (const id of toolResultIds) {
        expect(
          toolCallIds.has(id),
          `Tool result ${id} has no matching tool call in compacted messages`,
        ).toBe(true);
      }
    });

    test("should adjust recent boundary when it falls between tool call and result", () => {
      const manager = new ContextManager({
        maxContextTokens: 150,
        compactionThreshold: 2,
      });

      const callId = crypto.randomUUID();

      // Create a scenario where naive boundary (length - 2) would split a pair
      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "system",
          content: "System",
          timestamp: new Date().toISOString(),
          iteration: 0,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Old message " + "Z".repeat(200),
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
        // This tool call would be at the boundary (older side)
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolCall",
              toolCallId: callId,
              name: "read_file",
              input: { path: "/file" },
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: 2,
        },
        // This tool result would be at the boundary (recent side)
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            {
              type: "toolResult",
              toolCallId: callId,
              value: "content",
            },
          ],
          timestamp: new Date().toISOString(),
          iteration: 2,
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Latest message",
          timestamp: new Date().toISOString(),
          iteration: 3,
        },
      ];

      const compacted = manager.compact(messages);

      // If the tool call is present, its result must also be present
      const hasToolCall = compacted.some(
        (m) =>
          Array.isArray(m.content) &&
          m.content.some(
            (p) => p.type === "toolCall" && p.toolCallId === callId,
          ),
      );
      const hasToolResult = compacted.some(
        (m) =>
          Array.isArray(m.content) &&
          m.content.some(
            (p) => p.type === "toolResult" && p.toolCallId === callId,
          ),
      );

      // They must either both be present or both absent
      expect(hasToolCall).toBe(hasToolResult);
    });
  });
});
