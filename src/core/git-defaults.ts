/**
 * Git Behavior Defaults Registry
 *
 * Central configuration for per-command git automation behavior.
 * This allows internal control over which commands auto-commit/push
 * without requiring CLI flags or user configuration.
 *
 * Future: These defaults could be overridable via orchestra.yaml
 */

/**
 * Git behavior configuration for a command
 */
export interface CommandGitBehavior {
  /** Always stage files after command completes */
  autoStage: boolean;
  /** Always commit after command completes (implies autoStage) */
  autoCommit: boolean;
  /** Always push after commit */
  autoPush: boolean;
}

/**
 * Registry of git behavior defaults per command
 *
 * Commands not listed here default to no automatic git actions.
 */
export const GIT_BEHAVIOR_REGISTRY: Record<string, CommandGitBehavior> = {
  // Init: Don't auto-commit (user should review structure first)
  init: {
    autoStage: false,
    autoCommit: false,
    autoPush: false,
  },

  // Prepare: Auto-commit handover files
  prepare: {
    autoStage: true,
    autoCommit: true,
    autoPush: false,
  },

  // Complete: Already has --commit/--push flags, keep manual for now
  complete: {
    autoStage: false,
    autoCommit: false,
    autoPush: false,
  },

  // Verify: Read-only, no git actions needed
  verify: {
    autoStage: false,
    autoCommit: false,
    autoPush: false,
  },

  // Accept-signal: Could auto-commit signal acceptance
  "accept-signal": {
    autoStage: false,
    autoCommit: false,
    autoPush: false,
  },

  // Closeout: Could auto-commit closeout report
  closeout: {
    autoStage: false,
    autoCommit: false,
    autoPush: false,
  },
};

/**
 * Default behavior for commands not in registry
 */
const DEFAULT_BEHAVIOR: CommandGitBehavior = {
  autoStage: false,
  autoCommit: false,
  autoPush: false,
};

/**
 * Get git behavior for a command
 *
 * @param command - Command name (e.g., "prepare", "init")
 * @returns Git behavior configuration
 */
export function getCommandGitBehavior(command: string): CommandGitBehavior {
  return GIT_BEHAVIOR_REGISTRY[command] ?? DEFAULT_BEHAVIOR;
}
