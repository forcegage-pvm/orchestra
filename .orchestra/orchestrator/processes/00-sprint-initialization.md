# Process 0: Sprint Initialization

> **Purpose**: Map requirements (SpecKit or otherwise) to Orchestra manifests and prepare for first task.
>
> **When**: ONCE at sprint start, before Process 1 begins.
>
> **Outcome**: Fully configured `.orchestra/` folder ready for task execution.

---

## Overview

Sprint Initialization is the setup phase where you:

1. Run `orchestra init` to create the folder structure
2. Analyze source requirements (SpecKit spec, feature doc, etc.)
3. Configure the manifest with tasks, phases, and dependencies
4. Create verification criteria YAML for each task
5. Run `orchestra status` to validate setup
6. Prepare for the first task handover with `orchestra prepare`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PROCESS 0: Sprint Initialization                    │
│                                                                         │
│   orchestra init  →  Configure Manifest  →  Verification YAMLs         │
│                      (phases & tasks)       (per task)                  │
│                                                                         │
│   THEN: orchestra prepare --task 1 for first task handover             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before starting:

- [ ] Source requirements document exists (SpecKit spec.md, feature doc, etc.)
- [ ] Orchestra CLI installed (`npm install -g @orchestra/cli` or local dev)
- [ ] You understand the feature/sprint scope
- [ ] You have identified task categories (INFRASTRUCTURE, INTEGRATION, VISUAL, REFACTOR)

---

## Step-by-Step Process

### Step 1: Initialize Orchestra

Run the CLI to create the folder structure:

```bash
# Initialize in current directory
orchestra init

# With SpecKit spec path
orchestra init --spec spec/requirements.md

# Reinitialize (overwrites existing)
orchestra init --force
```

This creates:

```
.orchestra/
├── orchestra.yaml       # Configuration
├── manifest.yaml        # Sprint/task definitions (edit this!)
├── progress.yaml        # Progress tracking
├── common/templates/    # Handover templates
├── orchestrator/
│   ├── readme.md
│   ├── processes/       # This document
│   ├── .orchestrator-only/
│   │   ├── verification/   # Hidden verification YAMLs
│   │   └── preflight/      # Preflight checklists
│   └── results/         # Task archives
├── implementor/
│   ├── readme.md
│   └── artifacts/       # Implementation artifacts
└── handover/
    └── agent_readme.md  # Implementor instructions
```

### Step 2: Analyze Source Requirements

Read and understand the source document:

```
Source Types:
├── SpecKit spec.md          # Formal specification with phases/tasks
├── Feature request          # User-facing feature description
├── Technical debt doc       # Refactoring requirements
├── Bug ticket               # Issue to fix
└── Research document        # Investigation findings
```

**Extract:**

- Overall objective/goal
- Discrete deliverables (files, tests, demos)
- Natural phase boundaries
- Dependencies between work items
- Success criteria / acceptance requirements

### Step 3: Define Tasks in Manifest

Edit `.orchestra/manifest.yaml` to define your tasks:

#### Task Granularity Guidelines

| Category       | Typical Duration | Example                                     |
| -------------- | ---------------- | ------------------------------------------- |
| INFRASTRUCTURE | 1-2 hours        | Create enum, model class, utility function  |
| INTEGRATION    | 2-4 hours        | Wire components together, implement feature |
| VISUAL         | 1-2 hours        | Create demo, verify rendering               |
| REFACTOR       | 1-3 hours        | Code cleanup, pattern updates               |

#### Current Manifest Schema

```yaml
# .orchestra/manifest.yaml
version: "1.0.0"

sprint:
  id: "sprint-001" # Unique sprint identifier
  name: "Multi-Axis Normalization"
  status: ACTIVE # ACTIVE | COMPLETED | ABORTED
  created_at: "2025-12-06"

phases:
  - phase_id: "foundation"
    phase_name: "Foundation Phase"
    status: ACTIVE # PENDING | ACTIVE | COMPLETED | ABORTED
    speckit_tasks: # SpecKit task IDs in this phase
      - "T001"
      - "T002"
    tasks:
      - task_id: 1
        title: "Create YAxisPosition Enum"
        description: "Define enum with left/right values for axis positioning"
        status: PENDING # PENDING | PREPARE | IMPLEMENT | GATE_CHECK | VERIFY | COMPLETE | RETRY | ESCALATED
        category: INFRASTRUCTURE
        dependencies: [] # Array of task_ids this depends on
        speckit_task_ref: "001-foundation/tasks.md#T001"

      - task_id: 2
        title: "Create YAxisScaleType Enum"
        description: "Define enum for linear/logarithmic scale types"
        status: PENDING
        category: INFRASTRUCTURE
        dependencies: [1] # Depends on task 1
        speckit_task_ref: "001-foundation/tasks.md#T002"

  - phase_id: "integration"
    phase_name: "Integration Phase"
    status: PENDING
    speckit_tasks:
      - "T003"
    tasks:
      - task_id: 3
        title: "Create YAxisConfig Model"
        description: "Combine enums into configuration model"
        status: PENDING
        category: INTEGRATION
        dependencies: [1, 2]
        speckit_task_ref: "002-integration/tasks.md#T003"

  - phase_id: "visual"
    phase_name: "Visual Verification"
    status: PENDING
    speckit_tasks:
      - "T004"
    tasks:
      - task_id: 4
        title: "Multi-axis Demo"
        description: "Create demo showing multi-axis functionality"
        status: PENDING
        category: VISUAL
        dependencies: [3]
        speckit_task_ref: "003-visual/tasks.md#T004"

# Optional: Track task consolidation
consolidations: []
```

#### Ordering Strategy

1. **Foundation first**: Enums, types, interfaces
2. **Building blocks second**: Models, utilities
3. **Integration third**: Connecting components
4. **Visual last**: Demos, visual verification

### Step 4: Create Verification YAMLs

For EACH task, create verification criteria in `.orchestra/orchestrator/.orchestrator-only/verification/`:

```yaml
# verification/task-001.yaml
task_id: 1
title: "Create YAxisPosition Enum"
category: "INFRASTRUCTURE"
created_at: "2025-12-06"

# Severity levels:
# - BLOCKING: Must pass (test failures, missing files)
# - MAJOR: Should pass (documentation, patterns)
# - MINOR: Nice to have (style, extras)
# - INFO: Informational only

# Verification types:
# - structural: File/folder existence, structure validation
# - functional: Tests pass, commands succeed
# - adversarial: Edge cases, error handling
# - visual: Screenshots, UI verification

checks:
  - id: "V1.1"
    description: "Source file exists"
    severity: BLOCKING
    type: structural

  - id: "V1.2"
    description: "Enum has required values (left, right)"
    severity: BLOCKING
    type: structural

  - id: "V1.3"
    description: "Test file exists"
    severity: BLOCKING
    type: structural

  - id: "V1.4"
    description: "All tests pass"
    severity: BLOCKING
    type: functional

  - id: "V1.5"
    description: "Static analysis clean"
    severity: MAJOR
    type: functional

  - id: "V1.6"
    description: "Has documentation comments"
    severity: MINOR
    type: structural
```

> ⚠️ **IMPORTANT**: Verification YAMLs are in `.orchestrator-only/` and are NEVER shown to the implementor. This prevents gaming of acceptance criteria.

### Step 5: Validate Setup

Run CLI commands to verify your configuration:

```bash
# Verify initialization structure and all verification YAMLs
orchestra init --verify

# Check overall status
orchestra status

# See what step comes next
orchestra next
```

**`orchestra init --verify` checks:**

- All required directories exist (common/templates, orchestrator, handover, etc.)
- All required config files exist (orchestra.yaml, manifest.yaml, progress.yaml)
- **All verification YAML files** in `.orchestrator-only/verification/` are schema-valid

Expected output when everything is correct:

```
Init Verification

  ✓ [DIR-common-templates] Directory: common/templates
  ✓ [DIR-orchestrator--orchestrator-only-verification] Directory: orchestrator/.orchestrator-only/verification
  ✓ [DIR-orchestrator-processes] Directory: orchestrator/processes
  ✓ [DIR-handover] Directory: handover
  ✓ [DIR-implementor] Directory: implementor
  ✓ [FILE-orchestra-yaml] Configuration file
  ✓ [FILE-manifest-yaml] Manifest file
  ✓ [FILE-progress-yaml] Progress file
  ✓ [VERIFY-task-001-yaml] Verification: task-001.yaml
  ✓ [VERIFY-task-002-yaml] Verification: task-002.yaml

✓ All 10 checks passed. Initialization verified.
```

**If verification fails**, fix the issues and re-run until all checks pass:

```
  ✗ [VERIFY-task-001-yaml] Verification: task-001.yaml
      Expected: Valid schema
      Actual:   Invalid: Required
      Fix:      Verification YAML validation failed:

  ❌ checks: Required
     Received: "undefined"

✗ 1 of 9 checks failed. Fix issues above.
```

> ⚠️ **IMPORTANT**: You MUST iterate until `orchestra init --verify` passes completely before proceeding to Process 1. This is the structural gate that ensures all verification YAMLs are correctly formatted.

### Step 6: Prepare Handover Folder

The handover folder should be clean before starting:

```bash
# Check handover folder is empty (except agent_readme.md)
ls .orchestra/handover/

# Should show:
# agent_readme.md    # Static file - keep this
```

If there are stale files from previous work:

```powershell
# PowerShell: Clear stale files
Remove-Item .orchestra/handover/task-*.md -ErrorAction SilentlyContinue
Remove-Item .orchestra/handover/signal-*.yaml -ErrorAction SilentlyContinue
Remove-Item .orchestra/handover/feedback-*.md -ErrorAction SilentlyContinue
```

```bash
# Bash: Clear stale files
rm -f .orchestra/handover/task-*.md
rm -f .orchestra/handover/signal-*.yaml
rm -f .orchestra/handover/feedback-*.md
```

### Step 7: Prepare First Task

When ready to start, prepare the first task:

```bash
# Prepare task 1 (or next available task by dependency order)
orchestra prepare --task 1

# Or let Orchestra pick the next available task
orchestra prepare
```

This generates the handover document and transitions the task to IMPLEMENT status.

---

## Mapping from SpecKit

If your source is a SpecKit spec, here's how to map:

| SpecKit Element     | Orchestra Element               |
| ------------------- | ------------------------------- |
| `spec.md` phases    | `phases` array in manifest      |
| `tasks.md` items    | `tasks` array within each phase |
| Task checkboxes     | `description` + verification    |
| Acceptance criteria | `verification/*.yaml` checks    |
| Phase descriptions  | `phase_name` field              |
| Task IDs            | `speckit_task_ref` field        |

### Example SpecKit → Orchestra Mapping

**SpecKit tasks.md:**

```markdown
## Phase 1: Foundation

### T001: Create YAxisPosition Enum

- [ ] Create `lib/src/models/y_axis_position.dart`
- [ ] Add `left` and `right` values
- [ ] Write unit tests
- [ ] Export from barrel file
```

**Orchestra manifest.yaml:**

```yaml
phases:
  - phase_id: "foundation"
    phase_name: "Phase 1: Foundation"
    status: ACTIVE
    speckit_tasks:
      - "T001"
    tasks:
      - task_id: 1
        title: "Create YAxisPosition Enum"
        description: "Create enum with left/right values, tests, and exports"
        status: PENDING
        category: INFRASTRUCTURE
        dependencies: []
        speckit_task_ref: "001-foundation/tasks.md#T001"
```

**Orchestra verification/task-001.yaml:**

```yaml
task_id: 1
title: "Create YAxisPosition Enum"
created_at: "2025-12-06"

checks:
  - id: "V1.1"
    description: "File lib/src/models/y_axis_position.dart exists"
    severity: BLOCKING
    type: structural

  - id: "V1.2"
    description: "Enum has left and right values"
    severity: BLOCKING
    type: structural

  - id: "V1.3"
    description: "Unit tests exist and pass"
    severity: BLOCKING
    type: functional

  - id: "V1.4"
    description: "Exported from barrel file"
    severity: MAJOR
    type: structural
```

---

## Checklist

Before proceeding to Process 1:

- [ ] `orchestra init` has been run
- [ ] Source requirements analyzed
- [ ] All tasks identified and ordered in `manifest.yaml`
- [ ] Verification YAML created for EACH task in `.orchestrator-only/verification/`
- [ ] **`orchestra init --verify` passes with ALL checks green**
- [ ] `orchestra status` shows valid configuration
- [ ] Handover folder has no stale files
- [ ] Ready to run `orchestra prepare --task 1`

---

## CLI Commands Reference

| Command                        | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `orchestra init`               | Initialize folder structure                          |
| `orchestra init --spec <path>` | Initialize with SpecKit reference                    |
| `orchestra init --verify`      | **Verify initialization and all verification YAMLs** |
| `orchestra status`             | Show current state                                   |
| `orchestra next`               | Show what to do next                                 |
| `orchestra prepare`            | Prepare handover for next task                       |
| `orchestra prepare --task N`   | Prepare specific task                                |

---

## Next Steps

After completing Process 0:

1. **Run `orchestra prepare`**: Generate handover for task 1
2. **Proceed to Process 1**: [Handover Creation](./01-handover-creation.md)
3. **Invoke implementor**: Hand over to implementor agent

---

## Common Mistakes

❌ **Editing manifest in wrong location**

- Manifest is at `.orchestra/manifest.yaml` (root level)
- NOT in `.orchestrator-only/`

❌ **Missing verification YAMLs**

- Every task needs a verification file in `.orchestrator-only/verification/`
- Filename: `task-001.yaml`, `task-002.yaml`, etc.

❌ **Leaving stale files in handover/**

- Always clear task/signal/feedback files before new sprint
- Keep `agent_readme.md` (static reference)

❌ **Dependencies pointing to non-existent tasks**

- Validate all `dependencies` array values exist

❌ **Missing category assignment**

- Every task needs: INFRASTRUCTURE, INTEGRATION, VISUAL, or REFACTOR

❌ **Inconsistent task IDs**

- Use integer IDs (1, 2, 3, ...)
- Field name is `task_id` not `id`

❌ **Wrong status values**

- Task status: PENDING | PREPARE | IMPLEMENT | GATE_CHECK | VERIFY | COMPLETE | RETRY | ESCALATED
- Sprint status: ACTIVE | COMPLETED | ABORTED
- Phase status: PENDING | ACTIVE | COMPLETED | ABORTED

---

## Reference Files

| File         | Location                                                   | Purpose               |
| ------------ | ---------------------------------------------------------- | --------------------- |
| Manifest     | `.orchestra/manifest.yaml`                                 | Task definitions      |
| Config       | `.orchestra/orchestra.yaml`                                | CLI configuration     |
| Progress     | `.orchestra/progress.yaml`                                 | Progress tracking     |
| Verification | `.orchestra/orchestrator/.orchestrator-only/verification/` | Hidden criteria       |
| Handover     | `.orchestra/handover/`                                     | Implementor workspace |
