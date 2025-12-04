# Process 0: Sprint Initialization

> **Purpose**: Map requirements (SpecKit or otherwise) to Orchestra manifests and prepare for first task.
> 
> **When**: ONCE at sprint start, before Process 1 begins.
> 
> **Outcome**: Fully configured `.orchestra/` folder ready for task execution.

---

## Overview

Sprint Initialization is the setup phase where you:
1. Analyze the source requirements (SpecKit spec, feature doc, etc.)
2. Create the Orchestra manifest with tasks, phases, and dependencies
3. Create verification criteria YAML for each task
4. Initialize progress tracking
5. Prepare for the first task handover

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PROCESS 0: Sprint Initialization                    │
│                                                                         │
│   Requirements  →  Manifest  →  Verification YAMLs  →  Progress Init   │
│   (SpecKit/Doc)    (tasks)      (per task)             (tracking)      │
│                                                                         │
│   THEN: Proceed to Process 1 (Handover Creation) for first task        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before starting:
- [ ] Source requirements document exists (SpecKit spec.md, feature doc, etc.)
- [ ] `.orchestra/` folder structure exists (use template if needed)
- [ ] You understand the feature/sprint scope
- [ ] You have identified task categories (INFRASTRUCTURE, INTEGRATION, VISUAL)

---

## Step-by-Step Process

### Step 1: Analyze Source Requirements

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

### Step 2: Define Tasks

Break down the work into Orchestra tasks:

#### Task Granularity Guidelines

| Category | Typical Duration | Example |
|----------|-----------------|---------|
| INFRASTRUCTURE | 1-2 hours | Create enum, model class, utility function |
| INTEGRATION | 2-4 hours | Wire components together, implement feature |
| VISUAL | 1-2 hours | Create demo, verify rendering |

#### Task Structure

Each task should have:
```yaml
- id: "1.1"                           # Unique ID (phase.task)
  title: "Create YAxisPosition Enum"  # Clear, action-oriented title
  category: "INFRASTRUCTURE"          # INFRASTRUCTURE | INTEGRATION | VISUAL
  status: "not-started"               # Always start as not-started
  depends_on: []                      # Task IDs this depends on
  spec_ref: "SPEC-011-1.1"            # Reference to source requirement
  deliverables:                       # Concrete outputs
    - "lib/src/models/y_axis_position.dart"
    - "test/unit/y_axis_position_test.dart"
```

#### Ordering Strategy

1. **Foundation first**: Enums, types, interfaces
2. **Building blocks second**: Models, utilities
3. **Integration third**: Connecting components
4. **Visual last**: Demos, visual verification

### Step 3: Create Manifest

Create/update `.orchestra/orchestrator/.orchestrator-only/manifest.yaml`:

```yaml
# Sprint Manifest
# ⚠️ HIDDEN FROM IMPLEMENTOR

sprint: "011-multi-axis-normalization"
spec: "specs/011-multi-axis-normalization/spec.md"
created: "2025-12-01"
status: "not-started"

phases:
  - id: "foundation"
    name: "Foundation"
    description: "Core types and enums"
    tasks:
      - id: "1"
        title: "Create YAxisPosition Enum"
        category: "INFRASTRUCTURE"
        status: "not-started"
        depends_on: []
        spec_ref: "SPEC-011-1.1"
        deliverables:
          - "lib/src/models/y_axis_position.dart"
          - "test/unit/y_axis_position_test.dart"
        
      - id: "2"
        title: "Create YAxisScaleType Enum"
        category: "INFRASTRUCTURE"
        status: "not-started"
        depends_on: ["1"]
        spec_ref: "SPEC-011-1.2"
        deliverables:
          - "lib/src/models/y_axis_scale_type.dart"
          - "test/unit/y_axis_scale_type_test.dart"

  - id: "integration"
    name: "Integration"
    description: "Component wiring"
    tasks:
      - id: "3"
        title: "Create YAxisConfig Model"
        category: "INTEGRATION"
        status: "not-started"
        depends_on: ["1", "2"]
        spec_ref: "SPEC-011-2.1"
        deliverables:
          - "lib/src/models/y_axis_config.dart"
          - "test/unit/y_axis_config_test.dart"

  - id: "visual"
    name: "Visual Verification"
    description: "Demos and visual tests"
    tasks:
      - id: "4"
        title: "Multi-axis Demo"
        category: "VISUAL"
        status: "not-started"
        depends_on: ["3"]
        spec_ref: "SPEC-011-3.1"
        deliverables:
          - "example/lib/demos/multi_axis_demo.dart"
          - "screenshots/multi_axis_demo.png"

# Tracking
current_task: null
current_phase: null

# Summary (update as sprint progresses)
summary:
  total_tasks: 4
  completed: 0
  in_progress: 0
  pending: 4
```

### Step 4: Create Verification YAMLs

For EACH task, create verification criteria in `.orchestra/orchestrator/.orchestrator-only/verification/`:

```yaml
# verification/task-001.yaml
task_id: 1
title: "Create YAxisPosition Enum"
category: "INFRASTRUCTURE"
created: "2025-12-01"

# Severity levels:
# - BLOCKING: Must pass (file exists, tests pass)
# - MAJOR: Should pass (documentation, patterns)
# - MINOR: Nice to have (style, extras)
# - INFO: Informational only

checks:
  - id: "V1.1"
    name: "File exists"
    severity: "BLOCKING"
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
    name: "Has left/right values"
    severity: "BLOCKING"
    type: "pattern_match"
    params:
      file: "lib/src/models/y_axis_position.dart"
      pattern: "(left|right)"
    expected: "Contains left and right values"

  - id: "V1.4"
    name: "Test file exists"
    severity: "BLOCKING"
    type: "file_exists"
    params:
      path: "test/unit/y_axis_position_test.dart"
    expected: "Test file exists"

  - id: "V1.5"
    name: "Tests pass"
    severity: "BLOCKING"
    type: "command"
    params:
      command: "flutter test test/unit/y_axis_position_test.dart"
      expected_exit: 0
    expected: "All tests pass"

  - id: "V1.6"
    name: "Analyzer clean"
    severity: "MAJOR"
    type: "command"
    params:
      command: "flutter analyze lib/src/models/y_axis_position.dart"
      expected_pattern: "No issues found"
    expected: "No analyzer issues"

  - id: "V1.7"
    name: "Documentation"
    severity: "MINOR"
    type: "pattern_match"
    params:
      file: "lib/src/models/y_axis_position.dart"
      pattern: "///"
    expected: "Has doc comments"
```

#### Verification Types

| Type | Purpose | Parameters |
|------|---------|------------|
| `file_exists` | Check file exists | `path` |
| `dir_exists` | Check directory exists | `path` |
| `pattern_match` | Regex in file | `file`, `pattern` |
| `command` | Run shell command | `command`, `expected_exit`, `expected_pattern` |
| `json_valid` | Validate JSON | `path` |
| `yaml_valid` | Validate YAML | `path` |
| `screenshot_exists` | Check screenshot | `path`, `min_size` |

### Step 5: Initialize Progress

Create/reset `.orchestra/orchestrator/.orchestrator-only/progress.yaml`:

```yaml
# Sprint Progress
# Updated by orchestrator after each task

sprint: "011-multi-axis-normalization"
created: "2025-12-01"
status: "not-started"

current_task: null
current_phase: null

summary:
  total: 4
  completed: 0
  in_progress: 0
  pending: 4
  failed: 0

# Task-level tracking (populated as tasks complete)
tasks: {}
```

### Step 6: Prepare Handover Folder

Clear/prepare the handover folder:

```powershell
# Clear any stale files
Remove-Item .orchestra/handover/current-task.md -ErrorAction SilentlyContinue
Remove-Item .orchestra/handover/completion-signal.md -ErrorAction SilentlyContinue
Remove-Item .orchestra/handover/verification/* -ErrorAction SilentlyContinue

# Keep templates and context files
# - agent_readme.md (static)
# - task-context.md (will be updated)
```

### Step 7: Validate Setup

Run validation checks:

```powershell
# Check all verification YAMLs exist
$manifest = Get-Content .orchestra/orchestrator/.orchestrator-only/manifest.yaml | ConvertFrom-Yaml
$tasks = $manifest.phases | ForEach-Object { $_.tasks } | ForEach-Object { $_ }
foreach ($task in $tasks) {
    $yamlPath = ".orchestra/orchestrator/.orchestrator-only/verification/task-$($task.id.PadLeft(3,'0')).yaml"
    if (!(Test-Path $yamlPath)) {
        Write-Warning "Missing verification YAML: $yamlPath"
    }
}

# Verify progress.yaml matches manifest
# Verify folder structure is complete
```

---

## Mapping from SpecKit

If your source is a SpecKit spec, here's how to map:

| SpecKit Element | Orchestra Element |
|-----------------|-------------------|
| `spec.md` phases | `manifest.yaml` phases |
| `tasks.md` items | `manifest.yaml` tasks |
| Task checkboxes | `deliverables` list |
| Acceptance criteria | `verification/*.yaml` checks |
| Phase descriptions | Phase `description` field |

### Example SpecKit → Orchestra Mapping

**SpecKit tasks.md:**
```markdown
## Phase 1: Foundation

### 1.1 Create YAxisPosition Enum
- [ ] Create `lib/src/models/y_axis_position.dart`
- [ ] Add `left` and `right` values
- [ ] Write unit tests
- [ ] Export from barrel file
```

**Orchestra manifest.yaml:**
```yaml
phases:
  - id: "foundation"
    name: "Phase 1: Foundation"
    tasks:
      - id: "1"
        title: "Create YAxisPosition Enum"
        category: "INFRASTRUCTURE"
        status: "not-started"
        spec_ref: "SPEC-011-1.1"
        deliverables:
          - "lib/src/models/y_axis_position.dart"
          - "test/unit/y_axis_position_test.dart"
```

**Orchestra verification/task-001.yaml:**
```yaml
checks:
  - id: "V1.1"
    name: "File exists"
    severity: "BLOCKING"
    type: "file_exists"
    params:
      path: "lib/src/models/y_axis_position.dart"
```

---

## Checklist

Before proceeding to Process 1:

- [ ] Source requirements analyzed
- [ ] All tasks identified and ordered
- [ ] `manifest.yaml` created with all phases/tasks
- [ ] Verification YAML created for EACH task
- [ ] `progress.yaml` initialized
- [ ] Handover folder cleared
- [ ] No stale files from previous sprints

---

## Next Steps

After completing Process 0:

1. **Proceed to Process 1**: [Handover Creation](./01-HANDOVER-CREATION.md)
2. **Prepare first task**: Fill `current-task.md` for task 1
3. **Invoke implementor**: Hand over to implementor agent

---

## Common Mistakes

❌ **Creating manifest without verification YAMLs**
   - Every task needs verification criteria

❌ **Leaving stale files in handover/**
   - Always clear before new sprint

❌ **Dependencies pointing to non-existent tasks**
   - Validate all `depends_on` references

❌ **Missing category assignment**
   - Every task needs INFRASTRUCTURE, INTEGRATION, or VISUAL

❌ **Inconsistent task IDs**
   - Use consistent numbering (1, 2, 3 or 1.1, 1.2, 2.1)

---

## Reference Files

- Manifest: `.orchestra/orchestrator/.orchestrator-only/manifest.yaml`
- Progress: `.orchestra/orchestrator/.orchestrator-only/progress.yaml`
- Verification: `.orchestra/orchestrator/.orchestrator-only/verification/task-XXX.yaml`
- Handover: `.orchestra/handover/`
