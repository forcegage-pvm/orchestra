/**
 * Shared prompt context types for PromptBuilder and prompt templates.
 */

/**
 * Task information for prompt context
 */
export interface Task {
  task_id: number;
  title: string;
  category?: string;
  phase_id?: string;
  description: string;
  status?: string;
  /** Whether this is a TDD red-phase task (tests should fail) */
  tdd_red_phase?: boolean;
}

/**
 * Sprint information for prompt context
 */
export interface Sprint {
  sprint_id: string;
  title: string;
  status?: string;
}

/**
 * Context for generating workflow stage prompts (task-level)
 */
export interface PromptContext {
  /** The task being worked on */
  task: Task;

  /** The sprint the task belongs to */
  sprint: Sprint;

  /** Path to the task handover file (for IMPLEMENT/VERIFY stages) */
  handoverPath?: string;

  /** Path to feedback file (for RETRY stage) */
  feedbackPath?: string;

  /** Current retry attempt number (for RETRY stage, used with maxRetries for 'N of M' display) */
  retryCount?: number;

  /** Maximum retry attempts allowed (for RETRY stage, enables 'Attempt N of M' messaging) */
  maxRetries?: number;

  /** Review attempt number (for Controller review stages) */
  reviewAttempt?: number;
}

/**
 * Context for sprint-level review prompts (no task required)
 */
export interface SprintReviewContext {
  /** The sprint being reviewed */
  sprint: Sprint;

  /** Review attempt number */
  reviewAttempt?: number;
}

export interface CodeReviewContext {
  status: string;
  summary?: string | null;
  reviewId?: number;
}
