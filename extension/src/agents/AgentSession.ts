/**
 * AgentSession - State management for agent execution lifecycle
 *
 * Tracks messages, tool calls, file changes, and supports persistence
 * for pause/resume capability.
 *
 * @module agents/AgentSession
 */

import * as fs from "fs";
import * as path from "path";
import { SessionError } from "./errors.js";
import {
  AgentMessage,
  AgentRole,
  AgentSessionSchema,
  AgentStatus,
  CheckpointReference,
  FileChange,
  RecoveryInfo,
  ToolCall,
} from "./types.js";

/**
 * AgentSession manages the state of a single agent execution lifecycle
 *
 * Responsibilities:
 * - Session creation with unique ID
 * - Message history tracking
 * - Tool call tracking with timing
 * - File change tracking for undo
 * - Iteration management
 * - State transitions (running, paused, stopped, completed, failed)
 * - JSON persistence (save/load)
 * - Recovery information management
 */
export class AgentSession {
  // Version for schema evolution
  public readonly version = "1.0" as const;

  // Identity
  public readonly id: string;
  public readonly role: AgentRole;
  public taskId: number | null;
  public taskNumber: number | undefined; // Sprint-scoped sequential task number (1, 2, 3...)
  public readonly sprintId: string;

  // Lifecycle
  public status: AgentStatus;
  public readonly createdAt: string;
  public updatedAt: string;
  public lastActivityAt: string;

  // Execution tracking
  public currentIteration: number;
  public readonly maxIterations: number;

  // Conversation and actions
  public messages: AgentMessage[];
  public toolCalls: ToolCall[];
  public fileChanges: FileChange[];

  // Checkpoints
  public checkpoints: CheckpointReference[];
  public lastCheckpointId: string | null;

  // Recovery
  public recoveryInfo: RecoveryInfo;

  /**
   * Create a new AgentSession
   *
   * @param role - orchestrator or implementor
   * @param sprintId - Sprint identifier
   * @param taskId - Task ID (required for implementor, optional for orchestrator)
   * @param maxIterations - Maximum iteration limit (default 50)
   */
  constructor(
    role: AgentRole,
    sprintId: string,
    taskId: number | null = null,
    maxIterations: number = 50,
  ) {
    const now = new Date().toISOString();

    this.id = crypto.randomUUID();
    this.role = role;
    this.taskId = taskId;
    this.sprintId = sprintId;

    this.status = "running";
    this.createdAt = now;
    this.updatedAt = now;
    this.lastActivityAt = now;

    this.currentIteration = 0;
    this.maxIterations = maxIterations;

    this.messages = [];
    this.toolCalls = [];
    this.fileChanges = [];

    this.checkpoints = [];
    this.lastCheckpointId = null;

    this.recoveryInfo = {
      canResume: true,
      resumeFromIteration: null,
      resumeFromToolCall: null,
      failureReason: null,
    };
  }

  /**
   * Add a message to the conversation history
   *
   * @param message - The message to add
   */
  addMessage(message: AgentMessage): void {
    this.messages.push(message);
    this.updateActivityTimestamp();
  }

  /**
   * Record a tool call execution
   *
   * @param toolCall - The tool call record
   */
  recordToolCall(toolCall: ToolCall): void {
    this.toolCalls.push(toolCall);
    this.updateActivityTimestamp();
  }

  /**
   * Record a file change for undo capability
   *
   * @param fileChange - The file change record
   */
  recordFileChange(fileChange: FileChange): void {
    this.fileChanges.push(fileChange);
    this.updateActivityTimestamp();
  }

  /**
   * Increment the iteration counter
   *
   * @throws SessionError if max iterations exceeded
   */
  incrementIteration(): void {
    if (this.currentIteration >= this.maxIterations) {
      throw new SessionError(
        `Maximum iterations (${this.maxIterations}) exceeded`,
        this.id,
        { currentIteration: this.currentIteration },
      );
    }

    this.currentIteration++;
    this.updateActivityTimestamp();
  }

  /**
   * Update status to paused
   *
   * Sets recovery info to allow resume from current state
   */
  pause(): void {
    if (this.status !== "running") {
      throw new SessionError(
        `Cannot pause session with status: ${this.status}`,
        this.id,
        { currentStatus: this.status },
      );
    }

    this.status = "paused";
    const lastToolCall = this.toolCalls[this.toolCalls.length - 1];
    this.recoveryInfo = {
      canResume: true,
      resumeFromIteration: this.currentIteration,
      resumeFromToolCall:
        this.toolCalls.length > 0 && lastToolCall ? lastToolCall.id : null,
      failureReason: null,
    };
    this.updateActivityTimestamp();
    // Note: Auto-save removed - session state is persisted via database
  }

  /**
   * Update status to stopped
   *
   * Sets recovery info to allow resume from checkpoint
   */
  stop(): void {
    if (this.status !== "running" && this.status !== "paused") {
      throw new SessionError(
        `Cannot stop session with status: ${this.status}`,
        this.id,
        { currentStatus: this.status },
      );
    }

    this.status = "stopped";
    const lastToolCall = this.toolCalls[this.toolCalls.length - 1];
    this.recoveryInfo = {
      canResume: true,
      resumeFromIteration: this.currentIteration,
      resumeFromToolCall:
        this.toolCalls.length > 0 && lastToolCall ? lastToolCall.id : null,
      failureReason: null,
    };
    this.updateActivityTimestamp();
  }

  /**
   * Resume from paused or stopped state
   */
  resume(): void {
    if (this.status !== "paused" && this.status !== "stopped") {
      throw new SessionError(
        `Cannot resume session with status: ${this.status}`,
        this.id,
        { currentStatus: this.status },
      );
    }

    if (!this.recoveryInfo.canResume) {
      throw new SessionError("Session cannot be resumed", this.id, {
        failureReason: this.recoveryInfo.failureReason,
      });
    }

    this.status = "running";
    this.updateActivityTimestamp();
  }

  /**
   * Mark session as completed successfully
   */
  complete(): void {
    if (this.status !== "running") {
      throw new SessionError(
        `Cannot complete session with status: ${this.status}`,
        this.id,
        { currentStatus: this.status },
      );
    }

    this.status = "completed";
    this.recoveryInfo = {
      canResume: false,
      resumeFromIteration: null,
      resumeFromToolCall: null,
      failureReason: null,
    };
    this.updateActivityTimestamp();
  }

  /**
   * Mark session as failed
   *
   * @param reason - Reason for failure
   */
  fail(reason: string): void {
    if (this.status === "completed" || this.status === "failed") {
      throw new SessionError(
        `Cannot fail session with status: ${this.status}`,
        this.id,
        { currentStatus: this.status },
      );
    }

    this.status = "failed";
    this.recoveryInfo = {
      canResume: false,
      resumeFromIteration: null,
      resumeFromToolCall: null,
      failureReason: reason,
    };
    this.updateActivityTimestamp();
  }

  /**
   * Add a checkpoint reference
   *
   * @param checkpoint - The checkpoint reference
   */
  addCheckpoint(checkpoint: CheckpointReference): void {
    this.checkpoints.push(checkpoint);
    this.lastCheckpointId = checkpoint.id;
    this.updateActivityTimestamp();
  }

  /**
   * Update lastActivityAt and updatedAt timestamps
   */
  private updateActivityTimestamp(): void {
    const now = new Date().toISOString();
    this.lastActivityAt = now;
    this.updatedAt = now;
  }

  /**
   * Serialize session to JSON object
   *
   * @returns Session data matching AgentSessionSchema
   */
  toJSON(): Record<string, unknown> {
    return {
      version: this.version,
      id: this.id,
      role: this.role,
      taskId: this.taskId,
      sprintId: this.sprintId,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastActivityAt: this.lastActivityAt,
      currentIteration: this.currentIteration,
      maxIterations: this.maxIterations,
      messages: this.messages,
      toolCalls: this.toolCalls,
      fileChanges: this.fileChanges,
      checkpoints: this.checkpoints,
      lastCheckpointId: this.lastCheckpointId,
      recoveryInfo: this.recoveryInfo,
    };
  }

  /**
   * Deserialize session from JSON object
   *
   * @param data - JSON data matching AgentSessionSchema
   * @returns AgentSession instance
   * @throws SessionError if validation fails
   */
  static fromJSON(data: unknown): AgentSession {
    // Validate against schema
    const parseResult = AgentSessionSchema.safeParse(data);

    if (!parseResult.success) {
      throw new SessionError("Invalid session data", "unknown", {
        errors: parseResult.error.errors,
      });
    }

    const validated = parseResult.data;

    // Create session with validated data
    const session = new AgentSession(
      validated.role,
      validated.sprintId,
      validated.taskId,
      validated.maxIterations,
    );

    // Override generated fields with loaded data
    (session as { id: string }).id = validated.id;
    (session as { createdAt: string }).createdAt = validated.createdAt;

    session.status = validated.status;
    session.updatedAt = validated.updatedAt;
    session.lastActivityAt = validated.lastActivityAt;
    session.currentIteration = validated.currentIteration;
    session.messages = validated.messages;
    session.toolCalls = validated.toolCalls;
    session.fileChanges = validated.fileChanges;
    session.checkpoints = validated.checkpoints;
    session.lastCheckpointId = validated.lastCheckpointId;
    session.recoveryInfo = validated.recoveryInfo;

    return session;
  }

  /**
   * Save session to JSON file
   *
   * @param filePath - Absolute path to save file
   * @throws SessionError if save fails
   */
  async save(filePath: string): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Validate data before saving
      const data = this.toJSON();
      const parseResult = AgentSessionSchema.safeParse(data);

      if (!parseResult.success) {
        throw new SessionError(
          "Session data validation failed before save",
          this.id,
          { errors: parseResult.error.errors },
        );
      }

      // Write to file
      const json = JSON.stringify(data, null, 2);
      await fs.promises.writeFile(filePath, json, "utf-8");
    } catch (error) {
      if (error instanceof SessionError) {
        throw error;
      }

      throw new SessionError(`Failed to save session to ${filePath}`, this.id, {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Load session from JSON file
   *
   * @param filePath - Absolute path to session file
   * @returns AgentSession instance
   * @throws SessionError if load fails
   */
  static async load(filePath: string): Promise<AgentSession> {
    try {
      // Read file
      const json = await fs.promises.readFile(filePath, "utf-8");
      const data = JSON.parse(json);

      // Deserialize and validate
      return AgentSession.fromJSON(data);
    } catch (error) {
      if (error instanceof SessionError) {
        throw error;
      }

      throw new SessionError(
        `Failed to load session from ${filePath}`,
        "unknown",
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
