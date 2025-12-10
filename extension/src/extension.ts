/**
 * Orchestra VS Code Extension
 *
 * Entry point for the extension. Handles activation, workspace detection,
 * database initialization, view registration, and MCP server lifecycle.
 */

import * as vscode from "vscode";
import { OrchestraDB } from "./database/client.js";
import { DatabaseWatcher } from "./database/watcher.js";
import { MCPServerManager } from "./mcp/ServerManager.js";
import { OrchestraLogger } from "./utils/logger.js";
import { DashboardPanel } from "./views/dashboard/DashboardPanel.js";
import { StatusBarManager } from "./views/statusbar/StatusBarItem.js";
import { SprintTreeProvider } from "./views/treeview/SprintTreeProvider.js";
import {
  findOrchestraRoot,
  validateOrchestraWorkspace,
} from "./workspace/detector.js";

let logger: OrchestraLogger;
let dbWatcher: DatabaseWatcher | undefined;
let mcpManager: MCPServerManager | undefined;

/**
 * Extension activation
 * Triggered when .orchestra/orchestra.db is found in workspace
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  logger = new OrchestraLogger();
  logger.info("Orchestra extension activating...");

  // 1. Detect Orchestra workspace
  const orchestraRoot = findOrchestraRoot();
  if (!orchestraRoot) {
    logger.warn("No .orchestra/ folder found in workspace");
    vscode.window.showInformationMessage(
      "Orchestra: No .orchestra/ workspace detected. Initialize a sprint to get started."
    );
    return;
  }

  logger.info(`Orchestra workspace detected: ${orchestraRoot}`);

  // 2. Validate workspace
  if (!validateOrchestraWorkspace(orchestraRoot)) {
    logger.error("Invalid Orchestra workspace: orchestra.db not found");
    vscode.window.showErrorMessage(
      "Orchestra: Invalid workspace. Missing orchestra.db file."
    );
    return;
  }

  try {
    // 3. Initialize database client
    const db = OrchestraDB.getInstance(orchestraRoot);
    logger.info("Database client initialized");

    // 4. Setup database watcher for reactive updates
    dbWatcher = new DatabaseWatcher(orchestraRoot);
    context.subscriptions.push(dbWatcher);

    // 5. Register TreeView
    const treeProvider = new SprintTreeProvider(db, dbWatcher);
    const treeView = vscode.window.createTreeView("orchestraSprintExplorer", {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    logger.info("Sprint Explorer TreeView registered");

    // 6. Register Status Bar
    const statusBar = new StatusBarManager(db, dbWatcher);
    context.subscriptions.push(statusBar);
    logger.info("Status bar item registered");

    // 7. Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand("orchestra.openDashboard", () => {
        if (dbWatcher) {
          DashboardPanel.createOrShow(context.extensionUri, db, dbWatcher);
        }
      }),
      vscode.commands.registerCommand("orchestra.refreshStatus", () => {
        treeProvider.refresh();
        statusBar.refresh();
        logger.info("Manual refresh triggered");
      }),
      vscode.commands.registerCommand(
        "orchestra.openTaskDetail",
        (taskId: number) => {
          vscode.window.showInformationMessage(
            `Opening task ${taskId} (not yet implemented)`
          );
        }
      )
    );
    logger.info("Commands registered");

    // 8. Start MCP servers (if enabled)
    const config = vscode.workspace.getConfiguration("orchestra");
    const autoStartMCP = config.get<boolean>("autoStartMCP", true);

    if (autoStartMCP) {
      mcpManager = new MCPServerManager(orchestraRoot, logger);
      mcpManager.startServer("orchestrator");
      mcpManager.startServer("implementor");
      context.subscriptions.push({
        dispose: () => {
          mcpManager?.stopAllServers();
        },
      });
      logger.info("MCP servers started");
    }

    logger.info("Orchestra extension activated successfully");
    vscode.window.showInformationMessage("Orchestra: Extension activated");
  } catch (error) {
    logger.error("Failed to activate extension", error);
    vscode.window.showErrorMessage(
      `Orchestra: Activation failed - ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Extension deactivation
 * Cleanup resources
 */
export function deactivate(): void {
  logger?.info("Orchestra extension deactivating...");

  // Database watcher disposed via subscriptions
  dbWatcher = undefined;

  // MCP servers disposed via subscriptions
  mcpManager = undefined;

  // Close database connection
  OrchestraDB.close();

  logger?.info("Orchestra extension deactivated");
}
