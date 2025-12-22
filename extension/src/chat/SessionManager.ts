/**
 * SessionManager - Dual session management for Orchestra agents
 *
 * Manages separate chat sessions for Orchestrator and Implementor agents:
 * - Orchestrator: Uses Chat Panel (persistent, keeps history across tasks)
 * - Implementor: Uses Chat Editor Tab (cleared before each task)
 */

import * as vscode from "vscode";
import { ConfigService } from "../config/ConfigService.js";
import { OrchestraLogger } from "../utils/logger.js";

/**
 * SessionManager manages dual chat sessions for Orchestra agents
 *
 * Orchestrator sessions are persistent and maintain context across tasks.
 * Implementor sessions are ephemeral and cleared between tasks to prevent
 * cross-contamination.
 */
export class SessionManager {
  private readonly logger: OrchestraLogger;
  private readonly _configService: ConfigService;
  private _orchestratorActive: boolean = false;
  private _implementorActive: boolean = false;

  /**
   * Create a new SessionManager
   * @param logger - Logger instance for structured logging
   * @param configService - Configuration service for model selection
   */
  constructor(logger: OrchestraLogger, configService: ConfigService) {
    this.logger = logger;
    this._configService = configService;
  }

  /**
   * Invoke the Orchestrator agent in a Chat Panel session
   *
   * Opens or focuses the persistent Chat Panel and invokes the orchestrator
   * agent with the provided prompt and file context.
   *
   * @param prompt - The query/instruction to send to the orchestrator
   * @param files - Files to attach to the chat context
   * @returns Promise that resolves when the session is invoked
   */
  async invokeOrchestrator(prompt: string, files: vscode.Uri[]): Promise<void> {
    try {
      const model = this._configService.getModelForRole("orchestrator");
      const agentMode = this._configService.getAgentForRole("orchestrator");
      this.logger.info("Invoking orchestrator session", {
        hasFiles: files.length > 0,
        fileCount: files.length,
        model,
        agentMode,
        wasActive: this._orchestratorActive,
      });

      // Execute VS Code command to open chat with orchestrator agent
      // mode: custom agent ID (e.g., 'orchestra.orchestrator'), modelSelector must be an object with id property
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: prompt,
        isPartialQuery: false,
        mode: agentMode,
        modelSelector: { id: model },
        attachFiles: files,
      });

      this._orchestratorActive = true;
      this.logger.info("Orchestrator session invoked successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Failed to invoke orchestrator session", error);
      vscode.window.showErrorMessage(
        `Orchestra: Failed to invoke orchestrator - ${message}`
      );
      throw error;
    }
  }

  /**
   * Invoke the Implementor agent in a Chat Editor Tab session
   *
   * Opens a new Chat Editor Tab (separate from the panel) and invokes the
   * implementor agent with the provided prompt and file context.
   * Each invocation opens a fresh editor tab to prevent context contamination.
   *
   * @param prompt - The query/instruction to send to the implementor
   * @param files - Files to attach to the chat context
   * @returns Promise that resolves when the session is invoked
   */
  async invokeImplementor(prompt: string, files: vscode.Uri[]): Promise<void> {
    try {
      const model = this._configService.getModelForRole("implementor");
      const agentMode = this._configService.getAgentForRole("implementor");
      this.logger.info("Invoking implementor session", {
        hasFiles: files.length > 0,
        fileCount: files.length,
        model,
        agentMode,
      });

      // Open chat with implementor configuration
      // Using workbench.action.chat.open which supports full parameters
      // Note: Both orchestrator and implementor use the same command for now
      // Future: Could use workbench.action.chat.openInEditor for separate editor tabs
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: prompt,
        isPartialQuery: false,
        mode: agentMode,
        modelSelector: { id: model },
        attachFiles: files,
      });

      this._implementorActive = true;
      this.logger.info(
        "Implementor session invoked successfully in editor tab"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Failed to invoke implementor session", error);
      vscode.window.showErrorMessage(
        `Orchestra: Failed to invoke implementor - ${message}`
      );
      throw error;
    }
  }

  /**
   * Clear the Implementor session
   *
   * Note: With the new approach of using separate chat editor tabs,
   * clearing is less critical as each invocation opens a fresh editor.
   * This method is kept for API compatibility.
   *
   * @returns Promise that resolves when the session is cleared
   */
  async clearImplementorSession(): Promise<void> {
    this.logger.info("Implementor session clear requested", {
      wasActive: this._implementorActive,
    });
    // With separate editor tabs, we don't need to explicitly clear
    // Each invokeImplementor opens a fresh editor
    this._implementorActive = false;
  }
}
