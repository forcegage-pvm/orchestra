/**
 * AgentRunner - Core agent execution loop with vscode.lm integration
 *
 * Executes autonomous agent loops using VS Code's Language Model API:
 * - Model selection and streaming response handling
 * - Tool call parsing and execution via ToolRegistry
 * - Iteration tracking and limit enforcement
 * - Pause/resume/stop lifecycle management
 * - Event emission for UI integration
 *
 * @module agents/AgentRunner
 */

import type { LanguageModelChatMessage, LanguageModelChatTool } from "vscode";
import * as vscode from "vscode";
import { isModelSelectionRequired } from "../commands/selectModel.js";
import type { ConfigService } from "../config/ConfigService.js";
import { createEscalation } from "../database/mutations.js";
import { AgentSession } from "./AgentSession.js";
import { ContextManager } from "./ContextManager.js";
import { AgentError, SessionError } from "./errors.js";
import { SprintMemory } from "./memory/SprintMemory.js";
import {
  generateTaskSummary,
  type TaskSummaryInput,
} from "./memory/TaskSummary.js";
import type { TaskOutcome } from "./memory/types.js";
import { SessionEventEmitter } from "./sessions/eventEmitter.js";
import { createSession } from "./sessions/sessionRepository.js";
import type {
  AgentSessionInfo,
  SessionStatus,
  ToolCategory,
} from "./sessions/types.js";
import {
  loadControllerTools,
  loadImplementorTools,
  loadOrchestratorTools,
} from "./toolLoaders.js";
import { ToolRegistry } from "./ToolRegistry.js";
import type {
  FileOperationEvent,
  ToolInvocationContext,
} from "./tools/types.js";
import type { AgentConfig, AgentMessage, AgentRole } from "./types.js";

/**
 * Output types emitted during agent execution
 */
export type AgentOutputType =
  | "prompt"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "tool_progress"
  | "tool_output"
  | "tool_file_operation"
  | "tool_metadata"
  | "error"
  | "status";

/**
 * File operation types for display
 */
export type FileOperationType =
  | "create"
  | "update"
  | "delete"
  | "move"
  | "copy"
  | "read";

/**
 * File operation event for display
 */
export interface FileOperationInfo {
  operation: FileOperationType;
  path: string;
  targetPath?: string;
  size?: number;
  linesChanged?: number;
}

export interface AgentOutput {
  type: AgentOutputType;
  timestamp: string;
  iteration: number;
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolCallId?: string;
  toolResult?: string;
  toolSuccess?: boolean;
  toolDuration?: number;
  /** Progress percentage (0-100) for tool_progress events */
  progressPercent?: number;
  /** Streaming output chunk for tool_output events */
  streamChunk?: string;
  /** File operation info for tool_file_operation events */
  fileOperation?: FileOperationInfo;
  /** Structured metadata emitted during tool execution */
  metadata?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  recoverable?: boolean;
  previousStatus?: string;
  newStatus?: string;
  /** Attached context files (for prompt type) */
  attachments?: Array<{ name: string; path: string }>;
}

/**
 * Agent state for UI updates
 */
export interface AgentState {
  sessionId: string;
  role: AgentRole;
  status: string;
  iteration: number;
  maxIterations: number;
  taskId?: number;
  startedAt: string;
  lastActivityAt: string;
}

/**
 * File attachment for agent context
 */
export interface FileAttachment {
  /** Absolute path to the file */
  path: string;
  /** Optional display name (defaults to filename) */
  name?: string;
  /** Optional MIME type (defaults to text/plain) */
  mimeType?: string;
}

/**
 * Options for starting an agent
 */
export interface AgentStartOptions {
  prompt: string;
  taskId?: number;
  /** Sprint-scoped sequential task number (1, 2, 3...) for display purposes */
  taskNumber?: number;
  sprintId?: string;
  resumeSessionId?: string;
  maxIterations?: number;
  model?: string;
  /** Optional file attachments to include with the initial prompt */
  attachments?: FileAttachment[];
  /**
   * Optional system prompt injected as the first user message.
   * Since VS Code Language Model API doesn't support system messages,
   * this content is prepended as the first user message to provide
   * role-specific instructions to the agent.
   */
  systemPrompt?: string;
}

/**
 * AgentRunner - Executes autonomous agent loops
 *
 * Implements the core agent loop pattern:
 * 1. Initialize: Create session, select model, set up tools
 * 2. Loop:
 *    a. Check iteration limit and pause/stop flags
 *    b. Build message history (with context compaction if needed)
 *    c. Send request to LLM with tools
 *    d. Stream response, emit output events
 *    e. If tool call requested: execute via ToolRegistry, add result to history
 *    f. If no tool call: check for completion signal
 *    g. Increment iteration
 * 3. Complete: Set session status to completed/failed
 *
 * **Lifecycle States:**
 * - running: Agent is actively executing
 * - paused: Agent paused mid-execution, can resume
 * - stopped: Agent stopped, state preserved for resume
 * - completed: Agent finished successfully
 * - failed: Agent encountered error
 *
 * **Event Emissions:**
 * - onOutput: Thinking text, tool calls, tool results, errors, status changes
 * - onStateChange: Session state updates for UI
 */
export class AgentRunner implements vscode.Disposable {
  // Session and state
  private session: AgentSession | undefined;
  private toolRegistry: ToolRegistry;
  private contextManager: ContextManager;
  private config: AgentConfig;
  private configService?: ConfigService;
  private lastLoadedToolsRole: AgentRole | undefined;

  // Execution control
  private isPaused = false;
  private isStopped = false;
  private cancellationTokenSource: vscode.CancellationTokenSource | undefined;
  private runningPromise: Promise<void> | undefined;

  // Error tracking
  private consecutiveErrors = 0;
  private recentErrors: string[] = [];
  private hasEscalated = false;
  private hasEmittedSessionEnd = false;

  // Event emitters
  private _onOutput = new vscode.EventEmitter<AgentOutput>();
  private _onStateChange = new vscode.EventEmitter<AgentState>();
  private eventEmitter?: SessionEventEmitter;

  // Public event subscriptions
  readonly onOutput = this._onOutput.event;
  readonly onStateChange = this._onStateChange.event;

  /**
   * Map tool name to tool category for event emission
   */
  private getToolCategory(toolName: string): ToolCategory {
    // Orchestra MCP tools
    if (
      toolName.startsWith("mcp_") ||
      toolName.startsWith("get_current_task") ||
      toolName.startsWith("signal_completion") ||
      toolName.startsWith("get_feedback") ||
      toolName.startsWith("get_progress") ||
      toolName.startsWith("escalate_task")
    ) {
      return "orchestra";
    }

    // Coding tools (file read/write/edit)
    const codingTools = [
      "read_file",
      "edit_file",
      "edit_lines",
      "create_file",
      "create_directory",
      "delete_file",
      "insert_at_line",
      "delete_section",
      "smart_replace",
      "bulk_replace",
      "validate_edit",
      "search_files",
      "grep_search",
      "list_directory",
      "find_usages",
    ];
    if (codingTools.includes(toolName)) {
      return "coding";
    }

    // Filesystem tools (copy/move operations)
    const filesystemTools = ["copy_file", "move_file", "move_directory"];
    if (filesystemTools.includes(toolName)) {
      return "filesystem";
    }

    // System tools (terminal, processes, tests)
    const systemTools = [
      "run_terminal",
      "run_command",
      "run_task",
      "run_tests",
      "get_test_failures",
      "get_problems",
      "start_process",
      "stop_process",
      "get_process_output",
      "list_processes",
      "send_input",
      "wait_for_pattern",
      "find_port_process",
      "get_terminal_output",
      "execute_with_retry",
    ];
    if (systemTools.includes(toolName)) {
      return "system";
    }

    // Default to coding for unknown tools
    return "coding";
  }

  /**
   * Detect chunk type using both instanceof and property-based detection.
   * Property-based detection is needed as a fallback because class minification
   * in production VS Code builds can break instanceof checks.
   *
   * @param chunk - The chunk object from the LLM response stream
   * @param chunkAny - The chunk cast as Record<string, unknown> for property access
   * @returns The detected chunk type: "TEXT", "TOOL_CALL", "DATA", or "UNKNOWN"
   */
  private detectChunkType(
    chunk: unknown,
    chunkAny: Record<string, unknown>,
  ): "TEXT" | "TOOL_CALL" | "DATA" | "UNKNOWN" {
    // First try instanceof checks (most reliable when they work)
    if (chunk instanceof vscode.LanguageModelTextPart) {
      return "TEXT";
    }
    if (chunk instanceof vscode.LanguageModelToolCallPart) {
      return "TOOL_CALL";
    }
    if (chunk instanceof vscode.LanguageModelDataPart) {
      return "DATA";
    }

    // Fallback to property-based detection for minified classes
    // LanguageModelTextPart has: value (string)
    // Also matches chunks with keys=[value,id,metadata] seen in logs
    if (
      "value" in chunkAny &&
      typeof chunkAny.value === "string" &&
      !("name" in chunkAny && "callId" in chunkAny)
    ) {
      return "TEXT";
    }

    // LanguageModelToolCallPart has: name, input, callId
    if (
      "name" in chunkAny &&
      "callId" in chunkAny &&
      "input" in chunkAny &&
      typeof chunkAny.name === "string" &&
      typeof chunkAny.callId === "string"
    ) {
      return "TOOL_CALL";
    }

    // LanguageModelDataPart has: mimeType, data (and sometimes audience)
    // Matches chunks with keys=[mimeType,data,audience] seen in logs
    if (
      "mimeType" in chunkAny &&
      "data" in chunkAny &&
      typeof chunkAny.mimeType === "string"
    ) {
      return "DATA";
    }

    return "UNKNOWN";
  }

  /**
   * Extract text content from a LanguageModelDataPart-like chunk.
   * Handles text/* and application/json mimeTypes by decoding the data.
   *
   * @param chunkAny - The chunk as Record<string, unknown>
   * @returns The extracted text content, or undefined if not extractable
   */
  private extractDataPartContent(
    chunkAny: Record<string, unknown>,
  ): string | undefined {
    const mimeType = chunkAny.mimeType as string;
    const data = chunkAny.data;

    // Handle text-based mimeTypes
    if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType.includes("json")
    ) {
      try {
        // Data could be Uint8Array, ArrayBuffer, or already a string
        if (data instanceof Uint8Array) {
          const decoder = new TextDecoder();
          return decoder.decode(data);
        }
        if (data instanceof ArrayBuffer) {
          const decoder = new TextDecoder();
          return decoder.decode(new Uint8Array(data));
        }
        if (typeof data === "string") {
          return data;
        }
        // If it's an object, try to stringify it
        if (typeof data === "object" && data !== null) {
          return JSON.stringify(data);
        }
      } catch (error) {
        console.error(
          `[AgentRunner] Failed to extract DATA part content: ${error}`,
        );
      }
    }

    // For binary mimeTypes like image/*, we can't extract text
    // Log for debugging but don't extract
    console.log(
      `[AgentRunner] DATA part with mimeType=${mimeType} not extractable as text`,
    );
    return undefined;
  }

  /**
   * Create a new AgentRunner
   *
   * @param toolRegistry - Tool registry for executing tool calls
   * @param config - Agent configuration (models, iterations, verbosity)
   */
  constructor(
    toolRegistry: ToolRegistry,
    config?: Partial<AgentConfig>,
    configService?: ConfigService,
  ) {
    this.toolRegistry = toolRegistry;
    if (configService !== undefined) {
      this.configService = configService;
    }

    // Build context manager config with proper optional handling
    const contextConfig: {
      maxContextTokens?: number;
      compactionThreshold?: number;
      summarizeAfterToolCalls?: number;
    } = {};
    if (config?.maxContextTokens !== undefined)
      contextConfig.maxContextTokens = config.maxContextTokens;
    if (config?.compactionThreshold !== undefined)
      contextConfig.compactionThreshold = config.compactionThreshold;
    if (config?.summarizeAfterToolCalls !== undefined)
      contextConfig.summarizeAfterToolCalls = config.summarizeAfterToolCalls;

    this.contextManager = new ContextManager(contextConfig);

    // Apply defaults from AgentConfigSchema
    this.config = {
      orchestratorModel: config?.orchestratorModel ?? "claude-opus-4.5",
      implementorModel: config?.implementorModel ?? "claude-sonnet-4.5",
      controllerModel: config?.controllerModel ?? "claude-opus-4.5",
      maxIterations: config?.maxIterations ?? 50,
      maxToolRetries: config?.maxToolRetries ?? 3,
      verbosity: config?.verbosity ?? "normal",
      compactionThreshold: config?.compactionThreshold ?? 5,
      maxContextTokens: config?.maxContextTokens ?? 100000,
      summarizeAfterToolCalls: config?.summarizeAfterToolCalls ?? 20,
      skipToolLoading: config?.skipToolLoading ?? false,
    };
  }

  private getConfiguredModel(role: AgentRole): string {
    if (this.configService) {
      return this.configService.getModelForRole(role);
    }

    if (role === "orchestrator") {
      return this.config.orchestratorModel;
    }

    if (role === "implementor") {
      return this.config.implementorModel;
    }

    return this.config.controllerModel;
  }

  private applyConfiguredModel(role: AgentRole, model: string): void {
    if (role === "orchestrator") {
      this.config.orchestratorModel = model;
      return;
    }

    if (role === "implementor") {
      this.config.implementorModel = model;
      return;
    }

    this.config.controllerModel = model;
  }

  /**
   * Start a new agent session
   *
   * Creates a new session, selects appropriate model, and begins the agent loop.
   *
   * @param role - Agent role (orchestrator or implementor)
   * @param options - Start options with prompt, taskId, sprintId, etc.
   * @returns The created session
   * @throws AgentError if agent is already running
   */
  async start(
    role: AgentRole,
    options: AgentStartOptions,
  ): Promise<AgentSession> {
    // Check if there's an existing running session
    if (this.session && this.session.status === "running") {
      throw new AgentError(
        "Agent is already running. Stop or pause before starting a new session.",
        "AGENT_ALREADY_RUNNING",
      );
    }

    // Reset flags
    this.isPaused = false;
    this.isStopped = false;
    this.consecutiveErrors = 0;
    this.recentErrors = [];
    this.hasEscalated = false;
    this.hasEmittedSessionEnd = false;

    // Check if model selection is required (no model configured for this role)
    if (!options.model && isModelSelectionRequired(role)) {
      // Show model selection - returns true if user selected, false if cancelled
      const selected = await vscode.commands.executeCommand<boolean>(
        "orchestra.selectModel",
        role,
      );
      if (!selected) {
        throw new AgentError(
          "Model selection cancelled. Please select a model to continue.",
          "MODEL_SELECTION_CANCELLED",
        );
      }
    }

    // Refresh config after potential model selection
    const configuredModel = this.getConfiguredModel(role);
    this.applyConfiguredModel(role, configuredModel);

    // Create new session
    const sprintId = options.sprintId ?? "default-sprint";
    const maxIterations = options.maxIterations ?? this.config.maxIterations;
    this.session = new AgentSession(
      role,
      sprintId,
      options.taskId ?? null,
      maxIterations,
    );
    // Set taskNumber separately (sprint-scoped sequential number for display)
    this.session.taskNumber = options.taskNumber;

    // Create database session and event emitter for persistence
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    try {
      const dbSession = createSession(workspaceRoot, {
        role: this.session.role,
        taskId: options.taskId ?? 0,
        taskNumber: options.taskNumber,
        taskTitle: undefined,
        sprintId: this.session.sprintId,
        status: "initializing",
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        endedAt: undefined,
        statusMessage: undefined,
        iteration: 0,
        maxIterations: maxIterations,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
      });
      this.eventEmitter = new SessionEventEmitter(
        workspaceRoot,
        dbSession.sessionId,
      );
      const sessionInfo: AgentSessionInfo = {
        id: dbSession.sessionId,
        role: dbSession.role,
        status: dbSession.status,
        startedAt: dbSession.startedAt,
      };
      if (dbSession.taskId !== undefined) {
        sessionInfo.taskId = dbSession.taskId;
      }
      if (dbSession.taskNumber !== undefined) {
        sessionInfo.taskNumber = dbSession.taskNumber;
      }
      if (dbSession.taskTitle !== undefined) {
        sessionInfo.taskTitle = dbSession.taskTitle;
      }
      this.eventEmitter.emitSessionStart(sessionInfo);
    } catch (error) {
      // If database session creation fails, log but continue
      // This allows AgentRunner to work in test scenarios without database
      console.warn("Failed to create database session:", error);
      // eventEmitter remains undefined (already declared as optional property)
    }

    // Load role-specific tools unless skipToolLoading is set (for tests with custom tools)
    // This ensures:
    // 1. Role separation - each role gets only its permitted tools
    // 2. Test compatibility - tests can inject custom tools and skip auto-loading
    if (!this.config.skipToolLoading) {
      const needsToolReload = this.lastLoadedToolsRole !== role;

      if (needsToolReload) {
        this.toolRegistry.clear();
        this.lastLoadedToolsRole = role;
      }

      if (role === "implementor") {
        if (needsToolReload) {
          loadImplementorTools(this.toolRegistry);
        }
      } else if (role === "orchestrator") {
        if (needsToolReload) {
          loadOrchestratorTools(this.toolRegistry);
        }
      } else if (role === "controller") {
        if (needsToolReload) {
          loadControllerTools(this.toolRegistry);
        }
      }
    }

    // Orchestrator needs memory context regardless of tool loading
    if (role === "orchestrator") {
      const workspaceRoot =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      const memoryStore = SprintMemory.getInstance(workspaceRoot);
      const sprintName = options.sprintId ?? sprintId;
      const memory = await memoryStore.getOrCreate(sprintId, sprintName);
      const memoryContext = this.formatSprintMemoryContext(memory);
      this.addUserMessage(memoryContext);
    }

    // Create cancellation token
    this.cancellationTokenSource = new vscode.CancellationTokenSource();

    // Inject system prompt as first message if provided (hidden from UI)
    if (options.systemPrompt) {
      this.addSystemMessage(options.systemPrompt);
    }

    // Inject environment context so agent knows its operating environment
    const envContext = this.buildEnvironmentContext();
    this.addUserMessage(envContext);

    // Read and attach files if provided
    let attachmentParts: vscode.LanguageModelDataPart[] = [];
    if (options.attachments && options.attachments.length > 0) {
      attachmentParts = await this.readAttachments(options.attachments);
    }

    // Add initial user message with prompt and attachments
    if (attachmentParts.length > 0) {
      // Create message with both prompt text and file attachments
      const contentParts: Array<
        vscode.LanguageModelTextPart | vscode.LanguageModelDataPart
      > = [
        new vscode.LanguageModelTextPart(options.prompt),
        ...attachmentParts,
      ];
      this.addUserMessageWithParts(contentParts);
    } else {
      // No attachments - use simple text message
      this.addUserMessage(options.prompt);
    }

    // Emit prompt as first output so it's visible in the output panel
    this.emitOutput({
      type: "prompt",
      timestamp: new Date().toISOString(),
      iteration: 0,
      text: options.prompt,
      attachments: options.attachments?.map((a) => ({
        name: a.name ?? a.path.split(/[\\/]/).pop() ?? "attachment",
        path: a.path,
      })),
    });

    // Persist prompt event to database
    this.eventEmitter?.emitPrompt(
      options.prompt,
      options.attachments?.map((a) => ({
        path: a.path,
        name: a.name ?? a.path.split(/[\\/]/).pop() ?? "attachment",
        mimeType: a.mimeType,
      })),
    );

    // Emit state change
    this.emitStateChange();

    // Start agent loop in background (don't await)
    const modelOverride = options.model ?? configuredModel;
    this.runningPromise = this.runAgentLoop(role, modelOverride).catch(
      (error) => {
        this.handleError(error);
      },
    );

    return this.session;
  }

  /**
   * Pause the running agent
   *
   * Completes current step then pauses. Agent can be resumed later.
   *
   * @throws AgentError if agent is not running
   */
  async pause(): Promise<void> {
    if (!this.session || this.session.status !== "running") {
      throw new AgentError(
        "Cannot pause: agent is not running",
        "AGENT_NOT_RUNNING",
      );
    }

    const previousStatus = this.session.status;
    this.isPaused = true;
    this.session.pause();
    this.eventEmitter?.emitStatusChange(previousStatus, "paused");
    this.emitStateChange();

    // Wait for current step to complete
    if (this.runningPromise) {
      await this.runningPromise;
    }
  }

  /**
   * Resume a paused agent
   *
   * Continues execution from where it was paused.
   *
   * @throws AgentError if agent is not paused
   */
  async resume(): Promise<void> {
    if (!this.session || this.session.status !== "paused") {
      throw new AgentError(
        "Cannot resume: agent is not paused",
        "AGENT_NOT_PAUSED",
      );
    }

    const previousStatus = this.session.status;
    this.isPaused = false;
    this.session.resume();
    this.eventEmitter?.emitStatusChange(previousStatus, "running");
    this.emitStateChange();

    // Restart agent loop
    const role = this.session.role;
    this.runningPromise = this.runAgentLoop(role).catch((error) => {
      this.handleError(error);
    });
  }

  /**
   * Resume a session loaded from storage
   *
   * @deprecated File-based session storage is deprecated. Use database queries instead.
   * This method is kept for reference but will be removed in a future version.
   *
   * @param sessionId - Session ID to resume
   * @returns The resumed session
   */
  async resumeFromStorage(_sessionId: string): Promise<AgentSession> {
    throw new AgentError(
      "Resume from file storage is deprecated. Session resume functionality will be reimplemented using database queries.",
      "FEATURE_DEPRECATED",
    );

    /* DEPRECATED CODE - Kept for reference
    if (this.session && this.session.status === "running") {
      throw new AgentError(
        "Cannot resume: another agent session is already running",
        "AGENT_ALREADY_RUNNING",
      );
    }

    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const storage = SessionStorage.getInstance(workspaceRoot);
    const loaded = await storage.loadWithFallback(sessionId);

    if (loaded.status === "completed" || loaded.status === "failed") {
      throw new AgentError(
        `Cannot resume session with status: ${loaded.status}`,
        "SESSION_NOT_RECOVERABLE",
      );
    }

    this.session = loaded;
    this.isPaused = false;
    this.isStopped = false;
    this.consecutiveErrors = 0;
    this.recentErrors = [];
    this.hasEscalated = false;
    this.hasEmittedSessionEnd = false;

    if (this.session.status === "running") {
      this.session.stop();
    }

    if (this.session.role === "implementor") {
      loadImplementorTools(this.toolRegistry);
    }

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "system",
      content: `[SYSTEM: Session was interrupted and is now resuming. You are at iteration ${this.session.currentIteration} of ${this.session.maxIterations}.]`,
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
    };
    this.session.addMessage(message);

    this.session.resume();
    this.emitStateChange();

    this.cancellationTokenSource = new vscode.CancellationTokenSource();
    const role = this.session.role;
    this.runningPromise = this.runAgentLoop(role).catch((error) => {
      this.handleError(error);
    });

    return this.session;
    */
  }

  /**
   * Stop the agent
   *
   * Stops execution and preserves session state for later resume.
   *
   * @throws AgentError if agent is not running or paused
   */
  async stop(): Promise<void> {
    if (
      !this.session ||
      (this.session.status !== "running" && this.session.status !== "paused")
    ) {
      throw new AgentError(
        "Cannot stop: agent is not running or paused",
        "AGENT_NOT_RUNNING",
      );
    }

    const previousStatus = this.session.status;
    this.isStopped = true;
    this.session.stop();
    this.eventEmitter?.emitStatusChange(previousStatus, "stopped");
    this.emitSessionEndOnce("cancelled");

    // Cancel any ongoing requests
    if (this.cancellationTokenSource) {
      this.cancellationTokenSource.cancel();
    }

    this.emitStateChange();

    // Wait for current step to complete
    if (this.runningPromise) {
      await this.runningPromise;
    }
  }

  /**
   * Inject a new instruction into the running agent
   *
   * Adds a user message to the conversation and continues execution.
   *
   * @param instruction - New instruction to inject
   * @throws AgentError if agent is not running
   */
  async redirect(instruction: string): Promise<void> {
    if (!this.session || this.session.status !== "running") {
      throw new AgentError(
        "Cannot redirect: agent is not running",
        "AGENT_NOT_RUNNING",
      );
    }

    // Add user message to conversation history for next LLM iteration
    this.addUserMessage(instruction);

    // Emit prompt event so it's visible in the output panel (same as initial prompt)
    this.emitOutput({
      type: "prompt",
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
      text: instruction,
    });

    // Persist prompt event to database for history
    this.eventEmitter?.emitPrompt(instruction);
  }

  /**
   * Continue a stopped/completed/paused session with a new message
   *
   * This is used when the user sends a message to an agent that has stopped running.
   * It resumes the agent loop with the new instruction.
   *
   * @param instruction - New instruction to continue with
   * @throws AgentError if no session exists or session has failed
   */
  async continueWithMessage(instruction: string): Promise<void> {
    if (!this.session) {
      throw new AgentError("Cannot continue: no session exists", "NO_SESSION");
    }

    if (this.session.status === "failed") {
      throw new AgentError(
        "Cannot continue: session has failed. Start a new session.",
        "SESSION_FAILED",
      );
    }

    if (this.session.status === "running") {
      // Session is still running, use redirect instead
      await this.redirect(instruction);
      return;
    }

    const previousStatus = this.session.status;

    // Reset session state for continuation
    this.isPaused = false;
    this.isStopped = false;
    this.session.resume();

    // Add user message to conversation history
    this.addUserMessage(instruction);

    // Emit prompt event so it's visible in the output panel
    this.emitOutput({
      type: "prompt",
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
      text: instruction,
    });

    // Persist prompt event to database for history
    this.eventEmitter?.emitPrompt(instruction);

    // Emit status change to running
    this.eventEmitter?.emitStatusChange(previousStatus, "running");
    this.emitStateChange();

    // Restart agent loop
    const role = this.session.role;
    this.runningPromise = this.runAgentLoop(role).catch((error) => {
      this.handleError(error);
    });
  }

  /**
   * Get current session
   *
   * @returns Current session or undefined
   */
  getSession(): AgentSession | undefined {
    return this.session;
  }

  /**
   * Get current state for UI
   *
   * @returns Current state or undefined
   */
  getState(): AgentState | undefined {
    if (!this.session) {
      return undefined;
    }

    const state: AgentState = {
      sessionId: this.session.id,
      role: this.session.role,
      status: this.session.status,
      iteration: this.session.currentIteration,
      maxIterations: this.session.maxIterations,
      startedAt: this.session.createdAt,
      lastActivityAt: this.session.lastActivityAt,
    };

    if (this.session.taskId !== null) {
      state.taskId = this.session.taskId;
    }

    return state;
  }

  /**
   * Dispose resources
   *
   * Cleans up event emitters and cancellation tokens.
   */
  dispose(): void {
    this._onOutput.dispose();
    this._onStateChange.dispose();
    if (this.cancellationTokenSource) {
      this.cancellationTokenSource.dispose();
    }
  }

  /**
   * Core agent loop - the heart of the autonomous agent execution
   *
   * @param role - Agent role
   * @param modelOverride - Optional model override
   */
  private async runAgentLoop(
    role: AgentRole,
    modelOverride?: string,
  ): Promise<void> {
    console.log("[AgentRunner] runAgentLoop starting", {
      role,
      modelOverride,
    });
    if (!this.session) {
      console.log("[AgentRunner] No session!");
      throw new SessionError(
        "No session available for agent loop",
        "no-session",
      );
    }

    try {
      // Select language model
      console.log("[AgentRunner] Selecting model...");
      const model = await this.selectModel(role, modelOverride);
      console.log("[AgentRunner] Model selected:", model?.id);

      // Get tools
      const tools = this.toolRegistry.getToolDefinitions();
      console.log("[AgentRunner] Tools loaded:", tools.length);

      // Emit status change to running
      this.eventEmitter?.emitStatusChange("initializing", "running");

      // Main agent loop
      console.error(
        "[AgentRunner] Starting loop. maxIterations:",
        this.session.maxIterations,
        "isPaused:",
        this.isPaused,
        "isStopped:",
        this.isStopped,
      );
      while (
        this.session.currentIteration < this.session.maxIterations &&
        !this.isPaused &&
        !this.isStopped
      ) {
        // Increment iteration
        this.session.incrementIteration();
        this.eventEmitter?.setIteration(this.session.currentIteration);
        console.error(
          "[AgentRunner] Loop iteration:",
          this.session.currentIteration,
        );

        // Compact context if needed
        const compactedMessages = this.contextManager.isWithinLimit(
          this.session.messages,
        )
          ? this.session.messages
          : this.contextManager.compact(this.session.messages);
        console.error(
          "[AgentRunner] Messages to send:",
          compactedMessages.length,
        );

        // Convert to vscode.lm format
        const chatMessages = this.convertToLMMessages(compactedMessages);
        console.log("[AgentRunner] Sending request to LLM...");

        // Send request to LLM
        const hadToolCalls = await this.sendRequest(
          model,
          chatMessages,
          tools,
          this.cancellationTokenSource!.token,
        );

        // Check if paused or stopped after request
        if (this.isPaused || this.isStopped) {
          break;
        }

        // If no tool calls, we're done
        if (!hadToolCalls) {
          const previousStatus = this.session.status;
          this.session.complete();
          this.eventEmitter?.emitStatusChange(previousStatus, "completed");
          this.emitSessionEndOnce("completed");
          this.emitStateChange();
          break;
        }
      }

      // Check if we hit max iterations
      if (
        this.session.currentIteration >= this.session.maxIterations &&
        this.session.status === "running"
      ) {
        const previousStatus = this.session.status;
        this.session.fail(
          `Maximum iterations (${this.session.maxIterations}) reached`,
        );
        this.eventEmitter?.emitStatusChange(
          previousStatus,
          "failed",
          `Maximum iterations (${this.session.maxIterations}) reached`,
        );
        this.emitSessionEndOnce("failed");
        this.emitOutput({
          type: "error",
          timestamp: new Date().toISOString(),
          iteration: this.session.currentIteration,
          errorCode: "MAX_ITERATIONS",
          errorMessage: `Agent stopped after ${this.session.maxIterations} iterations`,
          recoverable: false,
        });
        const escalationDetails = this.buildEscalationDetails("max_iterations");
        await this.triggerAutoEscalation(
          escalationDetails.reason,
          escalationDetails.attemptsSummary,
        );
        this.emitStateChange();
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Select appropriate language model
   *
   * @param role - Agent role
   * @param modelOverride - Optional model override
   * @returns Selected model
   */
  private async selectModel(
    role: AgentRole,
    modelOverride?: string,
  ): Promise<vscode.LanguageModelChat> {
    console.log("[AgentRunner] selectModel", { role, modelOverride });
    // Determine target model name
    const targetModel =
      modelOverride ??
      (role === "orchestrator"
        ? this.config.orchestratorModel
        : role === "implementor"
          ? this.config.implementorModel
          : this.config.controllerModel);

    console.log("[AgentRunner] targetModel:", targetModel);

    // Get all available models first
    const allModels = await vscode.lm.selectChatModels();
    console.error(
      "[AgentRunner] Available models:",
      allModels.length,
      allModels.map((m) => `${m.family}:${m.id}`).slice(0, 10),
    );

    if (allModels.length === 0) {
      throw new AgentError(
        "No language models available. Please ensure you have Copilot or another LM provider enabled.",
        "NO_MODEL_AVAILABLE",
      );
    }

    // Try to find exact match by ID first
    const exactMatch = allModels.find((m) => m.id.includes(targetModel));
    if (exactMatch) {
      console.log("[AgentRunner] Found exact match:", exactMatch.id);
      return exactMatch;
    }

    // Try to find by family (claude, anthropic, etc.)
    const targetFamily = targetModel.startsWith("claude")
      ? "claude"
      : targetModel.startsWith("gpt")
        ? "gpt"
        : undefined;
    if (targetFamily) {
      // Try both the family name and "anthropic" for Claude models
      const familyVariants =
        targetFamily === "claude" ? ["claude", "anthropic"] : [targetFamily];
      for (const family of familyVariants) {
        const familyMatch = allModels.find(
          (m) =>
            m.family?.toLowerCase() === family ||
            m.id.toLowerCase().includes(family),
        );
        if (familyMatch) {
          console.log("[AgentRunner] Found family match:", familyMatch.id);
          return familyMatch;
        }
      }
    }

    // Fallback to first available model
    console.error(
      "[AgentRunner] No match found, using first available:",
      allModels[0]!.id,
    );
    return allModels[0]!;
  }

  /**
   * Read file attachments and create LanguageModelDataPart objects
   *
   * @param attachments - File attachments to read
   * @returns Array of LanguageModelDataPart objects
   */
  private async readAttachments(
    attachments: FileAttachment[],
  ): Promise<vscode.LanguageModelDataPart[]> {
    const parts: vscode.LanguageModelDataPart[] = [];

    for (const attachment of attachments) {
      try {
        const uri = vscode.Uri.file(attachment.path);
        const fileData = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(fileData).toString("utf8");
        const fileName =
          attachment.name ??
          attachment.path.split(/[\\/]/).pop() ??
          "attachment";
        const mimeType = attachment.mimeType ?? "text/plain";

        // Create a data part with the file content
        // Prefix with filename for context
        const contentWithHeader = `### File: ${fileName}\n\n${content}`;
        parts.push(
          vscode.LanguageModelDataPart.text(contentWithHeader, mimeType),
        );
      } catch (error) {
        // Log error but continue with other attachments
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `Failed to read attachment ${attachment.path}: ${message}`,
        );
      }
    }

    return parts;
  }

  /**
   * Convert AgentMessage[] to LanguageModelChatMessage[]
   *
   * VS Code LM API only supports User and Assistant roles.
   * System messages are converted to User messages and prepended to the conversation.
   *
   * @param messages - Agent messages to convert
   * @returns Array of language model chat messages
   */
  private convertToLMMessages(
    messages: AgentMessage[],
  ): LanguageModelChatMessage[] {
    // Separate system messages from user/assistant messages
    const systemMessages = messages.filter((msg) => msg.role === "system");
    const conversationMessages = messages.filter(
      (msg) => msg.role !== "system",
    );

    // Convert system messages to User messages (prepended to conversation)
    const systemLMMessages = systemMessages.map((msg) => {
      const content = typeof msg.content === "string" ? msg.content : "";
      return vscode.LanguageModelChatMessage.User(content);
    });

    // Convert conversation messages
    const conversationLMMessages = conversationMessages.map((msg) => {
      const role =
        msg.role === "user"
          ? vscode.LanguageModelChatMessageRole.User
          : vscode.LanguageModelChatMessageRole.Assistant;

      // Handle string content
      if (typeof msg.content === "string") {
        return role === vscode.LanguageModelChatMessageRole.User
          ? vscode.LanguageModelChatMessage.User(msg.content)
          : vscode.LanguageModelChatMessage.Assistant(msg.content);
      }

      // Handle array content (tool calls, tool results, etc.)
      const contentParts: Array<
        | vscode.LanguageModelTextPart
        | vscode.LanguageModelToolResultPart
        | vscode.LanguageModelToolCallPart
      > = [];
      const textValues: string[] = [];
      let hasToolResult = false;
      let hasToolCall = false;

      for (const part of msg.content) {
        if (part.type === "text") {
          textValues.push(part.value);
          contentParts.push(new vscode.LanguageModelTextPart(part.value));
        } else if (part.type === "toolCall") {
          hasToolCall = true;
          contentParts.push(
            new vscode.LanguageModelToolCallPart(
              part.toolCallId,
              part.name,
              part.input,
            ),
          );
        } else if (part.type === "toolResult") {
          hasToolResult = true;
          contentParts.push(
            new vscode.LanguageModelToolResultPart(part.toolCallId, [
              new vscode.LanguageModelTextPart(part.value),
            ]),
          );
        }
      }

      const textContent = textValues.join("\n");

      // Tool results are sent as User messages (required by API)
      if (hasToolResult) {
        return vscode.LanguageModelChatMessage.User(contentParts);
      }

      // Tool calls are sent as Assistant messages
      if (hasToolCall) {
        return vscode.LanguageModelChatMessage.Assistant(contentParts);
      }

      return role === vscode.LanguageModelChatMessageRole.User
        ? vscode.LanguageModelChatMessage.User(textContent)
        : vscode.LanguageModelChatMessage.Assistant(textContent);
    });

    // Return system messages first, then conversation messages
    return [...systemLMMessages, ...conversationLMMessages];
  }

  /**
   * Send request to language model and handle response
   *
   * @param model - Language model to use
   * @param messages - Chat messages
   * @param tools - Available tools
   * @param token - Cancellation token
   * @returns True if tool calls were made, false otherwise
   */
  private async sendRequest(
    model: vscode.LanguageModelChat,
    messages: LanguageModelChatMessage[],
    tools: LanguageModelChatTool[],
    token: vscode.CancellationToken,
  ): Promise<boolean> {
    if (!this.session) {
      console.log("[AgentRunner] sendRequest: No session");
      return false;
    }

    try {
      // Send request
      console.log("[AgentRunner] sendRequest: Calling model.sendRequest...");
      const request = await model.sendRequest(messages, { tools }, token);
      console.log("[AgentRunner] sendRequest: Got response, streaming...");

      let thinkingText = "";
      let hadToolCalls = false;
      const toolCalls: Array<{ name: string; input: unknown; callId: string }> =
        [];

      // Stream response - collect ALL chunks first before emitting events
      // This is necessary because LLMs may send tool calls BEFORE their reasoning text
      let unknownChunkLogged = false;
      for await (const chunk of request.stream) {
        // Detect chunk type using both instanceof and property-based detection
        // Property-based detection is needed as a fallback because minification
        // can break instanceof checks in production VS Code builds
        const chunkAny = chunk as Record<string, unknown>;
        const chunkType = this.detectChunkType(chunk, chunkAny);

        // Log UNKNOWN chunk details once to understand what they are
        if (chunkType === "UNKNOWN" && !unknownChunkLogged) {
          unknownChunkLogged = true;
          const chunkKeys = Object.keys(chunk as object);
          const chunkProto = Object.getPrototypeOf(chunk);
          const protoName = chunkProto?.constructor?.name || "no-proto";
          const hasValue = "value" in chunkAny;
          const hasText = "text" in chunkAny;
          const hasContent = "content" in chunkAny;
          const hasMimeType = "mimeType" in chunkAny;
          const hasData = "data" in chunkAny;
          console.error(
            `[AgentRunner] UNKNOWN chunk details: keys=[${chunkKeys.join(",")}], proto=${protoName}, hasValue=${hasValue}, hasText=${hasText}, hasContent=${hasContent}, hasMimeType=${hasMimeType}, hasData=${hasData}`,
          );
          if (hasValue) {
            console.error(
              `[AgentRunner] UNKNOWN chunk value type: ${typeof chunkAny.value}, preview: ${String(chunkAny.value).substring(0, 100)}`,
            );
          }
          if (hasMimeType) {
            console.error(
              `[AgentRunner] UNKNOWN chunk mimeType: ${chunkAny.mimeType}`,
            );
          }
        }

        // Check for pause/stop
        if (this.isPaused || this.isStopped) {
          break;
        }

        // Handle chunk based on detected type
        if (chunkType === "TEXT") {
          // Accumulate thinking text from LanguageModelTextPart
          const textValue =
            chunk instanceof vscode.LanguageModelTextPart
              ? chunk.value
              : (chunkAny.value as string);
          thinkingText += textValue;
        } else if (chunkType === "TOOL_CALL") {
          // Collect tool call - DON'T emit yet
          hadToolCalls = true;
          const toolCallChunk =
            chunk instanceof vscode.LanguageModelToolCallPart
              ? chunk
              : {
                  name: chunkAny.name as string,
                  input: chunkAny.input as object,
                  callId: chunkAny.callId as string,
                };
          toolCalls.push({
            name: toolCallChunk.name,
            input: toolCallChunk.input,
            callId: toolCallChunk.callId,
          });
        } else if (chunkType === "DATA") {
          // Handle LanguageModelDataPart - extract text content if applicable
          const extracted = this.extractDataPartContent(chunkAny);
          if (extracted) {
            thinkingText += extracted;
          }
        } else {
          // Truly unknown chunk - try to extract any text content as last resort
          if ("value" in chunkAny && typeof chunkAny.value === "string") {
            thinkingText += chunkAny.value;
          }
        }
      }

      // NOW emit events in correct order: thinking FIRST, then tool calls
      // This ensures proper sequencing regardless of stream order

      // Step 1: Emit thinking text (if any)
      if (thinkingText.trim()) {
        this.addAssistantMessage(thinkingText);

        // Path 1: Direct output event (for legacy listeners)
        this.emitOutput({
          type: "thinking",
          timestamp: new Date().toISOString(),
          iteration: this.session.currentIteration,
          text: thinkingText,
        });

        // Path 2: Through eventEmitter/database/eventBus (for Agent Panel)
        this.eventEmitter?.emitThinking(thinkingText);
      }

      // Step 2: Emit tool calls (if any)
      if (hadToolCalls) {
        for (const toolCall of toolCalls) {
          // Path 1: Direct output event (for legacy listeners)
          this.emitOutput({
            type: "tool_call",
            timestamp: new Date().toISOString(),
            iteration: this.session.currentIteration,
            toolName: toolCall.name,
            toolInput: toolCall.input as Record<string, unknown>,
            toolCallId: toolCall.callId,
          });

          // Path 2: Through eventEmitter/database/eventBus (for Agent Panel)
          this.eventEmitter?.emitToolCall(
            toolCall.callId,
            toolCall.name,
            this.getToolCategory(toolCall.name),
            toolCall.input as Record<string, unknown>,
          );
        }

        // Add assistant message with tool calls BEFORE executing them
        // This is required by the LLM API - tool results must follow tool calls
        this.addAssistantToolCallMessage(toolCalls);
        await this.executeToolCalls(toolCalls);
      }

      return hadToolCalls;
    } catch (error) {
      // Handle cancellation
      if (error instanceof Error && error.message.includes("cancel")) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Execute tool calls via ToolRegistry
   *
   * @param toolCalls - Array of tool calls to execute
   */
  private async executeToolCalls(
    toolCalls: Array<{ name: string; input: unknown; callId: string }>,
  ): Promise<void> {
    if (!this.session) {
      return;
    }

    // Create observer that emits real-time events
    const createObserver = (toolName: string, callId: string) => ({
      onProgress: (id: string, message: string, percent?: number) => {
        this.emitOutput({
          type: "tool_progress",
          timestamp: new Date().toISOString(),
          iteration: this.session!.currentIteration,
          toolName,
          toolCallId: id,
          text: message,
          progressPercent: percent,
        });
        this.eventEmitter?.emitToolProgress(callId, toolName, message, percent);
      },
      onOutput: (id: string, chunk: string, isStderr?: boolean) => {
        this.emitOutput({
          type: "tool_output",
          timestamp: new Date().toISOString(),
          iteration: this.session!.currentIteration,
          toolName,
          toolCallId: id,
          streamChunk: chunk,
        });
        this.eventEmitter?.emitToolOutput(callId, toolName, chunk, isStderr);
      },
      onFileOperation: (id: string, event: FileOperationEvent) => {
        this.emitOutput({
          type: "tool_file_operation",
          timestamp: new Date().toISOString(),
          iteration: this.session!.currentIteration,
          toolName,
          toolCallId: id,
          fileOperation: {
            operation: event.operation,
            path: event.path,
            targetPath: event.targetPath,
            size: event.size,
            linesChanged: event.linesChanged,
          },
        });
        this.eventEmitter?.emitToolFileOperation(callId, toolName, {
          operation: event.operation,
          path: event.path,
          targetPath: event.targetPath,
          size: event.size,
          linesChanged: event.linesChanged,
          linesInserted: event.linesInserted,
          linesDeleted: event.linesDeleted,
        });
      },
      onMetadata: (id: string, key: string, value: unknown) => {
        this.emitOutput({
          type: "tool_metadata",
          timestamp: new Date().toISOString(),
          iteration: this.session!.currentIteration,
          toolName,
          toolCallId: id,
          metadata: { [key]: value },
        });
        this.eventEmitter?.emitToolMetadata(callId, toolName, key, value);
      },
    });

    const baseContext: Omit<ToolInvocationContext, "observer"> = {
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
      sessionId: this.session.id,
      token:
        this.cancellationTokenSource?.token ?? vscode.CancellationToken.None,
    };

    for (const toolCall of toolCalls) {
      // Check for pause/stop
      if (this.isPaused || this.isStopped) {
        break;
      }

      const startTime = Date.now();

      // Create context with observer for this specific tool call
      const context: ToolInvocationContext = {
        ...baseContext,
        observer: createObserver(toolCall.name, toolCall.callId),
      };

      try {
        const result = await this.toolRegistry.execute(
          toolCall.name,
          toolCall.input,
          context,
          { retries: this.config.maxToolRetries },
        );

        const toolSuccess = result.result.success;
        const durationMs = result.result.metadata.durationMs;
        const contentText = result.result.content
          .map((part) => part.value)
          .join("\n");
        const errorMessage = result.result.error?.message;

        // Record tool call in session
        this.session.recordToolCall({
          id: toolCall.callId,
          name: toolCall.name,
          arguments: toolCall.input as Record<string, unknown>,
          result: result.result,
          status: toolSuccess ? "success" : "error",
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs,
          iteration: this.session.currentIteration,
          messageId: "", // Will be set when message is added
        });

        if (toolSuccess) {
          this.resetToolFailureTracking();
        } else {
          this.recordToolFailure(
            errorMessage ?? contentText ?? "Tool returned unsuccessful result",
          );
          if (await this.handleConsecutiveFailures()) {
            return;
          }
        }

        // Add tool result to message history
        // CRITICAL: If tool failed, include the error message so the LLM knows
        const resultMessage = toolSuccess
          ? contentText
          : errorMessage
            ? `Error: ${errorMessage}`
            : contentText || "Tool execution failed";
        this.addToolResultMessage(toolCall.callId, resultMessage);

        // Emit tool result
        this.emitOutput({
          type: "tool_result",
          timestamp: new Date().toISOString(),
          iteration: this.session.currentIteration,
          toolName: toolCall.name,
          toolInput: toolCall.input as Record<string, unknown>,
          toolCallId: toolCall.callId,
          toolResult: resultMessage,
          toolSuccess,
          toolDuration: durationMs,
        });
        this.eventEmitter?.emitToolResult(
          toolCall.callId,
          toolCall.name,
          toolSuccess,
          resultMessage,
          durationMs,
          toolSuccess
            ? undefined
            : {
                code: "TOOL_EXECUTION_FAILED",
                message: errorMessage ?? "Tool execution failed",
                suggestion: undefined,
                details: undefined,
              },
        );

        if (toolSuccess) {
          await this.handleTaskCompletion(toolCall.name, toolCall.input);
        }

        // Check for tool signal to pause or stop agent
        const toolSignal = result.result.signal;
        if (toolSignal === "pause") {
          const previousStatus = this.session.status;
          this.isPaused = true;
          this.session.pause();
          this.eventEmitter?.emitStatusChange(previousStatus, "paused");
          this.emitStateChange();
          // Exit tool execution loop - agent will wait for user input
          return;
        } else if (toolSignal === "stop") {
          const previousStatus = this.session.status;
          this.isStopped = true;
          this.session.stop();
          this.eventEmitter?.emitStatusChange(previousStatus, "stopped");
          this.emitSessionEndOnce("cancelled");
          this.emitStateChange();
          return;
        }
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Record failed tool call
        this.session.recordToolCall({
          id: toolCall.callId,
          name: toolCall.name,
          arguments: toolCall.input as Record<string, unknown>,
          status: "error",
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs,
          iteration: this.session.currentIteration,
          messageId: "",
          error: {
            code: "TOOL_EXECUTION_FAILED",
            message: errorMessage,
            recoverable: true,
          },
        });

        this.recordToolFailure(errorMessage);

        if (await this.handleConsecutiveFailures()) {
          return;
        }

        // Add error to message history
        this.addToolResultMessage(toolCall.callId, `Error: ${errorMessage}`);

        // Emit error
        this.emitOutput({
          type: "error",
          timestamp: new Date().toISOString(),
          iteration: this.session.currentIteration,
          toolName: toolCall.name,
          toolInput: toolCall.input as Record<string, unknown>,
          toolCallId: toolCall.callId,
          errorCode: "TOOL_EXECUTION_FAILED",
          errorMessage,
          recoverable: true,
        });
        this.eventEmitter?.emitToolResult(
          toolCall.callId,
          toolCall.name,
          false,
          `Error: ${errorMessage}`,
          durationMs,
          {
            code: "TOOL_EXECUTION_FAILED",
            message: errorMessage,
            suggestion: undefined,
            details: undefined,
          },
        );
        this.eventEmitter?.emitError(
          "error",
          "TOOL_EXECUTION_FAILED",
          errorMessage,
          true,
          { toolName: toolCall.name, toolCallId: toolCall.callId },
        );
      }
    }
  }

  private formatSprintMemoryContext(memory: {
    sprintId: string;
    sprintName: string;
    goals: string[];
    architectureDecisions: Array<{ title: string; decision: string }>;
    taskSummaries: Array<{ taskId: number; title: string; outcome: string }>;
    implementorPatterns: Array<{
      pattern: string;
      description: string;
      example?: string;
    }>;
    compactionCount: number;
    lastCompactedAt: string | null;
  }): string {
    const goals = memory.goals.length > 0 ? memory.goals.join("; ") : "None";
    const decisions =
      memory.architectureDecisions.length > 0
        ? memory.architectureDecisions
            .map((decision) => `${decision.title}: ${decision.decision}`)
            .join(" | ")
        : "None";
    const summaries =
      memory.taskSummaries.length > 0
        ? memory.taskSummaries
            .map(
              (summary) =>
                `#${summary.taskId} ${summary.title} (${summary.outcome})`,
            )
            .join(" | ")
        : "None";
    const patterns =
      memory.implementorPatterns.length > 0
        ? memory.implementorPatterns
            .map((pattern) => {
              const example = pattern.example
                ? ` (example: ${pattern.example})`
                : "";
              return `${pattern.pattern}: ${pattern.description}${example}`;
            })
            .join(" | ")
        : "None";

    return [
      "[SPRINT MEMORY CONTEXT]",
      `Sprint: ${memory.sprintName} (${memory.sprintId})`,
      `Goals: ${goals}`,
      `Architecture decisions: ${decisions}`,
      `Task summaries: ${summaries}`,
      `Implementor patterns: ${patterns}`,
      `Compaction count: ${memory.compactionCount}`,
      `Last compacted at: ${memory.lastCompactedAt ?? "Never"}`,
    ].join("\n");
  }

  /**
   * Build environment context for the agent.
   * Tells the agent about its operating environment (OS, shell, workspace).
   */
  private buildEnvironmentContext(): string {
    const platform = process.platform;
    const osName =
      platform === "win32"
        ? "Windows"
        : platform === "darwin"
          ? "macOS"
          : "Linux";
    const shell =
      platform === "win32"
        ? "cmd.exe (use Windows commands like 'type' instead of 'cat', 'dir' instead of 'ls')"
        : "/bin/sh (Unix shell)";
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const pathSeparator = platform === "win32" ? "\\" : "/";

    const lines = [
      "[ENVIRONMENT CONTEXT]",
      `Operating System: ${osName} (${platform})`,
      `Shell: ${shell}`,
      `Path Separator: ${pathSeparator}`,
      `Workspace Root: ${workspaceRoot}`,
    ];

    // Add Windows-specific guidance
    if (platform === "win32") {
      lines.push("");
      lines.push("IMPORTANT: You are on Windows. Use Windows commands:");
      lines.push("  - Use 'type' instead of 'cat'");
      lines.push("  - Use 'dir' instead of 'ls'");
      lines.push(
        "  - Use backslashes in paths (though forward slashes often work)",
      );
      lines.push(
        "  - Use 'findstr' instead of 'grep' (or use the grep_search tool)",
      );
      lines.push("  - Use 'where' instead of 'which'");
      lines.push("");
      lines.push(
        "TIP: Prefer using read_file, list_directory, search, grep_search tools over shell commands for file operations - they are cross-platform.",
      );
    }

    return lines.join("\n");
  }

  private async handleTaskCompletion(
    toolName: string,
    toolInput: unknown,
  ): Promise<void> {
    if (!this.session || this.session.role !== "orchestrator") {
      return;
    }

    if (toolName !== "complete_task") {
      return;
    }

    const input = toolInput as Record<string, unknown> | null;
    const outcomeCandidates = ["success", "partial", "failed", "escalated"];
    const outcome =
      input &&
      typeof input.outcome === "string" &&
      outcomeCandidates.includes(input.outcome)
        ? (input.outcome as TaskOutcome)
        : "success";

    const attemptCount =
      input &&
      typeof input.attemptCount === "number" &&
      Number.isFinite(input.attemptCount) &&
      input.attemptCount > 0
        ? Math.floor(input.attemptCount)
        : 1;

    const title =
      input && typeof input.title === "string"
        ? input.title
        : this.session.taskId !== null
          ? `Task ${this.session.taskId}`
          : "Task completed";

    const description =
      input && typeof input.description === "string"
        ? input.description
        : input && typeof input.summary === "string"
          ? input.summary
          : "Task completed.";

    const lessonsLearned =
      input && Array.isArray(input.lessonsLearned)
        ? input.lessonsLearned.filter(
            (lesson): lesson is string => typeof lesson === "string",
          )
        : [];

    const issuesEncountered =
      input && Array.isArray(input.issuesEncountered)
        ? input.issuesEncountered.filter(
            (issue): issue is string => typeof issue === "string",
          )
        : [];

    const completedAt =
      input && typeof input.completedAt === "string"
        ? input.completedAt
        : new Date().toISOString();

    const summaryInput: TaskSummaryInput = {
      title,
      outcome,
      attemptCount,
      description,
      lessonsLearned,
      issuesEncountered,
      completedAt,
    };

    const summary = generateTaskSummary(this.session, summaryInput);
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const memoryStore = SprintMemory.getInstance(workspaceRoot);
    await memoryStore.addTaskSummary(this.session.sprintId, summary);

    const patterns =
      input && Array.isArray(input.implementorPatterns)
        ? input.implementorPatterns
        : [];

    for (const pattern of patterns) {
      if (!pattern || typeof pattern !== "object") {
        continue;
      }

      const patternRecord = pattern as Record<string, unknown>;
      const patternType =
        patternRecord.pattern === "positive" ||
        patternRecord.pattern === "negative"
          ? patternRecord.pattern
          : null;
      const descriptionText =
        typeof patternRecord.description === "string"
          ? patternRecord.description
          : null;
      if (!patternType || !descriptionText) {
        continue;
      }

      const taskId =
        typeof patternRecord.taskId === "number" && patternRecord.taskId > 0
          ? Math.floor(patternRecord.taskId)
          : (this.session.taskId ?? 1);

      const example =
        typeof patternRecord.example === "string"
          ? patternRecord.example
          : undefined;

      const frequency =
        typeof patternRecord.frequency === "number" &&
        patternRecord.frequency > 0
          ? Math.floor(patternRecord.frequency)
          : undefined;

      await memoryStore.addImplementorPattern(this.session.sprintId, {
        pattern: patternType,
        description: descriptionText,
        taskId,
        example,
        frequency,
      });
    }
  }

  /**
   * Determine whether auto-escalation is allowed for the current session
   */
  private shouldAutoEscalate(): boolean {
    return !!this.session && this.session.taskId !== null && !this.hasEscalated;
  }

  /**
   * Record a tool failure for consecutive error tracking
   */
  private recordToolFailure(message: string): void {
    this.consecutiveErrors += 1;
    this.recentErrors.push(message);
    if (this.recentErrors.length > 5) {
      this.recentErrors.shift();
    }
  }

  /**
   * Reset consecutive tool failure tracking
   */
  private resetToolFailureTracking(): void {
    this.consecutiveErrors = 0;
    this.recentErrors = [];
  }

  /**
   * Build escalation details based on failure type
   */
  private buildEscalationDetails(
    reasonType: "max_iterations" | "tool_failures",
  ): { reason: string; attemptsSummary: string } {
    const iteration = this.session?.currentIteration ?? 0;
    const maxIterations =
      this.session?.maxIterations ?? this.config.maxIterations;
    const recentErrors =
      this.recentErrors.length > 0
        ? this.recentErrors.join(" | ")
        : "No tool errors recorded";

    if (reasonType === "max_iterations") {
      return {
        reason: `Auto-escalation: maximum iterations (${maxIterations}) reached`,
        attemptsSummary: `Iteration ${iteration} of ${maxIterations}. Consecutive tool failures: ${this.consecutiveErrors}. Recent errors: ${recentErrors}.`,
      };
    }

    return {
      reason: `Auto-escalation: ${this.consecutiveErrors} consecutive tool failures`,
      attemptsSummary: `Iteration ${iteration} of ${maxIterations}. Recent errors: ${recentErrors}.`,
    };
  }

  /**
   * Handle consecutive tool failures and auto-escalate when needed
   */
  private async handleConsecutiveFailures(): Promise<boolean> {
    if (this.consecutiveErrors < 8 || !this.session) {
      return false;
    }

    const escalationDetails = this.buildEscalationDetails("tool_failures");

    this.session.fail(escalationDetails.reason);
    this.emitOutput({
      type: "error",
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
      errorCode: "AUTO_ESCALATION",
      errorMessage: escalationDetails.reason,
      recoverable: false,
    });
    this.emitStateChange();
    this.isStopped = true;
    if (this.cancellationTokenSource) {
      this.cancellationTokenSource.cancel();
    }

    await this.triggerAutoEscalation(
      escalationDetails.reason,
      escalationDetails.attemptsSummary,
    );

    return true;
  }

  /**
   * Trigger auto-escalation via database mutation
   */
  private async triggerAutoEscalation(
    reason: string,
    attemptsSummary: string,
  ): Promise<void> {
    if (!this.shouldAutoEscalate() || !this.session) {
      return;
    }

    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    this.hasEscalated = true;

    try {
      createEscalation(workspaceRoot, this.session.taskId!, {
        reason,
        attemptsSummary,
        recommendedAction:
          "Review failure context, adjust task scope, and retry execution.",
        recommendedTargetStatus: "PENDING",
        escalatedBy: "implementor",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.emitOutput({
        type: "error",
        timestamp: new Date().toISOString(),
        iteration: this.session.currentIteration,
        errorCode: "ESCALATION_FAILED",
        errorMessage,
        recoverable: false,
      });
    }
  }

  /**
   * Add system message to session (hidden from UI, used for instructions)
   *
   * @param content - System message content
   */
  private addSystemMessage(content: string): void {
    if (!this.session) {
      return;
    }

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "system",
      content,
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
    };

    this.session.addMessage(message);
  }

  /**
   * Add user message to session
   *
   * @param content - Message content
   */
  private addUserMessage(content: string): void {
    if (!this.session) {
      return;
    }

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
    };

    this.session.addMessage(message);
  }

  /**
   * Add a user message with mixed content parts (text + attachments)
   *
   * @param parts - Array of content parts (text, data, etc.)
   */
  private addUserMessageWithParts(
    parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart>,
  ): void {
    if (!this.session) {
      return;
    }

    // Convert LanguageModel parts to AgentMessage content format
    const contentParts = parts.map((part) => {
      if (part instanceof vscode.LanguageModelTextPart) {
        return { type: "text" as const, value: part.value };
      } else if (part instanceof vscode.LanguageModelDataPart) {
        // For data parts, extract the text content
        // The value property contains the actual text for text data parts
        const decoder = new TextDecoder();
        const textContent = decoder.decode(part.value);
        return { type: "text" as const, value: textContent };
      }
      return { type: "text" as const, value: "[Unknown content type]" };
    });

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: contentParts,
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
    };

    this.session.addMessage(message);
  }

  /**
   * Add assistant message to session
   *
   * @param content - Message content
   */
  private addAssistantMessage(content: string): void {
    if (!this.session) {
      return;
    }

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
    };

    this.session.addMessage(message);
  }

  /**
   * Add assistant message with tool calls to session
   *
   * This is required by the LLM API - tool results must be preceded by
   * an assistant message that made the tool calls.
   *
   * @param toolCalls - Array of tool calls
   */
  private addAssistantToolCallMessage(
    toolCalls: Array<{ name: string; input: unknown; callId: string }>,
  ): void {
    if (!this.session) {
      return;
    }

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: toolCalls.map((tc) => ({
        type: "toolCall" as const,
        toolCallId: tc.callId,
        name: tc.name,
        input: tc.input as Record<string, unknown>,
      })),
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
    };

    this.session.addMessage(message);
  }

  /**
   * Add tool result message to session
   *
   * @param toolCallId - Tool call ID
   * @param result - Tool result text
   */
  private addToolResultMessage(toolCallId: string, result: string): void {
    if (!this.session) {
      return;
    }

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: [
        {
          type: "toolResult",
          toolCallId,
          value: result,
        },
      ],
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
    };

    this.session.addMessage(message);
  }

  /**
   * Emit output event
   *
   * @param output - Output event to emit
   */
  private emitOutput(output: AgentOutput): void {
    this._onOutput.fire(output);
  }

  /**
   * Emit state change event
   */
  private emitStateChange(): void {
    const state = this.getState();
    if (state) {
      this._onStateChange.fire(state);
    }
  }

  /**
   * Handle error during execution
   *
   * @param error - Error that occurred
   */
  private handleError(error: unknown): void {
    console.log("[AgentRunner] handleError called:", error);
    if (!this.session) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode =
      error instanceof AgentError ? error.code : "UNKNOWN_ERROR";

    const previousStatus = this.session.status;
    this.session.fail(errorMessage);
    this.eventEmitter?.emitStatusChange(previousStatus, "failed", errorMessage);

    this.emitOutput({
      type: "error",
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
      errorCode,
      errorMessage,
      recoverable: false,
    });
    this.eventEmitter?.emitError("error", errorCode, errorMessage, false);
    this.emitSessionEndOnce("failed");

    this.emitStateChange();
  }

  private emitSessionEndOnce(status: SessionStatus): void {
    if (!this.eventEmitter || this.hasEmittedSessionEnd) {
      return;
    }

    this.hasEmittedSessionEnd = true;
    this.eventEmitter.emitSessionEnd(status);
  }
}
