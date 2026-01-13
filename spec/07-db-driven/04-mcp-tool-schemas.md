# MCP Tool Schemas — Template-Driven Design

**Status**: Draft  
**Date**: 2025-12-09  
**Purpose**: Define MCP tool input/output schemas based on v1 templates

---

## 1. Overview

This document defines MCP tool schemas by:
1. **Starting with v1 templates** — what data agents need to provide
2. **Adding CRUD operations** — read/update tools inferred from templates
3. **Proposing improvements** — where database removes file-based constraints

**Key Principle**: Agent provides semantic content → System provides structure

---

## 2. Template-to-Tool Mapping

### 2.1 Core Templates

| Template | Primary Tool | Additional Tools | Purpose |
|----------|--------------|------------------|---------|
| `manifest.yaml.hbs` | `configure_sprint` | `add_task`, `update_task`, `get_task`, `get_tasks`, `remove_task` | Sprint & task configuration |
| `verification-criteria.yaml.hbs` | _(embedded in configure_sprint)_ | `update_verification`, `get_verification_results` | Hidden verification criteria |
| `current-task.md.hbs` | `prepare_task` | `update_handover`, `get_current_task` | Implementor handover |
| `completion-signal.md.hbs` | `signal_completion` | `get_signal` | Implementor completion claim |
| `feedback.md.hbs` | _(auto-generated)_ | `enhance_feedback`, `get_feedback` | Verification failure feedback |
| `progress.yaml.hbs` | _(auto-tracked)_ | `get_progress`, `get_sprint_status`, `get_task_history` | Audit trail & sprint status |

### 2.2 Supporting Templates (Rendering Only)

These templates are **views** of data, not input structures:

| Template | Renders From | Used For |
|----------|--------------|----------|
| `task-context.md.hbs` | Task + Sprint data | Context document |
| `task-results.md.hbs` | Verification results | Results summary |
| `orchestrator-preflight.md.hbs` | Sprint state | Human checklist |
| `orchestra.yaml.hbs` | Config | Initial setup |

---

## 3. Tool Definitions

### 3.1 Sprint Configuration: `configure_sprint`

**Template**: `manifest.yaml.hbs`

**Purpose**: Orchestrator defines sprint with tasks, dependencies, and verification

**What Agent Provides**:

```typescript
{
  sprint: {
    id: string,              // e.g., "sprint-015"
    name: string,            // e.g., "Multi-Axis Normalization"
  },

  phases: Array<{
    phase_id: string,        // e.g., "foundation"
    phase_name: string,      // e.g., "Foundation Phase"
    speckit_tasks?: string[], // Optional: ["T001", "T002"]
  }>,

  tasks: Array<{
    task_id: number,         // Sequential: 1, 2, 3...
    phase_id: string,        // Which phase
    title: string,
    description: string,
    category: "INFRASTRUCTURE" | "INTEGRATION" | "VISUAL" | "REFACTOR",
    dependencies: number[],  // Empty array if no deps
    speckit_task_ref?: string,
    
    // NEW: Embedded verification (no separate file)
    verification: {
      structural_checks?: Array<{
        description: string,
        severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
        path: string,
        pattern?: string,
        min_matches?: number,
      }>,
      
      behavioral_checks?: Array<{
        description: string,
        severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
        command: string,
        expect_exit_code?: number,
        expect_output_contains?: string,
      }>,
      
      quality_checks?: Array<{
        description: string,
        severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
        command?: string,
        path?: string,
        pattern?: string,
        min_matches?: number,
      }>,
    },
  }>,

  consolidations?: Array<{
    consolidated_task_id: number,
    speckit_tasks: string[],
    consolidation_rationale: string,
    verification_coverage?: Record<string, string>,
  }>,
}
```

**System Returns**:

```typescript
{
  success: true,
  sprint_id: string,
  tasks_created: number,
  
  summary: {
    phases: number,
    total_tasks: number,
  },
}
```

**Improvements from V1**:

| V1 | V2 | Justification |
|----|----|---------------|
| Verification in separate YAML files | Embedded in task definition | Atomic: task + verification defined together |
| Agent creates `verification/*.yaml` files | System stores verification with task | No file structure management by agent |
| Template has example tasks with TODOs | Agent provides complete task list | No placeholder/TODO pattern |
| Checks grouped by type (structural/behavioral/quality) | Same grouping preserved | Good organization, keep it |

**Validations** (Eager Validation principle):

- ✅ All phase IDs unique
- ✅ All task IDs sequential starting from 1
- ✅ All `phase_id` references exist
- ✅ All `dependencies` reference valid task IDs
- ✅ Dependency graph is acyclic
- ✅ Each task has at least one verification check
- ✅ All severity values valid

---

### 3.2 Add Task: `add_task`

**Template**: Inferred from `manifest.yaml.hbs`

**Purpose**: Add a single task to existing sprint

**What Agent Provides**:

```typescript
{
  phase_id: string,
  title: string,
  description: string,
  category: "INFRASTRUCTURE" | "INTEGRATION" | "VISUAL" | "REFACTOR",
  dependencies: number[],
  speckit_task_ref?: string,
  
  verification: {
    structural_checks?: Array<{ /* same as configure_sprint */ }>,
    behavioral_checks?: Array<{ /* same */ }>,
    quality_checks?: Array<{ /* same */ }>,
  },
}
```

**System Returns**:

```typescript
{
  success: true,
  task_id: number,  // Auto-assigned next ID
}
```

**Validations**:

- ✅ Sprint exists
- ✅ Phase exists
- ✅ Dependencies valid, no cycles
- ✅ At least one verification check

---

### 3.3 Update Task: `update_task`

**Template**: Inferred from `manifest.yaml.hbs`

**Purpose**: Update existing task metadata

**What Agent Provides**:

```typescript
{
  task_id: number,
  
  // All fields optional (only update what's provided)
  title?: string,
  description?: string,
  category?: "INFRASTRUCTURE" | "INTEGRATION" | "VISUAL" | "REFACTOR",
  dependencies?: number[],
  phase_id?: string,
  speckit_task_ref?: string,
}
```

**System Returns**:

```typescript
{
  success: true,
  task_id: number,
  updated_fields: string[],  // List of changed fields
}
```

**Validations**:

- ✅ Task exists
- ✅ If updating phase, phase exists
- ✅ If updating dependencies, no cycles

---

### 3.4 Update Verification: `update_verification`

**Template**: `verification-criteria.yaml.hbs`

**Purpose**: Update verification criteria for a task

**What Agent Provides**:

```typescript
{
  task_id: number,
  
  verification: {
    structural_checks?: Array<{ /* ... */ }>,
    behavioral_checks?: Array<{ /* ... */ }>,
    quality_checks?: Array<{ /* ... */ }>,
  },
}
```

**System Returns**:

```typescript
{
  success: true,
  task_id: number,
  total_checks: number,
}
```

**Improvement from V1**:

| V1 | V2 | Justification |
|----|----|---------------|
| Verification has auto-generated IDs (`struct-0`, `behav-1`) | System generates IDs automatically | Agent doesn't manage check IDs |
| Three separate arrays in template | Same structure | Works well, keep it |

---

### 3.5 Get Task: `get_task`

**Template**: Inferred from `manifest.yaml.hbs`

**Purpose**: Read single task details

**What Agent Provides**:

```typescript
{
  task_id: number,
}
```

**System Returns** (Orchestrator view):

```typescript
{
  task_id: number,
  phase_id: string,
  title: string,
  description: string,
  category: "INFRASTRUCTURE" | "INTEGRATION" | "VISUAL" | "REFACTOR",
  status: "PENDING" | "PREPARE" | "IMPLEMENT" | "GATE_CHECK" | "VERIFY" | "VERIFY_FAILED" | "COMPLETE" | "RETRY" | "ESCALATED",
  dependencies: number[],
  speckit_task_ref?: string,
  created_at: string,
  
  // Orchestrator sees verification
  verification: {
    structural_checks: Array<{ /* ... */ }>,
    behavioral_checks: Array<{ /* ... */ }>,
    quality_checks: Array<{ /* ... */ }>,
  },
  
  // If handover exists
  handover?: {
    prepared_at: string,
    /* ... handover data ... */
  },
  
  // Attempt tracking
  retry_count: number,
  max_retries: number,
}
```

**System Returns** (Implementor view - RESTRICTED):

```typescript
{
  task_id: number,
  title: string,
  description: string,
  status: "IMPLEMENT" | "RETRY",  // Only sees own task
  
  // NO verification criteria (hidden)
  // Only handover data
  handover: {
    /* ... handover data ... */
  },
}
```

**Improvement from V1**:

| V1 | V2 | Justification |
|----|----|---------------|
| Implementor can read manifest file (sees all tasks) | Implementor only sees current task | Proper role-based access |
| Verification in separate file, could be accidentally exposed | System enforces access control | Security by design, not process |

---

### 3.6 Get Tasks: `get_tasks`

**Template**: Inferred from `manifest.yaml.hbs`

**Purpose**: List all tasks (with optional filtering)

**What Agent Provides**:

```typescript
{
  phase_id?: string,  // Filter by phase
  status?: "PENDING" | "PREPARE" | ...,  // Filter by status
}
```

**System Returns**:

```typescript
{
  tasks: Array<{
    task_id: number,
    phase_id: string,
    title: string,
    category: string,
    status: string,
    dependencies: number[],
  }>,
  
  total: number,
}
```

---

### 3.7 Remove Task: `remove_task`

**Template**: Inferred from `manifest.yaml.hbs`

**Purpose**: Delete a task

**What Agent Provides**:

```typescript
{
  task_id: number,
}
```

**System Returns**:

```typescript
{
  success: true,
  task_id: number,
}
```

**Validations**:

- ✅ Task exists
- ✅ No other tasks depend on it
- ✅ Task status is PENDING (can't remove in-progress tasks)

---

### 3.8 Prepare Task: `prepare_task`

**Template**: `current-task.md.hbs`

**Purpose**: Orchestrator creates handover for implementor

**What Agent Provides**:

```typescript
{
  task_id: number,
  
  // Maps to template fields
  acceptance_criteria: Array<{
    criterion: string,          // The requirement
    verification: string,       // How to verify (visible to implementor)
  }>,
  
  file_operations: Array<{
    operation: "CREATE" | "MODIFY" | "DELETE" | "RENAME",
    path: string,
    description: string,        // Purpose/what changes
  }>,
  
  deliverables: string[],       // Checklist items
  
  // Optional fields
  priority?: "P0" | "P1" | "P2" | "P3",
  test_file?: string,
  test_requirements?: string,   // Markdown with test structure
  constraints?: string[],
  references?: string[],
  notes?: string,
}
```

**System Returns**:

```typescript
{
  success: true,
  task_id: number,
  status: "IMPLEMENT",  // Task now ready for implementor
}
```

**Improvements from V1**:

| V1 | V2 | Justification |
|----|----|---------------|
| Template has placeholder comments (`<!-- ORCHESTRATOR: You MUST... -->`) | No placeholders, validation enforces completeness | Agent must provide all required fields |
| acceptance_criteria is just strings | Structured: criterion + verification method | Clearer separation of what vs how to verify (but still visible to implementor) |
| file_operations includes operation type | Same | Good structure, keep it |
| Template allows empty sections | Validation rejects empty acceptance_criteria or file_operations | Eager Validation: fail fast |

**Validations**:

- ✅ Task exists and status is PENDING
- ✅ All dependencies are COMPLETE
- ✅ Task has verification defined (separate check)
- ✅ At least one acceptance criterion
- ✅ At least one file operation
- ✅ At least one deliverable

---

### 3.9 Get Current Task: `get_current_task`

**Template**: `current-task.md.hbs`

**Purpose**: Implementor retrieves their current task

**What Agent Provides**:

```typescript
{
  // No parameters - returns current task for calling agent
}
```

**System Returns**:

```typescript
{
  task_id: number,
  title: string,
  priority: "P0" | "P1" | "P2" | "P3",
  description: string,
  
  acceptance_criteria: Array<{
    criterion: string,
    verification: string,
  }>,
  
  dependencies: string[],  // Human-readable: "Task 1: Create Foundation"
  
  file_operations: Array<{
    operation: "CREATE" | "MODIFY" | "DELETE" | "RENAME",
    path: string,
    description: string,
  }>,
  
  deliverables: string[],
  
  test_file?: string,
  test_requirements?: string,
  constraints?: string[],
  references?: string[],
  notes?: string,
  
  // If this is a retry, includes feedback
  feedback?: {
    attempt: number,
    max_attempts: number,
    issues: Array<{
      category: string,
      severity: string,
      problem: string,
      impact: string,
      guidance: string,
    }>,
    passed_checks?: string[],
  },
}
```

**Validations**:

- ✅ Sprint is active
- ✅ Current task exists (error if no task ready)
- ✅ Calling agent has implementor role

---

### 3.10 Update Handover: `update_handover`

**Template**: `current-task.md.hbs`

**Purpose**: Orchestrator updates handover (e.g., adds guidance mid-task)

**What Agent Provides**:

```typescript
{
  task_id: number,
  
  // All fields optional (partial update)
  acceptance_criteria?: Array<{ criterion: string, verification: string }>,
  file_operations?: Array<{ /* ... */ }>,
  deliverables?: string[],
  test_requirements?: string,
  constraints?: string[],
  references?: string[],
  notes?: string,
}
```

**System Returns**:

```typescript
{
  success: true,
  task_id: number,
  updated_fields: string[],
}
```

**Improvement from V1**:

| V1 | V2 | Justification |
|----|----|---------------|
| Updating handover requires manual file edit | Tool-based update | Structured, validated updates |
| Implementor might see partial/broken handover mid-update | Atomic updates | Consistency guaranteed |

---

### 3.11 Signal Completion: `signal_completion`

**Template**: `completion-signal.md.hbs`

**Purpose**: Implementor claims task is complete

**What Agent Provides**:

```typescript
{
  task_id: number,  // Must match current task
  
  summary: string,  // Brief description of work done
  
  artifacts_created: Array<{
    path: string,
    type: "CREATE" | "UPDATE" | "DELETE",
    description: string,
  }>,
  
  tests: Array<{
    test_file: string,
    coverage: string,  // What it tests
  }>,
  
  build_status: "PASS" | "FAIL",
  test_status: "PASS" | "FAIL",
  
  notes?: string,  // Issues, concerns, suggestions
}
```

**System Returns** (Success):

```typescript
{
  success: true,
  task_id: number,
  signal_id: string,  // Unique identifier for this signal
  status: "GATE_CHECK",  // Pre-signal checks running
  
  pre_signal_checks: {
    build: { passed: boolean, output?: string },
    test: { passed: boolean, output?: string },
    lint: { passed: boolean, output?: string },
  },
  
  next_step: "Verification will run automatically. Orchestrator will review results.",
}
```

**System Returns** (Pre-signal failure):

```typescript
{
  success: false,
  error: "PRE_SIGNAL_CHECKS_FAILED",
  message: "Pre-signal checks failed. Fix issues and signal again.",
  
  pre_signal_checks: {
    build: { passed: boolean, output?: string },
    test: { passed: boolean, output?: string },
    lint: { passed: boolean, output?: string },
  },
  
  guidance: {
    suggestion: "Review failed checks above. Fix and call signal_completion again.",
  },
}
```

**Improvements from V1**:

| V1 | V2 | Justification |
|----|----|---------------|
| Signal is markdown template with placeholders | Structured data with validation | No "TODO" comments, agent must provide data |
| Pre-signal checks run separately (CLI command) | Automatic on signal (Eager Validation) | Cannot signal without passing checks |
| Build/test status is free-text | Enum: PASS/FAIL | Structured, validated |

**Validations**:

- ✅ Task exists and matches current task
- ✅ Task status is IMPLEMENT
- ✅ At least one artifact created
- ✅ **Pre-signal checks pass** (build, test, lint)

---

### 3.12 Get Signal: `get_signal`

**Template**: Inferred from `completion-signal.md.hbs`

**Purpose**: Orchestrator retrieves signal details

**What Agent Provides**:

```typescript
{
  task_id: number,
}
```

**System Returns**:

```typescript
{
  task_id: number,
  signal_id: string,
  signaled_at: string,
  
  summary: string,
  artifacts_created: Array<{ /* ... */ }>,
  tests: Array<{ /* ... */ }>,
  build_status: "PASS" | "FAIL",
  test_status: "PASS" | "FAIL",
  notes?: string,
  
  pre_signal_checks: {
    build: { passed: boolean, output?: string },
    test: { passed: boolean, output?: string },
    lint: { passed: boolean, output?: string },
  },
}
```

---

### 3.13 Submit Verification Judgment: `submit_verification_judgment`

**Template**: None (orchestrator judgment, not template-driven)

**Purpose**: Orchestrator judges verification results

**What Agent Provides**:

```typescript
{
  task_id: number,
  
  judgment: "PASS" | "FAIL",
  rationale: string,  // Why pass or fail
  
  // If FAIL: which checks failed
  failures?: Array<{
    check_id: string,  // References verification check
    reason: string,
    priority: "high" | "medium" | "low",
    guidance?: string,  // How to fix (will be sanitized)
  }>,
  
  feedback?: string,  // Overall feedback
}
```

**System Returns** (PASS):

```typescript
{
  success: true,
  task_id: number,
  judgment: "PASS",
  status: "VERIFY",  // Awaiting complete
  next_step: "Call complete_task to finalize.",
}
```

**System Returns** (FAIL):

```typescript
{
  success: true,
  task_id: number,
  judgment: "FAIL",
  status: "VERIFY_FAILED",
  retry_count: number,
  max_retries: number,
  can_retry: boolean,
  
  next_step: "Feedback generated for implementor. They will retry." | "Max retries exceeded. Call escalate_task.",
}
```

**Validations**:

- ✅ Task exists
- ✅ Task status is GATE_CHECK (verification just ran)
- ✅ If FAIL, at least one failure provided
- ✅ All failure check_ids reference valid verification checks

---

### 3.14 Get Feedback: `get_feedback`

**Template**: `feedback.md.hbs`

**Purpose**: Implementor retrieves feedback after failed verification

**What Agent Provides**:

```typescript
{
  task_id: number,
  attempt?: number,  // Optional: specific attempt (default: latest)
}
```

**System Returns**:

```typescript
{
  task_id: number,
  task_title: string,
  sprint_id: string,
  attempt: number,
  max_attempts: number,
  can_retry: boolean,
  generated_at: string,
  
  summary: string,  // "Verification found issues..." or "Final attempt..."
  
  issues: Array<{
    category: string,
    severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
    problem: string,        // What failed (sanitized)
    impact: string,         // Why it matters
    guidance: string,       // How to fix (sanitized)
  }>,
  
  passed_checks?: string[],  // What worked
  
  next_steps: string[],  // Action items
}
```

**Improvement from V1**:

| V1 | V2 | Justification |
|----|----|---------------|
| Feedback is generated file, implementor reads markdown | Structured data from tool | Agents can parse and understand feedback programmatically |
| Template includes Handlebars helpers (`{{add @index 1}}`) | System handles formatting | No template logic in agent responses |

**Validations**:

- ✅ Task exists
- ✅ Task has feedback (status is VERIFY_FAILED or RETRY)
- ✅ If implementor, can only read current task feedback

---

### 3.15 Enhance Feedback: `enhance_feedback`

**Template**: `feedback.md.hbs`

**Purpose**: Orchestrator adds guidance to system-generated feedback

**What Agent Provides**:

```typescript
{
  task_id: number,
  
  // Add/update guidance for specific issues
  issue_guidance?: Array<{
    issue_index: number,  // Which issue to update (0-based)
    additional_guidance: string,
  }>,
  
  // Overall encouragement/guidance
  encouragement?: string,
}
```

**System Returns**:

```typescript
{
  success: true,
  task_id: number,
  feedback_updated: boolean,
}
```

**Validations**:

- ✅ Task exists
- ✅ Task has feedback
- ✅ All issue indices are valid

---

### 3.16 Complete Task: `complete_task`

**Template**: None (workflow action)

**Purpose**: Mark task as complete and advance

**What Agent Provides**:

```typescript
{
  task_id: number,
  notes?: string,  // Final notes
}
```

**System Returns**:

```typescript
{
  success: true,
  task_id: number,
  status: "COMPLETE",
  completed_at: string,
  
  progress: {
    total_tasks: number,
    completed: number,
    remaining: number,
    next_task_id?: number,  // Next pending task, if any
  },
}
```

**Validations**:

- ✅ Task exists
- ✅ Task status is VERIFY (passed verification)

---

### 3.17 Escalate Task: `escalate_task`

**Template**: None (workflow action)

**Purpose**: Escalate task to human supervisor

**What Agent Provides**:

```typescript
{
  task_id: number,
  reason: string,
  attempts_summary: string,
  recommended_action?: string,
}
```

**System Returns**:

```typescript
{
  success: true,
  task_id: number,
  status: "ESCALATED",
  escalated_at: string,
  next_step: "Human supervisor will review and provide guidance.",
}
```

---

### 3.18 Get Progress: `get_progress`

**Template**: `progress.yaml.hbs`

**Purpose**: Get overall sprint progress

**What Agent Provides**:

```typescript
{
  // No parameters
}
```

**System Returns**:

```typescript
{
  sprint_id: string,
  sprint_name: string,
  started_at: string,
  
  summary: {
    total_tasks: number,
    completed: number,
    in_progress: number,
    pending: number,
    failed: number,
    escalated: number,
  },
  
  current_task?: {
    task_id: number,
    title: string,
    status: string,
    attempt: number,
  },
  
  completed_tasks: Array<{
    task_id: number,
    title: string,
    completed_at: string,
    attempts: number,
  }>,
}
```

---

### 3.19 Get Task History: `get_task_history`

**Template**: Inferred from `progress.yaml.hbs` + types.ts ProgressEntry

**Purpose**: Get audit trail for a task

**What Agent Provides**:

```typescript
{
  task_id: number,
}
```

**System Returns**:

```typescript
{
  task_id: number,
  title: string,
  
  timeline: Array<{
    timestamp: string,
    status: "PENDING" | "PREPARE" | "IMPLEMENT" | ...,
    agent?: string,     // Who made the change
    notes?: string,
    duration_ms?: number,
  }>,
  
  attempts: Array<{
    attempt: number,
    started_at: string,
    ended_at?: string,
    outcome: "PASSED" | "FAILED" | "IN_PROGRESS",
    failure_summary?: string,
  }>,
}
```

---

### 3.20 Get Verification Results: `get_verification_results`

**Template**: None (verification execution results)

**Purpose**: Orchestrator retrieves verification check results after signal

**What Agent Provides**:

```typescript
{
  task_id: number,
}
```

**System Returns**:

```typescript
{
  task_id: number,
  run_at: string,  // ISO timestamp
  
  results: Array<{
    check_id: string,       // e.g., "struct-0", "behav-1"
    check_type: "structural" | "behavioral" | "quality",
    description: string,    // From verification definition
    passed: boolean,
    output?: string,        // Command output or match results
    error?: string,         // Error message if check failed to run
    duration_ms: number,
  }>,
  
  summary: {
    total_checks: number,
    passed: number,
    failed: number,
    skipped: number,       // If any checks couldn't run
    overall_passed: boolean,
  },
}
```

**Validations**:

- ✅ Task exists
- ✅ Task status is GATE_CHECK (verification has run)
- ✅ Calling agent has orchestrator role

**Improvement from V1**:

| V1 | V2 | Justification |
|----|----|---------------|
| Verification results in file | Structured data from tool | Programmatically parseable |
| Manual correlation of check IDs to criteria | Check ID + description included | Easier to understand what failed |

---

### 3.21 Get Sprint Status: `get_sprint_status`

**Template**: Inferred from `progress.yaml.hbs`

**Purpose**: Get overall sprint status and metadata

**What Agent Provides**:

```typescript
{
  // No parameters - returns active sprint
}
```

**System Returns**:

```typescript
{
  sprint_id: string,
  name: string,
  status: "ACTIVE" | "COMPLETED",
  started_at: string,
  completed_at?: string,  // If status is COMPLETED
  
  summary: {
    total_tasks: number,
    completed: number,
    in_progress: number,
    pending: number,
    failed: number,
    escalated: number,
  },
  
  current_task?: {
    task_id: number,
    title: string,
    status: string,
    assignee?: string,     // Agent working on it
  },
  
  phases: Array<{
    phase_id: string,
    phase_name: string,
    task_count: number,
    completed_count: number,
  }>,
}
```

**Validations**:

- ✅ Sprint exists
- ✅ Calling agent has orchestrator role

**Improvement from V1**:

| V1 | V2 | Justification |
|----|----|---------------|
| Sprint status implicit from files | Explicit sprint status tracking | Clear lifecycle management |
| No phase-level progress | Phase summary included | Better high-level visibility |

---

## 4. Tool Summary

### 4.1 Tool Count by Category

| Category | Tools | Template-Driven | Inferred CRUD |
|----------|-------|-----------------|---------------|
| **Sprint Config** | 6 | configure_sprint | add_task, update_task, get_task, get_tasks, remove_task |
| **Verification** | 2 | _(embedded)_ | update_verification, get_verification_results |
| **Handover** | 3 | prepare_task, get_current_task | update_handover |
| **Signal** | 2 | signal_completion | get_signal |
| **Verification Judgment** | 1 | submit_verification_judgment | — |
| **Feedback** | 2 | _(auto-generated)_ | get_feedback, enhance_feedback |
| **Completion** | 2 | complete_task, escalate_task | — |
| **Progress/Audit** | 3 | get_progress, get_sprint_status | get_task_history |

**Total**: 21 tools

---

## 5. Key Improvements from V1

### 5.1 Structural Improvements

| V1 Limitation | V2 Improvement | Impact |
|---------------|----------------|--------|
| Verification in separate files | Embedded in task definition | Atomic task+verification configuration |
| Agent creates YAML files | System manages all file structure | No file management by agent |
| Templates have TODO placeholders | Validation enforces completeness | Fail fast, no incomplete handovers |
| Implementor can read manifest | Role-based access control | Security by design |
| Pre-signal checks are separate step | Automatic on signal | Cannot bypass validation |
| Feedback is markdown file | Structured data via tool | Programmatically parseable |

### 5.2 Data Model Improvements

| V1 | V2 | Justification |
|----|----|---------------|
| acceptance_criteria: string[] | Array<{ criterion, verification }> | Clearer what vs how to verify |
| build_status/test_status: string | Enum: "PASS" \| "FAIL" | Validated, structured |
| Verification check IDs: `struct-0` | Auto-generated by system | Agent doesn't manage IDs |
| file_operations with operation type | Same | Good structure, keep it |

---

## 6. Design Decisions

All open questions have been resolved. Below are the finalized design decisions:

### 6.1 Status Enum Names
**Decision**: Keep V1 verbose names (GATE_CHECK, VERIFY_FAILED, VERIFY)

**Rationale**:
- Maximum clarity for what each status represents
- Matches existing V1 codebase patterns
- Explicit states reduce ambiguity in workflow state machine
- Examples: `GATE_CHECK` (pre-signal checks running), `VERIFY_FAILED` (verification failed), `VERIFY` (passed verification, awaiting completion)

### 6.2 Consolidation Tracking
**Decision**: Keep SpecKit consolidation feature

**Rationale**:
- Maintains traceability from consolidated tasks to original SpecKit tasks
- Optional field - doesn't add complexity if not used
- Already well-defined in V1 with consolidation_rationale and verification_coverage
- Supports use case where multiple SpecKit tasks are combined into single Orchestra task

**Schema**:
```typescript
consolidations?: Array<{
  consolidated_task_id: number,
  speckit_tasks: string[],
  consolidation_rationale: string,
  verification_coverage?: Record<string, string>,
}>
```

### 6.3 Phase Status
**Decision**: Derived status only (computed from task statuses)

**Rationale**:
- Simple derivation rule eliminates redundant state
- Phase status is always accurate (can't get out of sync)
- Reduces database complexity (no stored phase status field)
- Computed in `get_sprint_status` and `get_progress` tools

**Derivation Logic**:
- **PENDING**: All tasks in phase are PENDING
- **ACTIVE**: At least one task is PREPARE, IMPLEMENT, GATE_CHECK, VERIFY, VERIFY_FAILED, or RETRY
- **COMPLETED**: All tasks in phase are COMPLETE

### 6.4 WorkflowStep vs TaskStatus
**Decision**: Keep both separate (dual-enum architecture)

**Rationale**:
- **WorkflowStep**: Tracks sprint-level workflow state and orchestrator context (INIT, CONFIGURE, SELECT_TASK, PREPARE, IMPLEMENT, SIGNAL, VERIFY, COMPLETE, RETRY, ESCALATED, SPRINT_COMPLETE)
- **TaskStatus**: Tracks individual task lifecycle state (PENDING, PREPARE, IMPLEMENT, GATE_CHECK, VERIFY, VERIFY_FAILED, COMPLETE, RETRY, ESCALATED)
- Separation maintains clear distinction between workflow orchestration and task state
- Both fields serve different purposes with minimal overlap

### 6.5 Verification Result Format
**Decision**: Boolean-based (`passed: boolean`)

**Rationale**:
- Simple and concise
- Standard convention for test results
- Easy to aggregate (`results.every(r => r.passed)`)
- Sufficient for V1 needs (binary pass/fail)

**Schema**:
```typescript
results: Array<{
  check_id: string,
  passed: boolean,
  output?: string,
  duration_ms: number,
}>
```

### 6.6 Auto-Commit Configuration
**Decision**: System-wide + per-tool override, both configurable in database

**Rationale**:
- **System-wide default**: Global `auto_commit` setting in sprint/system config table
- **Per-tool override**: Tool metadata or execution config with `auto_commit_override` field
- **Runtime configurable**: Both settings stored in database, no code changes needed
- **Flexibility**: Write tools commit by default, read tools never commit, with per-tool exceptions

**Implementation**:
- Global setting: `sprint_config.auto_commit: boolean`
- Per-tool override: `tool_config.auto_commit_override: boolean | null` (null = use global)
- Read tools: Auto-commit always false (hardcoded)
- Write tools: Check override first, then fall back to global setting

---

## 7. Next Steps

1. ✅ Tool schemas defined from templates
2. ✅ Missing tools added (`get_verification_results`, `get_sprint_status`)
3. ✅ Design decisions finalized (all 6 questions resolved)
4. ⏭️ Create Zod schemas for runtime validation
5. ⏭️ Database schema design (map tools to tables)
6. ⏭️ MCP server implementation

---

## Appendix: Template Variable Mapping

### A.1 `manifest.yaml.hbs` → `configure_sprint` Input

| Template Variable | Tool Input Field | Notes |
|-------------------|------------------|-------|
| `{{sprint.id}}` | `sprint.id` | Direct |
| `{{sprint.name}}` | `sprint.name` | Direct |
| `{{phases}}` | `phases` | Array |
| `{{tasks}}` | `tasks` | Array with embedded verification |
| `{{consolidations}}` | `consolidations` | Optional |

### A.2 `current-task.md.hbs` → `prepare_task` Input

| Template Variable | Tool Input Field | Notes |
|-------------------|------------------|-------|
| `{{task_id}}` | `task_id` | Direct |
| `{{task_title}}` | _(from task)_ | Not provided, system fetches |
| `{{priority}}` | `priority` | Optional, defaults to P1 |
| `{{acceptance_criteria}}` | `acceptance_criteria` | Array of {criterion, verification} |
| `{{file_operations}}` | `file_operations` | Array of {operation, path, description} |
| `{{deliverables}}` | `deliverables` | Array of strings |
| `{{test_file}}` | `test_file` | Optional |
| `{{test_requirements}}` | `test_requirements` | Optional markdown |

### A.3 `verification-criteria.yaml.hbs` → Embedded in Task

| Template Variable | Tool Input Field | Notes |
|-------------------|------------------|-------|
| `{{structural_checks}}` | `verification.structural_checks` | Array |
| `{{behavioral_checks}}` | `verification.behavioral_checks` | Array |
| `{{quality_checks}}` | `verification.quality_checks` | Array |
| `{{task_id}}`, `{{task_title}}`, `{{timestamp}}` | _(system-managed)_ | Not provided by agent |
