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
  async invokeOrchestrator(
    _prompt: string,
    files: vscode.Uri[]
  ): Promise<void> {
    try {
      const model = this._configService.getModelForRole("orchestrator");
      this.logger.info("Invoking orchestrator session", {
        hasFiles: files.length > 0,
        fileCount: files.length,
        model,
        wasActive: this._orchestratorActive,
      });

      // TODO: Implement orchestrator invocation
      // - Use workbench.action.chat.open for Chat Panel
      // - Format prompt with @orchestra prefix

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
   * Opens a new Chat Editor Tab (or focuses existing) and invokes the
   * implementor agent with the provided prompt and file context.
   *
   * @param prompt - The query/instruction to send to the implementor
   * @param files - Files to attach to the chat context
   * @returns Promise that resolves when the session is invoked
   */
  async invokeImplementor(_prompt: string, files: vscode.Uri[]): Promise<void> {
    try {
      const model = this._configService.getModelForRole("implementor");
      this.logger.info("Invoking implementor session", {
        hasFiles: files.length > 0,
        fileCount: files.length,
        model,
      });

      // TODO: Implement implementor invocation
      // - Use chat.newChatEditor for Chat Editor Tab
      // - Format prompt with @orchestra prefix

      this._implementorActive = true;
      this.logger.info("Implementor session invoked successfully");
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
   * Clears the implementor's Chat Editor Tab session to prevent
   * context contamination between tasks.
   *
   * @returns Promise that resolves when the session is cleared
   */
  async clearImplementorSession(): Promise<void> {
    try {
      this.logger.info("Clearing implementor session", {
        wasActive: this._implementorActive,
      });

      // TODO: Implement session clearing
      // - Use chat.newChat to reset the session
      // - Clear any cached state

      this._implementorActive = false;
      this.logger.info("Implementor session cleared successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Failed to clear implementor session", error);
      vscode.window.showErrorMessage(
        `Orchestra: Failed to clear implementor session - ${message}`
      );
      throw error;
    }
  }
}
