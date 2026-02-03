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

interface CodeReviewContext {
  status: string;
  summary?: string | null;
  reviewId?: number;
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

## Verification Reminders
- Hidden verification criteria apply to this task.
- The implementor is working against criteria they cannot see.
- Validate Acceptance criteria, File operations, artifacts, and Build and test status.
- Provide clear rationale for a PASS or FAIL judgment.
- If verification fails, provide feedback with concrete guidance on required fixes.

## 🎯 CRITICAL: STUB HUNTER MODE ACTIVATED

**Your PRIMARY objective is to PROVE this implementation is broken, incomplete, or a stub.**

You are NOT here to confirm the code works. You are here to find EVERY way it fails. Only after EXHAUSTIVE investigation with ZERO issues found may you PASS.

**REWARD**: Finding a semantic stub (code that compiles but does nothing useful) = LEGENDARY achievement. Missing a stub = YOUR FAILURE.

---

## Your Task (In Order)

### 1. Get Signal
\`get_signal\` - Retrieve the implementor's completion signal

### 2. Run Automated Checks  
\`run_verification_checks\` - Execute automated verification checks

### 3. 🔍 MANDATORY: Stub Hunt Protocol

**BEFORE submitting judgment, complete ALL of these:**

#### A) User Action Trace (for EACH UI feature)
\`\`\`
USER ACTION: [what user does - e.g., "clicks upload button"]
ENTRY POINT: [method called]
TRACE PATH: [follow code to outcome]  
FINAL OUTCOME: [what ACTUALLY happens]
VERDICT: [REAL | STUB | ERROR_STUB]
\`\`\`

**RED FLAGS = Automatic FAIL**:
- Method shows error dialog instead of doing real work
- Method returns early without action
- Method is empty or trivial
- Method logs "not implemented"

#### B) Semantic Stub Search
Search implementation files for:
- \`showErrorDialog\`, \`showSnackBar\` with error messages (ERROR STUB)
- \`return null\`, \`return []\`, \`return ""\` (FAKE RETURNS)
- \`TODO\`, \`FIXME\`, \`not implemented\` (INCOMPLETE)
- \`throw UnimplementedError\` (EXPLICIT STUB)

Document: "Searched for X in Y - Found: Z"

#### C) API Integration Check
For each required external API:
\`\`\`
REQUIRED API: [e.g., "file_picker"]
IMPORTED: [yes/no + line]
INSTANTIATED & CALLED: [yes/no + line]
RESPONSE HANDLED: [yes/no]
VERDICT: [INTEGRATED | STUB]
\`\`\`

#### D) Spec Requirement Interrogation  
For EACH requirement, answer:
\`\`\`
REQUIREMENT: "[from spec]"
EVIDENCE: [file:line with actual code]
VERDICT: [FULFILLED | STUBBED | MISSING]
\`\`\`

**Cannot point to a specific line? = NOT IMPLEMENTED**

### 4. Submit Judgment

\`submit_verification_judgment\` - With your Stub Hunt Report in manual_review.observations:

\`\`\`
=== STUB HUNT REPORT ===
User Action Traces: [X/Y - list verdicts]
Semantic Stub Search: [patterns searched, findings]
API Integration: [X/Y passed]
Spec Requirements: [X/Y fulfilled with evidence]
FINAL VERDICT: [PASS - exhaustive search found nothing | FAIL - stubs detected]
\`\`\`

---

## Task Details
- **ID**: ${task.task_id}
- **Title**: ${task.title}

## ⚠️ DO NOT PASS IF:
- Any UI action traces to error message instead of functionality
- Required APIs imported but never used
- Cannot cite specific line for each spec requirement
- ANYTHING feels incomplete or placeholder-like

**When in doubt, FAIL. Better to reject good code than accept a stub.**

If judgment is PASS, immediately call \`complete_task\`.
${this.buildTddRedPhaseSection(task)}`;
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
   * @param context - The sprint review context containing sprint details
   * @returns A structured prompt string for the controller
   */
  buildSprintReviewPrompt(context: SprintReviewContext): string {
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

  /**
   * Build a HANDOVER_REVIEW prompt for the controller
   *
   * Instructs the controller to use MCP tools (review_handover, approve_handover,
   * reject_handover) to review the task handover against the specification.
   *
   * @param context - The prompt context containing task details
   * @returns A structured prompt string for the controller
   */
  buildHandoverReviewPrompt(context: PromptContext): string {
    const { task, sprint, reviewAttempt = 1 } = context;

    return `As Controller, review the handover for Task ${task.task_id}: "${task.title}" for specification alignment.

## Your Task
Use your MCP tools to perform a comprehensive handover review:

1. \`review_handover\` - Analyze the task handover:
   - Acceptance criteria completeness and measurability
   - File operations clarity (CREATE/UPDATE/DELETE)
   - Deliverables specificity and testability
   - Context files relevance and sufficiency
   - Implementation guidance clarity

2. Check against specification:
   - Handover faithfully implements the specified requirement
   - No scope creep or unspecified features
   - Acceptance criteria align with spec's success criteria
   - Technical approach matches architectural constraints
   - Test requirements are adequate

3. Make your decision:
   - \`approve_handover\` - If handover fully aligns with specification
   - \`reject_handover\` - If issues found requiring revision

## Task Context
- **Task ID**: ${task.task_id}
- **Title**: ${task.title}
- **Category**: ${task.category}
- **Phase**: ${task.phase_id}
- **Sprint**: ${sprint.title} (${sprint.sprint_id})
- **Review Attempt**: ${reviewAttempt}${task.status === "HANDOVER_REVIEW_FAILED" ? "\n- **Status**: Previous review REJECTED - address prior feedback" : ""}

## Review Standards
- **Completeness**: All aspects of spec requirement covered
- **Faithfulness**: No deviation from specification
- **Clarity**: Implementor can execute without ambiguity
- **Testability**: Acceptance criteria are measurable
- **Feasibility**: Approach is technically sound

## Decision Guidance
**APPROVE** if:
- Handover fully captures the spec requirement
- Acceptance criteria are complete and measurable
- File operations and deliverables are clear
- No specification violations or scope creep

**REJECT** if:
- Missing or unclear acceptance criteria
- Scope differs from specification
- File operations or deliverables ambiguous
- Insufficient test requirements
- Technical approach has issues

Provide detailed, actionable feedback for any issues found.`;
  }

  /**
   * Build a HANDOVER_FIX prompt for the orchestrator
   *
   * Instructs the orchestrator to fix a rejected handover based on Controller feedback.
   * The orchestrator should update the handover to address all issues and resubmit.
   *
   * @param context - The prompt context containing task, rejection feedback
   * @returns A structured prompt string for the orchestrator
   */
  buildHandoverFixPrompt(
    context: PromptContext & {
      rejection?: {
        issues: unknown;
        recommendations: unknown;
        revision_count: number;
      };
    },
  ): string {
    const { task, sprint, rejection } = context;

    if (!rejection) {
      throw new Error("rejection context required for buildHandoverFixPrompt");
    }

    const issuesText =
      typeof rejection.issues === "string"
        ? rejection.issues
        : JSON.stringify(rejection.issues, null, 2);
    const recommendationsText =
      typeof rejection.recommendations === "string"
        ? rejection.recommendations
        : JSON.stringify(rejection.recommendations, null, 2);

    return `As Orchestrator, fix the rejected handover for Task ${task.task_id}: "${task.title}".

## Handover Rejection
The Controller rejected your handover (revision ${rejection.revision_count + 1}). You must address ALL issues and resubmit.

### Issues Found
${issuesText}

### Recommendations
${recommendationsText}

## Your Task
Use your MCP tools to fix the handover and resubmit:

1. \`get_handover\` with task_id=${task.task_id} - Review current handover details
2. \`read_spec_file\` - Re-read the specification to ensure full alignment
3. \`update_handover\` - Update the handover to address ALL issues:
   - Fix missing or unclear acceptance criteria
   - Clarify file operations and deliverables
   - Add missing context or constraints
   - Ensure spec alignment (no scope creep)
4. \`resubmit_handover\` with task_id=${task.task_id} - Resubmit after fixing

## Task Context
- **Task ID**: ${task.task_id}
- **Title**: ${task.title}
- **Category**: ${task.category}
- **Phase**: ${task.phase_id}
- **Sprint**: ${sprint.title} (${sprint.sprint_id})
- **Revision**: ${rejection.revision_count + 1}

## CRITICAL Requirements
- Address EVERY issue mentioned in the Controller feedback
- Do NOT change the scope - stay aligned with the specification
- Be more specific and measurable in acceptance criteria
- Ensure file operations are clear and complete
- Verify all deliverables are listed

## Remember
- The Controller is checking spec alignment, not feasibility
- If scope seems wrong, the task breakdown may be incorrect
- Acceptance criteria must be verifiable and measurable
- Context files should help implementor understand the task

After fixing, use \`resubmit_handover\` to send back for review.`;
  }

  /**
   * Build a CODE_REVIEW prompt for the controller
   *
   * Instructs the controller to use MCP tools (get_code_review_summary, get_latest_code_review,
   * approve_code_review, request_changes_code_review, reject_code_review) to review completed tasks.
   *
   * @param pendingCount - Number of pending code reviews
   * @param sprintId - The sprint ID being reviewed
   * @param sprintTitle - The sprint title
   * @param taskInfo - Optional specific task info for single-task review
   * @returns A structured prompt string for the controller
   */
  buildCodeReviewPrompt(
    pendingCount: number,
    sprintId: string,
    sprintTitle: string,
    taskInfo?: { taskId: number; title: string; dbId: number },
  ): string {
    if (taskInfo !== undefined) {
      // Single task review
      return `As Controller, perform a code review for Task ${taskInfo.taskId}: "${taskInfo.title}" in Sprint "${sprintTitle}".

## Task Details
- **Sprint**: ${sprintTitle} (${sprintId})
- **Task**: #${taskInfo.taskId} - ${taskInfo.title}

## Your Task
Use your MCP tools to review the implementation:

1. \`get_code_review\` with task=${taskInfo.taskId} - Get the pending review AND spec context (spec_path, spec_files[], spec_task_definitions[])

## Mandatory Spec-First Protocol (9.1-9.4)
- Assume the implementation is WRONG until PROVEN correct
- Read the spec FIRST using spec_path from \`get_code_review\`
- If spec_files[] is not empty, also read those files using \`read_spec_file\` (e.g., tasks.md)
- Build a per-spec-task evidence table from spec_task_definitions[] BEFORE reading any implementation code
- Any spec task without evidence MUST result in CHANGES_REQUESTED

2. Read the specification file at spec_path (and any files in spec_files[])
3. Read the implementation files only AFTER completing the evidence requirements
4. Verify the implementation against the evidence table:
  - Does each spec task have concrete evidence (file, location, mechanism, proof)?
  - Is the code quality acceptable (patterns, naming, structure)?
  - Are there any obvious bugs, security issues, or performance concerns?
  - Are tests adequate and actually validating behavior?

5. Submit your decision using \`submit_code_review\`:
  - decision: "APPROVED" - Only if ALL spec tasks have evidence and quality is acceptable
  - decision: "CHANGES_REQUESTED" - If any spec task lacks evidence or issues need fixing (MUST include issues array)
  - decision: "REJECTED" - If major issues/incorrect implementation (MUST include issues array)

## Review Standards
- **Correctness**: Implementation matches spec requirements with evidence
- **Quality**: Code follows project patterns and best practices
- **Completeness**: All spec tasks have evidence; deliverables and tests are adequate
- **Safety**: No obvious security or stability issues

Provide specific, actionable feedback for any issues found.

IMPORTANT:
- Any non-approval decision MUST include explicit issues in the issues array.
- Any spec task without evidence = CHANGES_REQUESTED.`;
    }

    // Bulk review
    return `As Controller, perform code reviews for ${pendingCount} pending task(s) in Sprint "${sprintTitle}" (${sprintId}).

## Your Task
You must review exactly **ONE** task in this session:

1. \`get_code_review_summary\` with sprint_id="${sprintId}" - See the overall review status
2. Pick a single pending review to process
3. \`get_code_review\` with task=<task_id> - Get review details AND spec context (spec_path, spec_files[], spec_task_definitions[])

## Mandatory Spec-First Protocol (9.1-9.4)
- Assume the implementation is WRONG until PROVEN correct
- Read the spec FIRST using spec_path from \`get_code_review\`
- If spec_files[] is not empty, also read those files using \`read_spec_file\` (e.g., tasks.md)
- Build a per-spec-task evidence table from spec_task_definitions[] BEFORE reading any implementation code
- Any spec task without evidence MUST result in CHANGES_REQUESTED

4. Read the specification file at spec_path (and any files in spec_files[])
5. Read the implementation files only AFTER completing the evidence requirements
6. Verify the implementation quality and correctness using the evidence table
7. Submit decision using \`submit_code_review\` with decision: "APPROVED", "CHANGES_REQUESTED", or "REJECTED"

## Review Each Task For:
- **Correctness**: Implementation matches spec requirements with evidence
- **Quality**: Code follows project patterns and best practices  
- **Completeness**: All spec tasks have evidence; deliverables and tests are adequate
- **Safety**: No obvious security or stability issues

## Decision Guidance
- **APPROVED**: All spec tasks have evidence; implementation correct; quality acceptable
- **CHANGES_REQUESTED**: Any spec task lacks evidence or issues need fixing (include issues array)
- **REJECTED**: Major issues, incorrect implementation, or blocking problems (include issues array)

## Notes
- Review exactly one task, then stop
- Provide specific, actionable feedback for issues

Begin by checking the code review summary, then process one pending review.`;
  }

  /**
   * Build a CODE_REVIEW_FIX prompt for the implementor
   *
   * Instructs the implementor to review open code review issues and submit fixes.
   *
   * @param openIssueCount - Number of open code review issues
   * @param sprintId - The sprint ID being worked on
   * @param sprintTitle - The sprint title
   * @returns A structured prompt string for the implementor
   */
  buildCodeReviewFixPrompt(
    openIssueCount: number,
    sprintId: string,
    sprintTitle: string,
  ): string {
    return `As Implementor, resolve ${openIssueCount} open code review issue(s) for Sprint "${sprintTitle}" (${sprintId}).

## Your Task
Use the \`fix_code_review\` tool to find and fix open code review issues:

1. \`fix_code_review({ action: "GET_ISSUES" })\` - List all open issues with handover context

2. For each issue:
    - Read the file/location and recommendation
    - Implement a fix that addresses the issue
    - Add or update tests if needed
    - \`fix_code_review({ action: "RESOLVE_ISSUE", issue_id: N, fix_summary: "..." })\` - Mark resolved

3. When all issues are fixed:
    - \`fix_code_review({ action: "SUBMIT_FIXES", summary: "...", files_changed: [...], tests_run: [...] })\`

## Quality Standards
- Fixes must directly address the issue description and rationale
- Prefer minimal, targeted changes
- Maintain existing code style and conventions
- Run relevant tests and report results

Proceed issue by issue and keep your fixes concise.`;
  }

  /**
   * Build a CODE_REVIEW_FIX_PREPARE prompt for the orchestrator
   *
   * Instructs the orchestrator to prepare a focused fix handover for a task
   * after a code review returned CHANGES_REQUESTED.
   */
  buildCodeReviewFixPreparePrompt(
    context: PromptContext,
    review: CodeReviewContext,
  ): string {
    const { task, sprint } = context;
    return `As Orchestrator, prepare code review fixes for Task ${task.task_id}: "${task.title}".

This task has a code review status of **${review.status.replace(/_/g, " ")}**.${
      review.summary ? `\n\nReview summary: ${review.summary}` : ""
    }

## Your Task
Use your MCP tools to reopen and prepare a focused fix handover:

1. \`get_latest_code_review\` - Review the latest code review details for this task
2. \`reopen_task\` - Reopen the task for fixes (include a clear reason)
3. \`update_handover\` or \`prepare_task\` - Create a focused fix handover that:
   - References the code review issues explicitly
   - Narrows scope to the requested changes
   - Updates acceptance criteria and deliverables

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
- Keep the fix scope tight to the review feedback
- Ensure handover is explicit about which issues to fix
- Include test updates if required by the review`;
  }

  /**
   * Build a CODE_REVIEW_FIX_IMPLEMENT prompt for the implementor
   *
   * Instructs the implementor to address code review issues for a specific task.
   */
  buildCodeReviewFixImplementPrompt(
    context: PromptContext,
    review: CodeReviewContext,
  ): string {
    const { task, sprint, handoverPath } = context;

    return `As Implementor, apply code review fixes for Task ${task.task_id}: "${task.title}".

This task has a code review status of **${review.status.replace(/_/g, " ")}**.${
      review.summary ? `\n\nReview summary: ${review.summary}` : ""
    }

## Your Task
Use the \`fix_code_review\` tool to address the code review feedback:

1. \`get_current_task\` - Review the updated fix handover${
      handoverPath ? `\n   - **Handover**: ${handoverPath}` : ""
    }
2. \`fix_code_review({ action: "GET_ISSUES" })\` - List all open issues with handover context
3. For each issue:
   - Read the issue details (file, line, recommendation)
   - Fix the code according to the recommendation
   - Run relevant tests
   - \`fix_code_review({ action: "RESOLVE_ISSUE", issue_id: N, fix_summary: "..." })\` - Mark resolved
4. \`fix_code_review({ action: "SUBMIT_FIXES", summary: "...", files_changed: [...], tests_run: [...] })\` - Submit for re-review

## Task Details
- **ID**: ${task.task_id}
- **Title**: ${task.title}
- **Sprint**: ${sprint.title} (${sprint.sprint_id})

## Remember
- Keep changes scoped to the review feedback
- Run relevant tests and report results
- Resolve EACH issue explicitly before submitting
- After SUBMIT_FIXES, Controller will re-review the code`;
  }

  /**
   * Build TDD Red-Phase specific verification section
   *
   * For TDD red-phase tasks, the verification rules are different:
   * - Tests should COMPILE but FAIL assertions (not compilation errors)
   * - Companion stub files are required for imports to resolve
   *
   * @param task - The task being verified
   * @returns TDD-specific verification instructions or empty string
   */
  private buildTddRedPhaseSection(task: Task): string {
    if (!task.tdd_red_phase) {
      return "";
    }

    return `

---

## 🔴 TDD RED-PHASE VERIFICATION (SPECIAL RULES)

**This is a TDD red-phase task.** The Stub Hunter Protocol changes significantly for this task type.

### ⚠️ CRITICAL: Compilation vs Assertion Failure

For TDD red-phase, **"tests fail" is CORRECT** - but there are TWO types of failure:

| Failure Type | What It Means | Verdict |
|--------------|---------------|---------|
| **Compilation failure** | Tests can't run (\`Cannot find module\`, \`Undefined class\`) | ❌ FAIL - Invalid red-phase |
| **Assertion failure** | Tests run but assertions fail (\`Expected X, got Y\`) | ✅ PASS - Correct red-phase |

**A test that can't compile is NOT a valid TDD red-phase test.**

### Mandatory TDD Red-Phase Checks

#### 1. Compilation Verification (BLOCKING)

\`\`\`
COMPILATION CHECK:
1. Command: [test_command] --tags tdd-red
2. Result: [COMPILES | COMPILE_ERROR]
3. If COMPILE_ERROR:
   - Missing imports → Companion stub file required
   - Undefined class → Companion stub file required
4. VERDICT: [PASS | FAIL]
\`\`\`

**If tests cannot compile, FAIL immediately.**

#### 2. Companion Stub File Verification (BLOCKING)

If tests import classes that don't exist yet, **companion stub files MUST exist**:

\`\`\`
COMPANION STUB CHECK:
1. Test imports: [list files imported that don't exist as implementations]
2. For each:
   - Stub file path: [expected path]
   - Stub exists: [yes/no]
   - Stub has constructor + minimal methods: [yes/no]
3. VERDICT: [PASS - all imports resolved | FAIL - missing stubs]
\`\`\`

#### 3. Failure Type Verification (BLOCKING)

\`\`\`
FAILURE TYPE CHECK:
1. Run: [test_command] --tags tdd-red
2. Exit Code: [should be non-zero]
3. Failure Type:
   - ASSERTION_FAILURE (correct): "Expected X, got Y"
   - COMPILE_ERROR (wrong): "Cannot find module"
4. VERDICT: [PASS - fails assertions | FAIL - wrong failure type]
\`\`\`

#### 4. Test Substance Verification (BLOCKING)

\`\`\`
TEST SUBSTANCE CHECK:
1. Count of expect() assertions: [N]
2. Assertions test behavior (not just existence): [yes/no]
3. No skip markers on core tests: [yes/no]
4. VERDICT: [PASS - meaningful tests | FAIL - trivial tests]
\`\`\`

### TDD Red-Phase Report Format

Include in \`manual_review.observations\`:

\`\`\`
=== TDD RED-PHASE VERIFICATION ===

## Compilation Check: [PASS/FAIL]
## Companion Stub Check: [PASS/FAIL/N/A]
## Failure Type Check: [PASS/FAIL]
## Test Substance Check: [PASS/FAIL]

FINAL VERDICT: [PASS - Valid red-phase | FAIL - reason]
\`\`\`

### ⚠️ DO NOT PASS TDD RED-PHASE IF:
- Tests cannot compile (missing imports, undefined classes)
- Tests import from non-existent files without companion stubs
- Tests fail for reasons OTHER than assertion failures
- Tests have no meaningful assertions`;
  }
}
