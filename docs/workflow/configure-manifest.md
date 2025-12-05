# Configure Manifest

> **Phase**: INIT  
> **CLI Command**: (orchestrator agent process)  
> **Source**: `.orchestra/manifest.yaml`  
> **Process Guide**: [00-sprint-initialization.md](../../templates/orchestrator/processes/00-sprint-initialization.md)

---

## Index

- [Overview](#overview)
- [Purpose](#purpose)
- [Philosophy](#philosophy)
- [Actions](#actions)
- [Execution Sequence](#execution-sequence)
- [Agent Process](#agent-process)
- [CLI Command](#cli-command)
- [Input](#input)
- [File Impact](#file-impact)
- [Template Details](#template-details)
- [Git Actions](#git-actions)
- [Outcome](#outcome)
- [Next Step](#next-step)
- [Evidence Produced](#evidence-produced)
- [Implementation Reference](#implementation-reference)
- [Troubleshooting](#troubleshooting)

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Phase** | INIT |
| **Role** | **Orchestrator Agent** (not human, not implementor) |
| **Trigger** | After `orchestra init` creates placeholder manifest |
| **Preconditions** | `.orchestra/manifest.yaml` exists; source requirements available |
| **Process Guide** | [00-sprint-initialization.md](../../templates/orchestrator/processes/00-sprint-initialization.md) |

---

## Purpose

Configure the sprint manifest with actual tasks, dependencies, and phases. This step transforms the placeholder `manifest.yaml` into a proper sprint definition that:

1. **Defines the sprint** - ID, name, and metadata
2. **Lists all tasks** - With titles, descriptions, and categories
3. **Establishes dependencies** - Which tasks must complete before others
4. **Organizes into phases** (optional) - Groups related tasks for SpecKit alignment
5. **Links to specifications** (optional) - References to SpecKit task definitions
6. **Creates verification criteria** - Hidden checks for each task (in `.orchestrator-only/`)

This is an **orchestrator agent process** - there is no CLI command. The orchestrator agent analyzes source requirements and populates the manifest.

---

## Philosophy

The manifest is the **contract for the sprint**. It defines exactly what work will be done, in what order, with what dependencies.

### Why Orchestrator Agent?

This step is performed by the **orchestrator agent** (not human, not implementor) because:

1. **Spec analysis required** - Agent reads and understands source requirements (SpecKit, feature docs, etc.)
2. **Task decomposition** - Agent breaks down requirements into granular, verifiable tasks
3. **Dependency mapping** - Agent identifies which tasks depend on others
4. **Verification design** - Agent creates hidden verification criteria that implementor won't see
5. **Consistency** - Agent follows the structured process in [00-sprint-initialization.md](../../templates/orchestrator/processes/00-sprint-initialization.md)

> **Important**: The orchestrator agent has access to the full process guide at  
> `.orchestra/orchestrator/processes/00-sprint-initialization.md`  
> This document provides step-by-step instructions for manifest configuration.

### Anti-Patterns This Prevents

| Anti-Pattern | How This Step Prevents It |
|--------------|---------------------------|
| Undefined scope | All tasks must be explicitly listed |
| Hidden dependencies | Dependencies are declared upfront |
| Unbounded work | Task count and scope are fixed before implementation |
| Moving goalposts | Manifest is committed to git as the contract |
| Gaming verification | Verification criteria created BEFORE handover, hidden from implementor |

### Design Principles

1. **Explicit over implicit** - Every task must be defined, no "and also do X"
2. **Dependencies declared** - No surprise blockers during implementation
3. **Categories assigned** - Helps verification know what to check
4. **IDs are stable** - Once assigned, task IDs should not change
5. **Verification first** - Create verification criteria before any handover

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|--------|
| A-CFG-01 | Validate manifest | `orchestra status` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-CFG-02 | Orchestrator | Analyze source requirements |
| A-CFG-03 | Orchestrator | Define tasks with dependencies |
| A-CFG-04 | Orchestrator | Populate manifest.yaml |
| A-CFG-05 | Orchestrator | Create verification YAMLs |
| A-CFG-06 | Orchestrator | Initialize progress.yaml |
| A-CFG-07 | Orchestrator | Clear stale handover files |
| A-CFG-08 | Orchestrator | Validate setup |

### Manual Actions

| ID | Role | Action | Notes |
|----|------|--------|-------|
| A-CFG-09 | Human | Review manifest | Optional |

### Git Actions

| ID | Action | Level | Command |
|----|--------|-------|--------|
| A-CFG-10 | Stage manifest | Recommended | `git add .orchestra/manifest.yaml` |
| A-CFG-11 | Commit manifest | Recommended | `git commit -m "chore(orchestra): configure sprint"` |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-CFG-02 | Agent | Analyze source requirements |
| 2 | A-CFG-03 | Agent | Define tasks with dependencies |
| 3 | A-CFG-04 | Agent | Populate manifest.yaml |
| 4 | A-CFG-05 | Agent | Create verification YAMLs |
| 5 | A-CFG-06 | Agent | Initialize progress.yaml |
| 6 | A-CFG-07 | Agent | Clear stale handover files |
| 7 | A-CFG-08 | Agent | Validate setup |
| 8 | A-CFG-01 | CLI | `orchestra status` |
| 9 | A-CFG-09 | Manual | Review manifest (optional) |
| 10 | A-CFG-10 | Git | Stage manifest |
| 11 | A-CFG-11 | Git | Commit manifest |

---

## Agent Process

The orchestrator agent follows the detailed process in:

📄 **[00-sprint-initialization.md](../../templates/orchestrator/processes/00-sprint-initialization.md)**

This process guide covers:

### A-CFG-02: Analyze Source Requirements

- Read SpecKit spec, feature doc, or other source
- Extract objectives, deliverables, phase boundaries
- Identify dependencies between work items

### A-CFG-03: Define Tasks

- Break down work into Orchestra tasks
- Apply task granularity guidelines:

| Category | Typical Duration | Example |
|----------|------------------|---------|
| INFRASTRUCTURE | 1-2 hours | Create enum, model class, utility |
| INTEGRATION | 2-4 hours | Wire components, implement feature |
| VISUAL | 1-2 hours | Create demo, verify rendering |

### A-CFG-04: Populate Manifest

- Populate `.orchestra/manifest.yaml` with phases and tasks
- Include task IDs, titles, categories, dependencies
- Link to SpecKit task refs where applicable

### A-CFG-05: Create Verification YAMLs

- For EACH task, create verification criteria
- Store in `.orchestra/orchestrator/.orchestrator-only/verification/task-XXX.yaml`
- Define BLOCKING, MAJOR, MINOR severity checks

### A-CFG-06: Initialize Progress

- Create/reset `.orchestra/progress.yaml`
- Set all tasks to `not-started`

### A-CFG-07: Clear Stale Handover Files

- Clear any stale files from previous sprints
- Verify folder structure is ready

### A-CFG-08: Validate Setup

- Ensure all verification YAMLs exist
- Verify progress matches manifest
- Check for missing dependencies

> **Full details**: See [00-sprint-initialization.md](../../templates/orchestrator/processes/00-sprint-initialization.md) for complete step-by-step instructions.

---

## CLI Command

This step has no CLI command - it is an orchestrator agent process.

### Validation

After the orchestrator completes configuration, use `orchestra status` to validate:

```bash
orchestra status
```

This will:
- Parse the manifest YAML
- Validate against the schema
- Check dependency integrity (no circular dependencies, all referenced IDs exist)
- Report any errors

### Examples

```bash
# After editing manifest.yaml
orchestra status

# Expected output for valid manifest:
# ✓ Manifest valid
# Sprint: sprint-001 - My Sprint Name
# Tasks: 5 total (5 pending, 0 in progress, 0 complete)
```

---

## Input

### Required

| Input | Source | Purpose |
|-------|--------|---------|
| `.orchestra/manifest.yaml` | Created by `orchestra init` | File to populate |
| Source requirements | SpecKit spec, feature doc, ticket | Work to be done |
| `.orchestra/orchestrator/processes/00-sprint-initialization.md` | Template repository | Process guide |

### Source Requirement Types

The orchestrator agent can work from various source types:

| Source Type | Example | Notes |
|-------------|---------|-------|
| SpecKit spec.md | `spec/requirements.md` | Formal specification with phases/tasks |
| Feature request | GitHub issue, Jira ticket | User-facing feature description |
| Technical debt doc | `docs/tech-debt.md` | Refactoring requirements |
| Bug ticket | Issue tracker | Problem to fix |
| Research document | `docs/research.md` | Investigation findings |

### Optional

| Input | Source | Purpose |
|-------|--------|---------|
| Previous sprint manifests | Historical `.orchestra/` folders | Reference for similar work |
| Architecture docs | Project documentation | Context for task breakdown |

---

## File Impact

### Created

The orchestrator agent creates verification criteria for each task:

| Path | Purpose | Created By |
|------|---------|------------|
| `.orchestra/orchestrator/.orchestrator-only/verification/task-001.yaml` | Verification criteria for task 1 | Orchestrator Agent |
| `.orchestra/orchestrator/.orchestrator-only/verification/task-002.yaml` | Verification criteria for task 2 | Orchestrator Agent |
| `.orchestra/orchestrator/.orchestrator-only/verification/task-XXX.yaml` | (one per task) | Orchestrator Agent |

> **Hidden from Implementor**: These verification files are in `.orchestrator-only/` and must NEVER be shown to the implementor. This is the core of Orchestra's anti-gaming pattern.

### Updated

| Path | Purpose | Edited By |
|------|---------|-----------|
| `.orchestra/manifest.yaml` | Sprint and task definitions | Orchestrator Agent |
| `.orchestra/progress.yaml` | Initialize progress tracking | Orchestrator Agent |

### Read

| Path | Purpose |
|------|---------|
| Source requirements | SpecKit spec, feature doc, ticket, etc. |
| `.orchestra/orchestra.yaml` | May reference `spec_path` |
| `.orchestra/orchestrator/processes/00-sprint-initialization.md` | Process guide for orchestrator |

### Deleted

The orchestrator clears stale files from previous sprints:

| Path | Purpose |
|------|---------|
| `.orchestra/handover/current-task.md` | Stale handover from previous sprint |
| `.orchestra/handover/completion-signal.md` | Stale signal from previous sprint |

---

## Manifest Structure

### Required Fields

```yaml
version: "1.0.0"

sprint:
  id: "sprint-001"           # Unique identifier (kebab-case recommended)
  name: "Sprint Name"        # Human-readable name
  status: ACTIVE             # ACTIVE | COMPLETED | ABORTED
  created_at: "2025-12-05"   # ISO date

# Option 1: Legacy format (flat task list)
tasks:
  - id: 1
    title: "Task Title"
    # ... (see task schema below)

# Option 2: Phase format (SpecKit aligned)
phases:
  - phase_id: "foundation"
    phase_name: "Foundation Phase"
    status: PENDING
    tasks:
      - task_id: 1
        title: "Task Title"
        # ... (see task schema below)
```

### Task Schema

Each task requires:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` or `task_id` | number | Yes | Unique positive integer |
| `title` | string | Yes | Short task name |
| `description` | string | No | Detailed description |
| `status` | enum | No | Default: `PENDING` |
| `category` | enum | No | `INFRASTRUCTURE`, `INTEGRATION`, `VISUAL`, `REFACTOR` |
| `dependencies` | number[] | No | Array of task IDs this depends on |
| `speckit_task_ref` | string | No | Reference to SpecKit task definition |

### Task Status Values

| Status | Meaning | Set By |
|--------|---------|--------|
| `PENDING` | Not started | Default |
| `PREPARE` | Orchestrator preparing handover | `orchestra prepare` |
| `IMPLEMENT` | Implementor working | (automatic) |
| `GATE_CHECK` | Running automated checks | (automatic) |
| `VERIFY` | Verification in progress | `orchestra verify` |
| `COMPLETE` | Successfully finished | `orchestra complete` |
| `RETRY` | Failed, retrying | `orchestra feedback` |
| `ESCALATED` | Needs human intervention | `orchestra escalate` |

### Task Categories

| Category | Use For | Verification Focus |
|----------|---------|-------------------|
| `INFRASTRUCTURE` | Setup, configuration, tooling | File existence, config validity |
| `INTEGRATION` | APIs, data flow, connections | Functional tests, contracts |
| `VISUAL` | UI components, styling | Screenshot comparison, layout |
| `REFACTOR` | Code cleanup, restructuring | Tests still pass, no regression |

### Complete Example

```yaml
version: "1.0.0"

sprint:
  id: "sprint-001"
  name: "CLI Foundation Sprint"
  status: ACTIVE
  created_at: "2025-12-05"

phases:
  - phase_id: "foundation"
    phase_name: "Foundation Phase"
    status: ACTIVE
    speckit_tasks:
      - "T001"
      - "T002"
    tasks:
      - task_id: 1
        title: "Initialize project structure"
        description: "Create folder structure and configuration files"
        status: PENDING
        category: INFRASTRUCTURE
        dependencies: []
        speckit_task_ref: "001-foundation/tasks.md#T001"

      - task_id: 2
        title: "Implement core types"
        description: "Define TypeScript types and Zod schemas"
        status: PENDING
        category: INFRASTRUCTURE
        dependencies: [1]
        speckit_task_ref: "001-foundation/tasks.md#T002"

  - phase_id: "commands"
    phase_name: "Commands Phase"
    status: PENDING
    tasks:
      - task_id: 3
        title: "Implement init command"
        description: "Create orchestra init CLI command"
        status: PENDING
        category: INTEGRATION
        dependencies: [2]

      - task_id: 4
        title: "Implement status command"
        description: "Create orchestra status CLI command"
        status: PENDING
        category: INTEGRATION
        dependencies: [2]

consolidations: []
```

---

## Verification YAML Structure

For EACH task, the orchestrator agent creates a verification file in `.orchestra/orchestrator/.orchestrator-only/verification/`.

> **⚠️ CRITICAL**: These files are HIDDEN from the implementor. This is the core of Orchestra's anti-gaming pattern.

### Verification File Format

```yaml
# verification/task-001.yaml
task_id: 1
title: "Create YAxisPosition Enum"
category: "INFRASTRUCTURE"
created: "2025-12-05"

checks:
  - id: "V1.1"
    name: "File exists"
    severity: "BLOCKING"      # BLOCKING | MAJOR | MINOR | INFO
    type: "file_exists"
    params:
      path: "lib/src/models/y_axis_position.dart"
    expected: "File exists"

  - id: "V1.2"
    name: "Enum defined"
    severity: "BLOCKING"
    type: "pattern_match"
    params:
      file: "lib/src/models/y_axis_position.dart"
      pattern: "enum YAxisPosition"
    expected: "Enum YAxisPosition is defined"

  - id: "V1.3"
    name: "Tests pass"
    severity: "BLOCKING"
    type: "command"
    params:
      command: "flutter test test/unit/y_axis_position_test.dart"
      expected_exit: 0
    expected: "All tests pass"
```

### Severity Levels

| Severity | Meaning | Effect on Verification |
|----------|---------|------------------------|
| `BLOCKING` | Must pass | Task fails if any BLOCKING check fails |
| `MAJOR` | Should pass | Warning, may require retry |
| `MINOR` | Nice to have | Logged but doesn't block |
| `INFO` | Informational | Documentation only |

### Verification Types

| Type | Purpose | Parameters |
|------|---------|------------|
| `file_exists` | Check file exists | `path` |
| `dir_exists` | Check directory exists | `path` |
| `pattern_match` | Regex in file | `file`, `pattern` |
| `command` | Run shell command | `command`, `expected_exit`, `expected_pattern` |
| `json_valid` | Validate JSON | `path` |
| `yaml_valid` | Validate YAML | `path` |
| `screenshot_exists` | Check screenshot | `path`, `min_size` |

> **Full details**: See [00-sprint-initialization.md](../../templates/orchestrator/processes/00-sprint-initialization.md) Step 4 for complete verification YAML documentation.

---

## Template Details

### Current State

| Template | Converts To | When Used |
|----------|-------------|-----------|
| N/A | N/A | Orchestrator agent edits files directly |

**Note**: The orchestrator agent populates the manifest by analyzing source requirements. The placeholder created by `orchestra init` is a starting point.

### Future State (Pending TD-003)

Once [TD-003: Template-Based Config Generation](technical-debt.md#td-003-template-based-config-generation) is implemented, `manifest.yaml.hbs` may provide a richer starting template with dynamic values.

---

## Git Actions

### Enforcement Levels

| Action | Level | Current State | Notes |
|--------|-------|---------------|-------|
| Commit manifest | **Recommended** | Manual | Manifest is the sprint contract |
| Stage manifest | **Guideline** | Manual | Before starting work |

> **Best Practice**: Commit the configured manifest before running `orchestra prepare`.  
> This establishes the sprint contract in version control.

### Recommended Git Workflow

```bash
# After editing manifest.yaml
git add .orchestra/manifest.yaml
git commit -m "chore(orchestra): configure sprint-001 manifest

- Define 4 tasks across 2 phases
- Establish task dependencies
- Link to SpecKit task refs"
```

---

## Outcome

### Success

| Outcome | Description |
|---------|-------------|
| Valid manifest | YAML parses without errors |
| Schema valid | All required fields present, correct types |
| Dependencies valid | No circular dependencies, all IDs exist |
| Ready for prepare | Can run `orchestra prepare --task 1` |

**Validation Output (Success):**
```
$ orchestra status

✓ Orchestra initialized
✓ Manifest valid

Sprint: sprint-001 - CLI Foundation Sprint
Status: ACTIVE
Created: 2025-12-05

Tasks: 4 total
  • PENDING: 4
  • IN PROGRESS: 0
  • COMPLETE: 0

Ready to prepare task 1: Initialize project structure
```

### Failure

| Failure | Cause | Resolution |
|---------|-------|------------|
| YAML parse error | Invalid YAML syntax | Fix syntax (check indentation, colons, quotes) |
| Schema validation error | Missing required fields | Add missing fields per schema |
| Circular dependency | Task A → B → A | Remove circular reference |
| Invalid dependency | Task depends on non-existent ID | Fix dependency array |
| Empty tasks | No tasks defined | Add at least one task |

**Validation Output (Failure):**
```
$ orchestra status

✗ Manifest validation failed

Errors:
  • tasks[1].dependencies: Task 99 does not exist
  • phases[0].tasks: Array must contain at least one task

Fix these errors in .orchestra/manifest.yaml
```

---

## Next Step

After successful manifest configuration:

| Action | Command/Location | Purpose |
|--------|------------------|---------|
| **Validate manifest** | `orchestra status` | Confirm no errors |
| **Commit manifest** | `git commit` | Establish sprint contract |
| **Prepare first task** | `orchestra prepare --task 1` | Begin first task |
| **Check guidance** | `orchestra next` | Get context-aware next action |

> **`orchestra next` Command**: Run this at any point to get guidance on what to do next.  
> See [Technical Debt: orchestra next](technical-debt.md#td-002-orchestra-next-command) for implementation status.

---

## Evidence Produced

After successful configuration, these artifacts prove the step completed correctly:

### Verification Checklist

- [ ] `.orchestra/manifest.yaml` contains real tasks (not placeholder)
- [ ] `.orchestra/orchestrator/.orchestrator-only/verification/` contains one YAML per task
- [ ] `orchestra status` shows no errors
- [ ] All tasks have unique IDs
- [ ] Dependencies reference valid task IDs
- [ ] Sprint has meaningful name and ID
- [ ] Stale files cleared from `.orchestra/handover/`
- [ ] Manifest is committed to git

### Programmatic Verification

```bash
# Validate manifest
orchestra status

# Should show task count, no errors

# Verify verification YAMLs exist (PowerShell example from process guide)
$tasks = (Get-Content .orchestra/manifest.yaml | ConvertFrom-Yaml).phases.tasks
foreach ($task in $tasks) {
    $yamlPath = ".orchestra/orchestrator/.orchestrator-only/verification/task-$($task.task_id.ToString().PadLeft(3,'0')).yaml"
    if (!(Test-Path $yamlPath)) { Write-Warning "Missing: $yamlPath" }
}
```

---

## Implementation Reference

### Process Guide (Primary Reference)

| File | Purpose |
|------|---------|
| [00-sprint-initialization.md](../../templates/orchestrator/processes/00-sprint-initialization.md) | **Step-by-step process for orchestrator agent** |

This is the primary reference document for the orchestrator agent. It contains:
- Detailed instructions for each step
- SpecKit to Orchestra mapping
- Verification YAML examples
- Common mistakes to avoid
- Validation checklist

### Source Files

| File | Purpose |
|------|---------|
| [src/core/types.ts](../../src/core/types.ts) | `ManifestSchema`, `TaskSchema`, `PhaseSchema` |
| [src/core/manifest.ts](../../src/core/manifest.ts) | `loadManifest()`, `saveManifest()`, `getAllTasks()` |
| [src/core/validation.ts](../../src/core/validation.ts) | Manifest validation utilities |
| [src/commands/status.ts](../../src/commands/status.ts) | Status command that validates manifest |

### Key Types

From `src/core/types.ts`:

```typescript
// Task status lifecycle
type TaskStatus = "PENDING" | "PREPARE" | "IMPLEMENT" | "GATE_CHECK" 
                | "VERIFY" | "COMPLETE" | "RETRY" | "ESCALATED";

// Task categories
type TaskCategory = "INFRASTRUCTURE" | "INTEGRATION" | "VISUAL" | "REFACTOR";

// Sprint status
type SprintStatus = "ACTIVE" | "COMPLETED" | "ABORTED";
```

### Validation Rules

The manifest is validated by Zod schema with these rules:

1. **Version required** - Must be semver string
2. **Sprint required** - Must have `id`, `name`, `status`, `created_at`
3. **Tasks or Phases** - Must have either `tasks` array or `phases` array (not empty)
4. **Task IDs** - Must be positive integers
5. **Dependencies** - Must reference existing task IDs

---

## Troubleshooting

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| YAML syntax error | `unexpected token` | Check indentation (2 spaces), colons, quotes |
| Missing task ID | `Either 'id' or 'task_id' must be provided` | Add `id:` or `task_id:` to task |
| Circular dependency | `Circular dependency detected` | Review and fix dependency chain |
| Duplicate task ID | `Duplicate task ID: 3` | Ensure all IDs are unique |

### YAML Syntax Tips

```yaml
# ✓ Correct - proper indentation
tasks:
  - id: 1
    title: "Task One"
    dependencies: []

# ✗ Wrong - inconsistent indentation
tasks:
- id: 1
   title: "Task One"
  dependencies: []

# ✓ Correct - empty array
dependencies: []

# ✓ Correct - array with values
dependencies: [1, 2, 3]

# ✓ Correct - multiline array
dependencies:
  - 1
  - 2
  - 3
```

### Validation Commands

```bash
# Full status check
orchestra status

# JSON output for debugging
orchestra status --json

# Check specific manifest path (testing)
orchestra status --manifest ./test-manifest.yaml
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial specification |

---

*This document is part of the [Orchestra Workflow Specification](workflow.md).*
