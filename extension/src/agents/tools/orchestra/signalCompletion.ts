/**
 * signalCompletion tool - Record a completion signal in the local database
 */

import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";
import { getCurrentTask } from "../../../database/queries.js";
import { createSignal } from "../../../database/mutations.js";

type ArtifactType = "CREATE" | "UPDATE" | "DELETE";

interface SignalCompletionInput {
  summary: string;
  artifacts: Array<{ path: string; type: ArtifactType; description?: string }>;
  build_status: "PASS" | "FAIL";
  test_status: "PASS" | "FAIL";
  notes?: string;
}

export const signalCompletionTool: AgentTool = {
  name: "signal_completion",
  description: "Signal task completion to the local Orchestra database.",
  inputSchema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Summary of work completed",
      },
      artifacts: {
        type: "array",
        description: "List of artifacts created or modified",
      },
      build_status: {
        type: "string",
        enum: ["PASS", "FAIL"],
        description: "Build status",
      },
      test_status: {
        type: "string",
        enum: ["PASS", "FAIL"],
        description: "Test status",
      },
      notes: {
        type: "string",
        description: "Optional notes",
      },
    },
    required: ["summary", "artifacts", "build_status", "test_status"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const parsed = input as SignalCompletionInput;
      const currentTask = getCurrentTask(context.workspaceRoot);

      if (!currentTask) {
        return {
          success: false,
          output: "",
          error: "No current task found to signal completion.",
        };
      }

      const signalInput: {
        summary: string;
        artifacts: Array<{
          path: string;
          type: ArtifactType;
          description?: string;
        }>;
        buildStatus: "PASS" | "FAIL";
        testStatus: "PASS" | "FAIL";
        notes?: string;
      } = {
        summary: parsed.summary,
        artifacts: parsed.artifacts,
        buildStatus: parsed.build_status,
        testStatus: parsed.test_status,
      };

      if (parsed.notes !== undefined) {
        signalInput.notes = parsed.notes;
      }

      const signalId = createSignal(
        context.workspaceRoot,
        currentTask.id,
        signalInput,
      );

      return {
        success: true,
        output: JSON.stringify({
          signal_id: signalId,
          task_id: currentTask.id,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        output: "",
        error: `Failed to signal completion for ${context.workspaceRoot}: ${message}`,
      };
    }
  },
};
