/**
 * Wait For Input Tool
 *
 * Pauses agent execution and waits for user input before continuing.
 * Use this when you want to stop and wait for further instructions.
 */

import type { AgentTool, ToolResult } from "../types.js";

/**
 * Input schema for wait_for_input tool
 */
export interface WaitForInputInput {
  /** Message to display to user explaining what you're waiting for */
  message: string;
}

/**
 * Wait For Input Tool
 *
 * Signals the agent runtime to pause execution and wait for user input.
 * The agent will stop iterating until the user provides a new message.
 *
 * @example
 * // Agent calls this tool to pause and wait
 * {
 *   "message": "Awaiting your instructions before proceeding with the task."
 * }
 */
export const waitForInputTool: AgentTool<WaitForInputInput> = {
  name: "wait_for_input",
  description:
    "Pause agent execution and wait for user input before continuing. " +
    "Use this when you need to stop and wait for further instructions, " +
    "clarification, or approval from the user before proceeding.",

  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description:
          "A message explaining what you're waiting for or what kind of input you need from the user",
      },
    },
    required: ["message"],
  },

  async invoke(input: WaitForInputInput): Promise<ToolResult> {
    const startTime = Date.now();

    return {
      success: true,
      content: [
        {
          type: "text",
          value: `⏸️ Paused: ${input.message}\n\nThe agent is now waiting for your input. Type a message in the input box below to continue.`,
        },
      ],
      metadata: {
        toolName: "wait_for_input",
        callId: "",
        durationMs: Date.now() - startTime,
      },
      signal: "pause",
    };
  },
};
