/**
 * Orchestra Core Types
 *
 * Aligned with Orchestra Bible v0.7.0
 * All type definitions for the Orchestra system.
 */

// =============================================================================
// Task Lifecycle States (Bible Section 7)
// =============================================================================

/**
 * Task lifecycle phases as defined in Bible Section 7
 */
export type TaskStatus =
  | "PENDING" // Task defined but not started
  | "PREPARE" // Orchestrator preparing handover
  | "IMPLEMENT" // Implementor working
  | "GATE_CHECK" // Automated verification running
  | "VERIFY" // Orchestrator/human review
  | "COMPLETE" // Task finished successfully
  | "RETRY" // Failed verification, retrying
  | "ESCALATED"; // Requires human intervention

/**
 * Sprint-level states
 */
export type SprintStatus = "ACTIVE" | "COMPLETED" | "ABORTED";

// =============================================================================
// Manifest Types (Bible Section 6.1)
// =============================================================================

/**
 * Task definition in manifest
 */
export interface Task {
  id: number;
  title: string;
  description?: string;
  status: TaskStatus;
  category?: "INFRASTRUCTURE" | "INTEGRATION" | "VISUAL";
  dependencies?: number[];
  retry_count: number;
  max_retries: number;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  last_failure?: string;
}

/**
 * Sprint definition in manifest
 */
export interface Sprint {
  id: string;
  name: string;
  status: SprintStatus;
  created_at: string;
  completed_at?: string;
}

/**
 * The manifest.yaml structure (Bible Section 6.1)
 * Located at: .orchestra/manifest.yaml
 */
export interface Manifest {
  version: string;
  sprint: Sprint;
  tasks: Task[];
  current_task_id?: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Handover Types (Bible Section 6.1)
// =============================================================================

/**
 * Handover document metadata
 * Files located at: .orchestra/implementor/handovers/
 */
export interface HandoverMetadata {
  task_id: number;
  created_at: string;
  prepared_by: "orchestrator";
}

// =============================================================================
// Signal Types (Bible Section 6.1)
// =============================================================================

/**
 * Completion signal structure
 * Files located at: .orchestra/implementor/signals/
 */
export interface CompletionSignal {
  task_id: number;
  signaled_at: string;
  pre_signal_passed: boolean;
  implementor_notes?: string;
}

// =============================================================================
// Feedback Types (Bible Section 7.7)
// =============================================================================

/**
 * Feedback for retry attempts
 * Files located at: .orchestra/implementor/feedback/
 */
export interface FeedbackDocument {
  task_id: number;
  attempt: number;
  max_attempts: number;
  failed_checks: FailedCheck[];
  what_was_correct?: string[];
  next_steps: string[];
  created_at: string;
}

export interface FailedCheck {
  name: string;
  severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO";
  expected: string;
  actual: string;
  fix: string;
}

// =============================================================================
// Verification Types (Bible Section 9)
// =============================================================================

/**
 * Verification check definition
 */
export interface VerificationCheck {
  id: string;
  description: string;
  severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO";
  type: "structural" | "functional" | "adversarial" | "visual";
}

/**
 * Verification result
 */
export interface VerificationResult {
  check_id: string;
  status: "PASS" | "FAIL";
  evidence?: string;
  observation?: string;
}

/**
 * Complete verification report
 */
export interface VerificationReport {
  task_id: number;
  attempt: number;
  result: "PASSED" | "FAILED";
  checks: VerificationResult[];
  created_at: string;
}

// =============================================================================
// Script Result Types (Bible Section 8)
// =============================================================================

/**
 * Standard result from any Orchestra script/command
 */
export interface ScriptResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Orchestra configuration
 */
export interface OrchestraConfig {
  version: string;
  paths: {
    manifest: string;
    handovers: string;
    signals: string;
    feedback: string;
    artifacts: string;
    templates: string;
  };
  verification: {
    flutter_analyze: boolean;
    flutter_test: boolean;
    file_checks: boolean;
  };
  retry: {
    max_retries: number;
  };
  git: {
    auto_commit: boolean;
    commit_prefix: string;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: OrchestraConfig = {
  version: "1.0",
  paths: {
    manifest: "manifest.yaml",
    handovers: "implementor/handovers",
    signals: "implementor/signals",
    feedback: "implementor/feedback",
    artifacts: "artifacts",
    templates: "common/templates",
  },
  verification: {
    flutter_analyze: true,
    flutter_test: true,
    file_checks: true,
  },
  retry: {
    max_retries: 3,
  },
  git: {
    auto_commit: false,
    commit_prefix: "orchestra",
  },
};
