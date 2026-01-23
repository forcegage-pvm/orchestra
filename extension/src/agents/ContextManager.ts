/**
 * ContextManager - Token counting and context window management
 *
 * Manages LLM context window size to prevent token limit overflow by:
 * - Estimating token counts for message arrays
 * - Checking if messages fit within configured limits
 * - Compacting older messages when limits are approached
 *
 * @module agents/ContextManager
 */

import type { AgentMessage, MessageContentPart } from "./types.js";

/**
 * ContextManager configuration options
 */
export interface ContextManagerConfig {
  /** Maximum tokens allowed in context (default: 100000) */
  maxContextTokens?: number;

  /** Threshold before compaction triggers (default: 5) */
  compactionThreshold?: number;

  /** Tool calls before summarization kicks in (default: 20) */
  summarizeAfterToolCalls?: number;
}

/**
 * ContextManager - Manages LLM context window size
 *
 * Uses approximate token estimation (4 chars ≈ 1 token) and provides
 * compaction strategies to keep context within model limits.
 *
 * **Token Estimation:**
 * - English text: ~4 characters per token
 * - Accounts for message structure overhead
 *
 * **Compaction Strategy:**
 * When context exceeds limit:
 * 1. Preserve system messages and recent messages
 * 2. Summarize older tool results (keep tool name + status, truncate output)
 * 3. Target: reduce to ~80% of limit to leave room for growth
 */
export class ContextManager {
  private readonly maxContextTokens: number;
  private readonly compactionThreshold: number;
  private readonly summarizeAfterToolCalls: number;

  /**
   * Create a new ContextManager
   *
   * @param config - Configuration options
   */
  constructor(config?: ContextManagerConfig) {
    this.maxContextTokens = config?.maxContextTokens ?? 100000;
    this.compactionThreshold = config?.compactionThreshold ?? 5;
    this.summarizeAfterToolCalls = config?.summarizeAfterToolCalls ?? 20;
  }

  /**
   * Estimate token count for an array of messages
   *
   * Uses the heuristic: 4 characters ≈ 1 token for English text.
   * Accounts for message structure overhead.
   *
   * @param messages - Array of agent messages
   * @returns Estimated token count
   */
  estimateTokens(messages: AgentMessage[]): number {
    let totalChars = 0;

    for (const message of messages) {
      // Count role and timestamp overhead
      totalChars += message.role.length + 20; // role + timestamp structure

      // Count content
      if (typeof message.content === "string") {
        totalChars += message.content.length;
      } else {
        // Multi-part content
        for (const part of message.content) {
          totalChars += this.estimateContentPartSize(part);
        }
      }

      // Count tool call IDs if present
      if (message.toolCallIds) {
        totalChars += message.toolCallIds.join("").length;
      }
    }

    // Convert characters to tokens (4 chars ≈ 1 token)
    return Math.ceil(totalChars / 4);
  }

  /**
   * Estimate size of a message content part
   *
   * @param part - Content part to estimate
   * @returns Character count
   */
  private estimateContentPartSize(part: MessageContentPart): number {
    switch (part.type) {
      case "text":
        return part.value.length;
      case "toolCall":
        return 50 + part.toolCallId.length; // Structure overhead + ID
      case "toolResult":
        return 50 + part.toolCallId.length + part.value.length; // Structure + ID + result
      default:
        return 0;
    }
  }

  /**
   * Check if messages fit within token limit
   *
   * @param messages - Array of messages to check
   * @param maxTokens - Optional override for max tokens (defaults to config value)
   * @returns True if messages fit within limit
   */
  isWithinLimit(messages: AgentMessage[], maxTokens?: number): boolean {
    const limit = maxTokens ?? this.maxContextTokens;
    const tokenCount = this.estimateTokens(messages);
    return tokenCount <= limit;
  }

  /**
   * Compact messages to fit within target token count
   *
   * Strategy:
   * 1. Always preserve system messages (role === "system")
   * 2. Preserve last N messages (based on compactionThreshold)
   * 3. Summarize older tool results (truncate long outputs)
   * 4. Remove very old messages if still over limit
   *
   * @param messages - Array of messages to compact
   * @param targetTokens - Target token count (defaults to 80% of maxContextTokens)
   * @returns Compacted message array
   */
  compact(messages: AgentMessage[], targetTokens?: number): AgentMessage[] {
    const target = targetTokens ?? Math.floor(this.maxContextTokens * 0.8);

    // If already within limit, return as-is
    if (this.estimateTokens(messages) <= target) {
      return messages;
    }

    // Separate system messages, recent messages, and older messages
    const systemMessages: AgentMessage[] = [];
    const recentMessages: AgentMessage[] = [];
    const olderMessages: AgentMessage[] = [];

    // Keep last compactionThreshold messages as "recent"
    const recentStartIndex = Math.max(0, messages.length - this.compactionThreshold);

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (!message) continue; // Skip undefined entries

      if (message.role === "system") {
        systemMessages.push(message);
      } else if (i >= recentStartIndex) {
        recentMessages.push(message);
      } else {
        olderMessages.push(message);
      }
    }

    // Start with system + recent
    let compacted = [...systemMessages, ...recentMessages];

    // If still over limit, we need to be more aggressive
    if (this.estimateTokens(compacted) > target) {
      // Keep only system messages and the most recent message
      const lastRecent = recentMessages[recentMessages.length - 1];
      if (lastRecent) {
        compacted = [...systemMessages, lastRecent];
      } else {
        compacted = systemMessages;
      }
      return compacted;
    }

    // Try to add summarized older messages
    const summarizedOlder = this.summarizeMessages(olderMessages);

    // Add summarized older messages one by one until we approach limit
    const result = [...systemMessages];
    let currentTokens = this.estimateTokens(result);

    for (const message of summarizedOlder) {
      const messageTokens = this.estimateTokens([message]);
      if (currentTokens + messageTokens <= target * 0.9) {
        // Leave 10% buffer
        result.push(message);
        currentTokens += messageTokens;
      } else {
        break; // Stop adding if we'd exceed limit
      }
    }

    // Add recent messages at the end
    result.push(...recentMessages);

    return result;
  }

  /**
   * Summarize messages by truncating tool results
   *
   * Keeps tool call structure but truncates long outputs to save tokens.
   *
   * @param messages - Messages to summarize
   * @returns Summarized messages
   */
  private summarizeMessages(messages: AgentMessage[]): AgentMessage[] {
    return messages.map((message) => {
      // If content is string, truncate if too long
      if (typeof message.content === "string") {
        if (message.content.length > 500) {
          return {
            ...message,
            content: message.content.slice(0, 500) + "... [truncated]",
          };
        }
        return message;
      }

      // For multi-part content, truncate tool results
      const summarizedParts = message.content.map((part) => {
        if (part.type === "toolResult" && part.value.length > 200) {
          return {
            ...part,
            value: part.value.slice(0, 200) + "... [truncated]",
          };
        }
        return part;
      });

      return {
        ...message,
        content: summarizedParts,
      };
    });
  }

  /**
   * Get the configured maximum context tokens
   *
   * @returns Maximum context tokens
   */
  getMaxContextTokens(): number {
    return this.maxContextTokens;
  }

  /**
   * Get the configured compaction threshold
   *
   * @returns Compaction threshold
   */
  getCompactionThreshold(): number {
    return this.compactionThreshold;
  }

  /**
   * Get the configured summarize after tool calls value
   *
   * @returns Summarize after tool calls threshold
   */
  getSummarizeAfterToolCalls(): number {
    return this.summarizeAfterToolCalls;
  }
}
