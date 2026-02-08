/**
 * API Contract: AgentRunner (Resume & Continuation)
 *
 * Purpose: Agent execution with session resume and continuation support
 * Location: extension/src/agents/AgentRunner.ts (extend existing)
 * Phase: 3 (Session Resume) and 4 (Session Continuation)
 * Tasks: T007, T008, T009, T011
 */

import type { SessionStage } from "./sessions/sessionRepository.js";
import type { AgentSession } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of agent execution
 */
export interface AgentResult {
  session: AgentSession;
  status: "completed" | "failed" | "cancelled";
  error?: Error;
  finalMessage?: string;
}

/**
 * Options for resuming a session
 */
export interface ResumeSessionOptions {
  sessionId: string; // Session UUID to resume
  additionalContext?: string; // Optional context to inject
  maxIterations?: number; // Override max iterations
}

/**
 * Options for continuing a session
 */
export interface ContinueSessionOptions {
  sessionId: string; // Parent session UUID to continue
  continuationPrompt: string; // Feedback/instructions to inject
  stage: SessionStage; // New session stage (e.g., IMPLEMENT_FIX)
  maxIterations?: number; // Override max iterations
}

// ============================================================================
// AgentRunner Methods (Resume)
// ============================================================================

/**
 * Resume a session from database
 *
 * Reconstructs full conversation state from session_messages table and
 * continues agent execution from last iteration. Used for:
 * - Paused orchestrator sessions (VS Code restart, power loss)
 * - Failed sessions that need manual intervention
 *
 * Reconstruction includes:
 * - All messages from session_messages table
 * - Tool call history from ToolResultEvent events
 * - File changes from ToolFileOperationEvent events
 * - Sprint memory context (for orchestrator sessions)
 *
 * Does NOT restore:
 * - ProcessManager processes (may have died)
 * - Terminal state (OS-dependent)
 * - Open file handles (session-local)
 *
 * @param options Resume options with session ID
 * @returns AgentResult with resumed session
 * @throws Error if session not found or already running
 *
 * @example
 * // Resume paused orchestrator session after VS Code restart
 * try {
 *   const result = await AgentRunner.resumeSession({
 *     sessionId: 'session-abc-123',
 *     additionalContext: 'This session was interrupted by system restart.'
 *   });
 *   console.log(`Resumed session: ${result.session.iteration} iterations completed`);
 * } catch (err) {
 *   console.error('Failed to resume:', err);
 * }
 */
export async function resumeSession(
  options: ResumeSessionOptions,
): Promise<AgentResult>;

/**
 * Continue a session with new instructions (session reuse)
 *
 * Takes an existing session (e.g., implementor), appends continuation prompt,
 * and resumes execution. This is THE core workflow innovation for fix cycles.
 *
 * Process:
 * 1. Call continueSession() to create new session record
 * 2. Load all parent messages + new prompt
 * 3. Reconstruct tool calls and file changes
 * 4. Resume agent execution from last iteration
 *
 * @param options Continuation options with session ID and prompt
 * @returns AgentResult with continued session
 * @throws Error if parent session not found or continuation invalid
 *
 * @example
 * // Orchestrator continues implementor session with feedback
 * const implementorSession = getLatestImplementorSession(workspaceRoot, taskId);
 * const result = await AgentRunner.continueSession({
 *   sessionId: implementorSession.id,
 *   continuationPrompt: 'Verification failed: Missing password hashing. Please add bcrypt.',
 *   stage: 'IMPLEMENT_FIX',
 *   maxIterations: 50
 * });
 */
export async function continueSessionExecution(
  options: ContinueSessionOptions,
): Promise<AgentResult>;

// ============================================================================
// Internal Reconstruction Methods
// ============================================================================

/**
 * Reconstruct AgentSession from database
 *
 * Internal method called by resumeSession and continueSession.
 *
 * Steps:
 * 1. Load session metadata from agent_sessions
 * 2. Load messages from session_messages
 * 3. Reconstruct tool calls from events
 * 4. Reconstruct file changes from events
 * 5. Load sprint memory context (if orchestrator)
 * 6. Restore context compaction markers
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID to reconstruct
 * @returns Reconstructed AgentSession
 * @throws Error if session not found or data corrupted
 */
async function reconstructSession(
  workspaceRoot: string,
  sessionId: string,
): Promise<AgentSession>;

/**
 * Reconstruct tool call history from events
 *
 * Queries ToolResultEvent events for completed tool calls and rebuilds
 * the toolCalls array in AgentSession. Uses existing toolCallAggregator
 * to reconstruct tool call summaries.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Array of tool call records
 */
async function reconstructToolCalls(
  workspaceRoot: string,
  sessionId: string,
): Promise<ToolCall[]>;

/**
 * Reconstruct file changes from events
 *
 * Queries ToolFileOperationEvent events for file operations (read, write,
 * delete) and rebuilds the fileChanges array for undo capability.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Array of file change records
 */
async function reconstructFileChanges(
  workspaceRoot: string,
  sessionId: string,
): Promise<FileChange[]>;

/**
 * Load sprint memory context for session
 *
 * For orchestrator sessions, loads sprint memory (architectural decisions,
 * task context, etc.) and injects it into conversation.
 *
 * @param workspaceRoot Workspace root directory
 * @param session AgentSession
 * @returns Sprint memory context string or undefined
 */
async function loadSprintMemory(
  workspaceRoot: string,
  session: AgentSession,
): Promise<string | undefined>;

/**
 * Inject resume context into conversation
 *
 * Adds a system message indicating session is being resumed and any
 * additional context (e.g., "This session was paused mid-task").
 *
 * @param session AgentSession to update
 * @param context Additional context to inject
 */
function injectResumeContext(session: AgentSession, context?: string): void;

// ============================================================================
// Validation Methods
// ============================================================================

/**
 * Validate session can be resumed
 *
 * Checks:
 * - Session exists in database
 * - Session status is 'paused' or 'failed' (not 'running' or 'completed')
 * - Session has messages in database
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @throws Error if validation fails
 */
function validateResume(workspaceRoot: string, sessionId: string): void;

/**
 * Validate session can be continued
 *
 * Checks:
 * - Parent session exists and is completed or failed
 * - Continuation depth < 5
 * - Parent session role matches new session role
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Parent session UUID
 * @param newStage New session stage
 * @throws Error if validation fails
 */
function validateContinuation(
  workspaceRoot: string,
  sessionId: string,
  newStage: SessionStage,
): void;

// ============================================================================
// Performance Characteristics
// ============================================================================

/**
 * Expected performance:
 *
 * - resumeSession: <2s for 100-message session with 50 tool calls
 *   - Load messages: <500ms
 *   - Reconstruct tool calls: <500ms
 *   - Reconstruct file changes: <200ms
 *   - Load sprint memory: <300ms
 *
 * - continueSession: <3s (resume + copy parent messages)
 *   - Create continuation: <300ms
 *   - Reconstruct session: <2s
 *
 * Optimization:
 * - Parallel queries for messages, events, sprint memory
 * - Lazy loading of file changes (only if undo needed)
 * - Message pagination if session > 100 messages
 */

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Resume paused orchestrator session
 *
 * ```typescript
 * // User restarts VS Code mid-sprint, orchestrator was at iteration 15/50
 * const pausedSessions = getSessionsByStatus(workspaceRoot, 'paused');
 *
 * for (const session of pausedSessions) {
 *   console.log(`Resuming session ${session.id} (iteration ${session.iteration})`);
 *
 *   const result = await AgentRunner.resumeSession({
 *     sessionId: session.id,
 *     additionalContext: 'Session resumed after system restart.'
 *   });
 *
 *   if (result.status === 'completed') {
 *     console.log('Session completed successfully');
 *   } else {
 *     console.error('Session failed:', result.error);
 *   }
 * }
 * ```
 */

/**
 * Example 2: Continue implementor session with orchestrator feedback
 *
 * ```typescript
 * // Orchestrator verifies Task 5, finds issues
 * const verificationResult = await verifyTask(5);
 *
 * if (verificationResult.status === 'FAIL') {
 *   // Get latest implementor session for this task
 *   const implementorSession = getLatestImplementorSession(workspaceRoot, 5);
 *
 *   if (!implementorSession) {
 *     throw new Error('No implementor session to continue');
 *   }
 *
 *   // Generate feedback from verification failures
 *   const feedback = verificationResult.failures
 *     .map(f => `- ${f.criterion}: ${f.reason}`)
 *     .join('\n');
 *
 *   const prompt = `Verification failed. Please fix these issues:\n\n${feedback}\n\nThen signal completion again.`;
 *
 *   // Continue implementor session with feedback
 *   const result = await AgentRunner.continueSessionExecution({
 *     sessionId: implementorSession.id,
 *     continuationPrompt: prompt,
 *     stage: 'IMPLEMENT_FIX',
 *     maxIterations: 50
 *   });
 *
 *   if (result.status === 'completed') {
 *     // Verify again
 *     await verifyTask(5);
 *   }
 * }
 * ```
 */

/**
 * Example 3: Resume failed session for debugging
 *
 * ```typescript
 * // Session failed at iteration 23 with tool error
 * const failedSession = getSession(workspaceRoot, sessionId);
 *
 * console.log(`Session failed at iteration ${failedSession.iteration}`);
 * console.log(`Error: ${failedSession.error}`);
 *
 * // Examine conversation to understand what agent was trying to do
 * const messages = getSessionMessages(workspaceRoot, sessionId);
 * const lastFewMessages = messages.slice(-5);
 *
 * console.log('Last 5 messages before failure:');
 * for (const msg of lastFewMessages) {
 *   console.log(`  [${msg.role}]: ${typeof msg.content === 'string' ? msg.content : '<structured>'}`)
 * }
 *
 * // After debugging, resume with additional context
 * const result = await AgentRunner.resumeSession({
 *   sessionId: sessionId,
 *   additionalContext: 'Previous attempt failed due to missing dependency. Dependency has been installed.'
 * });
 * ```
 */

/**
 * Example 4: Multi-level continuation chain
 *
 * ```typescript
 * // Task 5 requires multiple fix cycles
 * let sessionId = initialImplementorSessionId;
 * let attempt = 1;
 * const maxAttempts = 5;
 *
 * while (attempt <= maxAttempts) {
 *   console.log(`Verification attempt ${attempt}`);
 *
 *   const verificationResult = await verifyTask(5);
 *
 *   if (verificationResult.status === 'PASS') {
 *     console.log('Verification passed!');
 *     break;
 *   }
 *
 *   if (attempt === maxAttempts) {
 *     console.error('Max attempts reached - escalating to human');
 *     await escalateTask(5, 'Multiple verification failures');
 *     break;
 *   }
 *
 *   // Continue session with feedback
 *   const feedback = generateFeedback(verificationResult);
 *   const continuedSession = await AgentRunner.continueSessionExecution({
 *     sessionId: sessionId,
 *     continuationPrompt: feedback,
 *     stage: 'IMPLEMENT_FIX',
 *     maxIterations: 50
 *   });
 *
 *   sessionId = continuedSession.session.id; // Use new session for next iteration
 *   attempt++;
 * }
 *
 * // Review entire chain
 * const chain = getSessionChain(workspaceRoot, sessionId);
 * console.log(`Task completed in ${chain.length} attempts`);
 * ```
 */
