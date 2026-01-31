/**
 * Agent output conversion utilities
 */

import type { AgentOutput } from "../../agents/AgentRunner.js";
import type { AgentOutputItem } from "./templates/agentOutputTemplate.js";

export type AgentOutputConversion =
  | { type: "item"; item: AgentOutputItem }
  | { type: "status"; status: string }
  | { type: "ignore" };

export type AgentOutputEvent = (
  listener: (output: AgentOutput) => void,
  thisArgs?: unknown,
  disposables?: Array<{ dispose(): void }>,
) => { dispose(): void };

export interface AgentOutputPanelLike {
  addOutput: (item: AgentOutputItem) => void;
  updateStatus: (status: string) => void;
}

const defaultId = (): string => crypto.randomUUID();

function getToolName(output: AgentOutput): string {
  return output.toolName ?? "Unknown Tool";
}

export function convertAgentOutput(
  output: AgentOutput,
  generateId: () => string = defaultId,
): AgentOutputConversion {
  if (output.type === "status") {
    return {
      type: "status",
      status:
        output.newStatus ?? output.text ?? output.errorMessage ?? "Unknown",
    };
  }

  if (output.type === "prompt") {
    return {
      type: "item",
      item: {
        id: generateId(),
        type: "prompt",
        timestamp: output.timestamp,
        content: { text: output.text ?? "", attachments: output.attachments },
      },
    };
  }

  if (output.type === "thinking") {
    return {
      type: "item",
      item: {
        id: generateId(),
        type: "thinking",
        timestamp: output.timestamp,
        content: { text: output.text ?? "" },
      },
    };
  }

  if (output.type === "tool_call") {
    return {
      type: "item",
      item: {
        id: generateId(),
        type: "tool_call",
        timestamp: output.timestamp,
        content: {
          toolName: getToolName(output),
          arguments: output.toolInput ?? {},
        },
      },
    };
  }

  if (output.type === "tool_result") {
    return {
      type: "item",
      item: {
        id: generateId(),
        type: "tool_result",
        timestamp: output.timestamp,
        content: {
          toolName: getToolName(output),
          success: output.toolSuccess ?? true,
          output: output.toolResult ?? "",
        },
        debug:
          typeof output.toolDuration === "number"
            ? { durationMs: output.toolDuration }
            : undefined,
      },
    };
  }

  if (output.type === "tool_progress") {
    return {
      type: "item",
      item: {
        id: generateId(),
        type: "tool_progress",
        timestamp: output.timestamp,
        content: {
          toolName: getToolName(output),
          message: output.text ?? "",
          percent: output.progressPercent,
        },
      },
    };
  }

  if (output.type === "tool_output") {
    return {
      type: "item",
      item: {
        id: generateId(),
        type: "tool_output",
        timestamp: output.timestamp,
        content: {
          toolName: getToolName(output),
          chunk: output.streamChunk ?? "",
        },
      },
    };
  }

  if (output.type === "tool_file_operation" && output.fileOperation) {
    return {
      type: "item",
      item: {
        id: generateId(),
        type: "tool_file_operation",
        timestamp: output.timestamp,
        content: {
          toolName: getToolName(output),
          fileOperation: output.fileOperation,
        },
      },
    };
  }

  if (output.type === "tool_metadata" && output.metadata) {
    return {
      type: "item",
      item: {
        id: generateId(),
        type: "tool_metadata",
        timestamp: output.timestamp,
        content: {
          toolName: getToolName(output),
          metadata: output.metadata,
        },
      },
    };
  }

  if (output.type === "error") {
    const content: {
      toolName: string;
      success: boolean;
      output: string;
      error?: string;
    } = {
      toolName: getToolName(output),
      success: false,
      output: output.errorMessage ?? "Unknown error",
    };
    if (output.errorCode) {
      content.error = output.errorCode;
    }

    return {
      type: "item",
      item: {
        id: generateId(),
        type: "tool_result",
        timestamp: output.timestamp,
        content,
      },
    };
  }

  // Catch-all for any unregistered message types
  return {
    type: "item",
    item: {
      id: generateId(),
      type: "unknown",
      timestamp: output.timestamp,
      content: {
        rawType: output.type,
        rawOutput: JSON.stringify(output, null, 2),
      },
    },
  };
}

export function bindAgentOutput(
  onOutput: AgentOutputEvent,
  panel: AgentOutputPanelLike,
  generateId?: () => string,
): { dispose(): void } {
  return onOutput((output) => {
    const conversion = convertAgentOutput(output, generateId);
    if (conversion.type === "item") {
      panel.addOutput(conversion.item);
      return;
    }

    if (conversion.type === "status") {
      panel.updateStatus(conversion.status);
    }
  });
}
