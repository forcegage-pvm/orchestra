# Sprint 004: Technical Debt Resolution

**Created**: 2025-12-22  
**Sprint ID**: sprint-004  
**Purpose**: Address accumulated technical debt from Sprint 001-003  
**Total Tasks**: 14  

---

## Sprint Configuration

```json
{
  "sprint": {
    "id": "sprint-004",
    "name": "Technical Debt Resolution"
  },
  "phases": [
    {"phase_id": "phase-1", "phase_name": "Critical Security & Workflow Fixes"},
    {"phase_id": "phase-2", "phase_name": "Information Isolation & Feedback"},
    {"phase_id": "phase-3", "phase_name": "Verification Improvements"},
    {"phase_id": "phase-4", "phase_name": "Database & UI Improvements"}
  ]
}
```

---

## Phase 1: Critical Security & Workflow Fixes

### Task 1: Fix ESCALATED Status Bypass in MCP Handlers

**Category**: INFRASTRUCTURE  
**Priority**: P0 - CRITICAL  
**Dependencies**: None  
**Source**: TD-016-escalated-status-bypass.md

**Description**:
The ESCALATED status can be bypassed by MCP tools, allowing agents to unilaterally de-escalate tasks without human supervisor intervention. Remove ESCALATED from allowed statuses in `prepare_task` and add status gate to `update_handover`.

**Acceptance Criteria**:
1. `prepare_task` rejects tasks in ESCALATED status with clear error message
2. `update_handover` only allows PENDING or PREPARE status, rejects IMPLEMENT and later
3. Error messages explain why the operation is blocked and what to do instead

**File Operations**:
- UPDATE: `src/mcp-server/handlers/prepare-task.ts` - Remove ESCALATED from validStatuses
- UPDATE: `src/mcp-server/handlers/update-handover.ts` - Add status validation

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "prepare-task.ts does not include ESCALATED in valid statuses",
      "path": "src/mcp-server/handlers/prepare-task.ts",
      "pattern": "ESCALATED",
      "min_matches": 0,
      "severity": "BLOCKING"
    }
  ],
  "behavioral_checks": [
    {
      "description": "update-handover validates task status",
      "command": "grep -c 'PENDING.*PREPARE\\|status.*validation' src/mcp-server/handlers/update-handover.ts",
      "expect_exit_code": 0,
      "severity": "BLOCKING"
    }
  ]
}
```

---

### Task 2: Add Extension De-escalation Commands

**Category**: INTEGRATION  
**Priority**: P0 - CRITICAL  
**Dependencies**: [1]  
**Source**: TD-016-escalated-status-bypass.md

**Description**:
Create VS Code commands for human supervisors to de-escalate tasks. These commands bypass MCP entirely, providing a clean separation between agent-callable tools and supervisor-only actions.

**Acceptance Criteria**:
1. Command `orchestra.deEscalateTask` - Opens dialog to choose target status (PENDING or VERIFY_FAILED)
2. Command `orchestra.moveToGateCheck` - Moves task to GATE_CHECK for re-verification
3. Command `orchestra.moveToImplement` - Moves task back to IMPLEMENT for re-work
4. Command `orchestra.forceComplete` - Force completes an escalated task (with confirmation)
5. Context menu entries visible only for ESCALATED tasks
6. All commands update database directly, not via MCP

**File Operations**:
- UPDATE: `extension/package.json` - Add command definitions and menu entries
- CREATE: `extension/src/commands/deEscalation.ts` - Command implementations
- UPDATE: `extension/src/extension.ts` - Register commands

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "deEscalation.ts exists with command handlers",
      "path": "extension/src/commands/deEscalation.ts",
      "pattern": "deEscalateTask|moveToGateCheck|moveToImplement|forceComplete",
      "min_matches": 4,
      "severity": "BLOCKING"
    },
    {
      "description": "Commands registered in extension.ts",
      "path": "extension/src/extension.ts",
      "pattern": "orchestra\\.deEscalateTask|orchestra\\.moveToGateCheck",
      "min_matches": 2,
      "severity": "BLOCKING"
    }
  ]
}
```

---

### Task 3: Fix Behavioral Check Path Resolution

**Category**: INFRASTRUCTURE  
**Priority**: HIGH  
**Dependencies**: None  
**Source**: TD-019-behavioral-check-path-resolution.md

**Description**:
Behavioral checks fail on Windows with paths containing spaces. Update `run_verification_checks` handler to resolve paths relative to workspace root and properly quote paths.

**Acceptance Criteria**:
1. Behavioral check commands receive absolute paths
2. Paths with spaces are properly quoted
3. Relative paths like `cd extension;` are expanded to absolute
4. Cross-platform: Works on Windows and Unix

**File Operations**:
- UPDATE: `src/mcp-server/handlers/run-verification-checks.ts` - Add path resolution
- UPDATE: `src/core/check-executor.ts` - Handle path expansion in commands

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "Path resolution logic exists in run-verification-checks",
      "path": "src/mcp-server/handlers/run-verification-checks.ts",
      "pattern": "workspaceRoot|absolutePath|path\\.resolve|cwd",
      "min_matches": 1,
      "severity": "BLOCKING"
    }
  ]
}
```

---

## Phase 2: Information Isolation & Feedback

### Task 4: Add Handover Information Isolation Validation

**Category**: INFRASTRUCTURE  
**Priority**: HIGH  
**Dependencies**: None  
**Source**: TD-018-sprint-configuration-gap-analysis.md (Section 4)

**Description**:
Add validation to `prepare_task` to reject handover context containing spec file references, task references, or sprint structure information. This enforces the trust boundary between orchestrator and implementor.

**Acceptance Criteria**:
1. `prepare_task` validates `context` field for forbidden patterns
2. Forbidden patterns: spec file paths, line number references, task ID references, sprint IDs
3. `prepare_task` validates `context_files` for forbidden file types
4. Forbidden files: spec/, tasks.md, manifest.yaml, .orchestrator-only/
5. Clear error messages listing which patterns were violated

**File Operations**:
- CREATE: `src/mcp-server/handlers/handover-validation.ts` - Validation functions
- UPDATE: `src/mcp-server/handlers/prepare-task.ts` - Add validation calls

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "Handover validation module exists",
      "path": "src/mcp-server/handlers/handover-validation.ts",
      "pattern": "FORBIDDEN_PATTERNS|validateHandoverContext|validateContextFiles",
      "min_matches": 2,
      "severity": "BLOCKING"
    },
    {
      "description": "prepare-task calls validation",
      "path": "src/mcp-server/handlers/prepare-task.ts",
      "pattern": "validateHandoverContext|validateContextFiles|handover-validation",
      "min_matches": 1,
      "severity": "BLOCKING"
    }
  ]
}
```

---

### Task 5: Update Agent README Files for Feedback Workflow

**Category**: REFACTOR  
**Priority**: HIGH  
**Dependencies**: None  
**Source**: TD-011-feedback-workflow.md

**Description**:
Update orchestrator and implementor agent instruction files to include complete feedback workflow documentation.

**Acceptance Criteria**:
1. Orchestrator README: Complete failure workflow with exact commands
2. Orchestrator README: Where to write feedback, how to communicate to implementor
3. Implementor README: Feedback file location (.orchestra/handover/feedback.md)
4. Implementor README: How to check for retry status via `orchestra next`
5. Handover template: Rejection handling section

**File Operations**:
- UPDATE: `extension/agents/orchestra.orchestrator.agent.md` - Add failure workflow section
- UPDATE: `extension/agents/orchestra.implementor.agent.md` - Add feedback handling section
- UPDATE: `templates/handover/agent_readme.md` - Add rejection handling

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "Orchestrator agent has failure workflow",
      "path": "extension/agents/orchestra.orchestrator.agent.md",
      "pattern": "verification.*fail|feedback|retry",
      "min_matches": 3,
      "severity": "BLOCKING"
    },
    {
      "description": "Implementor agent has feedback handling",
      "path": "extension/agents/orchestra.implementor.agent.md",
      "pattern": "feedback\\.md|retry|rejection",
      "min_matches": 2,
      "severity": "BLOCKING"
    }
  ]
}
```

---

### Task 6: Fix Progress Tracking on Verification Failure

**Category**: INFRASTRUCTURE  
**Priority**: HIGH  
**Dependencies**: None  
**Source**: TD-011-feedback-workflow.md

**Description**:
Ensure progress.yaml is updated when verification fails, so implementor can see RETRY status via `orchestra next`.

**Acceptance Criteria**:
1. `submit_verification_judgment` with FAIL updates progress tracking
2. RETRY status visible in progress data
3. `orchestra next` command shows retry information
4. Retry count visible to implementor

**File Operations**:
- UPDATE: `src/mcp-server/handlers/submit-verification-judgment.ts` - Update progress on FAIL
- UPDATE: `src/core/next.ts` - Show retry status in guidance

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "Verification judgment updates progress on failure",
      "path": "src/mcp-server/handlers/submit-verification-judgment.ts",
      "pattern": "FAIL.*progress|retry_count|VERIFY_FAILED",
      "min_matches": 1,
      "severity": "BLOCKING"
    }
  ]
}
```

---

### Task 7: Implement Standalone Feedback Command

**Category**: INFRASTRUCTURE  
**Priority**: MEDIUM  
**Dependencies**: [5, 6]  
**Source**: TD-011-feedback-workflow.md

**Description**:
Create `orchestra feedback` CLI command that generates feedback file for implementor after verification failure.

**Acceptance Criteria**:
1. Command: `orchestra feedback --task X` generates feedback file
2. Output location: `.orchestra/handover/feedback.md`
3. Includes: failure summary, specific issues, improvement guidance
4. Automatically called after verification FAIL judgment

**File Operations**:
- CREATE: `src/commands/feedback.ts` - CLI command
- CREATE: `src/core/feedback.ts` - Core logic
- UPDATE: `src/cli.ts` - Register command

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "Feedback command exists",
      "path": "src/commands/feedback.ts",
      "pattern": "createFeedbackCommand|runFeedback",
      "min_matches": 1,
      "severity": "BLOCKING"
    },
    {
      "description": "Feedback core logic exists",
      "path": "src/core/feedback.ts",
      "pattern": "generateFeedback|writeFeedback",
      "min_matches": 1,
      "severity": "BLOCKING"
    }
  ]
}
```

---

## Phase 3: Verification Improvements

### Task 8: Fix Glob Pattern Resolution in Structural Checks

**Category**: INFRASTRUCTURE  
**Priority**: MEDIUM  
**Dependencies**: None  
**Source**: TD-017-verification-pattern-matching.md

**Description**:
Structural checks with glob patterns (e.g., `test/**/*.test.ts`) fail because they're treated as literal paths. Add glob expansion support.

**Acceptance Criteria**:
1. Glob patterns detected (contains * or ?)
2. Patterns expanded using fast-glob
3. Pattern matching runs against all matched files
4. Clear error messages: "No files match pattern" vs "Pattern not found in N files"

**File Operations**:
- UPDATE: `package.json` - Add fast-glob dependency
- UPDATE: `src/core/check-executor.ts` - Add glob expansion

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "fast-glob dependency added",
      "path": "package.json",
      "pattern": "fast-glob",
      "min_matches": 1,
      "severity": "BLOCKING"
    },
    {
      "description": "Check executor handles globs",
      "path": "src/core/check-executor.ts",
      "pattern": "glob|fast-glob|isGlob|\\*",
      "min_matches": 2,
      "severity": "BLOCKING"
    }
  ]
}
```

---

### Task 9: Complete Audit Logging Coverage

**Category**: INFRASTRUCTURE  
**Priority**: MEDIUM  
**Dependencies**: None  
**Source**: TD-012-mcp-audit-logging.md

**Description**:
Add `logToolExecution` calls to all remaining MCP handlers that don't have audit logging.

**Acceptance Criteria**:
1. All MCP handlers import and use `logToolExecution`
2. Log on success and failure
3. Include: tool name, input parameters, result, duration
4. Handlers to update: prepare-task, complete-task, run-verification-checks, add-task, add-phase, remove-task, configure-sprint, get-* handlers

**File Operations**:
- UPDATE: `src/mcp-server/handlers/prepare-task.ts` - Add logging
- UPDATE: `src/mcp-server/handlers/complete-task.ts` - Add logging
- UPDATE: `src/mcp-server/handlers/run-verification-checks.ts` - Add logging
- UPDATE: `src/mcp-server/handlers/add-task.ts` - Add logging
- UPDATE: `src/mcp-server/handlers/add-phase.ts` - Add logging
- UPDATE: `src/mcp-server/handlers/remove-task.ts` - Add logging
- UPDATE: `src/mcp-server/handlers/configure-sprint.ts` - Add logging

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "prepare-task has audit logging",
      "path": "src/mcp-server/handlers/prepare-task.ts",
      "pattern": "logToolExecution",
      "min_matches": 1,
      "severity": "MAJOR"
    },
    {
      "description": "complete-task has audit logging",
      "path": "src/mcp-server/handlers/complete-task.ts",
      "pattern": "logToolExecution",
      "min_matches": 1,
      "severity": "MAJOR"
    },
    {
      "description": "run-verification-checks has audit logging",
      "path": "src/mcp-server/handlers/run-verification-checks.ts",
      "pattern": "logToolExecution",
      "min_matches": 1,
      "severity": "MAJOR"
    }
  ]
}
```

---

### Task 10: Add Cross-Reference Verification Check Type

**Category**: INFRASTRUCTURE  
**Priority**: MEDIUM  
**Dependencies**: [8]  
**Source**: TD-018-cross-reference-verification.md

**Description**:
Add new verification check type that validates identifiers match across multiple files (e.g., view IDs in package.json must match createTreeView calls in code).

**Acceptance Criteria**:
1. New check type: `cross_reference_checks` in verification schema
2. Check config: definition (source of truth) + references (must match)
3. Executor extracts values from definition file
4. Executor validates all references use same values
5. Clear error messages showing mismatches

**File Operations**:
- UPDATE: `src/schemas/verification.ts` - Add CrossReferenceCheckSchema
- UPDATE: `src/core/check-executor.ts` - Add executeCrossReferenceCheck
- UPDATE: `src/mcp-server/handlers/run-verification-checks.ts` - Handle new check type

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "CrossReferenceCheckSchema defined",
      "path": "src/schemas/verification.ts",
      "pattern": "CrossReferenceCheck|cross_reference",
      "min_matches": 1,
      "severity": "BLOCKING"
    },
    {
      "description": "Check executor handles cross-references",
      "path": "src/core/check-executor.ts",
      "pattern": "executeCrossReferenceCheck|crossReference",
      "min_matches": 1,
      "severity": "BLOCKING"
    }
  ]
}
```

---

## Phase 4: Database & UI Improvements

### Task 11: Database Change Signal File

**Category**: INFRASTRUCTURE  
**Priority**: MEDIUM  
**Dependencies**: None  
**Source**: TD-016-database-change-notification.md

**Description**:
MCP server writes a signal file after database writes. Extension watches signal file for instant UI updates instead of 2-second polling.

**Acceptance Criteria**:
1. MCP server writes `.orchestra/.signal` after any database write
2. Signal file contains timestamp
3. Extension watches signal file using VS Code FileSystemWatcher
4. File change triggers TreeView refresh
5. Remove or reduce polling interval

**File Operations**:
- CREATE: `src/mcp-server/db-signal.ts` - Signal file writer
- UPDATE: `src/db/index.ts` - Call signal after writes
- UPDATE: `extension/src/database/watcher.ts` - Add signal file watcher

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "DB signal module exists",
      "path": "src/mcp-server/db-signal.ts",
      "pattern": "writeSignal|signalPath|\\.signal",
      "min_matches": 1,
      "severity": "BLOCKING"
    },
    {
      "description": "Extension watches signal file",
      "path": "extension/src/database/watcher.ts",
      "pattern": "\\.signal|signalWatcher|FileSystemWatcher",
      "min_matches": 1,
      "severity": "BLOCKING"
    }
  ]
}
```

---

### Task 12: Sprint Settings Config Table

**Category**: INFRASTRUCTURE  
**Priority**: MEDIUM  
**Dependencies**: None  
**Source**: TD-012-sprint-settings-tdd-enforcement.md

**Description**:
Add database table and MCP tools for sprint-level configuration settings like TDD enforcement.

**Acceptance Criteria**:
1. `sprint_config` table with key-value pairs per sprint
2. Keys: require_tests, require_tests_categories, test_file_pattern, pre_signal_build_command
3. MCP tool: `get_sprint_config` - retrieve config for sprint
4. MCP tool: `set_sprint_config` - update config value
5. Config read during prepare_task for TDD auto-injection

**File Operations**:
- UPDATE: `src/db/schema.ts` - Add sprint_config table
- CREATE: `src/mcp-server/handlers/get-sprint-config.ts` - Handler
- UPDATE: `src/mcp-server/handlers/set-config.ts` - Support sprint config
- UPDATE: `src/mcp-server/tools.ts` - Register new tool

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "sprint_config table defined",
      "path": "src/db/schema.ts",
      "pattern": "sprintConfig|sprint_config",
      "min_matches": 1,
      "severity": "BLOCKING"
    },
    {
      "description": "get-sprint-config handler exists",
      "path": "src/mcp-server/handlers/get-sprint-config.ts",
      "pattern": "handleGetSprintConfig|getSprintConfig",
      "min_matches": 1,
      "severity": "BLOCKING"
    }
  ]
}
```

---

### Task 13: Sprint Settings WebView Panel

**Category**: VISUAL  
**Priority**: MEDIUM  
**Dependencies**: [12]  
**Source**: TD-012-sprint-settings-tdd-enforcement.md

**Description**:
Create VS Code WebView panel for configuring sprint settings including TDD enforcement.

**Acceptance Criteria**:
1. WebView opens via `orchestra.openSprintSettings` command
2. Shows current sprint config values
3. Checkbox: "Require tests for new code"
4. Checkbox grid: Categories to apply (INFRASTRUCTURE, INTEGRATION, etc.)
5. Text inputs: Test file pattern, pre-signal commands
6. Save/Reset buttons that update database

**File Operations**:
- CREATE: `extension/src/views/SprintSettingsPanel.ts` - WebView provider
- UPDATE: `extension/src/extension.ts` - Register panel
- CREATE: `extension/resources/sprintSettings.html` - WebView HTML (if needed)

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "SprintSettingsPanel exists",
      "path": "extension/src/views/SprintSettingsPanel.ts",
      "pattern": "SprintSettingsPanel|createWebviewPanel|require_tests",
      "min_matches": 2,
      "severity": "BLOCKING"
    },
    {
      "description": "Panel registered in extension",
      "path": "extension/src/extension.ts",
      "pattern": "SprintSettingsPanel|openSprintSettings",
      "min_matches": 1,
      "severity": "BLOCKING"
    }
  ]
}
```

---

### Task 14: Clean Up Completed TD Files

**Category**: REFACTOR  
**Priority**: LOW  
**Dependencies**: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]  
**Source**: Sprint hygiene

**Description**:
Delete completed TD files and update tracking documents to reflect resolved items.

**Acceptance Criteria**:
1. Delete `TD-013-signal-recording.md` (marked COMPLETE)
2. Delete `TD-014-escalation-soft-gate.md` (marked COMPLETE)
3. Delete `TD-014-verification-judgment-validation.md` (verified COMPLETE in code)
4. Delete `TD-015-legacy-test-failures.md` (marked COMPLETE)
5. Update remaining TD files with "addressed in Sprint 004" notes
6. Update `workflow-technical-debt.md` if needed

**File Operations**:
- DELETE: `technical-debt/TD-013-signal-recording.md`
- DELETE: `technical-debt/TD-014-escalation-soft-gate.md`
- DELETE: `technical-debt/TD-014-verification-judgment-validation.md`
- DELETE: `technical-debt/TD-015-legacy-test-failures.md`
- UPDATE: `technical-debt/TD-011-feedback-workflow.md` - Add resolution note
- UPDATE: `technical-debt/TD-016-escalated-status-bypass.md` - Add resolution note

**Verification**:
```json
{
  "structural_checks": [
    {
      "description": "TD-013-signal-recording.md deleted",
      "path": "technical-debt/TD-013-signal-recording.md",
      "pattern": ".",
      "min_matches": 0,
      "severity": "MAJOR"
    },
    {
      "description": "TD-014-escalation-soft-gate.md deleted",
      "path": "technical-debt/TD-014-escalation-soft-gate.md",
      "pattern": ".",
      "min_matches": 0,
      "severity": "MAJOR"
    }
  ]
}
```

---

## Deferred to Sprint 005

| TD ID | Title | Reason |
|-------|-------|--------|
| TD-012 (ESM) | Extension ESM Migration | Low priority, workaround acceptable |
| TD-013 (Register) | Technical Debt Register in DB | Nice-to-have, markdown works |
| TD-018e | Spec-to-Sprint Gap Analysis | Major architectural: new DB tables, new MCP tools, new UI, new workflow phase |

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| Phase 1 | 1-3 | Security: ESCALATED bypass, de-escalation commands, path resolution |
| Phase 2 | 4-7 | Workflow: Information isolation, feedback loop, progress tracking |
| Phase 3 | 8-10 | Verification: Globs, logging, cross-references |
| Phase 4 | 11-14 | Infrastructure: DB signals, sprint config, UI, cleanup |

