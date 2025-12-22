/**
 * SessionManager - Dual session management for Orchestra agents
 *
 * Manages SEPARATE chat sessions for Orchestrator and Implementor agents:
 * - Orchestrator: Opens in AUX_WINDOW_GROUP (separate floating window), REUSES same session
 * - Implementor: Opens in ACTIVE_GROUP as editor tab, NEW session each time (or cleared)
 *
 * Key insight: Sessions are tracked by sessionResource URI. By storing and reusing
 * the URI for orchestrator, we maintain history. By creating new URIs for implementor,
 * we ensure clean separation.
 */

import * as vscode from "vscode";
import { ConfigService } from "../config/ConfigService.js";
import { OrchestraLogger } from "../utils/logger.js";

/**
 * SessionManager manages dual chat sessions for Orchestra agents
 *
 * Orchestrator sessions are persistent in a separate window and maintain context across tasks.
 * Implementor sessions are ephemeral editor tabs, cleared between tasks to prevent
 * cross-contamination.
 *
 * Session isolation is critical for Orchestra's hidden verification pattern:
 * - Orchestrator must retain full sprint context for verification
 * - Implementor must have clean slate to prevent gaming acceptance criteria
 */
export class SessionManager {
  private readonly logger: OrchestraLogger;
  private readonly _configService: ConfigService;
  private _orchestratorActive: boolean = false;
  private _implementorActive: boolean = false;

  // Track orchestrator session URI for reuse (persistent session)
  private _orchestratorSessionUri: vscode.Uri | undefined;

  // Track implementor session URI (may be cleared/recreated)
  private _implementorSessionUri: vscode.Uri | undefined;

  // Track the implementor tab so we can close it
  private _implementorTab: vscode.Tab | undefined;

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
   * Close all chat editor tabs in the main editor area
   * This ensures the orchestrator window receives focus when we send prompts
   */
  private async closeChatEditorTabs(): Promise<void> {
    const tabsToClose: vscode.Tab[] = [];

    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        // Chat editor tabs have labels like "Chat" or start with "Copilot"
        // and their input is of unknown type (not standard TabInput types)
        const isLikelyChatTab =
          tab.label === "Chat" ||
          tab.label.startsWith("Copilot") ||
          tab.label.includes("Chat");

        if (isLikelyChatTab) {
          tabsToClose.push(tab);
        }
      }
    }

    if (tabsToClose.length > 0) {
      this.logger.info(`Closing ${tabsToClose.length} chat editor tab(s)`);
      try {
        await vscode.window.tabGroups.close(tabsToClose, true);
      } catch (error) {
        this.logger.warn("Failed to close some chat tabs", error);
      }
    }

    // Clear implementor tracking since we closed its tab
    this._implementorTab = undefined;
    this._implementorActive = false;
  }

  /**
   * Generate a new chat editor URI for a fresh session
   * Uses the vscodeChatEditor scheme with a unique identifier
   */
  private generateNewChatEditorUri(): vscode.Uri {
    const uniqueId = `untitled-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    return vscode.Uri.from({
      scheme: "vscodeChatEditor",
      path: `/${uniqueId}`,
    });
  }

  /**
   * Get or create the orchestrator session URI (reused for persistence)
   */
  private getOrchestratorSessionUri(): vscode.Uri {
    if (!this._orchestratorSessionUri) {
      // Create a stable URI for the orchestrator session
      this._orchestratorSessionUri = vscode.Uri.from({
        scheme: "vscodeChatEditor",
        path: "/orchestra-orchestrator-session",
      });
    }
    return this._orchestratorSessionUri;
  }

  /**
   * Invoke the Orchestrator agent in a separate floating window
   *
   * Opens or focuses the persistent orchestrator window and invokes the agent
   * with the provided prompt and file context. REUSES the same session to
   * maintain context across multiple orchestrator tasks.
   *
   * @param prompt - The query/instruction to send to the orchestrator
   * @param files - Files to attach to the chat context
   * @returns Promise that resolves when the session is invoked
   */
  async invokeOrchestrator(prompt: string, files: vscode.Uri[]): Promise<void> {
    try {
      const model = this._configService.getModelForRole("orchestrator");
      const agentMode = this._configService.getAgentForRole("orchestrator");
      const sessionUri = this.getOrchestratorSessionUri();

      this.logger.info("Invoking orchestrator session", {
        hasFiles: files.length > 0,
        fileCount: files.length,
        model,
        agentMode,
        sessionUri: sessionUri.toString(),
        wasActive: this._orchestratorActive,
        reusingSession: this._orchestratorActive,
      });

      // Orchestrator session strategy:
      // - First invocation: Create new chat window, then send prompt
      // - Subsequent invocations: Close any chat editor tabs (implementor), then send to orchestrator window
      //
      // CRITICAL: We must close chat editor tabs before sending to orchestrator,
      // otherwise workbench.action.chat.open may send to the wrong chat.
      try {
        // Always close chat editor tabs to ensure orchestrator window gets focus
        await this.closeChatEditorTabs();

        if (!this._orchestratorActive) {
          // First time: Create a new chat window
          this.logger.info("Creating new orchestrator chat window");
          await vscode.commands.executeCommand(
            "workbench.action.newChatWindow"
          );

          // Small delay to ensure window is ready
          await new Promise((resolve) => setTimeout(resolve, 150));
        } else {
          // Subsequent times: The orchestrator window should now be the only chat
          this.logger.info("Reusing existing orchestrator chat window");
          // Small delay to ensure focus is correct
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // Send the prompt with mode and model to the active chat
        await vscode.commands.executeCommand("workbench.action.chat.open", {
          query: prompt,
          isPartialQuery: false,
          mode: agentMode,
          modelSelector: { id: model },
          attachFiles: files,
        });
      } catch {
        // Fallback: Use standard chat.open (sidebar)
        this.logger.warn(
          "Could not open in new window, falling back to sidebar"
        );
        await vscode.commands.executeCommand("workbench.action.chat.open", {
          query: prompt,
          isPartialQuery: false,
          mode: agentMode,
          modelSelector: { id: model },
          attachFiles: files,
        });
      }

      const wasNewWindow = !this._orchestratorActive;
      this._orchestratorActive = true;
      this.logger.info("Orchestrator session invoked successfully", {
        wasNewWindow,
      });
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
   * Invoke the Implementor agent in a Chat Editor Tab (separate from orchestrator)
   *
   * Opens a NEW Chat Editor Tab and invokes the implementor agent with the
   * provided prompt and file context. Each invocation creates a fresh session
   * to prevent context contamination between tasks.
   *
   * @param prompt - The query/instruction to send to the implementor
   * @param files - Files to attach to the chat context
   * @returns Promise that resolves when the session is invoked
   */
  async invokeImplementor(prompt: string, files: vscode.Uri[]): Promise<void> {
    try {
      const model = this._configService.getModelForRole("implementor");
      const agentMode = this._configService.getAgentForRole("implementor");

      // Generate a new URI for each implementor session (fresh slate)
      const newSessionUri = this.generateNewChatEditorUri();
      this._implementorSessionUri = newSessionUri;

      this.logger.info("Invoking implementor session", {
        hasFiles: files.length > 0,
        fileCount: files.length,
        model,
        agentMode,
        sessionUri: newSessionUri.toString(),
        creatingNewSession: true,
      });

      // Open a NEW chat editor tab for implementor (separate from orchestrator window)
      // Using workbench.action.openChat which opens a new chat editor
      await vscode.commands.executeCommand("workbench.action.openChat");

      // Small delay to ensure editor is ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Track the newly created tab so we can close it later
      // The active tab in the active group should be our new chat tab
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (activeTab) {
        this._implementorTab = activeTab;
        this.logger.info("Tracked implementor tab", {
          label: activeTab.label,
        });
      }

      // Now send the prompt with mode and model
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: prompt,
        isPartialQuery: false,
        mode: agentMode,
        modelSelector: { id: model },
        attachFiles: files,
      });

      this._implementorActive = true;
      this.logger.info(
        "Implementor session invoked successfully in new editor tab"
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
   * Clears the current implementor session state. The next invokeImplementor
   * call will create a fresh session automatically.
   *
   * @returns Promise that resolves when the session is cleared
   */
  async clearImplementorSession(): Promise<void> {
    this.logger.info("Implementor session clear requested", {
      wasActive: this._implementorActive,
      hadSession: !!this._implementorSessionUri,
    });

    // Clear the tracked URI so next invocation creates a fresh session
    this._implementorSessionUri = undefined;
    this._implementorActive = false;
  }

  /**
   * Check if orchestrator session is active
   */
  isOrchestratorActive(): boolean {
    return this._orchestratorActive;
  }

  /**
   * Check if implementor session is active
   */
  isImplementorActive(): boolean {
    return this._implementorActive;
  }
}
