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
   * 3. Ensure tool call/result pairs are never split (LLM API requirement)
   * 4. Summarize older tool results (truncate long outputs)
   * 5. Remove very old messages if still over limit
   *
   * CRITICAL: LLM APIs require that every tool_call has a matching tool_result.
   * The compaction boundary must never split a tool_call/tool_result pair.
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

    // Separate system messages from conversation messages
    const systemMessages: AgentMessage[] = [];
    const conversationMessages: AgentMessage[] = [];

    for (const message of messages) {
      if (!message) continue;
      if (message.role === "system") {
        systemMessages.push(message);
      } else {
        conversationMessages.push(message);
      }
    }

    // Find a safe split point that doesn't break tool call/result pairs.
    // We want to keep at least compactionThreshold messages as "recent",
    // but we must expand the boundary if it falls between a pair.
    const safeRecentStart = this.findSafeRecentBoundary(
      conversationMessages,
      this.compactionThreshold,
    );

    const olderMessages = conversationMessages.slice(0, safeRecentStart);
    const recentMessages = conversationMessages.slice(safeRecentStart);

    // Start with system + recent
    let compacted = [...systemMessages, ...recentMessages];

    // If still over limit, we need to be more aggressive
    if (this.estimateTokens(compacted) > target) {
      // Keep minimum messages from the end that preserve tool-pair integrity.
      // Use findSafeRecentBoundary with threshold=1 to find the smallest safe
      // suffix of recentMessages — this ensures we never orphan a tool_call
      // without its tool_result (or vice versa), which would cause LLM API errors.
      const safeTailStart = this.findSafeRecentBoundary(recentMessages, 1);
      const safeTail = recentMessages.slice(safeTailStart);

      if (safeTail.length > 0) {
        compacted = [...systemMessages, ...safeTail];
      } else {
        compacted = systemMessages;
      }
      return this.ensureToolPairIntegrity(compacted);
    }

    // Try to add summarized older messages (in tool-pair-safe groups)
    const summarizedOlder = this.summarizeMessages(olderMessages);
    const olderGroups = this.groupToolPairs(summarizedOlder);

    // Add summarized older message groups until we approach limit
    const result = [...systemMessages];
    let currentTokens = this.estimateTokens(result);

    for (const group of olderGroups) {
      const groupTokens = this.estimateTokens(group);
      if (currentTokens + groupTokens <= target * 0.9) {
        // Leave 10% buffer
        result.push(...group);
        currentTokens += groupTokens;
      } else {
        break; // Stop adding if we'd exceed limit
      }
    }

    // Add recent messages at the end
    result.push(...recentMessages);

    return this.ensureToolPairIntegrity(result);
  }

  /**
   * Find a safe boundary index for splitting older/recent messages.
   *
   * The boundary must not fall between a tool_call message and its tool_result message.
   * If the naive boundary (length - threshold) would split a pair, we move it earlier
   * to include the full pair in the "recent" section.
   *
   * @param messages - Conversation messages (excluding system)
   * @param threshold - Minimum number of recent messages to keep
   * @returns Safe index where "recent" starts
   */
  private findSafeRecentBoundary(
    messages: AgentMessage[],
    threshold: number,
  ): number {
    let boundary = Math.max(0, messages.length - threshold);

    // Walk backwards from boundary to ensure we don't split a tool pair.
    // A tool_call message at boundary-1 (in "older") whose result is at boundary
    // (in "recent") would be split. We need to include the tool_call in "recent".
    while (boundary > 0) {
      const msgAtBoundary = messages[boundary];
      if (msgAtBoundary && this.hasToolResults(msgAtBoundary)) {
        // This message has tool results. Check if the preceding message has
        // the matching tool calls. If so, move boundary back to include it.
        const prevMsg = messages[boundary - 1];
        if (prevMsg && this.hasToolCalls(prevMsg)) {
          boundary--;
          continue;
        }
      }
      break;
    }

    return boundary;
  }

  /**
   * Group messages into tool-pair-safe groups for incremental addition.
   *
   * A tool_call message and the following tool_result message form one group.
   * Other messages are individual groups. This ensures we never add a tool_call
   * without its result (or vice versa) during the budget-limited older message loop.
   *
   * @param messages - Messages to group
   * @returns Array of message groups (each group is 1-2 messages)
   */
  private groupToolPairs(messages: AgentMessage[]): AgentMessage[][] {
    const groups: AgentMessage[][] = [];
    let i = 0;

    while (i < messages.length) {
      const msg = messages[i]!;
      if (this.hasToolCalls(msg)) {
        // Check if next message has matching tool results
        const next = messages[i + 1];
        if (next && this.hasToolResults(next)) {
          groups.push([msg, next]);
          i += 2;
          continue;
        }
      }
      groups.push([msg]);
      i++;
    }

    return groups;
  }

  /**
   * Check if a message contains tool call content parts
   */
  private hasToolCalls(message: AgentMessage): boolean {
    if (typeof message.content === "string") return false;
    return message.content.some((part) => part.type === "toolCall");
  }

  /**
   * Check if a message contains tool result content parts
   */
  private hasToolResults(message: AgentMessage): boolean {
    if (typeof message.content === "string") return false;
    return message.content.some((part) => part.type === "toolResult");
  }

  /**
   * Ensure every tool_call has a matching tool_result and vice versa.
   *
   * This is a safety net to prevent LLM API errors like:
   *   "tool_use ids were found without tool_result blocks immediately after"
   *
   * If orphaned tool_call or tool_result messages are found (e.g., from aggressive
   * compaction), they are removed entirely. Messages with mixed content (both orphaned
   * and non-orphaned parts) have only the orphaned parts stripped.
   *
   * @param messages - Messages to validate
   * @returns Messages with orphaned tool parts removed
   */
  ensureToolPairIntegrity(messages: AgentMessage[]): AgentMessage[] {
    // Collect all toolCall IDs and toolResult IDs
    const toolCallIds = new Set<string>();
    const toolResultIds = new Set<string>();

    for (const msg of messages) {
      if (typeof msg.content === "string") continue;
      for (const part of msg.content) {
        if (part.type === "toolCall") toolCallIds.add(part.toolCallId);
        if (part.type === "toolResult") toolResultIds.add(part.toolCallId);
      }
    }

    // Find orphaned IDs (tool_call without tool_result, or vice versa)
    const orphanedCallIds = new Set(
      [...toolCallIds].filter((id) => !toolResultIds.has(id)),
    );
    const orphanedResultIds = new Set(
      [...toolResultIds].filter((id) => !toolCallIds.has(id)),
    );

    // If all pairs are complete, return as-is
    if (orphanedCallIds.size === 0 && orphanedResultIds.size === 0) {
      return messages;
    }

    // Filter out messages that consist entirely of orphaned tool parts.
    // For messages with mixed content, strip only the orphaned parts.
    return messages
      .map((msg) => {
        if (typeof msg.content === "string") return msg;

        const filteredParts = msg.content.filter((part) => {
          if (
            part.type === "toolCall" &&
            orphanedCallIds.has(part.toolCallId)
          ) {
            return false;
          }
          if (
            part.type === "toolResult" &&
            orphanedResultIds.has(part.toolCallId)
          ) {
            return false;
          }
          return true;
        });

        // If all parts were orphaned, remove the entire message
        if (filteredParts.length === 0) return null;

        // If some parts were removed, return message with remaining parts
        if (filteredParts.length !== msg.content.length) {
          return { ...msg, content: filteredParts };
        }

        return msg;
      })
      .filter((msg): msg is AgentMessage => msg !== null);
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
