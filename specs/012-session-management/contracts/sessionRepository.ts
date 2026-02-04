/**
 * API Contract: Session Repository (Continuation Extensions)
 *
 * Purpose: Session continuation and chain traversal operations
 * Location: extension/src/agents/sessions/sessionRepository.ts (extend existing)
 * Phase: 4 (Session Continuation)
 * Tasks: T010, T012
 */

import type { AgentSession } from "../types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Session workflow stage
 */
export type SessionStage =
  | "PREPARE" // Orchestrator creating task handover
  | "IMPLEMENT" // Implementor writing code (first attempt)
  | "VERIFY" // Orchestrator verifying implementation
  | "IMPLEMENT_FIX" // Implementor fixing issues (continuation)
  | "CODE_REVIEW" // Controller reviewing code
  | "GENERAL"; // Ad-hoc orchestrator work (no specific task)

/**
 * Extended session data with continuation fields
 */
export interface SessionWithContinuation extends AgentSession {
  stage: SessionStage | null; // Workflow stage (NULL for legacy)
  parent_session_id: string | null; // Parent session for continuations
  attempt: number; // Retry attempt number (≥1)
  is_continued: boolean; // Has child continuation sessions
  continued_at: string | null; // ISO timestamp of first continuation
  continuation_count: number; // Number of times continued
}

/**
 * Input for creating a session with stage
 */
export interface CreateSessionWithStageInput {
  role: "orchestrator" | "implementor" | "controller";
  task_id?: number; // Optional - for GENERAL stage
  sprint_id?: string;
  stage?: SessionStage; // Optional - defaults to GENERAL
  parent_session_id?: string; // For continuation
  attempt?: number; // For retries (defaults to 1)
}

/**
 * Session chain node - session with parent/children metadata
 */
export interface SessionChainNode {
  session: SessionWithContinuation;
  depth: number; // 0 = root, 1 = first child, etc.
  children: SessionChainNode[]; // Child sessions
}

// ============================================================================
// Repository Functions (Continuation)
// ============================================================================

/**
 * Continue an existing session with new prompt (session reuse)
 *
 * Creates a new session record linked to the original via parent_session_id,
 * allowing conversation to continue from where it left off. This is THE core
 * workflow innovation for fix cycles.
 *
 * - Creates new session with parent_session_id pointing to original
 * - Copies all messages from parent session
 * - Appends continuation prompt as user message
 * - Increments attempt counter
 * - Updates parent session: is_continued=true, continuation_count++
 * - Maintains agent separation: only same-role continuation allowed
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Original session UUID to continue
 * @param continuationPrompt User message to inject (e.g., feedback)
 * @param stage New session stage (e.g., IMPLEMENT_FIX)
 * @returns New session with conversation state copied from parent
 * @throws Error if parent session not found or continuation depth exceeded
 *
 * @example
 * // Orchestrator verifies Task 5, finds issues, continues implementor session
 * const implementorSession = getLatestImplementorSession(workspaceRoot, 5);
 * const continuedSession = continueSession(
 *   workspaceRoot,
 *   implementorSession.id,
 *   'Verification failed: Missing password hashing. Please add bcrypt.',
 *   'IMPLEMENT_FIX'
 * );
 * // continuedSession now has all implementor's original messages + feedback
 */
export function continueSession(
  workspaceRoot: string,
  sessionId: string,
  continuationPrompt: string,
  stage: SessionStage,
): SessionWithContinuation;

/**
 * Get the full conversation chain for a session (parent + children)
 *
 * - Traverses parent_session_id links recursively
 * - Returns all sessions in continuation chain
 * - Ordered by depth (parent first, then children chronologically)
 * - Maximum depth: 5 levels (prevents infinite loops)
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID (can be parent or child)
 * @returns Array of sessions in continuation chain
 *
 * @example
 * // Get full chain for a continued session
 * const chain = getSessionChain(workspaceRoot, sessionId);
 * console.log(chain.map(s => `${s.stage} (attempt ${s.attempt})`));
 * // ["IMPLEMENT (attempt 1)", "IMPLEMENT_FIX (attempt 2)", "IMPLEMENT_FIX (attempt 3)"]
 */
export function getSessionChain(
  workspaceRoot: string,
  sessionId: string,
): SessionWithContinuation[];

/**
 * Get session chain as tree structure with parent/children relationships
 *
 * Similar to getSessionChain but returns hierarchical tree structure
 * for UI visualization.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Root session UUID
 * @returns Tree structure with depth and children
 *
 * @example
 * const tree = getSessionChainTree(workspaceRoot, sessionId);
 * // tree.session = root session (depth 0)
 * // tree.children[0].session = first child (depth 1)
 * // tree.children[0].children[0].session = grandchild (depth 2)
 */
export function getSessionChainTree(
  workspaceRoot: string,
  sessionId: string,
): SessionChainNode;

/**
 * Get the latest implementor session for a task (for continuation)
 *
 * - Finds most recent IMPLEMENT or IMPLEMENT_FIX session
 * - Used by orchestrator to identify which session to continue
 * - Returns undefined if no implementor session exists
 *
 * @param workspaceRoot Workspace root directory
 * @param taskId Task ID
 * @returns Most recent implementor session, or undefined
 *
 * @example
 * // Orchestrator needs to continue implementor session for Task 5
 * const implementorSession = getLatestImplementorSession(workspaceRoot, 5);
 * if (implementorSession) {
 *   continueSession(workspaceRoot, implementorSession.id, feedback, 'IMPLEMENT_FIX');
 * }
 */
export function getLatestImplementorSession(
  workspaceRoot: string,
  taskId: number,
): SessionWithContinuation | undefined;

/**
 * Get all sessions for a task grouped by stage
 *
 * Returns sessions organized by workflow stage for task overview.
 *
 * @param workspaceRoot Workspace root directory
 * @param taskId Task ID
 * @returns Map of stage to sessions
 *
 * @example
 * const sessionsByStage = getTaskSessionsByStage(workspaceRoot, 5);
 * console.log(sessionsByStage.IMPLEMENT);  // [session1, session2]
 * console.log(sessionsByStage.VERIFY);     // [session3]
 */
export function getTaskSessionsByStage(
  workspaceRoot: string,
  taskId: number,
): Record<SessionStage, SessionWithContinuation[]>;

/**
 * Get continuation depth for a session
 *
 * Counts how many levels deep in continuation chain this session is.
 * Root session = depth 0, first continuation = depth 1, etc.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Depth in continuation chain (0-based)
 *
 * @example
 * const depth = getSessionDepth(workspaceRoot, sessionId);
 * if (depth >= 5) {
 *   // Max depth reached - escalate to human
 * }
 */
export function getSessionDepth(
  workspaceRoot: string,
  sessionId: string,
): number;

/**
 * Check if a session can be continued
 *
 * Validates:
 * - Session exists and is completed or failed
 * - Continuation depth < 5 (maximum)
 * - Session role matches expected continuation role
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns True if session can be continued
 *
 * @example
 * if (canContinueSession(workspaceRoot, sessionId)) {
 *   continueSession(workspaceRoot, sessionId, prompt, stage);
 * } else {
 *   // Start new session instead
 * }
 */
export function canContinueSession(
  workspaceRoot: string,
  sessionId: string,
): boolean;

/**
 * Get root session for a continuation chain
 *
 * Traverses parent_session_id links to find original session.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Any session UUID in chain
 * @returns Root session (no parent_session_id)
 *
 * @example
 * // Find original session for a deeply nested continuation
 * const rootSession = getRootSession(workspaceRoot, sessionId);
 * console.log(`Original attempt started at ${rootSession.created_at}`);
 */
export function getRootSession(
  workspaceRoot: string,
  sessionId: string,
): SessionWithContinuation;

// ============================================================================
// Repository Functions (Extended Session Creation)
// ============================================================================

/**
 * Create a new session with stage and continuation fields
 *
 * Extended version of existing createSession with continuation support.
 *
 * @param workspaceRoot Workspace root directory
 * @param input Session creation parameters with stage
 * @returns Created session with generated ID
 *
 * @example
 * const session = createSessionWithStage(workspaceRoot, {
 *   role: 'implementor',
 *   task_id: 5,
 *   sprint_id: 'sprint-001',
 *   stage: 'IMPLEMENT',
 *   attempt: 1
 * });
 */
export function createSessionWithStage(
  workspaceRoot: string,
  input: CreateSessionWithStageInput,
): SessionWithContinuation;

/**
 * Update session continuation metadata
 *
 * Updates parent session when child is created:
 * - Sets is_continued = true
 * - Sets continued_at if first continuation
 * - Increments continuation_count
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Parent session UUID
 */
export function markSessionAsContinued(
  workspaceRoot: string,
  sessionId: string,
): void;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate continuation is allowed
 *
 * Checks:
 * - Parent session exists
 * - Parent status is completed or failed
 * - Continuation depth < 5
 * - Same task_id and role
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Parent session UUID
 * @param newRole New session role
 * @throws Error if validation fails
 */
function validateContinuation(
  workspaceRoot: string,
  sessionId: string,
  newRole: "orchestrator" | "implementor" | "controller",
): void;

/**
 * Validate session stage transition
 *
 * Ensures stage transitions are valid:
 * - PREPARE → IMPLEMENT
 * - IMPLEMENT → VERIFY
 * - VERIFY → IMPLEMENT_FIX (continuation)
 * - etc.
 *
 * @param fromStage Current stage
 * @param toStage New stage
 * @throws Error if transition invalid
 */
function validateStageTransition(
  fromStage: SessionStage | null,
  toStage: SessionStage,
): void;

// ============================================================================
// Performance Characteristics
// ============================================================================

/**
 * Expected performance:
 *
 * - continueSession: <300ms (copy 100 messages + create session)
 * - getSessionChain: <200ms (recursive CTE for 5-level chain)
 * - getLatestImplementorSession: <50ms (indexed query)
 * - getSessionDepth: <100ms (recursive parent traversal)
 *
 * Index usage:
 * - idx_sessions_parent for continuation chain traversal
 * - idx_sessions_task_stage for stage-based queries
 */

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example: Orchestrator continues implementor session after verification fails
 *
 * ```typescript
 * // 1. Orchestrator verifies Task 5
 * const verificationSession = runVerification(taskId: 5);
 * const judgment = verifyImplementation(verificationSession);
 *
 * if (judgment === 'FAIL') {
 *   // 2. Get latest implementor session for task
 *   const implementorSession = getLatestImplementorSession(workspaceRoot, 5);
 *
 *   if (!implementorSession) {
 *     throw new Error('No implementor session found to continue');
 *   }
 *
 *   // 3. Continue implementor session with feedback
 *   const continuedSession = continueSession(
 *     workspaceRoot,
 *     implementorSession.id,
 *     `Verification failed:\n- Missing password hashing\n- No input validation\n\nPlease fix these issues.`,
 *     'IMPLEMENT_FIX'
 *   );
 *
 *   // 4. Resume implementor agent with continued session
 *   const result = await AgentRunner.resumeSession(continuedSession.id);
 * }
 * ```
 */

/**
 * Example: Get session chain for debugging
 *
 * ```typescript
 * const chain = getSessionChain(workspaceRoot, sessionId);
 *
 * console.log('Session Chain:');
 * for (const session of chain) {
 *   const messageCount = getSessionStats(workspaceRoot, session.id).messageCount;
 *   console.log(`  ${session.stage} (attempt ${session.attempt}): ${messageCount} messages`);
 * }
 *
 * // Output:
 * // Session Chain:
 * //   IMPLEMENT (attempt 1): 47 messages
 * //   IMPLEMENT_FIX (attempt 2): 53 messages
 * //   IMPLEMENT_FIX (attempt 3): 61 messages
 * ```
 */
