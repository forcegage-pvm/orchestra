/**
 * Tool Call Aggregator
 *
 * Transforms a flat list of AgentEvent instances into a structured
 * ToolCallAggregate for a specific tool invocation.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 1.6
 */

import type {
  AgentEvent,
  FileOperation,
  ToolCallAggregate,
  ToolCallEvent,
  ToolFileOperationEvent,
  ToolMetadataEvent,
  ToolOutputEvent,
  ToolProgressEvent,
  ToolResultEvent,
} from "./types.js";

/**
 * Aggregates all events for a specific tool call into a structured view
 *
 * @param events - Full array of session events
 * @param toolCallId - Target tool call identifier
 * @returns Aggregated tool call data, or null if no matching call found
 *
 * @example
 * ```typescript
 * const aggregate = aggregateToolCall(events, "tool-call-123");
 * if (aggregate) {
 *   console.log(`${aggregate.toolName}: ${aggregate.status}`);
 * }
 * ```
 */
export function aggregateToolCall(
  events: AgentEvent[],
  toolCallId: string
): ToolCallAggregate | null {
  // Filter events for this specific tool call
  const relevantEvents = events.filter((event) => {
    if (event.type === "tool_call") {
      return (event as ToolCallEvent).toolCallId === toolCallId;
    }
    if (
      event.type === "tool_progress" ||
      event.type === "tool_output" ||
      event.type === "tool_file_operation" ||
      event.type === "tool_metadata" ||
      event.type === "tool_result"
    ) {
      return (
        (event as { toolCallId: string }).toolCallId === toolCallId
      );
    }
    return false;
  });

  // Find the initiating ToolCallEvent
  const callEvent = relevantEvents.find(
    (e) => e.type === "tool_call"
  ) as ToolCallEvent | undefined;

  if (!callEvent) {
    return null;
  }

  // Extract basic properties from call event
  const toolName = callEvent.toolName;
  const toolCategory = callEvent.toolCategory;
  const args = callEvent.arguments;
  const startedAt = callEvent.timestamp;

  // Find result event (if present)
  const resultEvent = relevantEvents.find(
    (e) => e.type === "tool_result"
  ) as ToolResultEvent | undefined;

  // Compute status based on event progression
  let status: "pending" | "running" | "success" | "failed";
  if (!resultEvent) {
    // No result yet - check if there's progress
    const hasProgress = relevantEvents.some(
      (e) => e.type === "tool_progress"
    );
    status = hasProgress ? "running" : "pending";
  } else {
    // Result exists - use success flag
    status = resultEvent.success ? "success" : "failed";
  }

  // Extract completion data from result event
  const completedAt = resultEvent?.timestamp;
  const durationMs = resultEvent?.durationMs;
  const result = resultEvent?.output;
  const error = resultEvent?.error;

  // Aggregate progress events (use most recent)
  const progressEvents = relevantEvents.filter(
    (e) => e.type === "tool_progress"
  ) as ToolProgressEvent[];

  const lastProgress = progressEvents[progressEvents.length - 1];
  const lastProgressMessage = lastProgress?.message;
  const progressPercent = lastProgress?.percent;

  // Aggregate output chunks in order
  const outputEvents = relevantEvents.filter(
    (e) => e.type === "tool_output"
  ) as ToolOutputEvent[];

  const outputChunks = outputEvents.map((e) => e.chunk);
  const outputLineCount = outputChunks.join("").split("\n").length;

  // Collect file operations
  const fileOpEvents = relevantEvents.filter(
    (e) => e.type === "tool_file_operation"
  ) as ToolFileOperationEvent[];

  const fileOperations: FileOperation[] = fileOpEvents.map(
    (e) => e.operation
  );

  // Merge metadata from multiple events
  const metadataEvents = relevantEvents.filter(
    (e) => e.type === "tool_metadata"
  ) as ToolMetadataEvent[];

  const metadata: Record<string, unknown> = {};
  for (const event of metadataEvents) {
    metadata[event.key] = event.value;
  }

  // Build aggregate
  const aggregate: ToolCallAggregate = {
    toolCallId,
    toolName,
    toolCategory,
    status,
    startedAt,
    completedAt,
    durationMs,
    arguments: args,
    result,
    error,
    lastProgressMessage,
    progressPercent,
    outputChunks,
    outputLineCount,
    fileOperations,
    metadata,
    events: relevantEvents,
  };

  return aggregate;
}
