# Orchestra v2: Workflow-to-Tool Mapping

> **Document**: Workflow to MCP Tool Mapping  
> **Version**: 0.1.0  
> **Status**: Draft  
> **Date**: 2025-12-08  
> **Depends On**: [00-problem-statement.md](00-problem-statement.md), [01-interaction-model.md](01-interaction-model.md)

---

## 1. Overview

This document maps every workflow step from `docs/workflow/` to the v2 model where:
- **Agent actions** → Judgment (provide semantic content via MCP tools)
- **CLI actions** → System (automatic execution, no agent involvement)
- **Manual actions** → Human (escalation path)

For each workflow step, we identify:
1. Which actions become MCP tools (agent provides judgment)
2. Which actions are system-internal (no agent involvement)
3. The tool schema for agent-facing tools

---

## 2. Workflow Steps Summary

| Step | Phase | v1 Actions | v2 Agent Tools | v2 System-Only |
|------|-------|------------|----------------|----------------|
| init | INIT | 5 CLI, 1 Agent | 0 | All (fully automated) |
| **sprint-init** | **INIT** | **0 CLI, 6+ Agent** | **3-4** | **Some** |
| closeout | PREPARE | 5 CLI, 3 Agent | 0 | All (fully automated) |
| prepare | PREPARE | 5 CLI, 4 Agent | 1-2 | Most |
| implement | IMPLEMENT | 2 CLI, 7 Agent | 2 | Most |
| accept-signal | GATE_CHECK | 1 CLI, 3 Agent | 0-1 | Most |
| verify | VERIFY | 1 CLI, 4 Agent | 1 | Most |
| complete | COMPLETE | 4 CLI, 3 Agent | 0-1 | Most |
| feedback | RETRY | 1 CLI, 3 Agent | 0-1 | Most |
| escalate | ESCALATED | 2 CLI, 3 Agent | 1 | Most |

---

## 3. INIT Phase

### 3.1 Workflow: `init`

**Purpose**: Initialize Orchestra folder structure in a project.

**v1 Actions**:
| ID | Type | Action |
|----|------|--------|
| A-INIT-01 | CLI | `orchestra init` |
| A-INIT-02 | CLI | `orchestra init --spec <path>` |
| A-INIT-03 | CLI | `orchestra init --force` |
| A-INIT-04 | CLI | `orchestra init --dry-run` |
| A-INIT-05 | CLI | `orchestra status` |
| A-INIT-06 | Agent | Run init command |

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Initialize folder structure | **System** | Pure structure, no judgment |
| Copy templates | **System** | Pure structure |
| Create default manifest | **System** | Pure structure |
| Run status check | **System** | Pure structure |

**MCP Tools**: None required.

Init is fully automated. The system exposes an `init` resource/tool that takes minimal parameters (project path, optional spec path) and creates everything. No agent judgment needed.

```typescript
// System-only (can be triggered by agent but no judgment needed)
mcp_init({
  project_path: string,       // Required
  spec_path?: string,         // Optional: path to spec folder
  force?: boolean             // Optional: reinitialize
})
// Returns: { success: boolean, created_folders: string[], errors?: string[] }
```

---

### 3.2 Workflow: `sprint-init` ⭐ (CRITICAL - Previously Missing)

> **Reference**: `templates/orchestrator/processes/00-sprint-initialization.md`
> 
> **NOTE**: This workflow step was NOT documented in `docs/workflow/` but is critical.
> It represents the orchestrator's judgment work between `orchestra init` and `orchestra prepare`.

**Purpose**: Configure the sprint by defining tasks, dependencies, and verification criteria.

**v1 Actions** (implicit, not documented as workflow step):
| ID | Type | Action |
|----|------|--------|
| A-SINIT-01 | Agent | Analyze source requirements (SpecKit, feature doc, etc.) |
| A-SINIT-02 | Agent | Define phases in manifest |
| A-SINIT-03 | Agent | Define tasks with dependencies |
| A-SINIT-04 | Agent | Create verification YAML for each task |
| A-SINIT-05 | CLI | `orchestra init --verify` (validate setup) |
| A-SINIT-06 | Agent | Fix any validation errors |
| A-SINIT-07 | Agent | Clear stale handover files |

**The Problem in v1**:

In v1, the agent was expected to:
1. Manually edit `.orchestra/manifest.yaml` (YAML structure)
2. Manually create `verification/task-001.yaml`, `task-002.yaml`, etc. (YAML files)
3. Ensure all files are schema-valid

This is **exactly the structural work agents fail at**. They would:
- Create malformed YAML
- Miss required fields
- Use wrong status values
- Create inconsistent task IDs
- Forget to create verification files for some tasks

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Analyze requirements | **Agent** | JUDGMENT (understand scope) |
| Determine phases | **Agent** | JUDGMENT (logical grouping) |
| Determine tasks + dependencies | **Agent** | JUDGMENT (breakdown) |
| Define verification criteria per task | **Agent** | JUDGMENT (what to verify) |
| Create manifest.yaml | **System** | Structure |
| Create verification/*.yaml | **System** | Structure |
| Validate all files | **System** | Automated |
| Report validation errors | **System** | Structure |

**MCP Tools**:

#### Primary Tool: `configure_sprint`

```typescript
configure_sprint({
  sprint: {
    id: string,                      // e.g., "sprint-015"
    name: string,                    // e.g., "Multi-Axis Normalization"
  },

  phases: [{
    phase_id: string,                // e.g., "foundation"
    phase_name: string,              // e.g., "Foundation Phase"
    speckit_tasks?: string[],        // Optional: SpecKit task IDs
  }],

  tasks: [{
    task_id: number,                 // Sequential: 1, 2, 3...
    phase_id: string,                // Which phase this belongs to
    title: string,                   // e.g., "Create YAxisPosition Enum"
    description: string,             // What to do
    category: "INFRASTRUCTURE" | "INTEGRATION" | "VISUAL" | "REFACTOR",
    dependencies: number[],          // Task IDs this depends on
    speckit_task_ref?: string,       // Optional: reference to SpecKit

    // CRITICAL: Verification criteria for this task
    verification: {
      checks: [{
        id: string,                  // e.g., "V1.1"
        description: string,         // What to check
        severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
        type: "structural" | "functional" | "adversarial" | "visual",
        
        // Optional: specific check parameters
        file_path?: string,          // For file existence checks
        pattern?: string,            // For content/pattern checks
        command?: string,            // For command execution checks
      }]
    }
  }]
})

// System then:
// 1. Validates all input (schema, references, dependencies)
// 2. Creates manifest.yaml with proper structure
// 3. Creates verification/task-001.yaml, task-002.yaml, etc.
// 4. Runs `orchestra init --verify` equivalent
// 5. Returns validation result

// Returns on success:
{
  success: true,
  sprint_id: string,
  tasks_created: number,
  verification_files: string[],
  manifest_path: string
}

// Returns on validation failure:
{
  success: false,
  errors: [{
    field: string,
    error: string,
    hint?: string
  }]
}
```

#### Granular Update Tools:

```typescript
// Add a single task to existing sprint
add_task({
  phase_id: string,
  task: {
    task_id: number,
    title: string,
    description: string,
    category: string,
    dependencies: number[],
    verification: { checks: [...] }
  }
})

// Update an existing task
update_task({
  task_id: number,
  updates: {
    title?: string,
    description?: string,
    dependencies?: number[],
    // Note: verification updates use separate tool
  }
})

// Add/update verification for a task
set_task_verification({
  task_id: number,
  verification: {
    checks: [{
      id: string,
      description: string,
      severity: string,
      type: string,
      // ... check parameters
    }]
  }
})

// Add a single check to existing verification
add_verification_check({
  task_id: number,
  check: {
    id: string,
    description: string,
    severity: string,
    type: string,
  }
})
```

#### Resource: `get_sprint_status`

```typescript
get_sprint_status()
// Returns:
{
  initialized: boolean,
  sprint: { id, name, status },
  phases: [{ phase_id, phase_name, status, task_count }],
  tasks: [{
    task_id: number,
    title: string,
    status: string,
    has_verification: boolean,
    verification_check_count: number,
    dependencies: number[]
  }],
  validation: {
    passed: boolean,
    errors: string[]
  }
}
```

---

**Why This Is Critical**:

This step involves the MOST file creation in the entire workflow:
- 1 manifest.yaml file
- N verification YAML files (one per task)

If agents create these files directly, they WILL corrupt them. The v2 model has the agent provide the semantic content (tasks, criteria) and the system creates all files with guaranteed schema compliance.

---

### 4.1 Workflow: `closeout`

**Purpose**: Verify previous task is fully closed before preparing new task.

**v1 Actions**:
| ID | Type | Action |
|----|------|--------|
| A-CLO-01 | CLI | `orchestra closeout` |
| A-CLO-02 | CLI | `orchestra closeout --task <id>` |
| A-CLO-03 | CLI | `orchestra closeout --fix` |
| A-CLO-04 | CLI | `orchestra closeout --force` |
| A-CLO-05 | CLI | `orchestra closeout --verbose` |
| A-CLO-06 | Agent | Run closeout before prepare |
| A-CLO-07 | Agent | Review failed checks |
| A-CLO-08 | Agent | Apply manual fixes |

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Run 6-point check | **System** | Automated validation |
| Auto-fix (git add, clear signal) | **System** | Automated remediation |
| Report results | **System** | Pure structure |

**MCP Tools**: None required.

Closeout is fully automated. System runs checks and auto-fixes what it can. If checks fail and can't be auto-fixed, the workflow blocks until conditions are met.

```typescript
// System-only (runs automatically before prepare)
// No agent tool needed - system blocks if closeout fails
```

---

### 4.2 Workflow: `prepare` ⭐ (Most Complex)

**Purpose**: Generate handover and hidden verification for a task.

**v1 Actions**:
| ID | Type | Action |
|----|------|--------|
| A-PREP-01 | CLI | `orchestra prepare` |
| A-PREP-02 | CLI | `orchestra prepare --task <id>` |
| A-PREP-03 | CLI | `orchestra prepare --force` |
| A-PREP-04 | CLI | `orchestra prepare --dry-run` |
| A-PREP-05 | CLI | `orchestra prepare --skip-closeout` |
| A-PREP-07 | Agent | Run prepare command |
| A-PREP-08 | Agent | Complete handover content |
| A-PREP-09 | Agent | Complete pre-flight checklist |
| A-PREP-10 | Agent | Verify handover is complete |

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Determine next task | **System** | Read from manifest |
| Validate preconditions | **System** | Automated checks |
| Run closeout | **System** | Automated |
| Present task to agent | **System** | Context provision |
| Define verification criteria | **Agent** | JUDGMENT |
| Define acceptance criteria | **Agent** | JUDGMENT |
| Provide implementor context | **Agent** | JUDGMENT |
| Create verification YAML | **System** | Structure |
| Create handover markdown | **System** | Structure |
| Update manifest status | **System** | Structure |
| Update progress | **System** | Structure |

**MCP Tools**:

#### Primary Tool: `prepare_task`

```typescript
prepare_task({
  task_id: number,                    // Required: which task

  // HIDDEN from implementor
  verification_criteria: {
    file_checks: [{
      path: string,                   // e.g., "src/auth/jwt.ts"
      exists?: boolean,               // File must exist
      not_exists?: boolean,           // File must NOT exist
      exports?: string[],             // Must export these symbols
      contains?: string[],            // Must contain these strings
      not_contains?: string[],        // Must NOT contain these strings
      pattern?: string,               // Regex pattern to match
    }],
    test_checks: [{
      path: string,                   // e.g., "test/auth/jwt.test.ts"
      min_count?: number,             // Minimum test count
      must_pass?: boolean,            // Tests must pass
      coverage_min?: number,          // Minimum coverage %
    }],
    command_checks: [{
      command: string,                // e.g., "npm run build"
      expect_success?: boolean,       // Must exit 0
      output_contains?: string[],     // Output must contain
      output_not_contains?: string[], // Output must NOT contain
    }],
    custom_checks: [{
      description: string,            // What to verify
      severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
    }]
  },

  // VISIBLE to implementor
  acceptance_criteria: string[],       // List of visible criteria

  // VISIBLE to implementor  
  implementor_context: {
    objective: string,                // What to build
    background?: string,              // Why it's needed
    constraints?: string[],           // Technical constraints
    references?: string[],            // Files to look at
    examples?: string[],              // Example patterns to follow
  },

  // VISIBLE to implementor
  expected_files: [{
    action: "create" | "modify" | "delete",
    path: string,
    purpose?: string,
  }]
})

// Returns on success:
{
  success: true,
  task_id: number,
  handover_path: string,              // Path to generated handover
  verification_path: string,          // Path to generated verification (hidden)
  status: "IMPLEMENT"
}

// Returns on validation failure:
{
  success: false,
  errors: [{
    field: string,
    error: string,
    hint?: string
  }]
}
```

#### Granular Update Tools:

```typescript
update_verification_criteria({
  task_id: number,
  criteria_id?: string,               // If updating specific criterion
  operation: "add" | "update" | "remove",
  criterion: { /* same structure as above */ }
})

update_acceptance_criteria({
  task_id: number,
  criteria: string[]                  // Replace all
})

update_implementor_context({
  task_id: number,
  context: { /* same structure as above */ }
})
```

---

## 5. IMPLEMENT Phase

### 5.1 Workflow: `implement`

**Purpose**: Implementor executes the task from handover.

**v1 Actions**:
| ID | Type | Action |
|----|------|--------|
| A-IMPL-00 | CLI | `orchestra validate-handover` |
| A-IMPL-09 | CLI | `orchestra pre-signal-check` |
| A-IMPL-01 | Agent | Read handover documents |
| A-IMPL-02 | Agent | Understand task requirements |
| A-IMPL-03 | Agent | Implement solution (code) |
| A-IMPL-04 | Agent | Write tests |
| A-IMPL-06 | Agent | Complete completion signal |
| A-IMPL-07 | Agent | Stage all changes |
| A-IMPL-08 | Agent | Notify "ready for review" |

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Validate handover exists | **System** | Automated |
| Get current task handover | **System** | Provide context |
| Read/understand handover | **Agent** | JUDGMENT (comprehension) |
| Implement solution | **Agent** | JUDGMENT (coding) |
| Write tests | **Agent** | JUDGMENT (testing) |
| Run pre-signal checks | **System** | Automated validation |
| Signal completion | **Agent** | JUDGMENT (what was done) |
| Create signal file | **System** | Structure |
| Stage changes | **System** | Automated |

**MCP Tools**:

#### Resource: `get_current_task`

```typescript
get_current_task()
// Returns:
{
  task_id: number,
  title: string,
  objective: string,
  acceptance_criteria: string[],
  context: { /* implementor context */ },
  expected_files: [{ action, path, purpose }]
}
// NOTE: No verification criteria - implementor cannot see these
```

#### Primary Tool: `signal_completion`

```typescript
signal_completion({
  task_id: number,

  summary: string,                    // What was done

  files_changed: [{
    action: "created" | "modified" | "deleted",
    path: string,
    description?: string,            // What changed
  }],

  tests_added?: number,              // Count of new tests
  tests_passing?: boolean,           // All tests pass?

  notes?: string,                    // Any additional notes

  criteria_addressed: [{             // Map to acceptance criteria
    criterion: string,               // The criterion text
    how_addressed: string,           // How it was met
  }]
})

// System then:
// 1. Validates input
// 2. Runs pre-signal checks (build, test, lint)
// 3. Creates signal file
// 4. Stages changes
// 5. Returns result

// Returns on success:
{
  success: true,
  signal_id: string,
  pre_signal_result: {
    passed: boolean,
    checks: [{ name, passed, output }]
  }
}

// Returns on pre-signal failure:
{
  success: false,
  signal_id: null,
  pre_signal_result: {
    passed: false,
    checks: [{ name, passed, output, error }]
  },
  hint: "Fix build errors before signaling completion"
}
```

---

## 6. GATE_CHECK Phase

### 6.1 Workflow: `accept-signal`

**Purpose**: Validate implementor's completion signal before verification.

**v1 Actions**:
| ID | Type | Action |
|----|------|--------|
| A-ASIG-01 | CLI | `orchestra accept-signal` |
| A-ASIG-02 | Agent | Review pre-signal details |
| A-ASIG-03 | Agent | Check for warnings |
| A-ASIG-04 | Agent | Decide proceed/reject |

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Validate signal exists | **System** | Automated |
| Validate signal format | **System** | Automated |
| Check freshness | **System** | Automated |
| Check pre-signal passed | **System** | Automated |
| Accept or reject | **System** | Automated (rule-based) |

**MCP Tools**: None required (or minimal).

Accept-signal is fully automated in v2. The system validates the signal against rules:
- Signal file exists and is valid
- Pre-signal checks passed
- Task ID matches
- Freshness check (< 60 min)

If all pass, workflow advances. If any fail, workflow blocks with clear error.

```typescript
// Optional: If orchestrator needs to manually override
accept_signal_override({
  task_id: number,
  reason: string,                    // Why overriding
  override_checks: string[]          // Which checks to bypass
})
// Only available with elevated permissions
```

---

## 7. VERIFY Phase

### 7.1 Workflow: `verify`

**Purpose**: Execute hidden verification criteria against implementation.

**v1 Actions**:
| ID | Type | Action |
|----|------|--------|
| A-VER-01 | CLI | `orchestra verify` |
| A-VER-02 | Agent | Review verification report |
| A-VER-03 | Agent | Document observations |
| A-VER-04 | Agent | Visual verification (if required) |
| A-VER-05 | Agent | Determine task outcome |

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Load verification criteria | **System** | Automated |
| Execute all checks | **System** | Automated |
| Aggregate results | **System** | Automated |
| Generate report | **System** | Structure |
| Visual verification | **Agent** | JUDGMENT (if needed) |
| Determine outcome | **Agent** | JUDGMENT |
| Record results | **System** | Structure |

**MCP Tools**:

#### Resource: `get_verification_results`

```typescript
get_verification_results({
  task_id: number
})
// Returns:
{
  task_id: number,
  status: "PENDING" | "RUNNING" | "COMPLETE",
  results: {
    passed: boolean,
    summary: {
      total: number,
      passed: number,
      failed: number,
      by_severity: {
        BLOCKING: { passed: number, failed: number },
        MAJOR: { passed: number, failed: number },
        MINOR: { passed: number, failed: number },
        INFO: { passed: number, failed: number }
      }
    },
    checks: [{
      id: string,
      type: string,
      severity: string,
      passed: boolean,
      evidence: string,          // What was found
      expected?: string,         // What was expected (for failures)
    }]
  }
}
```

#### Primary Tool: `submit_verification_judgment`

```typescript
submit_verification_judgment({
  task_id: number,

  passed: boolean,                   // Overall judgment

  // Required if passed=false
  failure_reasons?: [{
    check_id: string,                // Which check failed
    explanation: string,             // Why it's a real failure
    severity_override?: string,      // Optional: request severity change
  }],

  // Optional observations
  observations?: string,             // General notes

  // Required for visual/integration tasks
  visual_verification?: {
    performed: boolean,
    passed: boolean,
    evidence?: string,               // Screenshot path or description
    issues?: string[],               // Visual issues found
  }
})

// System then:
// 1. Validates judgment against check results
// 2. Records verification result
// 3. Advances workflow (to complete or feedback)

// Returns:
{
  success: true,
  task_id: number,
  outcome: "PASSED" | "FAILED",
  next_step: "complete" | "feedback"
}
```

---

## 8. COMPLETE Phase

### 8.1 Workflow: `complete`

**Purpose**: Complete task after successful verification.

**v1 Actions**:
| ID | Type | Action |
|----|------|--------|
| A-COMP-01 | CLI | `orchestra complete` |
| A-COMP-02 | CLI | `orchestra complete --commit` |
| A-COMP-03 | CLI | `orchestra complete --push` |
| A-COMP-04 | CLI | `orchestra complete --force` |
| A-COMP-05 | Agent | Validate verification passed |
| A-COMP-06 | Agent | Review archive contents |
| A-COMP-07 | Agent | Verify handover cleared |

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Validate can complete | **System** | Automated |
| Create archive | **System** | Structure |
| Update manifest | **System** | Structure |
| Update progress | **System** | Structure |
| Clear handover | **System** | Structure |
| Git commit | **System** | Automated (optional) |
| Trigger next task | **System** | Automated (optional) |

**MCP Tools**: Minimal or none.

Complete is largely automated. The system archives, updates state, and clears handover.

```typescript
// Optional: Agent can request completion with notes
complete_task({
  task_id: number,
  lessons_learned?: string[],        // Optional insights
  technical_debt?: string[],         // Optional debt notes
  commit_message?: string            // Optional custom message
})

// Returns:
{
  success: true,
  task_id: number,
  archived_path: string,
  next_task?: number                 // If more tasks exist
}
```

---

## 9. RETRY Phase

### 9.1 Workflow: `feedback`

**Purpose**: Generate actionable feedback after verification failure.

**v1 Actions**:
| ID | Type | Action |
|----|------|--------|
| A-FEED-01 | CLI | `orchestra feedback` |
| A-FEED-02 | Agent | Review verification failures |
| A-FEED-03 | Agent | Craft actionable guidance |
| A-FEED-04 | Agent | Check escalation threshold |

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Load verification failures | **System** | Automated |
| Transform failures (strip criteria) | **System** | Automated (critical) |
| Generate feedback template | **System** | Structure |
| Enhance feedback | **Agent** | JUDGMENT (optional) |
| Update retry count | **System** | Structure |
| Check escalation threshold | **System** | Automated |
| Deliver to implementor | **System** | Structure |

**MCP Tools**:

```typescript
// Optional: Agent can enhance auto-generated feedback
enhance_feedback({
  task_id: number,
  feedback_enhancements: [{
    failure_id: string,
    additional_guidance: string,     // Extra hints (no criteria leak!)
    priority?: "high" | "medium" | "low"
  }],
  encouragement?: string             // Positive reinforcement
})

// Returns:
{
  success: true,
  feedback_path: string,
  retry_count: number,
  max_retries: number,
  should_escalate: boolean
}
```

**Note**: The system's `transformToFeedback()` function is CRITICAL — it strips all hidden criteria details. The agent can only enhance, not replace, the transformed feedback.

---

## 10. ESCALATED Phase

### 10.1 Workflow: `escalate`

**Purpose**: Escalate persistent failures to human supervisor.

**v1 Actions**:
| ID | Type | Action |
|----|------|--------|
| A-ESC-01 | CLI | `orchestra escalate --reason "..."` |
| A-ESC-02 | CLI | `orchestra escalate --reason "..." --context "..."` |
| A-ESC-03 | Agent | Determine escalation needed |
| A-ESC-04 | Agent | Provide clear reason |
| A-ESC-05 | Agent | Include context for human |

**v2 Model**:

| Action | v2 Owner | Rationale |
|--------|----------|-----------|
| Detect escalation trigger | **System** | Automated (retry count) |
| Compile attempt history | **System** | Structure |
| Provide reason/context | **Agent** | JUDGMENT |
| Generate escalation report | **System** | Structure |
| Update status | **System** | Structure |
| Halt workflow | **System** | Automated |

**MCP Tools**:

```typescript
escalate_task({
  task_id: number,

  reason: string,                    // Why escalating

  context: {
    attempts_summary: string,        // What was tried
    blocking_issue: string,          // What's preventing progress
    suggested_actions?: string[],    // Recommendations for human
  },

  urgency?: "low" | "medium" | "high"
})

// System then:
// 1. Generates full escalation report
// 2. Updates task status to ESCALATED
// 3. Halts workflow
// 4. Returns path to escalation report

// Returns:
{
  success: true,
  task_id: number,
  escalation_report_path: string,
  status: "ESCALATED"
}
```

---

## 11. Tool Summary — CRUD Pattern

Every resource in Orchestra v2 follows a consistent **Create/Read/Update/Delete** pattern. Access is controlled by role-based security.

### 11.1 Design Principle

Each logical resource has a complete set of operations:

| Operation | Pattern | Example |
|-----------|---------|---------|
| **Create** | `create_<resource>` or `configure_<resource>` | `configure_sprint`, `add_task` |
| **Read** | `get_<resource>` or `get_<resources>` | `get_task`, `get_tasks` |
| **Update** | `update_<resource>` | `update_task` |
| **Delete** | `delete_<resource>` or `remove_<resource>` | `remove_task` |

All tools are protected by role-based access control. An implementor calling `get_task_verification` will receive an access denied error.

---

### 11.2 Sprint Resource

| Operation | Tool | Role | Description |
|-----------|------|------|-------------|
| Create | `configure_sprint` | Orchestrator | Create sprint with phases, tasks, verification |
| Read | `get_sprint` | Orchestrator | Get full sprint details |
| Read | `get_sprint_status` | Orchestrator | Get sprint overview + validation status |
| Update | `update_sprint` | Orchestrator | Modify sprint metadata (name, etc.) |
| Delete | — | Human Only | Sprints cannot be deleted by agents |

```typescript
get_sprint()
// Returns:
{
  sprint: {
    id: string,
    name: string,
    status: "ACTIVE" | "COMPLETED" | "ABORTED",
    created_at: string,
  },
  phases: [{
    phase_id: string,
    phase_name: string,
    status: string,
    speckit_tasks: string[],
  }],
  task_count: number,
  completed_count: number,
  validation: { passed: boolean, errors: string[] }
}
```

---

### 11.3 Task Resource

| Operation | Tool | Role | Description |
|-----------|------|------|-------------|
| Create | `add_task` | Orchestrator | Add single task to sprint |
| Read | `get_task` | Orchestrator | Get full task details including verification |
| Read | `get_tasks` | Orchestrator | Get all tasks with optional filters |
| Read | `get_current_task` | Implementor | Get current task handover (NO verification) |
| Update | `update_task` | Orchestrator | Modify task metadata |
| Delete | `remove_task` | Orchestrator | Remove task (only if PENDING) |

```typescript
get_task({
  task_id: number
})
// Returns (Orchestrator view - FULL access):
{
  task_id: number,
  phase_id: string,
  title: string,
  description: string,
  status: string,
  category: string,
  dependencies: number[],
  speckit_task_ref?: string,
  
  // ORCHESTRATOR ONLY - hidden from implementor
  verification: {
    checks: [{
      id: string,
      description: string,
      severity: string,
      type: string,
      file_path?: string,
      pattern?: string,
      command?: string,
    }]
  },
  
  // Also visible to implementor (when prepared)
  acceptance_criteria?: string[],
  implementor_context?: { /* ... */ },
  expected_files?: [{ action, path, purpose }]
}

get_tasks({
  phase_id?: string,                 // Filter by phase
  status?: string,                   // Filter by status
  category?: string,                 // Filter by category
  include_verification?: boolean     // Include verification details (default: false for performance)
})
// Returns:
{
  tasks: [{
    task_id: number,
    title: string,
    status: string,
    phase_id: string,
    category: string,
    dependencies: number[],
    has_verification: boolean,
    verification_check_count: number,
    // verification details only if include_verification=true
  }],
  total: number,
  by_status: { PENDING: number, IMPLEMENT: number, COMPLETE: number, ... }
}
```

---

### 11.4 Verification Resource

| Operation | Tool | Role | Description |
|-----------|------|------|-------------|
| Create | `set_task_verification` | Orchestrator | Set verification for a task |
| Create | `add_verification_check` | Orchestrator | Add single check to task |
| Read | `get_task_verification` | Orchestrator | Get verification criteria for a task |
| Read | `get_verification_results` | Orchestrator | Get verification execution results |
| Update | `update_verification_check` | Orchestrator | Modify a specific check |
| Delete | `remove_verification_check` | Orchestrator | Remove a check |

```typescript
get_task_verification({
  task_id: number
})
// Returns:
{
  task_id: number,
  created_at: string,
  checks: [{
    id: string,
    description: string,
    severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
    type: "structural" | "functional" | "adversarial" | "visual",
    file_path?: string,
    pattern?: string,
    command?: string,
    // ... other check parameters
  }],
  summary: {
    total: number,
    by_severity: { BLOCKING: number, MAJOR: number, MINOR: number, INFO: number },
    by_type: { structural: number, functional: number, ... }
  }
}

update_verification_check({
  task_id: number,
  check_id: string,
  updates: {
    description?: string,
    severity?: string,
    file_path?: string,
    pattern?: string,
    // ... other fields
  }
})

remove_verification_check({
  task_id: number,
  check_id: string
})
```

---

### 11.5 Handover Resource

| Operation | Tool | Role | Description |
|-----------|------|------|-------------|
| Create | `prepare_task` | Orchestrator | Create handover for task |
| Read | `get_current_task` | Implementor | Get current handover |
| Read | `get_handover` | Orchestrator | Get handover details |
| Update | `update_acceptance_criteria` | Orchestrator | Modify acceptance criteria |
| Update | `update_implementor_context` | Orchestrator | Modify context |
| Delete | — | System Only | Cleared automatically on complete |

```typescript
get_handover({
  task_id: number
})
// Returns (Orchestrator view):
{
  task_id: number,
  status: "PREPARED" | "IN_PROGRESS" | "SIGNALED",
  prepared_at: string,
  
  acceptance_criteria: string[],
  implementor_context: {
    objective: string,
    background?: string,
    constraints?: string[],
    references?: string[],
    examples?: string[],
  },
  expected_files: [{ action, path, purpose }],
  
  // Link to verification (orchestrator can cross-reference)
  verification_task_id: number,
  verification_check_count: number,
}
```

---

### 11.6 Signal Resource

| Operation | Tool | Role | Description |
|-----------|------|------|-------------|
| Create | `signal_completion` | Implementor | Signal task completion |
| Read | `get_signal` | Orchestrator | Get signal details |
| Update | — | Not Allowed | Signals are immutable |
| Delete | — | System Only | Cleared on complete/retry |

```typescript
get_signal({
  task_id: number
})
// Returns:
{
  task_id: number,
  signal_id: string,
  signaled_at: string,
  
  summary: string,
  files_changed: [{ action, path, description }],
  tests_added?: number,
  tests_passing?: boolean,
  criteria_addressed: [{ criterion, how_addressed }],
  notes?: string,
  
  pre_signal_result: {
    passed: boolean,
    checks: [{ name, passed, output }]
  }
}
```

---

### 11.7 Progress/History Resource

| Operation | Tool | Role | Description |
|-----------|------|------|-------------|
| Read | `get_progress` | Orchestrator | Get overall progress |
| Read | `get_task_history` | Orchestrator | Get history for specific task |
| Read | `get_attempt_history` | Orchestrator | Get retry attempts for task |

```typescript
get_progress()
// Returns:
{
  sprint_id: string,
  started_at: string,
  
  summary: {
    total_tasks: number,
    completed: number,
    in_progress: number,
    pending: number,
    escalated: number,
  },
  
  current_task?: {
    task_id: number,
    title: string,
    status: string,
    attempt: number,
  },
  
  completed_tasks: [{
    task_id: number,
    title: string,
    completed_at: string,
    attempts: number,
  }]
}

get_task_history({
  task_id: number
})
// Returns:
{
  task_id: number,
  title: string,
  
  timeline: [{
    timestamp: string,
    event: "CREATED" | "PREPARED" | "SIGNALED" | "VERIFIED" | "COMPLETED" | "FAILED" | "RETRY" | "ESCALATED",
    details: string,
    actor: "orchestrator" | "implementor" | "system",
  }],
  
  attempts: [{
    attempt: number,
    started_at: string,
    ended_at?: string,
    outcome: "PASSED" | "FAILED" | "IN_PROGRESS",
    failure_summary?: string,
  }]
}
```

---

### 11.8 Feedback Resource

| Operation | Tool | Role | Description |
|-----------|------|------|-------------|
| Create | — | System | Auto-generated from verification failures |
| Read | `get_feedback` | Both* | Get feedback for current task |
| Update | `enhance_feedback` | Orchestrator | Add guidance to feedback |

*Implementor can read feedback for their current task only.

```typescript
get_feedback({
  task_id: number,
  attempt?: number              // Default: latest attempt
})
// Returns:
{
  task_id: number,
  attempt: number,
  generated_at: string,
  
  failures: [{
    id: string,
    description: string,        // Sanitized - no criteria leak
    priority: "high" | "medium" | "low",
    guidance?: string,          // From enhance_feedback
  }],
  
  encouragement?: string,
  retry_count: number,
  max_retries: number,
  can_retry: boolean,
}
```

---

### 11.9 Complete Tool Inventory

#### Primary Workflow Tools

| Tool | Operation | Role | Phase |
|------|-----------|------|-------|
| `configure_sprint` | Create | Orchestrator | INIT |
| `prepare_task` | Create | Orchestrator | PREPARE |
| `signal_completion` | Create | Implementor | IMPLEMENT |
| `submit_verification_judgment` | Create | Orchestrator | VERIFY |
| `complete_task` | Create | Orchestrator | COMPLETE |
| `enhance_feedback` | Update | Orchestrator | RETRY |
| `escalate_task` | Create | Orchestrator | ESCALATED |

#### CRUD Tools by Resource

| Resource | Create | Read | Update | Delete |
|----------|--------|------|--------|--------|
| Sprint | `configure_sprint` | `get_sprint`, `get_sprint_status` | `update_sprint` | — |
| Task | `add_task` | `get_task`, `get_tasks` | `update_task` | `remove_task` |
| Verification | `set_task_verification`, `add_verification_check` | `get_task_verification`, `get_verification_results` | `update_verification_check` | `remove_verification_check` |
| Handover | `prepare_task` | `get_handover`, `get_current_task` | `update_acceptance_criteria`, `update_implementor_context` | — |
| Signal | `signal_completion` | `get_signal` | — | — |
| Progress | — | `get_progress`, `get_task_history`, `get_attempt_history` | — | — |
| Feedback | — | `get_feedback` | `enhance_feedback` | — |

---

### 11.10 System-Only Operations (No Agent Tool)

| Operation | Phase | Triggered By |
|-----------|-------|--------------|
| `init` | INIT | Human or system |
| `closeout` | PREPARE | Auto before prepare |
| `accept-signal` | GATE_CHECK | Auto after signal |
| `verify` (execution) | VERIFY | Auto after accept |
| `archive` | COMPLETE | Auto after judgment |
| `clear_handover` | COMPLETE | Auto after archive |
| `generate_feedback` | RETRY | Auto after verification fail |

---

## 12. Role-Based Tool Access

### 12.1 Orchestrator Agent

Has access to:
- **Sprint Configuration**: `configure_sprint`, `add_task`, `update_task`, `set_task_verification`, `add_verification_check`, `get_sprint_status`
- **Task Preparation**: `prepare_task` + update variants
- **Verification**: `get_verification_results`, `submit_verification_judgment`
- **Completion/Feedback**: `complete_task`, `enhance_feedback`
- **Escalation**: `escalate_task`
- **Override** (elevated): `accept_signal_override`

Cannot access:
- `get_current_task` (implementor only)
- `signal_completion` (implementor only)

### 12.2 Implementor Agent

Has access to:
- `get_current_task`
- `signal_completion`

Cannot access:
- Everything else (especially verification criteria and sprint configuration)

### 12.3 System

Has access to all operations, including:
- Direct database/file manipulation
- Workflow state transitions
- Automated checks and validations

---

## 13. Open Questions

### 13.0 Foundational Principle: Eager Validation

**DECIDED**: Every tool call MUST perform all applicable validations inline.

- No separate "check" or "validate" steps
- Fail fast, fail informatively
- Shortens feedback and resolution loop
- Caller learns of errors immediately, not after subsequent calls

This principle applies universally across all tools. Examples:
- `signal_completion` → runs pre-signal checks (build, test, lint) automatically
- `prepare_task` → validates dependencies are complete, verification exists
- `configure_sprint` → validates task graph is acyclic, all references valid
- `add_task` → validates dependencies exist, no circular refs introduced

If a tool CAN validate something, it MUST validate it.

---

1. ~~**Resource vs Tool**: Should read-only operations (`get_current_task`, `get_verification_results`, `get_sprint_status`) be MCP resources or tools?~~

   **RESOLVED**: Tools only. MCP Resources and subscriptions are deferred as experimental. All read operations use tools for simplicity and uniformity.

2. ~~**Pre-signal integration**: Should `signal_completion` automatically run pre-signal checks, or should that be a separate step?~~

   **RESOLVED**: Automatic. Per the Eager Validation principle, `signal_completion` MUST run pre-signal checks. Signal is rejected if checks fail. No separate step needed.

3. ~~**Visual verification**: How does the agent perform visual verification? Separate tool? Integration with Chrome DevTools MCP?~~

   **RESOLVED**: Placeholder implementation. Tool `capture_visual_verification` is defined in the schema but returns `{ status: "not_implemented", message: "Visual verification is planned for future release" }`. This reserves the interface for future development while allowing verification specs to reference visual checks.

   Future implementation: System captures screenshots (mechanical), Orchestrator provides judgment (semantic).

4. ~~**Concurrent tasks**: How do we handle agents trying to call tools for wrong tasks or out-of-order?~~

   **RESOLVED**: Strict rejection with guidance. Invalid calls (wrong task, out-of-order, wrong state) are rejected with structured error responses that include:
   - Error code and human-readable message
   - Current system state (current task, status)
   - Valid actions the agent can take next
   
   Example:
   ```json
   {
     "error": "INVALID_TASK_STATE",
     "message": "Cannot signal completion for task 3. Task 2 is current.",
     "guidance": {
       "current_task_id": 2,
       "current_task_status": "IN_PROGRESS",
       "valid_actions": ["signal_completion for task 2", "get_current_task"]
     }
   }
   ```
   
   This aligns with the Eager Validation principle — fail fast with actionable feedback.

5. ~~**Sprint modification after start**: Can tasks be added/modified after sprint has started? What are the constraints?~~

   **RESOLVED**: Orchestrator has full modification rights. The orchestrator created the sprint and is trusted to manage it responsibly.
   
   Allowed at any time:
   - ✅ Add new tasks
   - ✅ Modify any task (PENDING, PREPARED, IN_PROGRESS, even COMPLETED)
   - ✅ Update verification criteria
   - ✅ Change dependencies
   - ✅ Remove tasks
   
   **Validation applied** (per Eager Validation principle):
   - Dependency graph must remain acyclic (no circular dependencies)
   - All task references must be valid (no dangling dependencies)
   - Tasks cannot depend on non-existent tasks
   
   **Rationale**: Orchestrators may discover issues during sprint execution and need to adapt. The system validates structural integrity but trusts the orchestrator's judgment on content and timing.

---

## 14. Resolution Summary

All open questions have been resolved:

1. **Resource vs Tool** → Tools only (Resources/subscriptions deferred as experimental)
2. **Pre-signal integration** → Automatic (Eager Validation principle)
3. **Visual verification** → Placeholder implementation (returns "not_implemented")
4. **Concurrent tasks** → Strict rejection with guidance (fail fast with actionable errors)
5. **Sprint modification** → Orchestrator has full modification rights (trust + structural validation)

**Core Design Principles Established:**

- **Eager Validation**: Every tool call performs all applicable validations inline
- **Fail Fast**: Invalid calls rejected immediately with structured error guidance
- **Trust the Orchestrator**: Full modification rights, system validates structure not judgment
- **Tool-First Architecture**: Uniform tool-based interface, no resources for v1

---

## Appendix A: v1 to v2 Action Migration

| v1 Action Type | v2 Equivalent |
|----------------|---------------|
| Agent edits manifest.yaml | Agent calls `configure_sprint` or `add_task` |
| Agent creates verification/*.yaml | Agent calls `configure_sprint` with verification data |
| Agent runs CLI command | System auto-executes, agent calls tool |
| Agent fills template | Agent provides content, system creates file |
| Agent creates YAML | Agent provides data via tool, system creates YAML |
| Agent reads file | System provides via resource/tool response |
| Agent updates progress | System updates automatically |
| Agent commits to git | System commits automatically |
