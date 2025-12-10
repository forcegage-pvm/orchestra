# MCP Workflows — Agent Tool Call Sequences

**Status**: Draft  
**Date**: 2025-12-09  
**Purpose**: Define the tool call sequences agents use for each Orchestra workflow step

---

## 1. Overview

This document defines **how agents use MCP tools** to execute Orchestra workflows.

**Key Difference from V1:**
- **V1**: Agents had file system context (read manifest.yaml, verification files, specs)
- **V2**: Agents have **no file access** — must use tools to get context and perform actions

Each workflow step is defined as:
1. **Context tools** — What information the agent needs first
2. **Action tools** — What the agent does with that information
3. **Tool call sequence** — The order of operations

---

## 2. Workflow Overview Table

Below is the complete workflow in typical execution order:

| # | Tool | Phase/Description | Role | Input (Conceptual) | Output (Conceptual) |
|---|------|-------------------|------|-------------------|---------------------|
| **Sprint Initialization** |
| 1 | `configure_sprint` | Define sprint with all tasks, phases, dependencies, and verification criteria | Orchestrator | Sprint metadata + tasks array + verification checks | Sprint created, task IDs assigned |
| 2 | `get_sprint_status` | Verify sprint configuration | Orchestrator | None | Sprint status, phase summaries, task counts |
| 3 | `get_progress` | Check detailed progress | Orchestrator | None | Sprint summary, completed tasks list |
| 4 | `get_tasks` | Review all tasks (optional) | Orchestrator | Filters (phase, status) | Task list |
| **Task Preparation** |
| 5 | `get_task` | Get task context before preparing handover | Orchestrator | Task ID | Task details + verification criteria |
| 6 | `prepare_task` | Create handover for implementor | Orchestrator | Task ID + acceptance criteria + file operations + deliverables | Task status → IMPLEMENT |
| **Implementation** |
| 7 | `get_current_task` | Implementor retrieves their assigned task | Implementor | None | Handover details (no verification criteria) |
| 8 | `signal_completion` | Implementor claims task complete, triggers pre-signal checks | Implementor | Task ID + summary + artifacts + build/test status | Pre-checks run, task → GATE_CHECK |
| **Verification** |
| 9 | `get_signal` | Orchestrator reviews completion signal | Orchestrator | Task ID | Signal details, artifacts, test results |
| 9b | `run_verification_checks` | Execute verification checks (auto or manual) | System/Orchestrator | Task ID + optional filters | Check results stored, accept-signal validated |
| 10 | `get_verification_results` | Orchestrator reviews verification check results | Orchestrator | Task ID | Verification pass/fail for each check with severity breakdown |
| 11 | `submit_verification_judgment` | Orchestrator judges pass or fail | Orchestrator | Task ID + judgment + rationale + failures (if any) | Task → VERIFY (pass) or VERIFY_FAILED (fail) |
| **Completion or Retry** |
| 12a | `complete_task` | Mark task complete and advance | Orchestrator | Task ID + notes | Task → COMPLETE, next task ID returned |
| 12b | `get_feedback` | Implementor retrieves failure feedback (if failed) | Implementor | Task ID | Sanitized feedback with guidance |
| 12c | `get_current_task` | Implementor gets task again (retry) | Implementor | None | Handover + feedback embedded |
| 12d | `signal_completion` | Implementor re-signals after fixes (retry loop) | Implementor | Task ID + updated summary | Re-runs pre-checks, task → GATE_CHECK |
| **Escalation (Exception Path)** |
| 13 | `escalate_task` | Escalate stuck task to human | Orchestrator | Task ID + reason + attempts summary | Task → ESCALATED |
| **Progress Tracking (Anytime)** |
| * | `get_sprint_status` | Check sprint status and phase progress | Orchestrator | None | Sprint metadata, phase summaries |
| * | `get_progress` | Check detailed progress | Orchestrator | None | Sprint summary, counts, current task, completed list |
| * | `get_task_history` | Review task audit trail | Orchestrator | Task ID | Timeline of status changes, attempts |
| **Task Management (CRUD Operations)** |
| * | `add_task` | Add task to existing sprint | Orchestrator | Task details + verification | New task created |
| * | `update_task` | Modify task metadata | Orchestrator | Task ID + fields to update | Task updated |
| * | `update_verification` | Modify verification criteria | Orchestrator | Task ID + verification checks | Verification updated |
| * | `update_handover` | Update handover mid-task | Orchestrator | Task ID + fields to update | Handover updated |
| * | `remove_task` | Delete pending task | Orchestrator | Task ID | Task deleted |
| * | `enhance_feedback` | Add guidance to feedback | Orchestrator | Task ID + additional guidance | Feedback enhanced |

**Notes:**
- **Typical flow**: 1 → 2 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12a (success) or 12b → 12c → 12d (retry)
- **Retry loop**: Steps 12b → 12c → 12d → 9 → 10 → 11 repeat until pass or max retries
- **Escalation**: Step 13 triggered when max retries exceeded or hard blocker
- **CRUD tools**: Used as needed for sprint management
- **Role enforcement**: System blocks implementor from calling orchestrator-only tools
- **Total tools**: 23 tools (21 original + run_verification_checks + set_config)

---

## 3. Workflow Steps (Detailed)

### 2.1 Sprint Initialization (Orchestrator)

**Goal**: Configure sprint with tasks, dependencies, and verification criteria

**V1 Behavior**:
- Orchestrator manually creates/edits `manifest.yaml`
- Manually creates `verification/task-*.yaml` files
- Runs `orchestra init --verify`

**V2 MCP Workflow**:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Gather Context                                      │
└─────────────────────────────────────────────────────────────┘

Agent reads requirements (SpecKit, feature specs, etc.)
→ This is external to Orchestra (agent's own research)

┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Configure Sprint                                    │
└─────────────────────────────────────────────────────────────┘

Tool: configure_sprint
Input: {
  sprint: { id, name },
  phases: [{ phase_id, phase_name, speckit_tasks? }],
  tasks: [{
    task_id, phase_id, title, description, category,
    dependencies, speckit_task_ref?,
    verification: {
      structural_checks, behavioral_checks, quality_checks
    }
  }],
  consolidations?: [...]
}

System:
→ Validates all input (dependency graph, references)
→ Creates sprint + tasks + verification in database
→ Returns: { success, sprint_id, tasks_created, summary }

┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Verify Configuration (Optional)                     │
└─────────────────────────────────────────────────────────────┘

Tool: get_sprint_status
→ Returns: Sprint status, phase summaries, task counts

Tool: get_progress
→ Returns: Detailed progress, completed tasks list

Tool: get_tasks (optional)
→ Returns: List of all tasks for review
```

**Key Points**:
- **Single tool call** creates entire sprint atomically
- Agent provides all tasks + verification criteria together
- No file management by agent
- System validates dependency graph, references, completeness

---

### 2.2 Task Preparation (Orchestrator)

**Goal**: Create handover for implementor to work on a task

**V1 Behavior**:
- Orchestrator reads manifest.yaml (sees task title, description)
- Reads verification/task-{id}.yaml (sees verification criteria they created)
- Reads spec files (SpecKit tasks, requirements)
- Manually fills in handover template
- Runs `orchestra prepare --task {id}`

**V2 MCP Workflow**:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Get Task Context                                    │
└─────────────────────────────────────────────────────────────┘

Tool: get_task
Input: { task_id: 2 }

Output: {
  task_id, phase_id, title, description, category,
  status: "PENDING",
  dependencies: [1],
  speckit_task_ref: "001-foundation/tasks.md#T002",
  
  // CRITICAL: Orchestrator sees verification they defined
  verification: {
    structural_checks: [...],
    behavioral_checks: [...],
    quality_checks: [...]
  },
  
  retry_count: 0,
  max_retries: 3
}

Tool: get_tasks (optional)
Input: { status: "COMPLETE" }
→ Verify all dependencies are complete

┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Agent Synthesis (Internal)                          │
└─────────────────────────────────────────────────────────────┘

Agent uses LLM reasoning to:
1. Analyze verification criteria (what will be verified)
2. Derive acceptance criteria (what implementor needs to achieve)
   - Translate hidden verification into visible success criteria
   - Do NOT leak verification details
3. Identify file operations needed
4. Structure test requirements
5. Determine constraints, references

This is pure reasoning — no tool calls

┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Create Handover                                     │
└─────────────────────────────────────────────────────────────┘

Tool: prepare_task
Input: {
  task_id: 2,
  acceptance_criteria: [
    { criterion: "Create YAxisPosition enum", verification: "Enum exists with TOP, CENTER, BOTTOM" },
    { criterion: "Unit tests pass", verification: "npm test shows 100% pass rate" }
  ],
  file_operations: [
    { operation: "CREATE", path: "src/enums/YAxisPosition.ts", description: "Define enum" },
    { operation: "CREATE", path: "test/enums/YAxisPosition.test.ts", description: "Unit tests" }
  ],
  deliverables: [
    "YAxisPosition.ts with enum definition",
    "Unit tests with full coverage",
    "All tests passing"
  ],
  priority?: "P1",
  test_file?: "test/enums/YAxisPosition.test.ts",
  test_requirements?: "...",
  constraints?: [...],
  references?: [...]
}

System:
→ Validates task exists, status is PENDING, dependencies complete
→ Creates handover in database
→ Updates task status to IMPLEMENT
→ Returns: { success, task_id, status: "IMPLEMENT" }
```

**Key Points**:
- **`get_task` provides preparation context** — all info orchestrator needs
- Orchestrator sees **their own verification criteria** to inform handover
- **Agent synthesis step** translates verification into acceptance criteria
- Must NOT leak verification details to implementor
- Single `prepare_task` call creates handover atomically

---

### 2.3 Implementation (Implementor)

**Goal**: Implementor retrieves task, does work, signals completion

**V1 Behavior**:
- Implementor reads handover file
- Works on task (file edits, tests, etc.)
- Manually fills in signal template
- Runs `orchestra pre-signal-check`
- Runs `orchestra signal`

**V2 MCP Workflow**:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Get Current Task                                    │
└─────────────────────────────────────────────────────────────┘

Tool: get_current_task
Input: {} (no parameters)

Output: {
  task_id: 2,
  title: "Create YAxisPosition Enum",
  priority: "P1",
  description: "...",
  
  acceptance_criteria: [
    { criterion: "Create YAxisPosition enum", verification: "Enum exists with TOP, CENTER, BOTTOM" }
  ],
  
  dependencies: ["Task 1: Foundation Setup (COMPLETE)"],
  
  file_operations: [
    { operation: "CREATE", path: "src/enums/YAxisPosition.ts", description: "..." }
  ],
  
  deliverables: [...],
  test_file: "test/enums/YAxisPosition.test.ts",
  test_requirements: "...",
  constraints: [...],
  references: [...],
  
  // If retry, includes feedback
  feedback?: {
    attempt: 2,
    max_attempts: 3,
    issues: [...]
  }
}

┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Implementation Work (External to Orchestra)         │
└─────────────────────────────────────────────────────────────┘

Agent performs work:
→ Creates/modifies files
→ Writes tests
→ Runs build/test locally
→ Validates acceptance criteria

This is agent's core work — no Orchestra tool calls

┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Signal Completion                                   │
└─────────────────────────────────────────────────────────────┘

Tool: signal_completion
Input: {
  task_id: 2,
  summary: "Created YAxisPosition enum with TOP, CENTER, BOTTOM values. Added unit tests with 100% coverage.",
  
  artifacts_created: [
    { path: "src/enums/YAxisPosition.ts", type: "CREATE", description: "Enum definition" },
    { path: "test/enums/YAxisPosition.test.ts", type: "CREATE", description: "Unit tests" }
  ],
  
  tests: [
    { test_file: "test/enums/YAxisPosition.test.ts", coverage: "Enum values and type safety" }
  ],
  
  build_status: "PASS",
  test_status: "PASS",
  
  notes?: "All acceptance criteria met. Tests passing."
}

System:
→ Validates task_id matches current task, status is IMPLEMENT
→ Runs pre-signal checks (build, test, lint) — AUTOMATIC
→ If pre-signal checks fail: Returns error with check output
→ If pre-signal checks pass: Creates signal, updates status to GATE_CHECK
→ Returns: {
    success: true,
    signal_id,
    status: "GATE_CHECK",
    pre_signal_checks: { build: {passed: true}, test: {passed: true}, lint: {passed: true} },
    next_step: "Verification will run automatically..."
  }
```

**Key Points**:
- **`get_current_task` is implementor's only read access**
- Implementor CANNOT see other tasks, verification criteria, or sprint config
- **Pre-signal checks run automatically** (Eager Validation)
- Cannot signal without passing build/test/lint
- If checks fail, agent must fix and signal again

---

### 2.4 Verification (Orchestrator)

**Goal**: Orchestrator reviews verification results and judges pass/fail

**V1 Behavior**:
- System runs `orchestra verify` (automated checks)
- Orchestrator reads verification report
- Makes judgment (pass/fail)
- If fail, provides feedback

**V2 MCP Workflow**:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Review Signal                                       │
└─────────────────────────────────────────────────────────────┘

Tool: get_signal
Input: { task_id: 2 }

Output: {
  task_id: 2,
  signal_id: "abc123",
  signaled_at: "2025-12-09T10:00:00Z",
  summary: "Created YAxisPosition enum...",
  artifacts_created: [...],
  tests: [...],
  build_status: "PASS",
  test_status: "PASS",
  notes: "All acceptance criteria met",
  pre_signal_checks: { /* all passed */ }
}

┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Review Verification Results                         │
└─────────────────────────────────────────────────────────────┘

Tool: get_verification_results (future tool — not yet defined)
Input: { task_id: 2 }

Output: {
  task_id: 2,
  run_at: "2025-12-09T10:01:00Z",
  results: [
    { check_id: "struct-0", passed: true, output: "...", duration_ms: 50 },
    { check_id: "behav-0", passed: false, output: "Expected exit code 0, got 1", duration_ms: 1200 }
  ],
  summary: {
    total_checks: 5,
    passed: 4,
    failed: 1,
    overall_passed: false
  }
}

NOTE: This tool was missing from initial schema — now added as tool #20

┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Agent Judgment (Internal)                           │
└─────────────────────────────────────────────────────────────┘

Agent analyzes:
→ Signal summary
→ Verification results
→ Acceptance criteria alignment
→ Makes judgment: PASS or FAIL

If FAIL, agent determines:
→ Which checks failed
→ Why they failed
→ How to fix (without leaking verification details)

┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Submit Judgment                                     │
└─────────────────────────────────────────────────────────────┘

Tool: submit_verification_judgment

Input (PASS):
{
  task_id: 2,
  judgment: "PASS",
  rationale: "All verification checks passed. Enum correctly defined with all values."
}

Input (FAIL):
{
  task_id: 2,
  judgment: "FAIL",
  rationale: "Behavioral check failed: enum values not correctly exported",
  failures: [
    {
      check_id: "behav-0",
      reason: "Import test failed - enum not properly exported",
      priority: "high",
      guidance: "Ensure YAxisPosition enum is exported from index.ts"
    }
  ],
  feedback: "Almost there! Just need to fix the export."
}

System:
→ Validates task status is GATE_CHECK
→ If PASS: Updates status to VERIFY, awaits complete
→ If FAIL: Generates sanitized feedback for implementor
→ Returns: {
    success: true,
    judgment: "FAIL",
    status: "VERIFY_FAILED",
    retry_count: 1,
    max_retries: 3,
    can_retry: true,
    next_step: "Feedback generated for implementor. They will retry."
  }
```

**Key Points**:
- **Missing tool**: `get_verification_results` not in current schema
- Orchestrator reviews signal + verification results
- Agent makes judgment using LLM reasoning
- Feedback must be **sanitized** (no verification criteria leaked)
- System enforces retry limits

---

### 2.5 Retry (Implementor)

**Goal**: Implementor receives feedback and retries failed task

**V1 Behavior**:
- Implementor reads feedback file
- Makes corrections
- Re-signals

**V2 MCP Workflow**:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Get Feedback                                        │
└─────────────────────────────────────────────────────────────┘

Tool: get_current_task
Input: {}

Output: {
  task_id: 2,
  title: "Create YAxisPosition Enum",
  status: "RETRY",
  
  // Normal handover data
  acceptance_criteria: [...],
  file_operations: [...],
  
  // PLUS feedback from failed verification
  feedback: {
    attempt: 1,
    max_attempts: 3,
    can_retry: true,
    issues: [
      {
        category: "Export",
        severity: "BLOCKING",
        problem: "Import test failed - enum not properly exported",
        impact: "Other modules cannot use YAxisPosition enum",
        guidance: "Ensure YAxisPosition enum is exported from index.ts"
      }
    ],
    passed_checks: [
      "Enum definition correct",
      "Unit tests present",
      "Test coverage adequate"
    ],
    next_steps: [
      "Add export statement to src/enums/index.ts",
      "Re-run build to verify",
      "Signal completion again"
    ]
  }
}

Alternative tool: get_feedback
Input: { task_id: 2, attempt: 1 }
→ Returns same feedback structure

┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Fix Issues                                          │
└─────────────────────────────────────────────────────────────┘

Agent makes corrections based on feedback
→ External work, no Orchestra tools

┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Re-signal                                           │
└─────────────────────────────────────────────────────────────┘

Tool: signal_completion
Input: {
  task_id: 2,
  summary: "Fixed export issue. Added YAxisPosition to index.ts exports.",
  artifacts_created: [
    { path: "src/enums/index.ts", type: "UPDATE", description: "Added export" }
  ],
  // ... rest of signal data
}

System:
→ Same validation as first attempt
→ Pre-signal checks run again
→ If pass, moves to GATE_CHECK
```

**Key Points**:
- Feedback included in `get_current_task` response
- Implementor sees **sanitized** feedback (no verification details)
- Retry follows same workflow as initial implementation
- Attempt counter tracks retries

---

### 2.6 Completion (Orchestrator)

**Goal**: Mark task complete and advance to next task

**V1 Behavior**:
- Orchestrator runs `orchestra complete --task {id}`
- System archives artifacts, updates progress

**V2 MCP Workflow**:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Finalize Task                                       │
└─────────────────────────────────────────────────────────────┘

Tool: complete_task
Input: {
  task_id: 2,
  notes?: "Excellent work. Enum is well-structured and tested."
}

System:
→ Validates task status is VERIFY (passed verification)
→ Updates task status to COMPLETE
→ Updates progress tracking
→ Archives signal + verification results
→ Determines next task

Output: {
  success: true,
  task_id: 2,
  status: "COMPLETE",
  completed_at: "2025-12-09T11:00:00Z",
  
  progress: {
    total_tasks: 10,
    completed: 2,
    remaining: 8,
    next_task_id: 3  // Next pending task
  }
}

┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Check Progress                                      │
└─────────────────────────────────────────────────────────────┘

Tool: get_progress (optional)
→ Returns sprint summary

Tool: get_task (optional)
Input: { task_id: 3 }
→ Get context for next task preparation
```

**Key Points**:
- Single tool call completes task
- System returns next task ID automatically
- Orchestrator can immediately prepare next task
- Use `get_sprint_status` for high-level sprint overview

---

### 2.7 Escalation (Orchestrator)

**Goal**: Escalate task to human supervisor when stuck

**V1 Behavior**:
- Manual escalation (not automated in v1)

**V2 MCP Workflow**:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Escalate                                            │
└─────────────────────────────────────────────────────────────┘

Tool: escalate_task
Input: {
  task_id: 2,
  reason: "Maximum retry attempts exceeded (3/3). Fundamental design issue suspected.",
  attempts_summary: "Attempt 1: Export issue. Attempt 2: Type error. Attempt 3: Build failure persists.",
  recommended_action: "Human should review enum design. May need refactoring."
}

System:
→ Updates task status to ESCALATED
→ Notifies human supervisor (future: via notification system)

Output: {
  success: true,
  task_id: 2,
  status: "ESCALATED",
  escalated_at: "2025-12-09T12:00:00Z",
  next_step: "Human supervisor will review and provide guidance."
}
```

**Key Points**:
- Triggered when max retries exceeded or hard blocker
- Orchestrator provides context for human review
- System pauses task progression

---

## 3. Missing Tools Identified

~~While documenting workflows, identified **missing tools** from current schema:~~

**UPDATE**: Both missing tools have been added to `04-mcp-tool-schemas.md`:

### 3.1 `get_verification_results` ✅ ADDED (Enhanced v1.1.0)

**Purpose**: Orchestrator retrieves verification run results with full check details

**Input**:
```typescript
{
  task_id: number,
}
```

**Output** (Enhanced v1.1.0 - VER-024/025/026):
```typescript
{
  task_id: number,
  run_at: string,
  
  results: Array<{
    check_id: string,
    type: "structural" | "behavioral" | "quality",  // NEW: check type
    description: string,                             // NEW: check description
    severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO", // NEW: severity
    passed: boolean,
    output?: string,
    duration_ms: number,
  }>,
  
  summary: {
    total_checks: number,
    passed: number,
    failed: number,
    overall_passed: boolean,  // Based on BLOCKING checks only
    severity_breakdown: {     // NEW: breakdown by severity
      BLOCKING: { passed: number, failed: number },
      MAJOR: { passed: number, failed: number },
      MINOR: { passed: number, failed: number },
      INFO: { passed: number, failed: number },
    },
  },
}
```

**Key Behaviors (v1.1.0)**:
- `overall_passed` is **system-computed** based on BLOCKING checks only
- Results include full check context (type, description, severity)
- Severity breakdown enables granular pass/fail analysis

**Status**: ✅ Added to tool schemas as tool #20, enhanced v1.1.0

---

### 3.2 `get_sprint_status` ✅ ADDED

**Purpose**: Get overall sprint status

**Input**: None

**Output**:
```typescript
{
  sprint_id: string,
  name: string,
  status: "ACTIVE" | "COMPLETED",
  started_at: string,
  
  summary: {
    total_tasks: number,
    completed: number,
    in_progress: number,
    pending: number,
  },
  
  current_task?: {
    task_id: number,
    title: string,
    status: string,
  },
}
```

**Status**: ✅ Added to tool schemas as tool #21

---

### 3.3 `run_verification_checks` ✅ ADDED (v1.1.0)

**Purpose**: Execute verification checks for a task (called automatically after signal, can also run manually)

**Input**:
```typescript
{
  task_id: number,
  check_ids?: string[],        // Optional: run specific checks only
  severity_filter?: "BLOCKING" | "MAJOR" | "MINOR" | "INFO" | "all",
  continue_on_error?: boolean, // Default: false
  dry_run?: boolean,           // Default: false (preview checks without running)
}
```

**Output**:
```typescript
{
  status: "COMPLETED" | "PARTIAL" | "REJECTED",
  task_id: number,
  accept_signal_status: "ACCEPTED" | "REJECTED",  // Pre-flight validation
  accept_signal_checks: Array<{
    check_id: string,
    description: string,
    passed: boolean,
    reason?: string,
  }>,
  checks_run: number,
  checks_passed: number,
  checks_failed: number,
  results: Array<{
    check_id: string,
    type: "structural" | "behavioral" | "quality",
    description: string,
    severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
    passed: boolean,
    message: string,
    output?: string,
    duration_ms: number,
  }>,
}
```

**Key Behaviors (v1.1.0)**:
- **Accept-Signal Validation**: Validates signal before running checks (ASV-1 through ASV-5)
  - ASV-1: Signal exists for task
  - ASV-2: Pre-signal checks passed (build/test status)
  - ASV-3: Signal not stale (default 60 min timeout)
  - ASV-4: Task in GATE_CHECK status
  - ASV-5: Verification checks exist for task
- Returns REJECTED if accept-signal validation fails
- Executes structural, behavioral, and quality checks
- Stores results in database for retrieval via `get_verification_results`

**Status**: ✅ Added to tool schemas as tool #22

---

### 3.4 `set_config` ✅ ADDED (v1.1.0)

**Purpose**: Set configuration values in database (e.g., pre_signal commands)

**Input**:
```typescript
{
  key: string,
  value: unknown,  // JSON-serializable value
  description?: string,
}
```

**Output**:
```typescript
{
  success: true,
  key: string,
  message: string,
}
```

**Status**: ✅ Added to tool schemas as tool #23

---

## 4. Tool Call Sequences Summary

### 4.1 Orchestrator Workflows

| Workflow Step | Context Tools | Action Tools | Result |
|---------------|---------------|--------------|--------|
| **Sprint Init** | _(external research)_ | `configure_sprint` | Sprint + tasks created |
| **Prepare Task** | `get_task`, `get_tasks` | `prepare_task` | Handover created |
| **Verification** | `get_signal`, `get_verification_results` | `submit_verification_judgment` | Task verified or failed |
| **Completion** | _(status known)_ | `complete_task` | Task complete, next task ready |
| **Escalation** | _(status known)_ | `escalate_task` | Task escalated to human |

### 4.2 Implementor Workflows

| Workflow Step | Context Tools | Action Tools | Result |
|---------------|---------------|--------------|--------|
| **Get Task** | `get_current_task` | _(agent works)_ | Task context retrieved |
| **Signal** | _(work complete)_ | `signal_completion` | Pre-checks run, signal submitted |
| **Retry** | `get_current_task`, `get_feedback` | `signal_completion` | Retry with feedback |

---

## 5. Workflow Comparison: V1 vs V2

### 5.1 Sprint Initialization

| Aspect | V1 (File-Based) | V2 (MCP-Based) |
|--------|-----------------|----------------|
| **Context** | Agent reads spec files | Agent reads spec files (external) |
| **Task definition** | Agent edits manifest.yaml | Agent calls `configure_sprint` |
| **Verification** | Agent creates verification/*.yaml | Embedded in task definition |
| **Validation** | Manual file editing, errors at runtime | Schema validation, fail fast |
| **Tool calls** | 0 (file edits) | 1 (`configure_sprint`) |

### 5.2 Task Preparation

| Aspect | V1 (File-Based) | V2 (MCP-Based) |
|--------|-----------------|----------------|
| **Context** | Read manifest.yaml, verification/*.yaml | `get_task` returns all context |
| **Handover creation** | Edit handover template file | `prepare_task` with structured data |
| **Validation** | Template placeholders, may be incomplete | Validation enforces completeness |
| **Tool calls** | 0-1 (file edits + CLI) | 2 (`get_task`, `prepare_task`) |

### 5.3 Implementation

| Aspect | V1 (File-Based) | V2 (MCP-Based) |
|--------|-----------------|----------------|
| **Get task** | Read handover file | `get_current_task` |
| **Pre-signal checks** | Manual CLI command | Automatic on `signal_completion` |
| **Signal** | Edit signal template file + CLI | `signal_completion` with structured data |
| **Tool calls** | 0-2 (file edits + CLI) | 1-2 (`get_current_task`, `signal_completion`) |

### 5.4 Verification

| Aspect | V1 (File-Based) | V2 (MCP-Based) |
|--------|-----------------|----------------|
| **Review results** | Read verification report file | `get_signal`, `get_verification_results` |
| **Submit judgment** | CLI command | `submit_verification_judgment` |
| **Feedback** | System generates file | System generates in DB, agent retrieves via `get_feedback` |
| **Tool calls** | 1 (CLI) | 2-3 (`get_signal`, `get_verification_results`, `submit_verification_judgment`) |

---

## 6. Workflow State Machine

```
┌──────────────┐
│   PENDING    │ ← Task created
└──────┬───────┘
       │
       │ prepare_task
       ↓
┌──────────────┐
│   PREPARE    │ ← Handover being created
└──────┬───────┘
       │
       │ (handover complete)
       ↓
┌──────────────┐
│  IMPLEMENT   │ ← Implementor working
└──────┬───────┘
       │
       │ signal_completion
       ↓
┌──────────────┐
│  GATE_CHECK  │ ← Pre-signal checks + verification running
└──────┬───────┘
       │
       │ submit_verification_judgment(PASS)
       ↓
┌──────────────┐
│    VERIFY    │ ← Awaiting complete_task
└──────┬───────┘
       │
       │ complete_task
       ↓
┌──────────────┐
│   COMPLETE   │ ← Task done
└──────────────┘

       Alternative paths:
       
       GATE_CHECK → submit_verification_judgment(FAIL) → VERIFY_FAILED
       
       VERIFY_FAILED → (can retry?) → RETRY → IMPLEMENT
       
       VERIFY_FAILED → (max retries) → escalate_task → ESCALATED
```

---

## 7. Key Insights

### 7.1 Context Acquisition Pattern

**Every workflow step follows this pattern:**

1. **Get Context** (read tools)
2. **Agent Reasoning** (LLM synthesis)
3. **Take Action** (write tools)

Example:
```
get_task → [agent synthesizes handover] → prepare_task
```

### 7.2 Information Flow

```
Orchestrator creates verification criteria (hidden)
         ↓
Orchestrator prepares handover (sanitized)
         ↓
Implementor sees handover (no verification details)
         ↓
Implementor signals completion
         ↓
System runs verification (using hidden criteria)
         ↓
Orchestrator reviews results (sees verification)
         ↓
Orchestrator provides feedback (sanitized)
```

### 7.3 Validation Points (Eager Validation)

| Tool | Validation Performed |
|------|----------------------|
| `configure_sprint` | Dependency graph acyclic, references valid, at least one verification check |
| `prepare_task` | Dependencies complete, verification exists, all required fields present |
| `signal_completion` | Pre-signal checks pass (build, test, lint) |
| `submit_verification_judgment` | Task in correct state, failures reference valid checks |
| `complete_task` | Task verified (status = VERIFY) |

---

## 8. Agent Responsibilities

### 8.1 Orchestrator

**Responsible for**:
- Defining tasks and verification criteria
- Translating verification into acceptance criteria (without leaking details)
- Reviewing verification results and making judgment
- Providing constructive feedback
- Managing sprint progression

**NOT responsible for**:
- File structure management
- Template rendering
- Running verification checks

### 8.2 Implementor

**Responsible for**:
- Understanding acceptance criteria
- Implementing changes
- Writing tests
- Ensuring build/tests pass before signaling

**NOT responsible for**:
- Knowing verification criteria
- Managing task state
- Running verification checks

### 8.3 System

**Responsible for**:
- Validating all inputs (Eager Validation)
- Enforcing role-based access control
- Running pre-signal checks
- Running verification checks
- Generating feedback templates
- State management
- Audit trail

---

## 9. Next Steps

1. ✅ MCP workflows documented
2. ✅ Missing tools added to tool schemas (`get_verification_results`, `get_sprint_status`)
3. ⏭️ Resolve open questions from tool schemas document
4. ⏭️ Database schema design
5. ⏭️ Zod schema implementation

---

## Appendix: Workflow Decision Tree

```
Agent starts → What role?
  │
  ├─ Orchestrator
  │   │
  │   └─ What phase?
  │       │
  │       ├─ Sprint not configured → configure_sprint
  │       │
  │       ├─ Task needs preparation
  │       │   └─ get_task → prepare_task
  │       │
  │       ├─ Task signaled
  │       │   └─ get_signal + get_verification_results → submit_verification_judgment
  │       │
  │       ├─ Task verified
  │       │   └─ complete_task
  │       │
  │       └─ Task stuck
  │           └─ escalate_task
  │
  └─ Implementor
      │
      └─ What action?
          │
          ├─ Start task → get_current_task
          │
          ├─ Work complete → signal_completion
          │
          └─ Retry → get_current_task (includes feedback) → fix → signal_completion
```
