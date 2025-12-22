/**
 * Orchestra VS Code Extension
 *
 * Entry point for the extension. Handles activation, workspace detection,
 * database initialization, view registration, and MCP server lifecycle.
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SessionManager } from "./chat/SessionManager.js";
import { handlePlayTask } from "./commands/PlayTaskHandler.js";
import {
  handleDeEscalateTask,
  handleForceComplete,
  handleMoveToGateCheck,
  handleMoveToImplement,
} from "./commands/deEscalation.js";
import { ConfigService } from "./config/ConfigService.js";
import { OrchestraDB } from "./database/client.js";
import { DatabaseWatcher } from "./database/watcher.js";
import { ConfigGenerator } from "./mcp/ConfigGenerator.js";
import { MCPServerManager } from "./mcp/ServerManager.js";
import { ContextFileResolver } from "./prompts/ContextFileResolver.js";
import { OrchestraLogger } from "./utils/logger.js";
import { DashboardPanel } from "./views/dashboard/DashboardPanel.js";
import { OrchestraViewDecorationProvider } from "./views/providers/ViewDecorationProvider.js";
import { SprintSettingsPanel } from "./views/settings/SprintSettingsPanel.js";
import { StatusBarManager } from "./views/statusbar/StatusBarItem.js";
import { TaskDetailPanel } from "./views/task/TaskDetailPanel.js";
import { SprintTreeProvider } from "./views/treeview/SprintTreeProvider.js";
import { CurrentTaskViewProvider } from "./views/webview/CurrentTaskViewProvider.js";
import {
  findOrchestraRoot,
  validateOrchestraWorkspace,
} from "./workspace/detector.js";

let logger: OrchestraLogger;
let configService: ConfigService;
let sessionManager: SessionManager | undefined;
let contextFileResolver: ContextFileResolver | undefined;
let dbWatcher: DatabaseWatcher | undefined;
let mcpManager: MCPServerManager | undefined;

/**
 * Get the ConfigService instance
 * @returns The ConfigService instance or throws if not initialized
 */
export function getConfigService(): ConfigService {
  if (!configService) {
    throw new Error("ConfigService not initialized. Extension not activated.");
  }
  return configService;
}

/**
 * Get the SessionManager instance
 * @returns The SessionManager instance or throws if not initialized
 */
export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    throw new Error("SessionManager not initialized. Extension not activated.");
  }
  return sessionManager;
}

/**
 * Get the ContextFileResolver instance
 * @returns The ContextFileResolver instance or throws if not initialized
 */
export function getContextFileResolver(): ContextFileResolver {
  if (!contextFileResolver) {
    throw new Error(
      "ContextFileResolver not initialized. Orchestra workspace not detected."
    );
  }
  return contextFileResolver;
}

/**
 * Install MCP servers to .vscode/mcp.json
 * Merges with existing configuration, preserving other servers
 */
async function installMcpServers(
  orchestraRoot: string,
  extensionPath: string
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("No workspace folder open");
  }

  const workspaceFolder = workspaceFolders[0];
  if (!workspaceFolder) {
    throw new Error("No workspace folder found");
  }
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const vscodeDir = path.join(workspaceRoot, ".vscode");
  const mcpJsonPath = path.join(vscodeDir, "mcp.json");

  // Get bundled MCP server path
  const serverPath = path.join(extensionPath, "dist", "mcp-server", "index.js");
  if (!fs.existsSync(serverPath)) {
    throw new Error(
      "Bundled MCP server not found. Extension may be corrupted."
    );
  }

  // Read existing config or create new
  let existingConfig: { servers?: Record<string, unknown> } = { servers: {} };
  if (fs.existsSync(mcpJsonPath)) {
    try {
      const content = fs.readFileSync(mcpJsonPath, "utf-8");
      existingConfig = JSON.parse(content);
      if (!existingConfig.servers) {
        existingConfig.servers = {};
      }
    } catch (error) {
      throw new Error(
        `Failed to parse existing mcp.json: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Add/update Orchestra servers
  existingConfig.servers = existingConfig.servers || {};
  existingConfig.servers["orchestra-orchestrator"] = {
    type: "stdio",
    command: "node",
    args: [serverPath, "--role=orchestrator"],
    env: {
      ORCHESTRA_WORKSPACE: orchestraRoot,
    },
  };
  existingConfig.servers["orchestra-implementor"] = {
    type: "stdio",
    command: "node",
    args: [serverPath, "--role=implementor"],
    env: {
      ORCHESTRA_WORKSPACE: orchestraRoot,
    },
  };

  // Ensure .vscode directory exists
  if (!fs.existsSync(vscodeDir)) {
    fs.mkdirSync(vscodeDir, { recursive: true });
  }

  // Write updated config
  fs.writeFileSync(
    mcpJsonPath,
    JSON.stringify(existingConfig, null, 2),
    "utf-8"
  );
}

/**
 * Initialize Orchestra workspace
 * Creates .orchestra folder and empty database
 */
async function initializeWorkspace(
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("Orchestra: No workspace folder open");
    return;
  }

  const workspaceRoot = workspaceFolders[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage(
      "Orchestra: Unable to determine workspace root"
    );
    return;
  }

  const orchestraDir = path.join(workspaceRoot, ".orchestra");

  // Check if already initialized
  if (fs.existsSync(orchestraDir)) {
    const dbPath = path.join(orchestraDir, "orchestra.db");
    if (fs.existsSync(dbPath)) {
      vscode.window.showInformationMessage(
        "Orchestra: Workspace already initialized. Reloading..."
      );
      // Reload the window to pick up the workspace
      vscode.commands.executeCommand("workbench.action.reloadWindow");
      return;
    }
  }

  try {
    // Create .orchestra directory
    fs.mkdirSync(orchestraDir, { recursive: true });
    logger.info(`Created .orchestra directory at ${orchestraDir}`);

    // NOTE: Don't create database file - MCP server will create it with proper schema
    // when configure_sprint is called

    // Create .github/agents directory and agent instruction files
    const agentsDir = path.join(workspaceRoot, ".github", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    // Copy agent instruction files from extension bundle
    const agentFiles = [
      "orchestra.orchestrator.agent.md",
      "orchestra.implementor.agent.md",
    ];

    for (const agentFile of agentFiles) {
      const sourcePath = path.join(context.extensionPath, "agents", agentFile);
      const targetPath = path.join(agentsDir, agentFile);

      // Only copy if source exists and target doesn't (don't overwrite user customizations)
      if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
        fs.copyFileSync(sourcePath, targetPath);
        logger.info(`Created agent file: ${agentFile}`);
      }
    }
    logger.info("Created .github/agents directory with agent instructions");

    // Automatically install MCP servers
    await installMcpServers(orchestraDir, context.extensionPath);
    logger.info("MCP servers installed to .vscode/mcp.json");

    vscode.window.showInformationMessage(
      "Orchestra: Workspace initialized with MCP servers. Reloading window..."
    );

    // Reload window to activate extension with the new workspace
    vscode.commands.executeCommand("workbench.action.reloadWindow");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to initialize workspace", error);
    vscode.window.showErrorMessage(
      `Orchestra: Failed to initialize workspace - ${message}`
    );
  }
}

/**
 * Handle invoking the orchestrator agent
 * Opens chat with orchestrator agent context using SessionManager
 */
async function handleInvokeOrchestrator(_workspaceRoot: string): Promise<void> {
  try {
    const sm = getSessionManager();
    await sm.invokeOrchestrator(
      "I'm ready to work as the orchestrator agent.",
      []
    );
    logger.info("Orchestrator agent invoked via SessionManager");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to open chat - ${message}`
    );
    logger.error("Failed to invoke orchestrator", error);
  }
}

/**
 * Handle invoking the implementor agent
 * Opens chat with implementor agent context using SessionManager
 */
async function handleInvokeImplementor(_workspaceRoot: string): Promise<void> {
  try {
    const sm = getSessionManager();
    await sm.invokeImplementor(
      "I'm ready to work as the implementor agent.",
      []
    );
    logger.info("Implementor agent invoked via SessionManager");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to open chat - ${message}`
    );
    logger.error("Failed to invoke implementor", error);
  }
}

/**
 * Handle starting a task
 * Opens chat with implementor agent and task context pre-filled
 */
async function handleStartTask(
  workspaceRoot: string,
  taskId: number
): Promise<void> {
  const { getHandover, getTasksForSprint, getCurrentSprint } = await import(
    "./database/queries.js"
  );

  try {
    // Get task details
    const sprint = getCurrentSprint(workspaceRoot);
    if (!sprint) {
      vscode.window.showErrorMessage("Orchestra: No active sprint found");
      return;
    }

    const tasks = getTasksForSprint(workspaceRoot, sprint.id);
    // taskId is the internal database id (task.id), not task_id
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      vscode.window.showErrorMessage(
        `Orchestra: Task ${taskId} not found in current sprint`
      );
      return;
    }

    // Check if task has a handover
    const handover = getHandover(workspaceRoot, task.id);
    if (!handover) {
      vscode.window.showWarningMessage(
        `Orchestra: Task ${task.task_id} has no handover yet. Use the orchestrator to prepare it first.`
      );
      return;
    }

    // Open chat with task context pre-filled using SessionManager
    const sm = getSessionManager();
    await sm.invokeImplementor(
      `Start working on Task ${task.task_id}: ${task.title}. The handover has been prepared and I'm ready to implement.`,
      []
    );

    logger.info(`Task ${task.task_id} started via SessionManager`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to start task - ${message}`
    );
    logger.error(`Failed to start task ${taskId}`, error);
  }
}

/**
 * Handle setting a sprint as active
 */
async function handleSetActiveSprint(
  workspaceRoot: string,
  sprintId: string,
  sprintName: string,
  treeProvider: SprintTreeProvider,
  watcher: DatabaseWatcher
): Promise<void> {
  const { setActiveSprint } = await import("./database/mutations.js");

  try {
    const result = setActiveSprint(workspaceRoot, sprintId, watcher);
    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `Orchestra: "${result.sprintName}" is now the active sprint.`
    );
    logger.info(`Set active sprint: ${sprintId} (${sprintName})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to set active sprint - ${message}`
    );
    logger.error(`Failed to set active sprint ${sprintId}`, error);
  }
}

/**
 * Extension activation
 * Triggered when .orchestra/orchestra.db is found in workspace
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  logger = new OrchestraLogger();
  logger.info("Orchestra extension activating...");

  // Initialize ConfigService
  configService = new ConfigService();
  logger.info("ConfigService initialized");

  // Initialize SessionManager
  sessionManager = new SessionManager(logger, configService);
  logger.info("SessionManager initialized");

  // 1. Detect Orchestra workspace
  const orchestraRoot = findOrchestraRoot();

  // Set context for welcome view
  vscode.commands.executeCommand(
    "setContext",
    "orchestra.hasWorkspace",
    !!orchestraRoot
  );

  // Always register the initialize command (available even without workspace)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "orchestra.initializeWorkspace",
      async () => {
        await initializeWorkspace(context);
      }
    )
  );

  if (!orchestraRoot) {
    logger.warn("No .orchestra/ folder found in workspace");

    // Register empty tree provider for welcome view
    const emptyProvider: vscode.TreeDataProvider<never> = {
      getTreeItem: () => {
        throw new Error("No items");
      },
      getChildren: () => [],
    };
    const treeView = vscode.window.createTreeView("orchestra.sprintExplorer", {
      treeDataProvider: emptyProvider,
    });
    context.subscriptions.push(treeView);

    logger.info("Orchestra extension activated (no workspace mode)");
    return;
  }

  logger.info(`Orchestra workspace detected: ${orchestraRoot}`);

  // Initialize ContextFileResolver (Task 8)
  contextFileResolver = new ContextFileResolver(orchestraRoot);
  logger.info("ContextFileResolver initialized");

  // 2. Validate workspace - check if database exists
  if (!validateOrchestraWorkspace(orchestraRoot)) {
    logger.info("Orchestra workspace found but no database yet");

    // Set context for "no sprint" welcome view
    vscode.commands.executeCommand(
      "setContext",
      "orchestra.hasActiveSprint",
      false
    );

    // Register empty tree provider for welcome view
    const emptyProvider: vscode.TreeDataProvider<never> = {
      getTreeItem: () => {
        throw new Error("No items");
      },
      getChildren: () => [],
    };
    const treeView = vscode.window.createTreeView("orchestra.sprintExplorer", {
      treeDataProvider: emptyProvider,
    });
    context.subscriptions.push(treeView);

    // Register install MCP command
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "orchestra.installMcpServers",
        async () => {
          try {
            await installMcpServers(orchestraRoot, context.extensionPath);
            vscode.window.showInformationMessage(
              "Orchestra: MCP servers installed to .vscode/mcp.json"
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            vscode.window.showErrorMessage(
              `Orchestra: Failed to install MCP servers - ${message}`
            );
          }
        }
      )
    );

    logger.info(
      "Orchestra extension activated (no database mode - use MCP to configure sprint)"
    );
    return;
  }

  // 3. Generate MCP config (safe to do even if database fails)
  const extensionVersion = context.extension.packageJSON.version || "0.0.0";
  const configGenerator = new ConfigGenerator(
    orchestraRoot,
    context.extensionPath,
    extensionVersion,
    logger
  );
  await configGenerator.generateConfig();
  logger.info("MCP config generation complete");

  // 4. Initialize database client - wrap in try-catch for graceful degradation
  let db: Database.Database;
  try {
    db = OrchestraDB.getInstance(orchestraRoot);
    logger.info("Database client initialized");
  } catch (error) {
    logger.error("Failed to initialize database", error);

    // Show error to user with helpful context
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Cannot open database - ${errorMsg}. ` +
        `The database may be locked by another process or corrupted. ` +
        `Try: 1) Close other VS Code windows, 2) Restart VS Code, 3) Check if MCP servers are running.`
    );

    // Register empty tree provider for graceful degradation
    const emptyProvider: vscode.TreeDataProvider<never> = {
      getTreeItem: () => {
        throw new Error("No items");
      },
      getChildren: () => [],
    };
    const treeView = vscode.window.createTreeView("orchestra.sprintExplorer", {
      treeDataProvider: emptyProvider,
    });
    context.subscriptions.push(treeView);

    logger.info("Orchestra extension activated (database error mode)");
    return;
  }

  try {
    // 5. Setup database watcher for reactive updates
    dbWatcher = new DatabaseWatcher(orchestraRoot);
    context.subscriptions.push(dbWatcher);

    // 5b. Register Current Task WebviewView (Task 7)
    const currentTaskProvider = new CurrentTaskViewProvider(
      context.extensionUri,
      orchestraRoot,
      dbWatcher
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "orchestra.currentTask",
        currentTaskProvider
      )
    );
    logger.info("Current Task WebviewView registered");

    // 6. Register TreeView
    const treeProvider = new SprintTreeProvider(db, dbWatcher);
    const treeView = vscode.window.createTreeView("orchestra.sprintExplorer", {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    logger.info("Sprint Explorer TreeView registered");

    // 6b. Register FileDecorationProvider for status-based styling (TD-016 DD-4)
    const decorationProvider = new OrchestraViewDecorationProvider();
    context.subscriptions.push(
      vscode.window.registerFileDecorationProvider(decorationProvider)
    );
    logger.info("View decoration provider registered");

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
      vscode.commands.registerCommand("orchestra.openSprintSettings", () => {
        SprintSettingsPanel.show(orchestraRoot, logger);
      }),
      vscode.commands.registerCommand(
        "orchestra.openTaskDetail",
        (taskId: number) => {
          if (dbWatcher) {
            TaskDetailPanel.createOrShow(
              context.extensionUri,
              db,
              dbWatcher,
              taskId
            );
          } else {
            vscode.window.showErrorMessage(
              "Orchestra: Database watcher not initialized"
            );
          }
        }
      ),
      vscode.commands.registerCommand(
        "orchestra.installMcpServers",
        async () => {
          try {
            await installMcpServers(orchestraRoot, context.extensionPath);
            vscode.window.showInformationMessage(
              "Orchestra: MCP servers installed successfully to .vscode/mcp.json"
            );
            logger.info("MCP servers installed to .vscode/mcp.json");
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            vscode.window.showErrorMessage(
              `Orchestra: Failed to install MCP servers - ${message}`
            );
            logger.error("Failed to install MCP servers", error);
          }
        }
      ),
      // Agent invocation commands
      vscode.commands.registerCommand(
        "orchestra.invokeOrchestrator",
        async () => {
          await handleInvokeOrchestrator(orchestraRoot);
        }
      ),
      vscode.commands.registerCommand(
        "orchestra.invokeImplementor",
        async () => {
          await handleInvokeImplementor(orchestraRoot);
        }
      ),
      vscode.commands.registerCommand(
        "orchestra.startTask",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handleStartTask(orchestraRoot, element.task.id);
          }
        }
      ),
      vscode.commands.registerCommand(
        "orchestra.playTask",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handlePlayTask(orchestraRoot, element.task.id);
          }
        }
      ),
      // Task remediation commands
      vscode.commands.registerCommand(
        "orchestra.deEscalateTask",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handleDeEscalateTask(
              orchestraRoot,
              element.task.id,
              treeProvider,
              dbWatcher
            );
          }
        }
      ),
      vscode.commands.registerCommand(
        "orchestra.moveToGateCheck",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handleMoveToGateCheck(
              orchestraRoot,
              element.task.id,
              treeProvider,
              dbWatcher
            );
          }
        }
      ),
      vscode.commands.registerCommand(
        "orchestra.moveToImplement",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handleMoveToImplement(
              orchestraRoot,
              element.task.id,
              treeProvider,
              dbWatcher
            );
          }
        }
      ),
      vscode.commands.registerCommand(
        "orchestra.forceComplete",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handleForceComplete(
              orchestraRoot,
              element.task.id,
              treeProvider,
              dbWatcher
            );
          }
        }
      ),
      vscode.commands.registerCommand(
        "orchestra.setActiveSprint",
        async (element: {
          type: string;
          sprint?: { id: string; name: string };
        }) => {
          if (element?.sprint?.id && dbWatcher) {
            await handleSetActiveSprint(
              orchestraRoot,
              element.sprint.id,
              element.sprint.name,
              treeProvider,
              dbWatcher
            );
          }
        }
      )
    );
    logger.info("Commands registered");

    // 9. Start MCP servers (if enabled)
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

  // ConfigService has no disposal required - it only provides access to workspace config
  // Any onConfigChange listeners created by consumers are their responsibility to dispose

  // Database watcher disposed via subscriptions
  dbWatcher = undefined;

  // MCP servers disposed via subscriptions
  mcpManager = undefined;

  // Close database connection
  OrchestraDB.close();

  logger?.info("Orchestra extension deactivated");
}
