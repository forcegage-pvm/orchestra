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
import { AgentSession } from "./AgentSession.js";
import { ContextManager } from "./ContextManager.js";
import { AgentError, SessionError } from "./errors.js";
import { ToolRegistry } from "./ToolRegistry.js";
import type {
  AgentConfig,
  AgentMessage,
  AgentRole,
  MessageContentPart,
  ToolContext,
} from "./types.js";

/**
 * Output types emitted during agent execution
 */
export type AgentOutputType =
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "error"
  | "status";

/**
 * Agent output event
 */
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
  errorCode?: string;
  errorMessage?: string;
  recoverable?: boolean;
  previousStatus?: string;
  newStatus?: string;
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
 * Options for starting an agent
 */
export interface AgentStartOptions {
  prompt: string;
  taskId?: number;
  sprintId?: string;
  resumeSessionId?: string;
  maxIterations?: number;
  model?: string;
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

  // Execution control
  private isPaused = false;
  private isStopped = false;
  private cancellationTokenSource: vscode.CancellationTokenSource | undefined;
  private runningPromise: Promise<void> | undefined;

  // Event emitters
  private _onOutput = new vscode.EventEmitter<AgentOutput>();
  private _onStateChange = new vscode.EventEmitter<AgentState>();

  // Public event subscriptions
  readonly onOutput = this._onOutput.event;
  readonly onStateChange = this._onStateChange.event;

  /**
   * Create a new AgentRunner
   *
   * @param toolRegistry - Tool registry for executing tool calls
   * @param config - Agent configuration (models, iterations, verbosity)
   */
  constructor(toolRegistry: ToolRegistry, config?: Partial<AgentConfig>) {
    this.toolRegistry = toolRegistry;

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
    };
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

    // Create new session
    const sprintId = options.sprintId ?? "default-sprint";
    const maxIterations = options.maxIterations ?? this.config.maxIterations;
    this.session = new AgentSession(
      role,
      sprintId,
      options.taskId ?? null,
      maxIterations,
    );

    // Create cancellation token
    this.cancellationTokenSource = new vscode.CancellationTokenSource();

    // Add initial user message with prompt
    this.addUserMessage(options.prompt);

    // Emit state change
    this.emitStateChange();

    // Start agent loop in background (don't await)
    this.runningPromise = this.runAgentLoop(role, options.model).catch(
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

    this.isPaused = true;
    this.session.pause();
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

    this.isPaused = false;
    this.session.resume();
    this.emitStateChange();

    // Restart agent loop
    const role = this.session.role;
    this.runningPromise = this.runAgentLoop(role).catch((error) => {
      this.handleError(error);
    });
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

    this.isStopped = true;
    this.session.stop();

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

    this.addUserMessage(instruction);
    this.emitOutput({
      type: "thinking",
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
      text: `[Redirected with new instruction: ${instruction}]`,
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
    if (!this.session) {
      throw new SessionError(
        "No session available for agent loop",
        "no-session",
      );
    }

    try {
      // Select language model
      const model = await this.selectModel(role, modelOverride);

      // Get tools
      const tools = this.toolRegistry.getToolDefinitions();

      // Main agent loop
      while (
        this.session.currentIteration < this.session.maxIterations &&
        !this.isPaused &&
        !this.isStopped
      ) {
        // Increment iteration
        this.session.incrementIteration();

        // Compact context if needed
        const compactedMessages = this.contextManager.isWithinLimit(
          this.session.messages,
        )
          ? this.session.messages
          : this.contextManager.compact(this.session.messages);

        // Convert to vscode.lm format
        const chatMessages = this.convertToLMMessages(compactedMessages);

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
          this.session.complete();
          this.emitStateChange();
          break;
        }
      }

      // Check if we hit max iterations
      if (
        this.session.currentIteration >= this.session.maxIterations &&
        this.session.status === "running"
      ) {
        this.session.fail(
          `Maximum iterations (${this.session.maxIterations}) reached`,
        );
        this.emitOutput({
          type: "error",
          timestamp: new Date().toISOString(),
          iteration: this.session.currentIteration,
          errorCode: "MAX_ITERATIONS",
          errorMessage: `Agent stopped after ${this.session.maxIterations} iterations`,
          recoverable: false,
        });
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
    // Determine model family
    const targetModel =
      modelOverride ??
      (role === "orchestrator"
        ? this.config.orchestratorModel
        : role === "implementor"
          ? this.config.implementorModel
          : this.config.controllerModel);

    const family = targetModel.startsWith("claude") ? "claude" : undefined;
    const familyModels = family
      ? await vscode.lm.selectChatModels({ family })
      : [];

    const models =
      familyModels.length > 0
        ? familyModels
        : await vscode.lm.selectChatModels();

    if (models.length === 0) {
      throw new AgentError(
        family === "claude"
          ? "No Claude language models available"
          : "No language models available",
        "NO_MODEL_AVAILABLE",
      );
    }

    // Try to find exact match first
    const exactMatch = models.find((m) => m.id.includes(targetModel));
    if (exactMatch) {
      return exactMatch;
    }

    // Fallback to first available model (guaranteed to exist due to check above)
    return models[0]!;
  }

  /**
   * Convert AgentMessage[] to LanguageModelChatMessage[]
   *
   * @param messages - Agent messages to convert
   * @returns Array of language model chat messages
   */
  private convertToLMMessages(
    messages: AgentMessage[],
  ): LanguageModelChatMessage[] {
    return messages.map((msg) => {
      const role =
        msg.role === "user"
          ? vscode.LanguageModelChatMessageRole.User
          : vscode.LanguageModelChatMessageRole.Assistant;

      // Handle string content
      if (typeof msg.content === "string") {
        return vscode.LanguageModelChatMessage.User(msg.content);
      }

      // Handle array content (tool results, etc.)
      const textParts = msg.content
        .filter(
          (part): part is Extract<MessageContentPart, { type: "text" }> =>
            part.type === "text",
        )
        .map((part) => part.value)
        .join("\n");

      return role === vscode.LanguageModelChatMessageRole.User
        ? vscode.LanguageModelChatMessage.User(textParts)
        : vscode.LanguageModelChatMessage.Assistant(textParts);
    });
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
      return false;
    }

    try {
      // Send request
      const request = await model.sendRequest(messages, { tools }, token);

      let thinkingText = "";
      let hadToolCalls = false;
      const toolCalls: Array<{ name: string; input: unknown; callId: string }> =
        [];

      // Stream response
      for await (const chunk of request.stream) {
        // Check for pause/stop
        if (this.isPaused || this.isStopped) {
          break;
        }

        if (chunk instanceof vscode.LanguageModelTextPart) {
          // Accumulate thinking text
          thinkingText += chunk.value;
        } else if (chunk instanceof vscode.LanguageModelToolCallPart) {
          // Tool call requested
          hadToolCalls = true;
          toolCalls.push({
            name: chunk.name,
            input: chunk.input,
            callId: chunk.callId,
          });

          this.emitOutput({
            type: "tool_call",
            timestamp: new Date().toISOString(),
            iteration: this.session.currentIteration,
            toolName: chunk.name,
            toolInput: chunk.input as Record<string, unknown>,
            toolCallId: chunk.callId,
          });
        }
      }

      // Emit thinking text if any
      if (thinkingText.trim()) {
        this.addAssistantMessage(thinkingText);
        this.emitOutput({
          type: "thinking",
          timestamp: new Date().toISOString(),
          iteration: this.session.currentIteration,
          text: thinkingText,
        });
      }

      // Execute tool calls
      if (hadToolCalls) {
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

    const context: ToolContext = {
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
      sessionId: this.session.id,
      iteration: this.session.currentIteration,
      cancellationToken: this.cancellationTokenSource?.token,
      logger: console,
      db: undefined,
    };

    for (const toolCall of toolCalls) {
      // Check for pause/stop
      if (this.isPaused || this.isStopped) {
        break;
      }

      const startTime = Date.now();

      try {
        const result = await this.toolRegistry.execute(
          toolCall.name,
          toolCall.input,
          context,
          { retries: this.config.maxToolRetries },
        );

        const durationMs = Date.now() - startTime;

        // Record tool call in session
        this.session.recordToolCall({
          id: toolCall.callId,
          name: toolCall.name,
          arguments: toolCall.input as Record<string, unknown>,
          result: result.result,
          status: result.result.success ? "success" : "error",
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs,
          iteration: this.session.currentIteration,
          messageId: "", // Will be set when message is added
        });

        // Add tool result to message history
        this.addToolResultMessage(toolCall.callId, result.result.output);

        // Emit tool result
        this.emitOutput({
          type: "tool_result",
          timestamp: new Date().toISOString(),
          iteration: this.session.currentIteration,
          toolCallId: toolCall.callId,
          toolResult: result.result.output,
          toolSuccess: result.result.success,
          toolDuration: durationMs,
        });
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

        // Add error to message history
        this.addToolResultMessage(toolCall.callId, `Error: ${errorMessage}`);

        // Emit error
        this.emitOutput({
          type: "error",
          timestamp: new Date().toISOString(),
          iteration: this.session.currentIteration,
          toolCallId: toolCall.callId,
          errorCode: "TOOL_EXECUTION_FAILED",
          errorMessage,
          recoverable: true,
        });
      }
    }
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
    if (!this.session) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    this.session.fail(errorMessage);

    this.emitOutput({
      type: "error",
      timestamp: new Date().toISOString(),
      iteration: this.session.currentIteration,
      errorCode: error instanceof AgentError ? error.code : "UNKNOWN_ERROR",
      errorMessage,
      recoverable: false,
    });

    this.emitStateChange();
  }
}
