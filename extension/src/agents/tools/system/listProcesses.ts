/**
 * listProcesses tool - List managed background processes
 */

import { z } from "zod";

import { ToolErrorCode } from "../errors.js";
import { ProcessManager } from "../infrastructure/ProcessManager.js";
import type {
  AgentTool,
  ProcessInfo,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "list_processes";

const ListProcessesInputSchema = z.object({
  status: z
    .enum(["STARTING", "RUNNING", "READY", "STOPPED", "FAILED"])
    .optional(),
});

type ListProcessesInput = z.output<typeof ListProcessesInputSchema>;

function buildToolResult(partial: Partial<ToolResult>): ToolResult {
  return {
    success: partial.success ?? false,
    content: partial.content ?? [],
    error: partial.error,
    metadata: partial.metadata ?? {
      toolName: TOOL_NAME,
      callId: "",
      durationMs: 0,
    },
  };
}

/**
 * Agent tool for listing managed background processes
 * Returns process info with optional status filtering
 * Respects CancellationToken for interruptibility
 * @property name - Tool identifier: "list_processes"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const listProcessesTool: AgentTool<ListProcessesInput> = {
  name: TOOL_NAME,
  description: "List background processes managed by the ProcessManager.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Optional process status to filter by",
        enum: ["STARTING", "RUNNING", "READY", "STOPPED", "FAILED"],
      },
    },
  },
  invoke: async (
    input: ListProcessesInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    const callId = crypto.randomUUID();
    context.observer?.onProgress?.(callId, "Listing background processes");

    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Process listing cancelled.",
          "Retry after cancellation is cleared.",
        ),
      );
    }

    const parsed = ListProcessesInputSchema.safeParse(input);
    if (!parsed.success) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Invalid list_processes input.",
          "Check the status filter.",
          { issues: parsed.error.issues },
        ),
      );
    }

    const manager = ProcessManager.getInstance();
    const processes: ProcessInfo[] = manager.listProcesses(parsed.data.status);

    // Emit metadata with process count
    context.observer?.onMetadata?.(callId, "processCount", processes.length);

    return buildToolResult(
      successResult(TOOL_NAME, [
        { type: "json", value: JSON.stringify(processes, null, 2) },
      ]),
    );
  },
};
