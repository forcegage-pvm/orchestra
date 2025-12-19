/**
 * ChatInvoker - Utility for invoking VS Code Chat with Orchestra agents
 *
 * Centralizes the pattern for programmatically opening VS Code Chat
 * with the @orchestra participant and appropriate agent context.
 */

import * as vscode from "vscode";
import { OrchestraLogger } from "../utils/logger.js";

/**
 * Agent mode for chat invocation
 */
export type AgentMode = "orchestrator" | "implementor";

/**
 * Options for chat invocation
 */
export interface ChatInvocationOptions {
  /** The prompt/query to send to the chat */
  prompt: string;

  /** Which agent mode to use (orchestrator or implementor) */
  agentMode: AgentMode;

  /** Optional files to attach to the chat context */
  files?: vscode.Uri[];

  /** Optional model preference (note: currently not supported by VS Code API) */
  model?: string;
}

/**
 * ChatInvoker - Invokes VS Code Chat with Orchestra agents
 *
 * Encapsulates the pattern for opening chat with the @orchestra participant
 * and prefixing queries to indicate agent mode. Based on spike findings
 * (see extension/docs/spike-results.md).
 */
export class ChatInvoker {
  private readonly logger: OrchestraLogger;

  constructor(logger: OrchestraLogger) {
    this.logger = logger;
  }

  /**
   * Invoke VS Code Chat with the specified options
   *
   * Opens the chat panel with @orchestra participant and formats
   * the query to indicate the desired agent mode.
   *
   * @param options Chat invocation options
   * @returns Promise that resolves when chat is opened
   */
  async invokeChat(options: ChatInvocationOptions): Promise<void> {
    const { prompt, agentMode, files, model } = options;

    try {
      // Format query with @orchestra prefix
      // The participant determines agent mode from the query content
      const query = `@orchestra ${prompt}`;

      // Log the invocation
      this.logger.info(`Invoking chat with ${agentMode} agent`, {
        agentMode,
        hasFiles: !!files && files.length > 0,
        model,
      });

      // Build command options
      const commandOptions: { query: string; isPartialQuery: boolean } = {
        query,
        isPartialQuery: false, // Complete query, ready to send
      };

      // Note: attachFiles parameter exists but is not yet production-tested
      // We rely on ContextFileResolver for file access instead

      // Execute VS Code command to open chat
      await vscode.commands.executeCommand(
        "workbench.action.chat.open",
        commandOptions
      );

      this.logger.info(`Chat opened successfully for ${agentMode} agent`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to invoke chat for ${agentMode} agent`, error);

      // Show user-facing error
      vscode.window.showErrorMessage(
        `Orchestra: Failed to open chat - ${message}`
      );

      throw error;
    }
  }
}
