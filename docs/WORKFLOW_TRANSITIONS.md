# Orchestra Workflow Transitions

This document defines all possible state transitions in Orchestra's task workflow, including the agent invoked and the full prompt injected.

## State Transition Table

| Current Task Status               | Current Code Review Status | → Next Task Status            | → Next Code Review Status | Agent        | Action/Prompt         | Description                              |
| --------------------------------- | -------------------------- | ----------------------------- | ------------------------- | ------------ | --------------------- | ---------------------------------------- |
| **PENDING**                       | None                       | PENDING_HANDOVER_REVIEW       | None                      | Orchestrator | prepare handover      | Orchestrator preparing handover TASK-N   |
| **PENDING_HANDOVER_REVIEW**       | None                       | HANDOVER_REVIEW_FAILED        | None                      | Controller   | review handover       | Controller reviewing handover TASK-N     |
| **PENDING_HANDOVER_REVIEW**       | None                       | IMPLEMENT                     | None                      | Controller   | review handover       | Controller reviewing handover TASK-N     |
| **HANDOVER_REVIEW_FAILED**        | None                       | PENDING_HANDOVER_REVIEW       | None                      | Orchestrator | fix handover          | Orchestrator fixing handover TASK-N      |
| **IMPLEMENT**                     | None                       | GATE_CHECK                    | None                      | Implementor  | implement             | Implementor implementing TASK-N          |
| **GATE_CHECK**                    | None                       | VERIFIED                      | PENDING                   | Orchestrator | verify implementation | Orchestrator verifying TASK-N            |
| **GATE_CHECK**                    | None                       | VERIFY_FAILED                 | None                      | Orchestrator | verify implementation | Orchestrator verifying TASK-N            |
| **VERIFY_FAILED**                 | None                       | GATE_CHECK                    | None                      | Implementor  | fix implementation    | Implementor fixing implementation TASK-N |
| **VERIFIED**                      | PENDING                    | CODE_REVIEW_CHANGES_REQUESTED | None                      | Controller   | code review           | Controller reviewing code TASK-N         |
| **VERIFIED**                      | PENDING                    | REJECTED                      | None                      | Controller   | code review           | Controller reviewing code TASK-N         |
| **VERIFIED**                      | PENDING                    | COMPLETE                      | APPROVED                  | Controller   | code review           | Controller reviewing code TASK-N         |
| **CODE_REVIEW_CHANGES_REQUESTED** | None                       | PENDING_VERIFICATION          | None                      | Implementor  | fix code review       | Implementor fixing code issues TASK-N    |
| **VERIFIED**                      | PENDING_VERIFICATION       | COMPLETE                      | APPROVED                  | Controller   | re-review code        | Controller re-reviewing code TASK-N      |
| **VERIFIED**                      | PENDING_VERIFICATION       | CODE_REVIEW_CHANGES_REQUESTED | None                      | Controller   | re-review code        | Controller re-reviewing code TASK-N      |
| **COMPLETE**                      | CHANGES_REQUESTED          | COMPLETE                      | REJECTED                  | Implementor  | fix code review       | Implementor fixing code issues TASK-N    |
| **COMPLETE**                      | CHANGES_REQUESTED          | COMPLETE                      | APPROVED                  | Controller   | code review           | Controller reviewing code TASK-N         |
| **COMPLETE**                      | PENDING_VERIFICATION       | COMPLETE                      | APPROVED                  | Controller   | re-review code        | Controller re-reviewing code TASK-N      |
| **COMPLETE**                      | APPROVED                   | **→ NEXT TASK: PENDING**      | None                      | Orchestrator | prepare handover      | Orchestrator preparing handover TASK-N+1 |

---

## Prompts by Action

Each action has a corresponding prompt that is injected when the agent is invoked.

---

### Action: `prepare handover`

**Agent**: Orchestrator  
**Triggers on**: Task status = `PENDING`  
**Transitions to**: `PENDING_HANDOVER_REVIEW`  
**Description**: Orchestrator preparing handover TASK-N  
**Includes task.description**: ✅ Yes

<details>
<summary><strong>Full Prompt</strong></summary>

```
As Orchestrator, prepare Task ${task.task_id}: "${task.title}".

## Your Task
Use your MCP tools to prepare this task for implementation:

1. `get_task` - Review the task specification and verification criteria
2. `prepare_task` - Create a comprehensive handover with:
   - Clear acceptance criteria
   - File operations (CREATE/UPDATE/DELETE)
   - Deliverables list
   - Context files to reference

## Task Details
- **ID**: ${task.task_id}
- **Title**: ${task.title}
- **Category**: ${task.category}
- **Phase**: ${task.phase_id}

## Sprint Context
- **Sprint ID**: ${sprint.sprint_id}
- **Sprint Title**: ${sprint.title}

## Description
${task.description}

## Remember
- Create verification criteria that the implementor CANNOT see
- Be specific about expected file changes
- Include test requirements
- Reference relevant context files from the codebase
```

</details>

---

### Action: `review handover`

**Agent**: Controller  
**Triggers on**: Task status = `PENDING_HANDOVER_REVIEW`  
**Transitions to**: `IMPLEMENT` (approved) or `HANDOVER_REVIEW_FAILED` (rejected)  
**Description**: Controller reviewing handover TASK-N  
**Includes task.description**: ❌ No

<details>
<summary><strong>Full Prompt</strong></summary>

```
As Controller, review the handover for Task ${task.task_id}: "${task.title}" for specification alignment.

## Your Task
Use your MCP tools to perform a comprehensive handover review:

1. `review_handover` - Analyze the task handover:
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
   - `approve_handover` - If handover fully aligns with specification
   - `reject_handover` - If issues found requiring revision

## Task Context
- **Task ID**: ${task.task_id}
- **Title**: ${task.title}
- **Category**: ${task.category}
- **Phase**: ${task.phase_id}
- **Sprint**: ${sprint.title} (${sprint.sprint_id})
- **Review Attempt**: ${reviewAttempt}

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

Provide detailed, actionable feedback for any issues found.
```

</details>

---

### Action: `fix handover`

**Agent**: Orchestrator  
**Triggers on**: Task status = `HANDOVER_REVIEW_FAILED`  
**Transitions to**: `PENDING_HANDOVER_REVIEW`  
**Description**: Orchestrator fixing handover TASK-N  
**Includes task.description**: ❌ No

<details>
<summary><strong>Full Prompt</strong></summary>

```
As Orchestrator, fix the rejected handover for Task ${task.task_id}: "${task.title}".

## Handover Rejection
The Controller rejected your handover (revision ${rejection.revision_count + 1}). You must address ALL issues and resubmit.

### Issues Found
${issuesText}

### Recommendations
${recommendationsText}

## Your Task
Use your MCP tools to fix the handover and resubmit:

1. `get_handover` with task_id=${task.task_id} - Review current handover details
2. `read_spec_file` - Re-read the specification to ensure full alignment
3. `update_handover` - Update the handover to address ALL issues:
   - Fix missing or unclear acceptance criteria
   - Clarify file operations and deliverables
   - Add missing context or constraints
   - Ensure spec alignment (no scope creep)
4. `resubmit_handover` with task_id=${task.task_id} - Resubmit after fixing

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

After fixing, use `resubmit_handover` to send back for review.
```

</details>

---

### Action: `implement`

**Agent**: Implementor  
**Triggers on**: Task status = `IMPLEMENT`  
**Transitions to**: `GATE_CHECK`  
**Description**: Implementor implementing TASK-N  
**Includes task.description**: ❌ No

<details>
<summary><strong>Full Prompt</strong></summary>

```
As Implementor, you are assigned Task ${task.task_id}: "${task.title}".

## Your Task
Use your MCP tools to implement this task:

1. `get_current_task` - Get your task handover with:
   - Acceptance criteria (what defines success)
   - File operations (CREATE/UPDATE/DELETE)
   - Deliverables (what you must produce)
   - Context files (background information)

2. Follow the handover instructions carefully
   - **Handover**: ${handoverPath}

3. Implement the task following all acceptance criteria

4. `signal_completion` - Signal when done with:
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
- You will be verified against criteria you cannot see
```

</details>

---

### Action: `verify implementation`

**Agent**: Orchestrator  
**Triggers on**: Task status = `GATE_CHECK` or `VERIFY`  
**Transitions to**: `VERIFIED` + code review `PENDING` (pass) or `VERIFY_FAILED` (fail)  
**Description**: Orchestrator verifying TASK-N  
**Includes task.description**: ❌ No

<details>
<summary><strong>Full Prompt</strong></summary>

```
As Orchestrator, verify Task ${task.task_id}: "${task.title}".

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
`get_signal` - Retrieve the implementor's completion signal

### 2. Run Automated Checks
`run_verification_checks` - Execute automated verification checks

### 3. 🔍 MANDATORY: Stub Hunt Protocol

**BEFORE submitting judgment, complete ALL of these:**

#### A) User Action Trace (for EACH UI feature)
USER ACTION: [what user does - e.g., "clicks upload button"]
ENTRY POINT: [method called]
TRACE PATH: [follow code to outcome]
FINAL OUTCOME: [what ACTUALLY happens]
VERDICT: [REAL | STUB | ERROR_STUB]

**RED FLAGS = Automatic FAIL**:
- Method shows error dialog instead of doing real work
- Method returns early without action
- Method is empty or trivial
- Method logs "not implemented"

#### B) Semantic Stub Search
Search implementation files for:
- `showErrorDialog`, `showSnackBar` with error messages (ERROR STUB)
- `return null`, `return []`, `return ""` (FAKE RETURNS)
- `TODO`, `FIXME`, `not implemented` (INCOMPLETE)
- `throw UnimplementedError` (EXPLICIT STUB)

Document: "Searched for X in Y - Found: Z"

#### C) API Integration Check
For each required external API:
REQUIRED API: [e.g., "file_picker"]
IMPORTED: [yes/no + line]
INSTANTIATED & CALLED: [yes/no + line]
RESPONSE HANDLED: [yes/no]
VERDICT: [INTEGRATED | STUB]

#### D) Spec Requirement Interrogation
For EACH requirement, answer:
REQUIREMENT: "[from spec]"
EVIDENCE: [file:line with actual code]
VERDICT: [FULFILLED | STUBBED | MISSING]

**Cannot point to a specific line? = NOT IMPLEMENTED**

### 4. Submit Judgment

`submit_verification_judgment` - With your Stub Hunt Report in manual_review.observations:

=== STUB HUNT REPORT ===
User Action Traces: [X/Y - list verdicts]
Semantic Stub Search: [patterns searched, findings]
API Integration: [X/Y passed]
Spec Requirements: [X/Y fulfilled with evidence]
FINAL VERDICT: [PASS - exhaustive search found nothing | FAIL - stubs detected]

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

If judgment is PASS, immediately call `complete_task`.
```

</details>

---

### Action: `fix implementation`

**Agent**: Implementor  
**Triggers on**: Task status = `VERIFY_FAILED`  
**Transitions to**: `GATE_CHECK`  
**Description**: Implementor fixing implementation TASK-N  
**Includes task.description**: ❌ No

<details>
<summary><strong>Full Prompt</strong></summary>

```
As Implementor, your work on Task ${task.task_id}: "${task.title}" did not pass verification. You must fix the issues and retry.

## Retry Attempt ${retryCount}

## Your Task
Use your MCP tools to address the verification failures:

1. `get_current_task` - Get your original task handover with:
   - Acceptance criteria (what defines success)
   - File operations (CREATE/UPDATE/DELETE)
   - Deliverables (what you must produce)
   - Context files (background information)

2. `get_feedback` - Retrieve verification failure feedback explaining:
   - What went wrong (specific issues found)
   - What worked (checks that passed)
   - Guidance on how to fix the issues
   - **Feedback**: ${feedbackPath}

3. Read the feedback CAREFULLY and address ALL issues

4. Fix your implementation based on the feedback

5. `signal_completion` - Re-signal when done with:
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

Do not skip any feedback items. Incomplete fixes will result in another FAIL.
```

</details>

---

### Action: `code review`

**Agent**: Controller  
**Triggers on**: Task status = `VERIFIED` with code review status = `PENDING`  
**Transitions to**: `COMPLETE` + `APPROVED`, or `CODE_REVIEW_CHANGES_REQUESTED`, or `REJECTED`  
**Description**: Controller reviewing code TASK-N  
**Includes task.description**: ❌ No

<details>
<summary><strong>Full Prompt</strong></summary>

```
As Controller, perform a code review for Task ${taskInfo.taskId}: "${taskInfo.title}" in Sprint "${sprintTitle}".

## Task Details
- **Sprint**: ${sprintTitle} (${sprintId})
- **Task**: #${taskInfo.taskId} - ${taskInfo.title}

## Your Task
Use your MCP tools to review the implementation:

1. `get_code_review` with task=${taskInfo.taskId} - Get the pending review AND spec context (spec_path, spec_files[], spec_task_definitions[])

## Mandatory Spec-First Protocol (9.1-9.4)
- Assume the implementation is WRONG until PROVEN correct
- Read the spec FIRST using spec_path from `get_code_review`
- If spec_files[] is not empty, also read those files using `read_spec_file` (e.g., tasks.md)
- Build a per-spec-task evidence table from spec_task_definitions[] BEFORE reading any implementation code
- Any spec task without evidence MUST result in CHANGES_REQUESTED

2. Read the specification file at spec_path (and any files in spec_files[])
3. Read the implementation files only AFTER completing the evidence requirements
4. Verify the implementation against the evidence table:
  - Does each spec task have concrete evidence (file, location, mechanism, proof)?
  - Is the code quality acceptable (patterns, naming, structure)?
  - Are there any obvious bugs, security issues, or performance concerns?
  - Are tests adequate and actually validating behavior?

5. Submit your decision using `submit_code_review`:
  - decision: "APPROVED" - Only if ALL spec tasks have evidence and quality is acceptable
  - decision: "CHANGES_REQUESTED" - If any spec task lacks evidence or issues need fixing (MUST include issues array)
  - decision: "REJECTED" - If major issues/incorrect implementation (MUST include issues array)

Minimal valid issues entry (REQUIRED for CHANGES_REQUESTED/REJECTED):
{
  "issues": [
    {
      "severity": "MAJOR",
      "issue": "Describe the problem",
      "rationale": "Why this is a problem and needs fixing"
    }
  ]
}

## Review Standards
- **Correctness**: Implementation matches spec requirements with evidence
- **Quality**: Code follows project patterns and best practices
- **Completeness**: All spec tasks have evidence; deliverables and tests are adequate
- **Safety**: No obvious security or stability issues

Provide specific, actionable feedback for any issues found.

IMPORTANT:
- Any non-approval decision MUST include explicit issues in the issues array.
- Any spec task without evidence = CHANGES_REQUESTED.

---

# STUB HUNTER MODE (MANDATORY)

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
```

</details>

---

### Action: `fix code review`

**Agent**: Implementor  
**Triggers on**: Code review status = `CHANGES_REQUESTED` or `REJECTED`  
**Transitions to**: Code review status = `PENDING_VERIFICATION`  
**Description**: Implementor fixing code issues TASK-N  
**Includes task.description**: ❌ No

<details>
<summary><strong>Full Prompt</strong></summary>

```
As Implementor, apply code review fixes for Task ${task.task_id}: "${task.title}".

This task has a code review status of **${review.status}**.
Review summary: ${review.summary}

## Your Task
Use the `fix_code_review` tool to address the code review feedback:

1. `get_current_task` - Review the updated fix handover
   - **Handover**: ${handoverPath}
2. `fix_code_review({ action: "GET_ISSUES" })` - List all open issues with handover context
3. For each issue:
   - Read the issue details (file, line, recommendation)
   - Fix the code according to the recommendation
   - Run relevant tests
   - `fix_code_review({ action: "RESOLVE_ISSUE", issue_id: N, fix_summary: "..." })` - Mark resolved
4. `fix_code_review({ action: "SUBMIT_FIXES", summary: "...", files_changed: [...], tests_run: [...] })` - Submit for re-review

## Task Details
- **ID**: ${task.task_id}
- **Title**: ${task.title}
- **Sprint**: ${sprint.title} (${sprint.sprint_id})

## Remember
- Keep changes scoped to the review feedback
- Run relevant tests and report results
- Resolve EACH issue explicitly before submitting
- After SUBMIT_FIXES, Controller will re-review the code
```

</details>

---

### Action: `re-review code`

**Agent**: Controller  
**Triggers on**: Code review status = `PENDING_VERIFICATION`  
**Transitions to**: `COMPLETE` + `APPROVED`, or `CHANGES_REQUESTED`, or `REJECTED`  
**Description**: Controller re-reviewing code TASK-N  
**Includes task.description**: ❌ No

<details>
<summary><strong>Full Prompt</strong></summary>

```
As Controller, re-review Task ${taskInfo.taskId}: "${taskInfo.title}" after the Implementor submitted fixes.

## Context
- **Sprint**: ${sprintTitle} (${sprintId})
- **Task**: #${taskInfo.taskId} - ${taskInfo.title}
- **Review ID**: ${reviewId}
- **Status**: PENDING_VERIFICATION (fixes have been submitted)

## Your Task
The Implementor has addressed the issues from your previous review. Verify the fixes:

1. `get_code_review` with task=${taskInfo.taskId} - Get review details including:
   - Previously reported issues and their resolution status
   - The fix summary provided by the implementor
   - Files changed and tests run

2. For each previously reported issue:
   - Verify the fix addresses the original concern
   - Check that no new issues were introduced
   - Ensure tests cover the fixed code path

3. Submit your decision using `submit_code_review` with `verifying_fixes: true`:
   - decision: "APPROVED" - All issues have been properly addressed
   - decision: "CHANGES_REQUESTED" - Some issues remain or new issues found (include issues array)
   - decision: "REJECTED" - Fundamental problems remain (include issues array)

Minimal valid issues entry (REQUIRED for CHANGES_REQUESTED/REJECTED):
{
  "issues": [
    {
      "severity": "MAJOR",
      "issue": "Describe the problem",
      "rationale": "Why this is a problem and needs fixing"
    }
  ]
}

## Re-Review Focus
- **Issue Resolution**: Were the original issues properly fixed?
- **Regression**: Did the fixes introduce new problems?
- **Quality**: Is the fix implementation acceptable?
- **Tests**: Were relevant tests added or updated?

Note: This is a focused re-review - you don't need to do a full spec-first review.
Focus on verifying the fixes for previously reported issues.
```

</details>

---

## Visual Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              START OF WORKFLOW                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PENDING                                                                     │
│  Code Review: None                                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Action: prepare handover                                                   │
│  Agent: Orchestrator                                                        │
│  Description: Orchestrator preparing handover TASK-N                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PENDING_HANDOVER_REVIEW                                                     │
│  Code Review: None                                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Action: review handover                                                    │
│  Agent: Controller                                                          │
│  Description: Controller reviewing handover TASK-N                          │
└─────────────────────────────────────────────────────────────────────────────┘
                          │                            │
                   (rejected)                    (approved)
                          │                            │
                          ▼                            ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────────┐
│  HANDOVER_REVIEW_FAILED         │    │  IMPLEMENT                          │
│  Code Review: None              │    │  Code Review: None                  │
│  ─────────────────────────────  │    │  ───────────────────────────────── │
│  Action: fix handover           │    │  Action: implement                  │
│  Agent: Orchestrator            │    │  Agent: Implementor                 │
│  Desc: Orchestrator fixing      │    │  Desc: Implementor implementing    │
│        handover TASK-N          │    │        TASK-N                       │
└─────────────────────────────────┘    └─────────────────────────────────────┘
              │                                        │
              └──────────► (resubmit) ────────────────►│
                                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  GATE_CHECK                                                                  │
│  Code Review: None                                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Action: verify implementation                                              │
│  Agent: Orchestrator                                                        │
│  Description: Orchestrator verifying TASK-N                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                          │                            │
                       (fail)                       (pass)
                          │                            │
                          ▼                            ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────────┐
│  VERIFY_FAILED                  │    │  VERIFIED                           │
│  Code Review: None              │    │  Code Review: PENDING               │
│  ─────────────────────────────  │    │  ───────────────────────────────── │
│  Action: fix implementation     │    │  Action: code review                │
│  Agent: Implementor             │    │  Agent: Controller                  │
│  Desc: Implementor fixing       │    │  Desc: Controller reviewing code   │
│        implementation TASK-N    │    │        TASK-N                       │
└─────────────────────────────────┘    └─────────────────────────────────────┘
              │                          │           │           │
              └────► (retry) ───────────►│    (changes)    (rejected)  (approved)
                                         │           │           │          │
                                         │           ▼           ▼          ▼
                                         │    ┌──────────────────────┐  ┌────────┐
                                         │    │ CODE_REVIEW_CHANGES_ │  │COMPLETE│
                                         │    │ REQUESTED            │  │APPROVED│
                                         │    │ ──────────────────── │  └────────┘
                                         │    │ Action: fix code     │
                                         │    │ Agent: Implementor   │
                                         │    │ Desc: Implementor    │
                                         │    │   fixing code issues │
                                         │    └──────────────────────┘
                                         │              │
                                         │              ▼
                                         │    ┌──────────────────────┐
                                         │    │ PENDING_VERIFICATION │
                                         │    │ ──────────────────── │
                                         │    │ Action: re-review    │
                                         │    │ Agent: Controller    │
                                         │    │ Desc: Controller     │
                                         │    │   re-reviewing code  │
                                         │    └──────────────────────┘
                                         │              │
                                         └──────────────┘
                                                        │
                                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         END OF WORKFLOW → NEXT TASK                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Source Files

- **PlayTaskHandler**: [extension/src/commands/PlayTaskHandler.ts](../extension/src/commands/PlayTaskHandler.ts)
- **PromptBuilder**: [extension/src/prompts/PromptBuilder.ts](../extension/src/prompts/PromptBuilder.ts)
- **WorkflowChain**: [extension/src/agents/WorkflowChain.ts](../extension/src/agents/WorkflowChain.ts)
