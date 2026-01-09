/**
 * SessionManager - Dual session management for Orchestra agents
 *
 * ARCHITECTURE:
 * - Orchestrator: ONE persistent floating window (auxiliary window), reused across all orchestrator calls
 * - Implementor: ONE new editor tab per task (fresh context), new tab for each new task
 *
 * KEY INSIGHT:
 * VS Code's `workbench.action.chat.open` sends to the CURRENTLY FOCUSED chat.
 * We control routing by:
 * 1. Closing implementor tabs before sending to orchestrator
 * 2. Creating fresh implementor tabs in the main editor area
 *
 * COMMANDS USED:
 * - workbench.action.newChatWindow: Creates chat in a NEW floating (auxiliary) window
 * - workbench.action.openChat: Creates chat as a NEW editor tab in current editor area
 * - workbench.action.chat.open: Sends query to currently focused chat
 */

import * as vscode from "vscode";
import { ConfigService } from "../config/ConfigService.js";
import { saveSessionLabel } from "../database/mutations.js";
import { getSessionLabel } from "../database/queries.js";
import { OrchestraLogger } from "../utils/logger.js";

/**
 * SessionManager manages dual chat sessions for Orchestra agents
 *
 * Session isolation is critical for Orchestra's hidden verification pattern:
 * - Orchestrator must retain full sprint context for verification
 * - Implementor must have clean slate to prevent gaming acceptance criteria
 */
export class SessionManager {
  private readonly logger: OrchestraLogger;
  private readonly _configService: ConfigService;

  // Orchestrator state - ONE persistent floating window
  private _orchestratorActive: boolean = false;

  // Implementor state - ONE tab per task
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
   * Initialize a session for the specified role (orchestrator or implementor)
   *
   * This is the main entry point for initializing an Orchestra agent session.
   * It ties together database label loading, tab discovery, and user prompting
   * into a cohesive workflow.
   *
   * WORKFLOW:
   * 1. Load stored label from database
   * 2. If label exists, find the corresponding tab
   * 3. If tab found, focus it
   * 4. If tab not found (or no label), prompt user to select
   * 5. For implementor role: send /clear command to reset context
   *
   * @param role - The role to initialize ('orchestrator' | 'implementor')
   * @returns Promise<boolean> - true if session is ready to use, false on failure/cancel
   *
   * @example
   * ```typescript
   * const ready = await sessionManager.initSession('implementor');
   * if (ready) {
   *   // Session is initialized and tab is focused
   *   await sessionManager.invokeImplementor(prompt, files);
   * } else {
   *   // User cancelled or error occurred
   *   console.log('Session initialization cancelled');
   * }
   * ```
   */
  async initSession(role: "orchestrator" | "implementor"): Promise<boolean> {
    try {
      this.logger.info(`Initializing ${role} session`);

      // Get workspace root
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        this.logger.error("No workspace folder found");
        vscode.window.showErrorMessage(
          "Orchestra: No workspace folder is open."
        );
        return false;
      }

      // Step 1: Load stored label from database
      let label = getSessionLabel(workspaceRoot, role);
      this.logger.info(`Loaded ${role} label from database`, { label });

      // Step 2: Handle case where no label exists (first run)
      if (!label) {
        this.logger.info(`No previous ${role} label found, prompting user`);
        label = await this.promptUserToSelectSession(role);

        if (!label) {
          this.logger.info(`User cancelled ${role} session selection`);
          return false;
        }
      }

      // Step 3: Find the tab by label
      const tabResult = this.findTabByLabel(label);

      if (!tabResult) {
        // Tab not found even though label exists - prompt user to select
        this.logger.warn(
          `Tab not found for ${role} label: ${label}, prompting user to select`
        );
        const newLabel = await this.promptUserToSelectSession(role);

        if (!newLabel) {
          this.logger.info(`User cancelled ${role} session re-selection`);
          return false;
        }

        // After user selects, try to find the tab again
        const newTabResult = this.findTabByLabel(newLabel);
        if (!newTabResult) {
          this.logger.error(`Tab still not found after user selection`);
          vscode.window.showErrorMessage(
            "Orchestra: Could not find the selected chat tab."
          );
          return false;
        }

        // Focus the newly selected tab
        await vscode.commands.executeCommand(
          "workbench.action.openEditorAtIndex",
          newTabResult.index
        );
        this.logger.info(`Focused ${role} tab at index ${newTabResult.index}`);
      } else {
        // Step 4: Focus the tab
        await vscode.commands.executeCommand(
          "workbench.action.openEditorAtIndex",
          tabResult.index
        );
        this.logger.info(`Focused ${role} tab at index ${tabResult.index}`);
      }

      // Step 5: For implementor, send /clear to reset context
      if (role === "implementor") {
        this.logger.info("Sending /clear command to implementor chat");
        await this.delay(200); // Wait for tab to be fully focused
        await vscode.commands.executeCommand("workbench.action.chat.open", {
          query: "/clear",
          isPartialQuery: false,
        });
      }

      this.logger.info(`${role} session initialized successfully`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to initialize ${role} session`, error);
      vscode.window.showErrorMessage(
        `Orchestra: Failed to initialize ${role} session - ${message}`
      );
      return false;
    }
  }

  /**
   * Find a tab by its exact label across all tab groups
   *
   * Searches all tab groups for a tab with an exact label match.
   * Returns the first matching tab along with its position info.
   *
   * @param label - The exact label string to search for
   * @returns Object containing the tab, its index, and parent tabGroup, or null if not found
   *
   * @example
   * ```typescript
   * const result = sessionManager.findTabByLabel("Orchestra Implementor");
   * if (result) {
   *   console.log(`Found tab at index ${result.index} in group`);
   *   // Use result.tab for tab operations
   *   // Use result.tabGroup for group operations
   * }
   * ```
   */
  findTabByLabel(
    label: string
  ): { tab: vscode.Tab; index: number; tabGroup: vscode.TabGroup } | null {
    for (const tabGroup of vscode.window.tabGroups.all) {
      for (let index = 0; index < tabGroup.tabs.length; index++) {
        const tab = tabGroup.tabs[index];
        if (tab && tab.label === label) {
          return { tab, index, tabGroup };
        }
      }
    }
    return null;
  }

  /**
   * Close all chat editor tabs in ALL editor groups
   * This is used to ensure clean routing to orchestrator window
   */
  private async closeAllChatEditorTabs(): Promise<void> {
    const tabsToClose: vscode.Tab[] = [];

    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        // Chat tabs have labels: "Chat", "Copilot Chat", or contain "Chat"
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

    this._implementorActive = false;
  }

  /**
   * Invoke the Orchestrator agent in a floating window
   *
   * BEHAVIOR:
   * - First call: Creates a new floating window, sends prompt there
   * - Subsequent calls: Closes any implementor tabs, sends to existing window
   *
   * @param prompt - The query/instruction to send to the orchestrator
   * @param files - Files to attach to the chat context
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
        isFirstCall: !this._orchestratorActive,
      });

      // CRITICAL: Close implementor tabs first so orchestrator window is only target
      await this.closeAllChatEditorTabs();
      await this.delay(100);

      if (!this._orchestratorActive) {
        // FIRST CALL: Create a new floating window
        this.logger.info("Creating new orchestrator floating window");
        await vscode.commands.executeCommand("workbench.action.newChatWindow");
        await this.delay(300); // Wait for window to be ready
        this._orchestratorActive = true;
      } else {
        // SUBSEQUENT CALLS: Window already exists, just need to ensure focus
        this.logger.info("Using existing orchestrator window");
        await this.delay(100);
      }

      // Send prompt - goes to orchestrator window (only remaining chat)
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: prompt,
        isPartialQuery: false,
        mode: agentMode,
        modelSelector: { id: model },
        attachFiles: files,
      });

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
   * Invoke the Implementor agent in a new editor tab
   *
   * BEHAVIOR:
   * - Always creates a FRESH chat editor tab (clean context per task)
   * - Each new task gets a new session
   *
   * @param prompt - The query/instruction to send to the implementor
   * @param files - Files to attach to the chat context
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

      // Create a NEW chat editor tab
      // This opens in the main editor area as a tab
      await vscode.commands.executeCommand("workbench.action.openChat");
      await this.delay(200); // Wait for tab to be ready

      // Send prompt to the newly created tab (now focused)
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: prompt,
        isPartialQuery: false,
        mode: agentMode,
        modelSelector: { id: model },
        attachFiles: files,
      });

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
   * Closes any implementor tabs and resets state
   */
  async clearImplementorSession(): Promise<void> {
    this.logger.info("Clearing implementor session", {
      wasActive: this._implementorActive,
    });
    // Note: We don't close tabs here - they'll be closed next orchestrator call
    this._implementorActive = false;
  }

  /**
   * Prompt user to manually select a session from chat history
   *
   * Guides the user through selecting an existing chat tab to associate with
   * an Orchestra role (orchestrator or implementor). This is used when automatic
   * session tracking fails or a session label is lost.
   *
   * WORKFLOW:
   * 1. Show info message explaining what the user needs to do
   * 2. Open chat history panel
   * 3. Show modal dialog asking user to confirm they've selected a chat
   * 4. Capture the active tab's label
   * 5. Save the label to the database
   * 6. Return the label
   *
   * @param role - The role to associate the selected session with ('orchestrator' | 'implementor')
   * @returns Promise<string | null> - The captured tab label on success, null if user cancels
   *
   * @example
   * ```typescript
   * const label = await sessionManager.promptUserToSelectSession('orchestrator');
   * if (label) {
   *   console.log(`Orchestrator session set to: ${label}`);
   * } else {
   *   console.log('User cancelled session selection');
   * }
   * ```
   */
  async promptUserToSelectSession(
    role: "orchestrator" | "implementor"
  ): Promise<string | null> {
    try {
      this.logger.info(`Prompting user to select ${role} session`);

      // Step 1: Show initial info message
      const initialChoice = await vscode.window.showInformationMessage(
        `${
          role.charAt(0).toUpperCase() + role.slice(1)
        } session not found. Please select from chat history.`,
        "Open Chat History",
        "Cancel"
      );

      if (initialChoice !== "Open Chat History") {
        this.logger.info(`User cancelled ${role} session selection`);
        return null;
      }

      // Step 2: Execute chat history command
      await vscode.commands.executeCommand("workbench.action.chat.history");
      await this.delay(500); // Wait for history panel to open

      // Step 3: Show modal confirmation dialog
      const confirmation = await vscode.window.showInformationMessage(
        `Click OK after selecting the ${role} session from the chat history.`,
        { modal: true },
        "OK",
        "Cancel"
      );

      if (confirmation !== "OK") {
        this.logger.info(`User cancelled ${role} session confirmation`);
        return null;
      }

      // Step 4: Capture active tab label
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;

      if (!activeTab || !activeTab.label) {
        this.logger.warn(`No active tab found after ${role} session selection`);
        vscode.window.showWarningMessage(
          "Orchestra: No chat tab is currently active. Please try again."
        );
        return null;
      }

      const label = activeTab.label;
      this.logger.info(`Captured ${role} session label: ${label}`);

      // Step 5: Save to database
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      if (!workspaceRoot) {
        this.logger.error("No workspace folder found");
        vscode.window.showErrorMessage(
          "Orchestra: No workspace folder is open."
        );
        return null;
      }

      saveSessionLabel(workspaceRoot, role, label);
      this.logger.info(`Saved ${role} session label to database: ${label}`);

      // Step 6: Return the label
      return label;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to prompt user for ${role} session`, error);
      vscode.window.showErrorMessage(
        `Orchestra: Failed to select session - ${message}`
      );
      return null;
    }
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

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
