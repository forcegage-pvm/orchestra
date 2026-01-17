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

  /** Current retry attempt number (for RETRY stage, used with maxRetries for 'N of M' display) */
  retryCount?: number;

  /** Maximum retry attempts allowed (for RETRY stage, enables 'Attempt N of M' messaging) */
  maxRetries?: number;
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

  /**
   * Build a RETRY stage prompt for the implementor
   *
   * Instructs the implementor to use MCP tools (get_current_task, get_feedback,
   * signal_completion) to retrieve their original handover, read verification
   * failure feedback, fix ALL issues, and re-signal completion.
   *
   * @param context - The prompt context containing task, feedback path, and retry count
   * @returns A structured prompt string for the implementor
   */
  buildRetryPrompt(context: PromptContext): string {
    const { task, feedbackPath, retryCount = 1 } = context;

    return `As Implementor, your work on Task ${task.task_id}: "${task.title}" did not pass verification. You must fix the issues and retry.

## Retry Attempt ${retryCount}

## Your Task
Use your MCP tools to address the verification failures:

1. \`get_current_task\` - Get your original task handover with:
   - Acceptance criteria (what defines success)
   - File operations (CREATE/UPDATE/DELETE)
   - Deliverables (what you must produce)
   - Context files (background information)

2. \`get_feedback\` - Retrieve verification failure feedback explaining:
   - What went wrong (specific issues found)
   - What worked (checks that passed)
   - Guidance on how to fix the issues${
     feedbackPath ? `\n   - **Feedback**: ${feedbackPath}` : ""
   }

3. Read the feedback CAREFULLY and address ALL issues

4. Fix your implementation based on the feedback

5. \`signal_completion\` - Re-signal when done with:
   - List of artifacts (files created/modified)
   - Summary of fixes applied
   - Build and test status

## Task Details
- **ID**: ${task.task_id}
- **Title**: ${task.title}

## CRITICAL: Read and Fix ALL Feedback
The orchestrator found specific issues with your implementation. You must:
- Read the entire feedback document carefully
- Understand what failed and why
- Address EVERY issue mentioned in the feedback
- Test your fixes thoroughly before re-signaling
- Remember you are still verified against criteria you cannot see

Do not skip any feedback items. Incomplete fixes will result in another FAIL.`;
  }

  /**
   * Build a SPRINT_REVIEW prompt for the controller
   *
   * Instructs the controller to use MCP tools (review_sprint_config, approve_sprint,
   * reject_sprint) to review the sprint configuration against the specification.
   *
   * @param context - The prompt context containing sprint details
   * @returns A structured prompt string for the controller
   */
  buildSprintReviewPrompt(context: PromptContext): string {
    const { sprint, reviewAttempt = 1 } = context;

    return `As Controller, review Sprint "${sprint.title}" (ID: ${sprint.sprint_id}) for specification alignment.

## Your Task
Use your MCP tools to perform a comprehensive sprint review:

1. \`review_sprint_config\` - Analyze the sprint configuration:
   - Task breakdown completeness (all spec requirements covered?)
   - Task descriptions clarity and specificity
   - Dependencies correctness and logical ordering
   - Verification criteria adequacy
   - TDD task separation (red/green phases distinct?)
   - Category assignments appropriateness

2. Check against specification:
   - All specified features have corresponding tasks
   - No tasks implement features not in specification
   - Task granularity is appropriate (not too broad/narrow)
   - Technical approach aligns with architectural constraints

3. Make your decision:
   - \`approve_sprint\` - If configuration fully aligns with specification
   - \`reject_sprint\` - If issues found requiring revision

## Sprint Context
- **Sprint ID**: ${sprint.sprint_id}
- **Sprint Title**: ${sprint.title}
- **Review Attempt**: ${reviewAttempt}${sprint.status === "SPEC_REVIEW_FAILED" ? "\n- **Status**: Previous review REJECTED - address prior feedback" : ""}

## Review Standards
- **Completeness**: Every spec requirement has corresponding task(s)
- **Faithfulness**: No tasks implement unspecified features
- **Clarity**: Task descriptions are specific and actionable
- **Testability**: Verification criteria are measurable
- **Feasibility**: Technical approach is sound given constraints

## Decision Guidance
**APPROVE** if:
- All spec requirements covered by tasks
- Task breakdown is logical and complete
- Verification criteria are adequate
- No specification violations

**REJECT** if:
- Missing tasks for spec requirements
- Tasks implementing unspecified features
- Unclear or overly broad task descriptions
- Inadequate verification criteria
- Logical dependency issues

Provide detailed, actionable feedback for any issues found.`;
  }
}
