# UI Actions Design: Code Review Fix Workflow

**Sprint**: 006-code-review-fix-workflow  
**Revised**: 2026-01-20  
**Status**: Draft

---

## Purpose

Define the UI actions that enable seamless handoffs between agents during the code review fix workflow. Each action opens the correct agent chat with a pre-populated prompt containing all necessary context.

---

## Key Design Principles

1. **User-Visible IDs Only**: All prompts use task numbers (1, 2, 5...), never internal IDs
2. **Consolidated Tools**: Reference the 4 new tools, not the old 12
3. **Minimal Prompts**: Prompts are minimal - tools return full context for fresh agent instances
4. **Auto-Discovery**: Implementor prompts don't need IDs - tools discover from context
5. **Full Context Handoffs**: Tools return complete handover (context, acceptance criteria, deliverables)

---

## Action Button Matrix

### Task Card (Based on Task Status)

| Task Status | Primary Action  | Agent      | Behavior                              |
| ----------- | --------------- | ---------- | ------------------------------------- |
| VERIFIED    | "Code Review"   | Controller | Opens controller for initial review   |
| COMPLETE    | **"Re-review"** | Controller | Reverts to VERIFIED, opens controller |

### Code Review Panel (Based on Review Status)

| Review Status        | Primary Action      | Secondary Action | Badge                          |
| -------------------- | ------------------- | ---------------- | ------------------------------ |
| PENDING              | "Start Review"      | -                | "Pending"                      |
| IN_REVIEW            | -                   | -                | "In Review"                    |
| CHANGES_REQUESTED    | **Fix Issues**      | View Issues      | "Changes Requested" (warning)  |
| FIXING_ISSUES        | **Continue Fixing** | View Issues      | "Fixing" (info)                |
| PENDING_VERIFICATION | **Verify Fixes**    | View Submission  | "Awaiting Verification" (info) |
| APPROVED             | -                   | View Review      | "Approved" (success)           |
| REJECTED             | **Escalate**        | View Review      | "Rejected" (error)             |

### Current Task Card

When task has review with open issues:

- Badge: "Code Review: {issue_count} issues"
- Primary Action: **Fix Issues** (same as panel)

When task has review pending verification:

- Badge: "Code Review: Pending Verification"
- Primary Action: **Verify Fixes** (same as panel)

---

## Action Implementations

### Action: Start Review

**Trigger**: User clicks "Start Review" on PENDING review  
**Agent**: Controller  
**Mode**: `orchestra.controller`

**Prompt Template**:

````markdown
You are being invoked to perform a code review.

## Task to Review

Task {task}: {task_title}

## Your Task

Review the implementation and submit your decision:

```json
{
  "tool": "submit_code_review",
  "params": {
    "task": {task},
    "decision": "APPROVED",  // or "CHANGES_REQUESTED" or "REJECTED"
    "summary": "Your assessment (min 30 chars)",
    "risk": "LOW",  // or "MEDIUM" or "HIGH"
    "files_reviewed": ["path/to/file.ts", ...]
  }
}
```
````

If requesting changes, include issues:

```json
{
  "task": {task},
  "decision": "CHANGES_REQUESTED",
  "summary": "Issues found requiring fixes",
  "risk": "MEDIUM",
  "files_reviewed": ["..."],
  "issues": [
    {
      "severity": "MAJOR",
      "issue": "Description of the issue",
      "file": "path/to/file.ts",
      "line": 42,
      "recommendation": "How to fix it"
    }
  ]
}
```

````

---

### Action: Fix Issues

**Trigger**: User clicks "Fix Issues" or "Continue Fixing"
**Agent**: Implementor
**Mode**: `orchestra.implementor`

**Prompt Template** (Minimal - tool returns full context):

```markdown
You are being invoked to fix code review issues.

## First Action

Call this tool to get your full task context and issues:

```json
{ "tool": "fix_code_review", "params": { "action": "GET_ISSUES" } }
```

This returns:
- Full task handover (context, acceptance criteria, deliverables, file operations)
- Context files to read for additional understanding
- All open code review issues with severity, file, line, and recommendations

## Workflow

1. Read the handover context and context_files
2. Review each issue and its recommendation
3. Make the necessary code changes
4. Run tests: `npm test`
5. For each fixed issue, mark it resolved:
   ```json
   { "action": "RESOLVE_ISSUE", "issue_id": <id>, "fix_summary": "What you did" }
   ```
6. When ALL issues are fixed and tests pass, submit:
   ```json
   { "action": "SUBMIT_FIXES", "summary": "Overall fix summary", "files_changed": [...] }
   ```

Do NOT guess at IDs - use `GET_ISSUES` action to discover them.
```

````

**Implementation**:

```typescript
async function fixCodeReviewIssues(taskNumber: number): Promise<void> {
  const prompt = generateFixIssuesPrompt(taskNumber);

  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: prompt,
    participant: "orchestra.implementor",
  });
}
```

---

### Action: Verify Fixes

**Trigger**: User clicks "Verify Fixes"  
**Agent**: Controller  
**Mode**: `orchestra.controller`

**Prompt Template** (Minimal - tool returns full context):

````markdown
You are being invoked to verify code review fixes for task {task}.

## First Action

Call this tool to get the full task context and fix details:

```json
{ "tool": "get_code_review", "params": { "task": {task} } }
```

This returns:

- Full task handover (context, acceptance criteria, deliverables)
- Code review history and original issues
- Fix submission details (summary, files changed)
- Current review status

## Your Task

1. Review the submitted fixes against the original issues
2. Verify the code changes address each acceptance criterion
3. Check that tests pass and code quality is maintained
4. Submit your verification decision using `submit_code_review` with `verifying_fixes: true`

**To Approve:**

```json
{
  "task": {task},
  "decision": "APPROVED",
  "verifying_fixes": true,
  "summary": "All issues properly addressed",
  "risk": "LOW",
  "files_reviewed": [...]
}
```

**To Request More Changes:**

```json
{
  "task": {task},
  "decision": "CHANGES_REQUESTED",
  "verifying_fixes": true,
  "summary": "Some issues need more work",
  "risk": "MEDIUM",
  "files_reviewed": [...],
  "issues": [{ "severity": "MAJOR", "issue": "...", "recommendation": "..." }]
}
```
````

**Implementation**:

```typescript
async function verifyCodeReviewFixes(taskNumber: number): Promise<void> {
  const prompt = generateVerifyFixesPrompt(taskNumber);

  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: prompt,
    participant: "orchestra.controller",
  });
}
```

---

### Action: Re-review (COMPLETE tasks)

**Trigger**: User clicks "Re-review" on COMPLETE task  
**Agent**: Controller  
**Mode**: `orchestra.controller`

**Behavior**:

1. **Revert task status**: COMPLETE → VERIFIED
2. Open controller agent with re-review prompt

**Prompt Template**:

````markdown
You are being invoked to re-review a completed task.

This task was previously approved but has been sent back for re-review.
The task status has been reverted from COMPLETE to VERIFIED.

## First Action

Call this tool to get the full task context:

```json
{ "tool": "get_code_review", "params": { "task": {task} } }
```

This returns:

- Full task handover (context, acceptance criteria, deliverables)
- Complete code review history
- Previous decisions and issues

## Your Task

Perform a fresh review considering any concerns that triggered the re-review.
Then submit your decision using `submit_code_review`.
````

**Implementation**:

```typescript
async function reReviewTask(taskNumber: number): Promise<void> {
  // First revert the task status
  await updateTaskStatus(taskNumber, "VERIFIED");

  // Then open controller with prompt
  const prompt = generateReReviewPrompt(taskNumber);

  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: prompt,
    participant: "orchestra.controller",
  });
}
```

---

### Action: Escalate

**Trigger**: User clicks "Escalate" on REJECTED review  
**Agent**: None (dialog-based workflow)  
**Mode**: Dialog + MCP tool call

**Purpose**:
REJECTED reviews block sprint progression (FR-025). Escalation provides resolution paths
to unblock the sprint while ensuring the rejection is properly addressed.

**Behavior**:

1. Opens a dialog with resolution options
2. Records the escalation decision
3. Updates task status if "Mark as Blocked" is chosen
4. Clears the REJECTED blocking condition

**Resolution Options**:

| Option              | Description                            | Effect                                           |
| ------------------- | -------------------------------------- | ------------------------------------------------ |
| **Re-assign Task**  | Create new task for different approach | Original task marked ESCALATED, new task created |
| **Mark as Blocked** | Escalate to human supervisor           | Task status → ESCALATED, blocker note recorded   |
| **Re-review**       | Controller will reconsider decision    | Opens controller with re-review prompt           |
| **Cancel**          | Close without action                   | No change                                        |

**Dialog Implementation**:

```typescript
async function escalateRejectedReview(taskNumber: number): Promise<void> {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "$(git-pull-request) Re-assign Task",
        description: "Create new task for different approach",
        detail:
          "Original task will be marked ESCALATED. A new task will be created for fresh implementation.",
        value: "reassign",
      },
      {
        label: "$(warning) Mark as Blocked",
        description: "Escalate to human supervisor",
        detail:
          "Task will be marked ESCALATED with a blocker note. Sprint progression will be unblocked.",
        value: "blocked",
      },
      {
        label: "$(refresh) Request Re-review",
        description: "Ask controller to reconsider",
        detail:
          "Opens controller agent to submit a new review decision (e.g., CHANGES_REQUESTED instead).",
        value: "rereview",
      },
      {
        label: "$(close) Cancel",
        description: "Close without action",
        value: "cancel",
      },
    ],
    {
      title: `Escalate Rejected Review: Task ${taskNumber}`,
      placeHolder: "How do you want to resolve this rejection?",
      matchOnDetail: true,
    },
  );

  if (!choice || choice.value === "cancel") {
    return;
  }

  switch (choice.value) {
    case "reassign":
      await handleReassign(taskNumber);
      break;
    case "blocked":
      await handleMarkBlocked(taskNumber);
      break;
    case "rereview":
      await handleRequestRereview(taskNumber);
      break;
  }
}

async function handleMarkBlocked(taskNumber: number): Promise<void> {
  // Prompt for blocker reason
  const reason = await vscode.window.showInputBox({
    title: `Blocker Reason for Task ${taskNumber}`,
    prompt: "Describe why this task cannot proceed",
    placeHolder:
      "e.g., Fundamental design issue requiring architectural review",
    validateInput: (value) =>
      value.length < 20 ? "Please provide more detail (min 20 chars)" : null,
  });

  if (!reason) return;

  // Call MCP tool to escalate
  await mcpClient.callTool("escalate_task", {
    task_id: taskNumber,
    reason: reason,
    attempts_summary: "Code review REJECTED - escalating per user request",
  });

  vscode.window.showInformationMessage(
    `Task ${taskNumber} marked as ESCALATED. Sprint progression unblocked.`,
  );
}

async function handleRequestRereview(taskNumber: number): Promise<void> {
  const prompt = `You are being asked to re-review task ${taskNumber}.

The previous code review was REJECTED, but the rejection is being reconsidered.
Please review the implementation again and submit a new decision.

Consider whether the issues could be addressed via CHANGES_REQUESTED instead of REJECTED.

Call this tool first to get the context:

\`\`\`json
{ "tool": "get_code_review", "params": { "task": ${taskNumber} } }
\`\`\`

Then submit your revised decision using \`submit_code_review\`.`;

  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: prompt,
    participant: "orchestra.controller",
  });
}
```

**REJECTED → ESCALATED Transition**:

When "Mark as Blocked" is chosen:

1. Task status changes from VERIFIED to ESCALATED
2. The REJECTED review remains (for audit trail)
3. Escalation record created with blocker note
4. Task is excluded from FR-025 blocking check
5. `prepare_task` for other tasks now succeeds

````

---

## View Actions (Secondary)

### View Issues

**Trigger**: User clicks "View Issues"
**Behavior**: Opens webview panel showing issue list

- Displays all issues for the review
- Shows severity, file, line, recommendation
- Status indicator (OPEN/RESOLVED)
- "Fix Issues" button at bottom

### View Submission

**Trigger**: User clicks "View Submission"
**Behavior**: Opens webview panel showing fix submission

- Summary of fixes
- Files changed
- Tests run
- Validation result (if any)
- Submitted timestamp

### View Review

**Trigger**: User clicks "View Review"
**Behavior**: Opens webview panel showing review details

- Decision and summary
- Risk assessment
- Files reviewed
- Issues (if any)
- History of revisions

---

## Button Styling

### Primary Actions

```css
.code-review-action-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 4px;
}

.code-review-action-primary:hover {
  background: var(--vscode-button-hoverBackground);
}
````

### Status Badges

```css
.badge-warning {
  background: var(--vscode-inputValidation-warningBackground);
  border: 1px solid var(--vscode-inputValidation-warningBorder);
}

.badge-info {
  background: var(--vscode-inputValidation-infoBackground);
  border: 1px solid var(--vscode-inputValidation-infoBorder);
}

.badge-success {
  background: var(--vscode-testing-iconPassed);
  color: white;
}

.badge-error {
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
}
```

---

## Integration Points

### Extension Commands

Register these commands:

```typescript
// In extension.ts
context.subscriptions.push(
  vscode.commands.registerCommand(
    "orchestra.codeReview.startReview",
    startReview,
  ),
  vscode.commands.registerCommand(
    "orchestra.codeReview.fixIssues",
    fixCodeReviewIssues,
  ),
  vscode.commands.registerCommand(
    "orchestra.codeReview.verifyFixes",
    verifyCodeReviewFixes,
  ),
  vscode.commands.registerCommand(
    "orchestra.codeReview.reReview",
    reReviewTask,
  ),
  vscode.commands.registerCommand(
    "orchestra.codeReview.escalate",
    escalateRejectedReview,
  ),
  ),
  vscode.commands.registerCommand(
    "orchestra.codeReview.escalate",
    escalateRejectedReview,
  ),
  vscode.commands.registerCommand(
    "orchestra.codeReview.viewIssues",
    viewIssues,
  ),
  vscode.commands.registerCommand(
    "orchestra.codeReview.viewSubmission",
    viewSubmission,
  ),
  vscode.commands.registerCommand(
    "orchestra.codeReview.viewReview",
    viewReview,
  ),
);
```

### Tree View Integration

In code review tree view, each item has context menu and inline buttons:

```typescript
getTreeItem(element: CodeReviewItem): vscode.TreeItem {
  const item = new vscode.TreeItem(element.label);

  // Set buttons based on status
  if (element.status === 'CHANGES_REQUESTED' || element.status === 'FIXING_ISSUES') {
    item.command = {
      command: 'orchestra.codeReview.fixIssues',
      title: 'Fix Issues',
      arguments: [element.taskNumber]
    };
  } else if (element.status === 'PENDING_VERIFICATION') {
    item.command = {
      command: 'orchestra.codeReview.verifyFixes',
      title: 'Verify Fixes',
      arguments: [element.taskNumber, element.taskTitle, element.fixesSummary, ...]
    };
  }

  return item;
}
```

---

## Error Handling

### No Active Sprint

If no active sprint when button clicked:

```typescript
vscode.window
  .showErrorMessage(
    "No active sprint. Configure a sprint first.",
    "Configure Sprint",
  )
  .then((choice) => {
    if (choice === "Configure Sprint") {
      vscode.commands.executeCommand("orchestra.configureSprint");
    }
  });
```

### Review Not Found

If review data cannot be loaded:

```typescript
vscode.window
  .showErrorMessage(
    "Could not load review data. Try refreshing the view.",
    "Refresh",
  )
  .then((choice) => {
    if (choice === "Refresh") {
      vscode.commands.executeCommand("orchestra.refresh");
    }
  });
```

---

## Accessibility

- All buttons have `aria-label` with full description
- Keyboard navigation supported (Tab between actions)
- Screen reader announces status changes
- High contrast theme support for badges
