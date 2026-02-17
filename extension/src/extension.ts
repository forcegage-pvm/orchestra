/**
 * Orchestra VS Code Extension
 *
 * Entry point for the extension. Handles activation, workspace detection,
 * database initialization, view registration, and MCP server lifecycle.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AgentRunner, ToolRegistry } from "./agents/index.js";
import { disposeAgentEventBus } from "./agents/sessions/eventBus.js";
import { ProcessManager } from "./agents/tools/infrastructure/ProcessManager.js";
import {
  disposeWorkflowChain,
  getWorkflowChain,
  WorkflowChain,
} from "./agents/WorkflowChain.js";
import { SessionManager } from "./chat/SessionManager.js";
import { handleArchiveSprint } from "./commands/archiveSprint.js";
import { handleChangeTaskStatus } from "./commands/changeTaskStatus.js";
import {
  handleDeEscalateTask,
  handleForceComplete,
  handleMoveToGateCheck,
  handleMoveToImplement,
} from "./commands/deEscalation.js";
import { handleFilterSprints } from "./commands/filterSprints.js";
import { handlePlayTask } from "./commands/PlayTaskHandler.js";
import { handleResumeAgent } from "./commands/resumeAgent.js";
import { handleReviewSprint } from "./commands/ReviewSprintHandler.js";
import { handleSelectModel } from "./commands/selectModel.js";
import { handleSetVerbosity } from "./commands/setVerbosity.js";
import { registerTestCommands } from "./commands/testAgentCommands.js";
import { handleUnarchiveSprint } from "./commands/unarchiveSprint.js";
import { ConfigService } from "./config/ConfigService.js";
import { OrchestraDB } from "./database/client.js";
import {
  getCompletedUnreviewedTasks,
  getCurrentSprint,
  getHandover,
  getLatestCodeReviewForTask,
  getOpenCodeReviewIssues,
} from "./database/queries.js";
import { DatabaseWatcher } from "./database/watcher.js";
import { ConfigGenerator } from "./mcp/ConfigGenerator.js";
import { registerMcpServerProvider } from "./mcp/McpServerProvider.js";
import { MCPServerManager } from "./mcp/ServerManager.js";
import { ContextFileResolver } from "./prompts/ContextFileResolver.js";
import { ensurePromptTemplates } from "./prompts/ensurePromptTemplates.js";
import { PromptBuilder } from "./prompts/PromptBuilder.js";
import { getLogger, type OrchestraLogger } from "./utils/logger.js";
import { AgentOutputPanel } from "./views/agent/AgentOutputPanel.js";
import { AgentPanelProvider } from "./views/agentPanelProvider.js";
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
let agentRunner: AgentRunner | undefined;
let agentOutputPanel: AgentOutputPanel | undefined;
let agentStateSubscription: vscode.Disposable | undefined;
let workflowChain: WorkflowChain | undefined;

async function openAgentChat(
  participant:
    | "orchestra.implementor"
    | "orchestra.controller"
    | "orchestra.orchestrator",
  prompt: string,
): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: prompt,
    participant,
  });
}

async function promptForTaskNumber(
  prompt: string,
): Promise<number | undefined> {
  const input = await vscode.window.showInputBox({
    prompt,
    placeHolder: "e.g., 5",
    validateInput: (value) =>
      Number.isNaN(Number.parseInt(value, 10))
        ? "Enter a numeric task ID"
        : undefined,
  });

  if (!input) {
    return undefined;
  }

  const taskNumber = Number.parseInt(input, 10);
  return Number.isNaN(taskNumber) ? undefined : taskNumber;
}

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
      "ContextFileResolver not initialized. Orchestra workspace not detected.",
    );
  }
  return contextFileResolver;
}

/**
 * Get the AgentRunner singleton
 * @returns The AgentRunner instance (lazy-initialized)
 */
export function getAgentRunner(): AgentRunner {
  if (!agentRunner) {
    agentRunner = createAgentRunner();
  }
  return agentRunner;
}

function createAgentRunner(): AgentRunner {
  const toolRegistry = new ToolRegistry();
  const configSvc = getConfigService();
  return new AgentRunner(
    toolRegistry,
    {
      orchestratorModel: configSvc.getModelForRole("orchestrator"),
      implementorModel: configSvc.getModelForRole("implementor"),
      controllerModel: configSvc.getModelForRole("controller"),
      maxIterations: configSvc.getMaxIterations(),
      maxContextTokens: 100000,
    },
    configSvc,
  );
}

/**
 * Install MCP servers to .vscode/mcp.json
 * Merges with existing configuration, preserving other servers
 *
 * IMPORTANT: Skips overwrite if:
 * 1. Running in extension development mode (F5 debug)
 * 2. Existing config uses ${workspaceFolder} variables (dev workspace)
 * 3. Existing config has a "dev" section (MCP dev mode)
 */
async function installMcpServers(
  orchestraRoot: string,
  extensionPath: string,
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
      "Bundled MCP server not found. Extension may be corrupted.",
    );
  }

  // Check if we should skip updating mcp.json
  if (fs.existsSync(mcpJsonPath)) {
    try {
      const content = fs.readFileSync(mcpJsonPath, "utf-8");

      // Check for dev mode indicators:
      // 1. ${workspaceFolder} variables indicate local dev setup
      // 2. "dev" section indicates MCP dev mode
      const hasWorkspaceFolderVar = content.includes("${workspaceFolder}");
      const hasDevSection = content.includes('"dev"');

      if (hasWorkspaceFolderVar || hasDevSection) {
        // This is a development workspace - don't overwrite
        logger.info(
          "MCP config has dev markers - preserving local configuration",
        );
        return;
      }
    } catch {
      // If we can't read the file, proceed with overwrite
    }
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
        }`,
      );
    }
  }

  // Add/update Orchestra servers
  existingConfig.servers = existingConfig.servers || {};
  existingConfig.servers["orchestra-orc"] = {
    type: "stdio",
    command: "node",
    args: [serverPath, "--role=orchestrator"],
    env: {
      ORCHESTRA_WORKSPACE: orchestraRoot,
    },
  };
  existingConfig.servers["orchestra-imp"] = {
    type: "stdio",
    command: "node",
    args: [serverPath, "--role=implementor"],
    env: {
      ORCHESTRA_WORKSPACE: orchestraRoot,
    },
  };
  // T032/ISSUE-009: Controller MCP server for Controller Agent
  existingConfig.servers["orchestra-ctl"] = {
    type: "stdio",
    command: "node",
    args: [serverPath, "--role=controller"],
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
    "utf-8",
  );
}

/**
 * Ensure agent instruction files are synced from extension bundle
 * Always overwrites to ensure users have the latest agent definitions
 */
function ensureAgentFiles(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
): void {
  const agentsDir = path.join(workspaceRoot, ".github", "agents");

  // Create .github/agents directory if it doesn't exist
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
    logger.info(`Created .github/agents directory at ${agentsDir}`);
  }

  // Copy agent instruction files from extension bundle
  // Always overwrite to ensure latest definitions on extension update
  const agentFiles = [
    "orchestra.orchestrator.agent.md",
    "orchestra.implementor.agent.md",
    "orchestra.controller.agent.md", // T032/ISSUE-010: Controller Agent prompt
  ];

  for (const agentFile of agentFiles) {
    const sourcePath = path.join(context.extensionPath, "agents", agentFile);
    const targetPath = path.join(agentsDir, agentFile);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      logger.info(`Synced agent file: ${agentFile}`);
    } else {
      logger.warn(`Agent file not found in extension bundle: ${agentFile}`);
    }
  }
}

/**
 * Initialize Orchestra workspace
 * Creates .orchestra folder and empty database
 */
async function initializeWorkspace(
  context: vscode.ExtensionContext,
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("Orchestra: No workspace folder open");
    return;
  }

  const workspaceRoot = workspaceFolders[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage(
      "Orchestra: Unable to determine workspace root",
    );
    return;
  }

  const orchestraDir = path.join(workspaceRoot, ".orchestra");

  // Check if already initialized
  if (fs.existsSync(orchestraDir)) {
    const dbPath = path.join(orchestraDir, "orchestra.db");
    if (fs.existsSync(dbPath)) {
      vscode.window.showInformationMessage(
        "Orchestra: Workspace already initialized. Reloading...",
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

    // Sync agent instruction files from extension bundle
    ensureAgentFiles(context, workspaceRoot);
    logger.info("Synced .github/agents directory with agent instructions");

    // Sync prompt templates from extension bundle
    ensurePromptTemplates(context, workspaceRoot, { logger });
    logger.info(
      "Synced .orchestra/templates/prompts directory with prompt templates",
    );
    // Automatically install MCP servers
    await installMcpServers(workspaceRoot, context.extensionPath);
    logger.info("MCP servers installed to .vscode/mcp.json");

    vscode.window.showInformationMessage(
      "Orchestra: Workspace initialized with MCP servers. Reloading window...",
    );

    // Reload window to activate extension with the new workspace
    vscode.commands.executeCommand("workbench.action.reloadWindow");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to initialize workspace", error);
    vscode.window.showErrorMessage(
      `Orchestra: Failed to initialize workspace - ${message}`,
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
    await sm.sendMessage(
      "orchestrator",
      "I'm ready to work as the orchestrator agent.",
      [],
    );
    logger.info("Orchestrator agent invoked via SessionManager");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to open chat - ${message}`,
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
    await sm.sendMessage(
      "implementor",
      "I'm ready to work as the implementor agent.",
      [],
    );
    logger.info("Implementor agent invoked via SessionManager");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to open chat - ${message}`,
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
  taskId: number,
): Promise<void> {
  const { getHandover, getTasksForSprint, getCurrentSprint } =
    await import("./database/queries.js");

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
        `Orchestra: Task ${taskId} not found in current sprint`,
      );
      return;
    }

    // Check if task has a handover
    const handover = getHandover(workspaceRoot, task.id);
    if (!handover) {
      vscode.window.showWarningMessage(
        `Orchestra: Task ${task.task_id} has no handover yet. Use the orchestrator to prepare it first.`,
      );
      return;
    }

    // Open chat with task context pre-filled using SessionManager
    const sm = getSessionManager();

    // Clear implementor context before starting new task
    await sm.clearImplementorContext();

    await sm.sendMessage(
      "implementor",
      `Start working on Task ${task.task_id}: ${task.title}. The handover has been prepared and I'm ready to implement.`,
      [],
    );

    logger.info(`Task ${task.task_id} started via SessionManager`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to start task - ${message}`,
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
  watcher: DatabaseWatcher,
): Promise<void> {
  const { setActiveSprint } = await import("./database/mutations.js");

  try {
    const result = setActiveSprint(workspaceRoot, sprintId, watcher);
    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `Orchestra: "${result.sprintName}" is now the active sprint.`,
    );
    logger.info(`Set active sprint: ${sprintId} (${sprintName})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to set active sprint - ${message}`,
    );
    logger.error(`Failed to set active sprint ${sprintId}`, error);
  }
}

/**
 * Extension activation
 * Triggered when .orchestra/orchestra.db is found in workspace
 */
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  logger = getLogger();

  // Log version prominently on activation
  const extensionVersion = context.extension.packageJSON.version || "0.0.0";
  logger.info(`Orchestra extension v${extensionVersion} activating...`);

  // Initialize ConfigService
  configService = new ConfigService();
  logger.info("ConfigService initialized");

  // 1. Detect Orchestra workspace
  const orchestraRoot = findOrchestraRoot();

  if (orchestraRoot) {
    configService = new ConfigService(orchestraRoot);
    logger.info("ConfigService initialized with workspace root");
  }

  // Initialize SessionManager
  sessionManager = new SessionManager(logger, configService);
  logger.info("SessionManager initialized");

  // Set context for welcome view
  vscode.commands.executeCommand(
    "setContext",
    "orchestra.hasWorkspace",
    !!orchestraRoot,
  );

  // Always register the initialize command (available even without workspace)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "orchestra.initializeWorkspace",
      async () => {
        await initializeWorkspace(context);
      },
    ),
  );

  // Register show version command (always available)
  context.subscriptions.push(
    vscode.commands.registerCommand("orchestra.showVersion", async () => {
      const version = context.extension.packageJSON.version || "0.0.0";
      const workspaceRoot = findOrchestraRoot();

      const message = `Orchestra Extension v${version}`;
      const details = [`Extension Version: ${version}`];

      if (workspaceRoot) {
        const dbPath = path.join(workspaceRoot, "orchestra.db");
        if (fs.existsSync(dbPath)) {
          try {
            // Query migrations from database
            const { loadBetterSqlite3 } =
              await import("./database/native-loader.js");
            const Database = loadBetterSqlite3();
            const db = new Database(dbPath, { readonly: true });
            const migrations = db
              .prepare(
                "SELECT id, description, applied_at FROM schema_migrations ORDER BY applied_at",
              )
              .all() as Array<{
              id: string;
              description: string;
              applied_at: string;
            }>;
            db.close();

            details.push(`Database: ${dbPath}`);
            details.push(`Migrations Applied: ${migrations.length}`);
            if (migrations.length > 0) {
              details.push("");
              details.push("Applied Migrations:");
              for (const m of migrations) {
                details.push(`  • ${m.id}`);
              }
            }
          } catch (err) {
            details.push(
              `Database: Error reading - ${
                err instanceof Error ? err.message : "Unknown"
              }`,
            );
          }
        } else {
          details.push(
            "Database: Not yet created (run configure_sprint via MCP)",
          );
        }
      } else {
        details.push("Workspace: No Orchestra workspace detected");
      }

      // Show in output channel
      logger.info("=== Orchestra Version Info ===");
      for (const line of details) {
        logger.info(line);
      }
      logger.info("==============================");
      logger.show();

      vscode.window
        .showInformationMessage(message, "Show Details")
        .then((selection) => {
          if (selection === "Show Details") {
            logger.show();
          }
        });
    }),
  );

  // Register test commands (available even without workspace for debugging)
  registerTestCommands(context);

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

  try {
    const storage = SessionStorage.getInstance(orchestraRoot);
    const recoverableSessions = await storage.getRecoverableSessions();
    if (recoverableSessions.length > 0) {
      const selection = await vscode.window.showInformationMessage(
        "Resume interrupted session?",
        "Resume",
        "Dismiss",
      );
      if (selection === "Resume") {
        await vscode.commands.executeCommand("orchestra.resumeAgent");
      }
    }

    try {
      const deletedCount = await storage.cleanupExpiredSessions();
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} expired agent sessions.`);
      }
    } catch (error) {
      logger.warn(
        `Failed to cleanup expired sessions: ${
          error instanceof Error ? error.message : "Unknown"
        }`,
      );
    }
  } catch (error) {
    logger.warn(
      `Failed to check recoverable sessions: ${
        error instanceof Error ? error.message : "Unknown"
      }`,
    );
  }

  // Register MCP server definition provider (provides servers dynamically to VS Code)
  // This eliminates the need for hardcoded paths in .vscode/mcp.json
  try {
    const mcpProviderDisposable = registerMcpServerProvider(
      context,
      orchestraRoot,
    );
    context.subscriptions.push(mcpProviderDisposable);
    logger.info("MCP server definition provider registered");
  } catch (err) {
    // This may fail if VS Code version doesn't support McpServerDefinitionProvider
    logger.warn(
      `Failed to register MCP provider (may require VS Code 1.102+): ${
        err instanceof Error ? err.message : "Unknown"
      }`,
    );
  }

  // Sync agent files and MCP config on every activation to ensure latest definitions
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders[0]) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    ensureAgentFiles(context, workspaceRoot);

    // Sync prompt templates from extension bundle
    ensurePromptTemplates(context, workspaceRoot, { logger });
    // Also ensure MCP servers are configured with latest extension path
    try {
      await installMcpServers(orchestraRoot, context.extensionPath);
      logger.info("MCP server config updated");
    } catch (err) {
      logger.warn(
        `Failed to update MCP config: ${
          err instanceof Error ? err.message : "Unknown"
        }`,
      );
    }
  }

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
      false,
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
              "Orchestra: MCP servers installed to .vscode/mcp.json",
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            vscode.window.showErrorMessage(
              `Orchestra: Failed to install MCP servers - ${message}`,
            );
          }
        },
      ),
    );

    // Start MCP servers even before DB exists (server will create DB on first run)
    const config = vscode.workspace.getConfiguration("orchestra");
    const autoStartMCP = config.get<boolean>("autoStartMCP", true);

    if (autoStartMCP) {
      mcpManager = new MCPServerManager(
        orchestraRoot,
        context.extensionPath,
        logger,
      );
      mcpManager.startServer("orchestrator");
      mcpManager.startServer("implementor");
      context.subscriptions.push({
        dispose: () => {
          mcpManager?.stopAllServers();
        },
      });
      logger.info("MCP servers started (no database mode)");
    }

    logger.info(
      "Orchestra extension activated (no database mode - use MCP to configure sprint)",
    );
    return;
  }

  // 3. Generate MCP config (safe to do even if database fails)
  // Note: extensionVersion already declared at activation start
  const configGenerator = new ConfigGenerator(
    orchestraRoot,
    context.extensionPath,
    extensionVersion,
    logger,
  );
  await configGenerator.generateConfig();
  logger.info("MCP config generation complete");

  // 4. Initialize database client - wrap in try-catch for graceful degradation
  let db: ReturnType<typeof OrchestraDB.getInstance>;
  try {
    db = OrchestraDB.getInstance(orchestraRoot);
    logger.info("Database client initialized");

    // 4a. Run any pending migrations
    const { runExtensionMigrations } = await import("./database/migrations.js");
    const migrationResult = runExtensionMigrations(db);
    if (migrationResult.applied > 0) {
      logger.info(
        `Applied ${
          migrationResult.applied
        } database migration(s): ${migrationResult.migrations.join(", ")}`,
      );
    } else {
      logger.info("Database schema is up to date");
    }
  } catch (error) {
    logger.error("Failed to initialize database", error);

    // Show error to user with helpful context
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Cannot open database - ${errorMsg}. ` +
        `The database may be locked by another process or corrupted. ` +
        `Try: 1) Close other VS Code windows, 2) Restart VS Code, 3) Check if MCP servers are running.`,
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
      dbWatcher,
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "orchestra.currentTask",
        currentTaskProvider,
      ),
    );
    logger.info("Current Task WebviewView registered");

    // 5c. Register Agent Panel WebviewView (Task 32)
    const agentPanelProvider = new AgentPanelProvider(
      context.extensionUri,
      orchestraRoot,
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "orchestra.agentPanel",
        agentPanelProvider,
        { webviewOptions: { retainContextWhenHidden: true } },
      ),
    );
    logger.info("Agent Panel WebviewView registered");

    // 6. Register TreeView
    const treeProvider = new SprintTreeProvider(db, dbWatcher, context);
    const treeView = vscode.window.createTreeView("orchestra.sprintExplorer", {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    logger.info("Sprint Explorer TreeView registered");

    // TODO: Re-evaluate if Code Review and Workflow Controls views should be removed
    // 6a. Register Code Review TreeView
    // const codeReviewTreeProvider = new CodeReviewTreeProvider(
    //   orchestraRoot,
    //   dbWatcher,
    // );
    // const codeReviewTreeView = vscode.window.createTreeView(
    //   "orchestra.codeReview",
    //   {
    //     treeDataProvider: codeReviewTreeProvider,
    //     showCollapseAll: true,
    //   },
    // );
    // context.subscriptions.push(codeReviewTreeView);
    // logger.info("Code Review TreeView registered");

    // 6b. Register FileDecorationProvider for status-based styling (TD-016 DD-4)
    const decorationProvider = new OrchestraViewDecorationProvider();
    context.subscriptions.push(
      vscode.window.registerFileDecorationProvider(decorationProvider),
    );
    // Also refresh decorations when database changes (store subscription)
    context.subscriptions.push(
      dbWatcher.onDidChange(() => decorationProvider.refresh()),
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
        treeProvider.refresh("manual");
        // codeReviewTreeProvider.refresh(); // Commented out - Code Review view hidden
        decorationProvider.refresh(); // Refresh file decorations (code review badges)
        statusBar.refresh();
        logger.info("Manual refresh triggered");
      }),
      vscode.commands.registerCommand(
        "orchestra.clearAgentPanelHistory",
        () => {
          agentPanelProvider.clearPanel();
        },
      ),
      vscode.commands.registerCommand("orchestra.filterSprints", () => {
        handleFilterSprints(treeProvider).catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Orchestra: Failed to filter sprints - ${message}`,
          );
          logger.error("Failed to filter sprints", error);
        });
      }),
      vscode.commands.registerCommand("orchestra.setVerbosity", () => {
        handleSetVerbosity().catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Orchestra: Failed to set verbosity - ${message}`,
          );
          logger.error("Failed to set verbosity", error);
        });
      }),
      vscode.commands.registerCommand(
        "orchestra.selectModel",
        async (role?: string): Promise<boolean> => {
          const selectedRole =
            role === "orchestrator" ||
            role === "implementor" ||
            role === "controller"
              ? role
              : undefined;
          try {
            return await handleSelectModel(selectedRole);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            vscode.window.showErrorMessage(
              `Orchestra: Failed to select model - ${message}`,
            );
            logger.error("Failed to select model", error);
            return false;
          }
        },
      ),
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
              taskId,
            );
          } else {
            vscode.window.showErrorMessage(
              "Orchestra: Database watcher not initialized",
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.installMcpServers",
        async () => {
          try {
            await installMcpServers(orchestraRoot, context.extensionPath);
            vscode.window.showInformationMessage(
              "Orchestra: MCP servers installed successfully to .vscode/mcp.json",
            );
            logger.info("MCP servers installed to .vscode/mcp.json");
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            vscode.window.showErrorMessage(
              `Orchestra: Failed to install MCP servers - ${message}`,
            );
            logger.error("Failed to install MCP servers", error);
          }
        },
      ),
      // Agent invocation commands
      vscode.commands.registerCommand(
        "orchestra.invokeOrchestrator",
        async () => {
          await handleInvokeOrchestrator(orchestraRoot);
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.invokeImplementor",
        async () => {
          await handleInvokeImplementor(orchestraRoot);
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.startTask",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handleStartTask(orchestraRoot, element.task.id);
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.playTask",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handlePlayTask(orchestraRoot, element.task.id);
          }
        },
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
              dbWatcher,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.moveToGateCheck",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handleMoveToGateCheck(
              orchestraRoot,
              element.task.id,
              treeProvider,
              dbWatcher,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.moveToImplement",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handleMoveToImplement(
              orchestraRoot,
              element.task.id,
              treeProvider,
              dbWatcher,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.forceComplete",
        async (element: { type: string; task?: { id: number } }) => {
          if (element?.task?.id) {
            await handleForceComplete(
              orchestraRoot,
              element.task.id,
              treeProvider,
              dbWatcher,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.changeTaskStatus",
        async (element: {
          type: string;
          task?: { id: number; status?: string };
        }) => {
          if (element?.task?.id) {
            await handleChangeTaskStatus(
              orchestraRoot,
              element.task.id,
              element.task.status,
              treeProvider,
              dbWatcher,
            );
          }
        },
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
              dbWatcher,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.archiveSprint",
        async (element: {
          type: string;
          sprint?: { id: string; name: string };
        }) => {
          if (element?.sprint?.id && dbWatcher) {
            await handleArchiveSprint(
              orchestraRoot,
              element.sprint.id,
              treeProvider,
              dbWatcher,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.unarchiveSprint",
        async (element: {
          type: string;
          sprint?: { id: string; name: string };
        }) => {
          if (element?.sprint?.id && dbWatcher) {
            await handleUnarchiveSprint(
              orchestraRoot,
              element.sprint.id,
              treeProvider,
              dbWatcher,
            );
          }
        },
      ),
      // Code Review commands
      vscode.commands.registerCommand("orchestra.openCodeReviewSummary", () => {
        if (!dbWatcher) {
          vscode.window.showErrorMessage(
            "Orchestra: Database watcher not initialized",
          );
          return;
        }

        CodeReviewSummaryPanel.createOrShow(
          context.extensionUri,
          orchestraRoot,
          dbWatcher,
        );
      }),
      vscode.commands.registerCommand("orchestra.runAdHocReview", async () => {
        try {
          const db = OrchestraDB.getInstance(orchestraRoot);
          const sprint = getCurrentSprint(orchestraRoot);
          if (!sprint) {
            vscode.window.showWarningMessage(
              "No active sprint found. Cannot trigger ad-hoc reviews.",
            );
            return;
          }

          // Check for existing pending reviews
          const pendingCount = db
            .prepare(
              `SELECT COUNT(*) as count FROM code_reviews WHERE sprint_id = ? AND status = 'PENDING'`,
            )
            .get(sprint.id) as { count: number };

          const unreviewedTasks = getCompletedUnreviewedTasks(orchestraRoot);

          // Create reviews for any unreviewed tasks
          const now = new Date().toISOString();
          let createdCount = 0;
          for (const task of unreviewedTasks) {
            db.prepare(
              `INSERT INTO code_reviews (sprint_id, task_id, phase_id, review_scope, status, summary, risk, requested_by, requested_at)
               VALUES (?, ?, ?, 'TASK', 'PENDING', ?, 'LOW', 'orchestrator', ?)`,
            ).run(
              sprint.id,
              task.id,
              task.phase_id,
              `Ad-hoc review for task ${task.task_id}: ${task.title}`,
              now,
            );
            createdCount++;
          }

          const totalPending = pendingCount.count + createdCount;

          if (totalPending === 0) {
            vscode.window.showInformationMessage(
              "No pending code reviews to process.",
            );
            return;
          }

          if (createdCount > 0) {
            vscode.window.showInformationMessage(
              `Created ${createdCount} new review(s). Launching Controller agent for ${totalPending} pending review(s)...`,
            );
          } else {
            vscode.window.showInformationMessage(
              `Launching Controller agent for ${totalPending} pending review(s)...`,
            );
          }

          // Refresh the code review tree
          codeReviewTreeProvider?.refresh();

          // Build prompt and invoke Controller agent
          const promptBuilder = new PromptBuilder({
            workspaceRoot: orchestraRoot,
          });
          const prompt = promptBuilder.buildCodeReviewPrompt(
            totalPending,
            sprint.id,
            sprint.name,
          );

          const sm = getSessionManager();
          await sm.invokeController(prompt, []);
        } catch (error) {
          logger.error("Failed to trigger ad-hoc reviews", error);
          vscode.window.showErrorMessage(
            `Failed to trigger ad-hoc reviews: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
      vscode.commands.registerCommand(
        "orchestra.fixCodeReviewIssues",
        async () => {
          try {
            const sprint = getCurrentSprint(orchestraRoot);
            if (!sprint) {
              vscode.window.showWarningMessage(
                "No active sprint found. Cannot fix code review issues.",
              );
              return;
            }

            const issues = getOpenCodeReviewIssues(orchestraRoot);
            if (issues.length === 0) {
              vscode.window.showInformationMessage(
                "No open code review issues to fix.",
              );
              return;
            }

            const prompt = [
              "You are being invoked to fix code review issues.",
              "Call this tool first to get your full task context and issues:",
              '{ "tool": "fix_code_review", "params": { "action": "GET_ISSUES" } }',
              "This returns full handover context and all open issues.",
            ].join("\n");

            await openAgentChat("orchestra.implementor", prompt);
          } catch (error) {
            logger.error("Failed to invoke fix code review issues", error);
            vscode.window.showErrorMessage(
              `Failed to invoke fix code review issues: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.verifyCodeReviewFixes",
        async (element?: { task?: { task_id?: number } } | number) => {
          try {
            const taskNumber =
              typeof element === "number"
                ? element
                : (element?.task?.task_id ??
                  (await promptForTaskNumber(
                    "Enter the task ID to verify fixes for",
                  )));

            if (!taskNumber) {
              return;
            }

            const prompt = [
              `You are being invoked to verify code review fixes for task ${taskNumber}.`,
              `Call this tool first: { "tool": "get_code_review", "params": { "task": ${taskNumber} } }`,
              "Then submit decision with verifying_fixes: true.",
            ].join("\n");

            await openAgentChat("orchestra.controller", prompt);
          } catch (error) {
            logger.error("Failed to invoke verify code review fixes", error);
            vscode.window.showErrorMessage(
              `Failed to verify code review fixes: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.escalateRejectedReview",
        async () => {
          try {
            const selection = await vscode.window.showQuickPick(
              [
                {
                  label: "Re-assign Task",
                  description:
                    "Create a new task and mark original as ESCALATED",
                  value: "reassign",
                },
                {
                  label: "Mark as Blocked",
                  description: "Escalate and unblock progression",
                  value: "blocked",
                },
                {
                  label: "Request Re-review",
                  description: "Ask Controller to reconsider the decision",
                  value: "rereview",
                },
                { label: "Cancel", value: "cancel" },
              ],
              { placeHolder: "Select an escalation option" },
            );

            if (!selection || selection.value === "cancel") {
              return;
            }

            if (selection.value === "blocked") {
              const taskNumber = await promptForTaskNumber(
                "Enter the task ID to mark as blocked",
              );
              if (!taskNumber) {
                return;
              }

              const reason = await vscode.window.showInputBox({
                prompt: "Provide a reason for blocking this task",
                placeHolder: "e.g., External dependency missing",
              });

              if (!reason) {
                return;
              }

              const prompt = [
                "Mark the task as blocked by calling this tool:",
                `{ "tool": "escalate_task", "params": { "task_id": ${taskNumber}, "reason": ${JSON.stringify(reason)} } }`,
              ].join("\n");

              await openAgentChat("orchestra.implementor", prompt);
              return;
            }

            if (selection.value === "rereview") {
              const taskNumber = await promptForTaskNumber(
                "Enter the task ID to request re-review",
              );
              if (!taskNumber) {
                return;
              }

              const prompt = [
                `You are being invoked to re-review task ${taskNumber}.`,
                `Call this tool first: { "tool": "get_code_review", "params": { "task": ${taskNumber} } }`,
                "Then submit your decision.",
              ].join("\n");

              await openAgentChat("orchestra.controller", prompt);
              return;
            }

            if (selection.value === "reassign") {
              const taskNumber = await promptForTaskNumber(
                "Enter the task ID to re-assign",
              );
              if (!taskNumber) {
                return;
              }

              const prompt = [
                `You are being invoked to re-assign task ${taskNumber} after a rejected review.`,
                "Please create a new task and mark the original as ESCALATED.",
              ].join("\n");

              await openAgentChat("orchestra.orchestrator", prompt);
            }
          } catch (error) {
            logger.error("Failed to escalate rejected review", error);
            vscode.window.showErrorMessage(
              `Failed to escalate rejected review: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.reReviewTask",
        async (element?: { task?: { task_id?: number } } | number) => {
          try {
            const taskNumber =
              typeof element === "number"
                ? element
                : (element?.task?.task_id ??
                  (await promptForTaskNumber(
                    "Enter the task ID to re-review",
                  )));

            if (!taskNumber) {
              return;
            }

            const sprint = getCurrentSprint(orchestraRoot);
            if (!sprint) {
              vscode.window.showWarningMessage(
                "No active sprint found. Cannot re-review task.",
              );
              return;
            }

            const db = OrchestraDB.getInstance(orchestraRoot);
            db.prepare(
              `UPDATE tasks SET status = 'VERIFIED' WHERE task_id = ? AND sprint_id = ?`,
            ).run(taskNumber, sprint.id);

            codeReviewTreeProvider?.refresh();

            const prompt = [
              `You are being invoked to re-review task ${taskNumber}.`,
              `Call this tool first: { "tool": "get_code_review", "params": { "task": ${taskNumber} } }`,
              "Then submit your decision.",
            ].join("\n");

            await openAgentChat("orchestra.controller", prompt);
          } catch (error) {
            logger.error("Failed to re-review task", error);
            vscode.window.showErrorMessage(
              `Failed to re-review task: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.prepareCodeReviewFixTask",
        async (element: { type: string; task?: { id: number } }) => {
          try {
            if (!element?.task?.id) {
              vscode.window.showErrorMessage("No task specified.");
              return;
            }

            const sprint = getCurrentSprint(orchestraRoot);
            if (!sprint) {
              vscode.window.showWarningMessage(
                "No active sprint found. Cannot prepare code review fixes.",
              );
              return;
            }

            const task = getTaskById(orchestraRoot, element.task.id);
            if (!task) {
              vscode.window.showErrorMessage(
                `Task ${element.task.id} not found.`,
              );
              return;
            }

            const review = getLatestCodeReviewForTask(orchestraRoot, task.id);
            if (
              !review ||
              (review.status !== "CHANGES_REQUESTED" &&
                review.status !== "REJECTED")
            ) {
              vscode.window.showInformationMessage(
                "No CHANGES_REQUESTED or REJECTED review found for this task.",
              );
              return;
            }

            const phaseId =
              task.phase_id !== null && task.phase_id !== undefined
                ? String(task.phase_id)
                : undefined;

            const taskContext = {
              task_id: task.task_id,
              title: task.title,
              description: task.description,
              status: task.status,
              ...(task.category !== null && task.category !== undefined
                ? { category: task.category }
                : {}),
              ...(phaseId !== undefined ? { phase_id: phaseId } : {}),
            };

            const promptBuilder = new PromptBuilder({
              workspaceRoot: orchestraRoot,
            });
            const prompt = promptBuilder.buildCodeReviewFixPreparePrompt(
              {
                task: taskContext,
                sprint: {
                  sprint_id: sprint.id,
                  title: sprint.name,
                  status: sprint.status,
                },
              },
              {
                status: review.status,
                summary: review.summary,
                reviewId: review.review_id,
              },
            );

            const sm = getSessionManager();
            await sm.invokeOrchestrator(prompt, []);
          } catch (error) {
            logger.error("Failed to prepare code review fixes", error);
            vscode.window.showErrorMessage(
              `Failed to prepare code review fixes: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.implementCodeReviewFixTask",
        async (element: { type: string; task?: { id: number } }) => {
          try {
            if (!element?.task?.id) {
              vscode.window.showErrorMessage("No task specified.");
              return;
            }

            const sprint = getCurrentSprint(orchestraRoot);
            if (!sprint) {
              vscode.window.showWarningMessage(
                "No active sprint found. Cannot implement code review fixes.",
              );
              return;
            }

            const task = getTaskById(orchestraRoot, element.task.id);
            if (!task) {
              vscode.window.showErrorMessage(
                `Task ${element.task.id} not found.`,
              );
              return;
            }

            const review = getLatestCodeReviewForTask(orchestraRoot, task.id);
            if (
              !review ||
              (review.status !== "CHANGES_REQUESTED" &&
                review.status !== "REJECTED")
            ) {
              vscode.window.showInformationMessage(
                "No CHANGES_REQUESTED or REJECTED review found for this task.",
              );
              return;
            }

            const handover = getHandover(orchestraRoot, task.id);
            if (!handover) {
              vscode.window.showWarningMessage(
                "No handover found for this task. Prepare fixes before implementing.",
              );
              return;
            }

            const phaseId =
              task.phase_id !== null && task.phase_id !== undefined
                ? String(task.phase_id)
                : undefined;

            const taskContext = {
              task_id: task.task_id,
              title: task.title,
              description: task.description,
              status: task.status,
              ...(task.category !== null && task.category !== undefined
                ? { category: task.category }
                : {}),
              ...(phaseId !== undefined ? { phase_id: phaseId } : {}),
            };

            const promptBuilder = new PromptBuilder({
              workspaceRoot: orchestraRoot,
            });
            const prompt = promptBuilder.buildCodeReviewFixImplementPrompt(
              {
                task: taskContext,
                sprint: {
                  sprint_id: sprint.id,
                  title: sprint.name,
                  status: sprint.status,
                },
              },
              {
                status: review.status,
                summary: review.summary,
                reviewId: review.review_id,
              },
            );

            const sm = getSessionManager();
            await sm.invokeImplementor(prompt, []);
          } catch (error) {
            logger.error("Failed to implement code review fixes", error);
            vscode.window.showErrorMessage(
              `Failed to implement code review fixes: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.runCodeReview",
        async (
          element:
            | number
            | {
                type: string;
                task?: {
                  id: number;
                  task_id: number;
                  title: string;
                  status: string;
                };
              },
        ) => {
          try {
            // Handle TreeElement from SprintTreeProvider or direct taskId
            let taskId: number;
            if (typeof element === "number") {
              taskId = element;
            } else if (element?.type === "task" && element?.task?.id) {
              taskId = element.task.id;
            } else {
              vscode.window.showErrorMessage(
                "No task specified for code review.",
              );
              return;
            }

            const db = OrchestraDB.getInstance(orchestraRoot);
            const sprint = getCurrentSprint(orchestraRoot);
            if (!sprint) {
              vscode.window.showWarningMessage(
                "No active sprint found. Cannot trigger code review.",
              );
              return;
            }

            const task = getTaskById(orchestraRoot, taskId);
            if (!task) {
              vscode.window.showErrorMessage(`Task ${taskId} not found.`);
              return;
            }

            if (task.status !== "COMPLETE") {
              vscode.window.showWarningMessage(
                `Task ${taskId} is not complete. Code reviews can only be triggered for completed tasks.`,
              );
              return;
            }

            // Create a new review unless one is already pending/in review
            const latestReview = getLatestCodeReviewForTask(
              orchestraRoot,
              task.id,
            );
            const hasActiveReview =
              latestReview?.status === "PENDING" ||
              latestReview?.status === "IN_REVIEW";

            if (!hasActiveReview) {
              const now = new Date().toISOString();
              db.prepare(
                `INSERT INTO code_reviews (sprint_id, task_id, phase_id, review_scope, status, summary, risk, requested_by, requested_at)
                 VALUES (?, ?, ?, 'TASK', 'PENDING', ?, 'LOW', 'orchestrator', ?)`,
              ).run(
                sprint.id,
                task.id,
                task.phase_id,
                `Manual review for task ${task.task_id}: ${task.title}`,
                now,
              );
            }

            vscode.window.showInformationMessage(
              `Launching Controller agent to review task ${task.task_id}: ${task.title}`,
            );

            // Refresh the code review tree
            codeReviewTreeProvider?.refresh();

            // Build prompt and invoke Controller agent
            const promptBuilder = new PromptBuilder({
              workspaceRoot: orchestraRoot,
            });
            const prompt = promptBuilder.buildCodeReviewPrompt(
              1,
              sprint.id,
              sprint.name,
              { taskId: task.task_id, title: task.title, dbId: task.id },
            );

            const sm = getSessionManager();
            await sm.invokeController(prompt, []);
          } catch (error) {
            logger.error("Failed to trigger code review", error);
            vscode.window.showErrorMessage(
              `Failed to trigger code review: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      ),
      // Agent execution commands
      vscode.commands.registerCommand("orchestra.startAgent", async () => {
        try {
          if (agentRunner?.getSession()?.status === "running") {
            vscode.window.showErrorMessage(
              "Orchestra: Agent is already running. Stop or pause the current agent first.",
            );
            return;
          }

          // Prompt for role
          const role = await vscode.window.showQuickPick(
            [
              { label: "Orchestrator", value: "orchestrator" },
              { label: "Implementor", value: "implementor" },
              { label: "Controller", value: "controller" },
            ],
            { placeHolder: "Select agent role" },
          );

          if (!role) {
            return; // User cancelled
          }

          // Prompt for initial prompt
          const prompt = await vscode.window.showInputBox({
            prompt: "Enter initial instruction for the agent",
            placeHolder: "e.g., Prepare task 5 or Implement task 3",
          });

          if (!prompt) {
            return; // User cancelled
          }

          const runner = getAgentRunner();

          agentOutputPanel = AgentOutputPanel.createOrShow(
            context.extensionUri,
          );
          agentOutputPanel.clear();
          agentOutputPanel.updateStatus("Starting");
          agentOutputPanel.bindToRunner(runner);

          agentStateSubscription?.dispose();
          agentStateSubscription = runner.onStateChange((state) => {
            agentOutputPanel?.updateStatus(state.status);
          });
          context.subscriptions.push(agentStateSubscription);

          // Start the agent
          await runner.start(
            role.value as "orchestrator" | "implementor" | "controller",
            {
              prompt,
            },
          );

          vscode.window.showInformationMessage(
            `Orchestra: ${role.label} agent started successfully`,
          );
          logger.info(`Agent started: ${role.value}`);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Orchestra: Failed to start agent - ${message}`,
          );
          logger.error("Failed to start agent", error);
        }
      }),
      vscode.commands.registerCommand("orchestra.pauseAgent", async () => {
        try {
          if (!agentRunner) {
            vscode.window.showErrorMessage(
              "Orchestra: No agent is currently running",
            );
            return;
          }

          await agentRunner.pause();
          vscode.window.showInformationMessage(
            "Orchestra: Agent paused successfully",
          );
          logger.info("Agent paused");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Orchestra: Failed to pause agent - ${message}`,
          );
          logger.error("Failed to pause agent", error);
        }
      }),
      vscode.commands.registerCommand("orchestra.stopAgent", async () => {
        try {
          if (!agentRunner) {
            vscode.window.showErrorMessage(
              "Orchestra: No agent is currently running",
            );
            return;
          }

          await agentRunner.stop();
          agentRunner.dispose();
          agentRunner = undefined;
          agentStateSubscription?.dispose();
          agentStateSubscription = undefined;
          agentOutputPanel?.unbindRunner();
          agentOutputPanel?.updateStatus("Stopped");

          vscode.window.showInformationMessage(
            "Orchestra: Agent stopped successfully",
          );
          logger.info("Agent stopped");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Orchestra: Failed to stop agent - ${message}`,
          );
          logger.error("Failed to stop agent", error);
        }
      }),
      vscode.commands.registerCommand("orchestra.resumeAgent", async () => {
        try {
          await handleResumeAgent(orchestraRoot);
          logger.info("Agent resume requested");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Orchestra: Failed to resume agent - ${message}`,
          );
          logger.error("Failed to resume agent", error);
        }
      }),
      vscode.commands.registerCommand(
        "orchestra.launchControllerAgent",
        async () => {
          const sprint = getCurrentSprint(orchestraRoot);
          if (!sprint) {
            vscode.window.showErrorMessage(
              "Orchestra: No active sprint found for review.",
            );
            return;
          }

          await handleReviewSprint(orchestraRoot, sprint);
        },
      ),
      vscode.commands.registerCommand(
        "orchestra.launchControllerForSprint",
        async (element: any) => {
          // Element from tree view has: { type: 'sprint', sprint: Sprint }
          if (element?.sprint) {
            await handleReviewSprint(orchestraRoot, element.sprint);
          }
        },
      ),
    );
    logger.info("Commands registered");

    // 9. Start MCP servers (if enabled)
    const config = vscode.workspace.getConfiguration("orchestra");
    const autoStartMCP = config.get<boolean>("autoStartMCP", true);

    if (autoStartMCP) {
      mcpManager = new MCPServerManager(
        orchestraRoot,
        context.extensionPath,
        logger,
      );
      mcpManager.startServer("orchestrator");
      mcpManager.startServer("implementor");
      context.subscriptions.push({
        dispose: () => {
          mcpManager?.stopAllServers();
        },
      });
      logger.info("MCP servers started");
    }

    // Start WorkflowChain for automatic agent transitions
    workflowChain = getWorkflowChain(orchestraRoot);
    workflowChain.start();
    context.subscriptions.push(workflowChain);
    logger.info("WorkflowChain started - automatic agent transitions enabled");

    logger.info("Orchestra extension activated successfully");
    vscode.window.showInformationMessage("Orchestra: Extension activated");
  } catch (error) {
    logger.error("Failed to activate extension", error);
    vscode.window.showErrorMessage(
      `Orchestra: Activation failed - ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Extension deactivation
 * Cleanup resources
 */
export async function deactivate(): Promise<void> {
  logger?.info("Orchestra extension deactivating...");

  // ConfigService has no disposal required - it only provides access to workspace config
  // Any onConfigChange listeners created by consumers are their responsibility to dispose

  // Clean up agent runner
  if (agentRunner) {
    agentRunner.dispose();
    agentRunner = undefined;
  }

  await ProcessManager.getInstance().dispose();

  agentStateSubscription?.dispose();
  agentStateSubscription = undefined;
  agentOutputPanel?.unbindRunner();

  // Clean up EventBus singleton
  disposeAgentEventBus();

  // Clean up WorkflowChain
  disposeWorkflowChain();
  workflowChain = undefined;

  // Database watcher disposed via subscriptions
  dbWatcher = undefined;

  // MCP servers disposed via subscriptions
  mcpManager = undefined;

  // Close database connection
  OrchestraDB.close();

  logger?.info("Orchestra extension deactivated");
}
