/**
 * ChatInvoker - Utility for invoking VS Code Chat with Orchestra agents
 *
 * Centralizes the pattern for programmatically opening VS Code Chat
 * with Orchestra agents via SessionManager.
 */

import * as vscode from "vscode";
import { OrchestraLogger } from "../utils/logger.js";
import { SessionManager } from "./SessionManager.js";

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
 * Thin wrapper that delegates to SessionManager for actual chat invocation.
 * Preserves backward compatibility with existing callers.
 */
export class ChatInvoker {
  private readonly logger: OrchestraLogger;
  private readonly sessionManager: SessionManager;

  constructor(logger: OrchestraLogger, sessionManager: SessionManager) {
    this.logger = logger;
    this.sessionManager = sessionManager;
  }

  /**
   * Invoke VS Code Chat with the specified options
   *
   * Delegates to SessionManager to invoke either the orchestrator or
   * implementor agent based on the agentMode parameter.
   *
   * @param options Chat invocation options
   * @returns Promise that resolves when chat is opened
   */
  async invokeChat(options: ChatInvocationOptions): Promise<void> {
    const { prompt, agentMode, files = [] } = options;

    try {
      // Log the invocation
      this.logger.info(`Invoking chat with ${agentMode} agent`, {
        agentMode,
        hasFiles: files.length > 0,
        fileCount: files.length,
      });

      // Delegate to SessionManager based on agent mode
      if (agentMode === "orchestrator") {
        await this.sessionManager.invokeOrchestrator(prompt, files);
      } else {
        await this.sessionManager.invokeImplementor(prompt, files);
      }

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
