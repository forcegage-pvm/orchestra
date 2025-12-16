/**
 * PromptBuilder - Generates structured prompts for workflow stages
 *
 * Creates context-rich prompts for orchestrator and implementor agents,
 * guiding them through each workflow stage (PREPARE, IMPLEMENT, VERIFY, RETRY).
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
}

/**
 * Sprint information for prompt context
 */
export interface Sprint {
  sprint_id: string;
  title: string;
}

/**
 * Context for generating workflow stage prompts
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

  /** Number of retry attempts made (for RETRY stage) */
  retryCount?: number;
}

/**
 * PromptBuilder generates structured prompts for each workflow stage
 */
export class PromptBuilder {
  /**
   * Build a PREPARE stage prompt for the orchestrator
   *
   * Instructs the orchestrator to use MCP tools (get_task, prepare_task)
   * to prepare the task with handover and hidden verification criteria.
   *
   * @param context - The prompt context containing task and sprint details
   * @returns A structured prompt string for the orchestrator
   */
  buildPreparePrompt(context: PromptContext): string {
    const { task, sprint } = context;

    return `As Orchestrator, prepare Task ${task.task_id}: "${task.title}".

## Your Task
Use your MCP tools to prepare this task for implementation:

1. \`get_task\` - Review the task specification and verification criteria
2. \`prepare_task\` - Create a comprehensive handover with:
   - Clear acceptance criteria
   - File operations (CREATE/UPDATE/DELETE)
   - Deliverables list
   - Context files to reference

## Task Details
- **ID**: ${task.task_id}
- **Title**: ${task.title}
${task.category ? `- **Category**: ${task.category}\n` : ""}${
      task.phase_id ? `- **Phase**: ${task.phase_id}\n` : ""
    }
## Sprint Context
- **Sprint ID**: ${sprint.sprint_id}
- **Sprint Title**: ${sprint.title}

## Description
${task.description}

## Remember
- Create verification criteria that the implementor CANNOT see
- Be specific about expected file changes
- Include test requirements
- Reference relevant context files from the codebase`;
  }

  /**
   * Build an IMPLEMENT stage prompt for the implementor
   *
   * Instructs the implementor to use MCP tools (get_current_task, signal_completion)
   * to receive their handover and complete the task implementation.
   *
   * @param context - The prompt context containing task and handover details
   * @returns A structured prompt string for the implementor
   */
  buildImplementPrompt(context: PromptContext): string {
    const { task, handoverPath } = context;

    return `As Implementor, you are assigned Task ${task.task_id}: "${
      task.title
    }".

## Your Task
Use your MCP tools to implement this task:

1. \`get_current_task\` - Get your task handover with:
   - Acceptance criteria (what defines success)
   - File operations (CREATE/UPDATE/DELETE)
   - Deliverables (what you must produce)
   - Context files (background information)

2. Follow the handover instructions carefully${
      handoverPath ? `\n   - **Handover**: ${handoverPath}` : ""
    }

3. Implement the task following all acceptance criteria

4. \`signal_completion\` - Signal when done with:
   - List of artifacts (files created/modified)
   - Summary of work completed
   - Build and test status

## Task Details
- **ID**: ${task.task_id}
- **Title**: ${task.title}

## Remember
- Read ALL acceptance criteria before starting
- Follow the handover specifications exactly
- Test your implementation thoroughly
- Signal completion only when ALL criteria are met
- You will be verified against criteria you cannot see`;
  }

  /**
   * Build a VERIFY stage prompt for the orchestrator
   *
   * Instructs the orchestrator to use MCP tools (get_signal, run_verification_checks,
   * submit_verification_judgment) to retrieve the implementor's completion signal,
   * run automated verification checks, and record a PASS or FAIL judgment.
   *
   * @param context - The prompt context containing task details
   * @returns A structured prompt string for the orchestrator
   */
  buildVerifyPrompt(context: PromptContext): string {
    const { task } = context;

    return `As Orchestrator, verify Task ${task.task_id}: "${task.title}".

## Your Task
Use your MCP tools to verify the implementor's work:

1. \`get_signal\` - Retrieve the implementor's completion signal with:
   - List of artifacts (files created/modified)
   - Summary of work completed
   - Build and test status

2. \`run_verification_checks\` - Execute automated verification checks against:
   - Hidden verification criteria (defined during PREPARE)
   - Acceptance criteria compliance
   - File operations (CREATE/UPDATE/DELETE)
   - Build and test requirements

3. \`submit_verification_judgment\` - Record your judgment (PASS or FAIL) with:
   - Clear rationale for the decision
   - Specific issues found (if FAIL)
   - Feedback for the implementor

## Task Details
- **ID**: ${task.task_id}
- **Title**: ${task.title}

## Remember
- The implementor was verified against criteria they cannot see
- Hidden verification criteria ensure genuine implementation quality
- Be thorough and objective in your assessment
- Provide clear, actionable feedback if verification fails
- Your judgment determines if the task moves to COMPLETE or RETRY`;
  }
}
