/**
 * Prompt text builders for non-template prompts.
 */

import type { PromptContext, SprintReviewContext } from "./promptTypes.js";

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

