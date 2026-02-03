/**
 * Event Aggregation Logic
 *
 * Aggregates tool-related events into ToolCallAggregate structures.
 * Implements the specification's tool call grouping behavior.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 4.1
 */

import type {
  AgentEvent,
  ToolCallAggregate,
  ToolCallEvent,
  ToolFileOperationEvent,
  ToolMetadataEvent,
  ToolOutputEvent,
  ToolProgressEvent,
  ToolResultEvent,
} from "../../../agents/sessions/types.js";

/**
 * Aggregate tool events by toolCallId
 *
 * Takes all events and builds ToolCallAggregate structures by grouping
 * events with matching toolCallId:
 * - tool_call → Header (required, creates aggregate)
 * - tool_progress → Progress updates
 * - tool_output → Streaming output chunks
 * - tool_file_operation → File operations
 * - tool_metadata → Metadata
 * - tool_result → Result (completes aggregate)
 *
 * @param events All events from the session
 * @returns Record of ToolCallAggregates indexed by toolCallId
 */
export function aggregateToolCalls(
  events: AgentEvent[],
): Record<string, ToolCallAggregate> {
  const aggregates: Record<string, ToolCallAggregate> = {};

  for (const event of events) {
    switch (event.type) {
      case "tool_call": {
        const toolEvent = event as ToolCallEvent;
        aggregates[toolEvent.toolCallId] = {
          toolCallId: toolEvent.toolCallId,
          toolName: toolEvent.toolName,
          toolCategory: toolEvent.toolCategory,
          status: "pending",
          startedAt: toolEvent.timestamp,
          arguments: toolEvent.arguments,
          fileOperations: [],
          metadata: {},
          outputChunks: [],
          outputLineCount: 0,
        };
        break;
      }

      case "tool_progress": {
        const progressEvent = event as ToolProgressEvent;
        const aggregate = aggregates[progressEvent.toolCallId];
        if (aggregate) {
          aggregate.status = "running";
          aggregate.lastProgressMessage = progressEvent.message;
          if (progressEvent.percent !== undefined) {
            aggregate.progressPercent = progressEvent.percent;
          }
        }
        break;
      }

      case "tool_output": {
        const outputEvent = event as ToolOutputEvent;
        const aggregate = aggregates[outputEvent.toolCallId];
        if (aggregate) {
          aggregate.status = "running";
          aggregate.outputChunks.push(outputEvent.chunk);
          // Count lines in this chunk
          const lines = outputEvent.chunk.split("\n").length - 1;
          aggregate.outputLineCount += lines;
        }
        break;
      }

      case "tool_file_operation": {
        const fileOpEvent = event as ToolFileOperationEvent;
        const aggregate = aggregates[fileOpEvent.toolCallId];
        if (aggregate) {
          aggregate.fileOperations.push(fileOpEvent.operation);
        }
        break;
      }

      case "tool_metadata": {
        const metadataEvent = event as ToolMetadataEvent;
        const aggregate = aggregates[metadataEvent.toolCallId];
        if (aggregate) {
          aggregate.metadata[metadataEvent.key] = metadataEvent.value;
        }
        break;
      }

      case "tool_result": {
        const resultEvent = event as ToolResultEvent;
        const aggregate = aggregates[resultEvent.toolCallId];
        if (aggregate) {
          aggregate.status = resultEvent.success ? "success" : "failed";
          aggregate.completedAt = resultEvent.timestamp;
          aggregate.durationMs = resultEvent.durationMs;
          aggregate.result = resultEvent.output;
          if (resultEvent.error) {
            aggregate.error = resultEvent.error;
          }
        }
        break;
      }

      // Other event types are not tool-related
      default:
        break;
    }
  }

  return aggregates;
}

/**
 * Update a single tool call aggregate incrementally
 *
 * More efficient than rebuilding all aggregates - use this when
 * receiving a single new event.
 *
 * @param aggregate Existing aggregate (or undefined to create new)
 * @param event New event to incorporate
 * @returns Updated aggregate
 */
export function updateToolCallAggregate(
  aggregate: ToolCallAggregate | undefined,
  event: AgentEvent,
): ToolCallAggregate | undefined {
  switch (event.type) {
    case "tool_call": {
      const toolEvent = event as ToolCallEvent;
      return {
        toolCallId: toolEvent.toolCallId,
        toolName: toolEvent.toolName,
        toolCategory: toolEvent.toolCategory,
        status: "pending",
        startedAt: toolEvent.timestamp,
        arguments: toolEvent.arguments,
        fileOperations: [],
        metadata: {},
        outputChunks: [],
        outputLineCount: 0,
      };
    }

    case "tool_progress": {
      if (!aggregate) return undefined;
      const progressEvent = event as ToolProgressEvent;
      return {
        ...aggregate,
        status: "running",
        lastProgressMessage: progressEvent.message,
        progressPercent: progressEvent.percent,
      };
    }

    case "tool_output": {
      if (!aggregate) return undefined;
      const outputEvent = event as ToolOutputEvent;
      const lines = outputEvent.chunk.split("\n").length - 1;
      return {
        ...aggregate,
        status: "running",
        outputChunks: [...aggregate.outputChunks, outputEvent.chunk],
        outputLineCount: aggregate.outputLineCount + lines,
      };
    }

    case "tool_file_operation": {
      if (!aggregate) return undefined;
      const fileOpEvent = event as ToolFileOperationEvent;
      return {
        ...aggregate,
        fileOperations: [...aggregate.fileOperations, fileOpEvent.operation],
      };
    }

    case "tool_metadata": {
      if (!aggregate) return undefined;
      const metadataEvent = event as ToolMetadataEvent;
      return {
        ...aggregate,
        metadata: {
          ...aggregate.metadata,
          [metadataEvent.key]: metadataEvent.value,
        },
      };
    }

    case "tool_result": {
      if (!aggregate) return undefined;
      const resultEvent = event as ToolResultEvent;
      return {
        ...aggregate,
        status: resultEvent.success ? "success" : "failed",
        completedAt: resultEvent.timestamp,
        durationMs: resultEvent.durationMs,
        result: resultEvent.output,
        error: resultEvent.error,
      };
    }

    default:
      return aggregate;
  }
}
