/**
 * Prompt text builders for non-template prompts.
 */

import type {
  CodeReviewContext,
  PromptContext,
  SprintReviewContext,
} from "./promptTypes.js";

export function buildSprintReviewPromptText(
  context: SprintReviewContext,
): string {
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

export function buildHandoverReviewPromptText(context: PromptContext): string {
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

export function buildHandoverFixPromptText(
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

export function buildCodeReviewPromptText(
  pendingCount: number,
  sprintId: string,
  sprintTitle: string,
  taskInfo?: { taskId: number; title: string; dbId: number },
): string {
  if (taskInfo !== undefined) {
    return buildSingleTaskCodeReviewPromptText(
      sprintId,
      sprintTitle,
      taskInfo.taskId,
      taskInfo.title,
    );
  }

  return buildBulkCodeReviewPromptText(pendingCount, sprintId, sprintTitle);
}

export function buildCodeReviewReReviewPromptText(
  sprintId: string,
  sprintTitle: string,
  taskInfo: { taskId: number; title: string; dbId: number },
  reviewId: number,
): string {
  return `As Controller, re-review Task ${taskInfo.taskId}: "${taskInfo.title}" after the Implementor submitted fixes.

## Context
- **Sprint**: ${sprintTitle} (${sprintId})
- **Task**: #${taskInfo.taskId} - ${taskInfo.title}
- **Review ID**: ${reviewId}
- **Status**: PENDING_VERIFICATION (fixes have been submitted)

## Your Task
The Implementor has addressed the issues from your previous review. Verify the fixes:

1. \`get_code_review\` with task=${taskInfo.taskId} - Get review details including:
   - Previously reported issues and their resolution status
   - The fix summary provided by the implementor
   - Files changed and tests run

2. For each previously reported issue:
   - Verify the fix addresses the original concern
   - Check that no new issues were introduced
   - Ensure tests cover the fixed code path

3. Submit your decision using \`submit_code_review\` with \`verifying_fixes: true\`:
   - decision: "APPROVED" - All issues have been properly addressed
   - decision: "CHANGES_REQUESTED" - Some issues remain or new issues found (include issues array)
   - decision: "REJECTED" - Fundamental problems remain (include issues array)

Minimal valid issues entry (REQUIRED for CHANGES_REQUESTED/REJECTED):
\`\`\`json
{
  "issues": [
    {
      "severity": "MAJOR",
      "issue": "Describe the problem",
      "rationale": "Why this is a problem and needs fixing"
    }
  ]
}
\`\`\`

## Re-Review Focus
- **Issue Resolution**: Were the original issues properly fixed?
- **Regression**: Did the fixes introduce new problems?
- **Quality**: Is the fix implementation acceptable?
- **Tests**: Were relevant tests added or updated?

Note: This is a focused re-review - you don't need to do a full spec-first review.
Focus on verifying the fixes for previously reported issues.`;
}

export function buildCodeReviewFixPromptText(
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

export function buildCodeReviewFixPreparePromptText(
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

export function buildCodeReviewFixImplementPromptText(
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

function buildSingleTaskCodeReviewPromptText(
  sprintId: string,
  sprintTitle: string,
  taskId: number,
  title: string,
): string {
  const header = [
    "As Controller, perform a code review for Task " +
      taskId +
      ': "' +
      title +
      '" in Sprint "' +
      sprintTitle +
      '".',    "",
    "## Task Details",
    "- **Sprint**: " + sprintTitle + " (" + sprintId + ")",
    "- **Task**: #" + taskId + " - " + title,
    "",
    "## Your Task",
    "Use your MCP tools to review the implementation:",
    "",
    "1. `get_code_review` with task=" +
      taskId +
      " - Get the pending review AND spec context (spec_path, spec_files[], spec_task_definitions[])",
    "",
  ].join("\n");

  const specProtocol = `## Mandatory Spec-First Protocol (9.1-9.4)
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

Minimal valid issues entry (REQUIRED for CHANGES_REQUESTED/REJECTED):
\`\`\`json
{
  "issues": [
    {
      "severity": "MAJOR",
      "issue": "Describe the problem",
      "rationale": "Why this is a problem and needs fixing"
    }
  ]
}
\`\`\`

## Review Standards
- **Correctness**: Implementation matches spec requirements with evidence
- **Quality**: Code follows project patterns and best practices
- **Completeness**: All spec tasks have evidence; deliverables and tests are adequate
- **Safety**: No obvious security or stability issues

Provide specific, actionable feedback for any issues found.

IMPORTANT:
- Any non-approval decision MUST include explicit issues in the issues array.
- Any spec task without evidence = CHANGES_REQUESTED.
`;

  const stubHunterMode = getStubHunterModeText();

  return header + specProtocol + "\n---\n\n" + stubHunterMode;
}

function buildBulkCodeReviewPromptText(
  pendingCount: number,
  sprintId: string,
  sprintTitle: string,
): string {
  const header =
    "As Controller, perform code reviews for " +
    pendingCount +
    ' pending task(s) in Sprint "' +
    sprintTitle +
    '" (' +
    sprintId +
    ").";

  const instructions = `

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

Minimal valid issues entry (REQUIRED for CHANGES_REQUESTED/REJECTED):
\`\`\`json
{
  "issues": [
    {
      "severity": "MAJOR",
      "issue": "Describe the problem",
      "rationale": "Why this is a problem and needs fixing"
    }
  ]
}
\`\`\`

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

Begin by checking the code review summary, then process one pending review.
`;

  const stubHunterMode = getStubHunterModeText();

  return header + instructions + "\n---\n\n" + stubHunterMode;
}

function getStubHunterModeText(): string {
  return `# STUB HUNTER MODE (MANDATORY)

You are a hostile reviewer. Assume the implementation is wrong until proven correct.

## Mandatory Stub Hunt Protocol

### Step 1: User Action Trace
For each required feature:
- Identify the user trigger
- Trace the call graph to the real work
- Confirm the final outcome is real (not a dialog or placeholder)

Reject if you cannot trace from trigger to real work.

### Step 2: Semantic Stub Detection
For each core method, ask:
1. What actually happens on call?
2. Does it do real work or return defaults?
3. Are there error dialogs in the success path?

Red flags:
- showErrorMessage/showWarningMessage in success path
- return null/[]/{} without doing work
- TODO/FIXME/not implemented strings

### Step 3: API Integration Verification
For each external integration:
- Locate the real call site
- Verify parameters are used
- Verify response is handled
- Trace the data flow to a real outcome

### Step 4: Spec Requirement Interrogation
For EACH spec requirement:
- Evidence file + line range
- Mechanism (how it works)
- Proof (test or runtime path)

### Step 5: Test Fraud Detection
For each test:
- What behavior does it claim to verify?
- What do the assertions actually check?
- Could empty/wrong implementation still pass?

## Stub Hunt Report (Required)
Include this section in your review notes:

## STUB HUNT REPORT

### User Action Traces
- [ ] Feature A traced end-to-end
- [ ] Feature B traced end-to-end

### Semantic Stub Scan
- [ ] No placeholders in success path
- [ ] No default-return stubs
- [ ] No TODO/FIXME/not implemented

### API Integration
- [ ] Calls verified with real parameters
- [ ] Responses used and traced

### Test Fraud Scan
- [ ] Assertions verify behavior
- [ ] Tests exercise real code paths

### Stubs/Fraud Found
- [list issues]

### Verdict
- HUNTED: Found N issues
- CLEAN: No stubs detected after thorough hunt

## DO NOT APPROVE if ANY are true
1. Cannot trace feature to real behavior
2. Success path shows error/warning
3. Returns default values instead of doing work
4. Tests pass without verifying behavior
5. API responses ignored
6. TODO/FIXME/not implemented found
7. Mock/stub in production code
8. Evidence requirements not satisfied
`;
}

