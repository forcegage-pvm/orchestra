````markdown
# Folder Structure

> **Navigation**: [Index](../readme.md) | **Prev**: [ADR-001](../02-architecture/decisions/adr-001-translation-layer.md) | **Next**: [File Specifications](file-specifications.md)
> 
> **Authority**: [Orchestra Bible Section 6.1](../00-orchestra-bible.md#61-folder-structure-abstract)

---

## Overview

The `.orchestra/` folder is the self-contained root of all Orchestra artifacts. The structure is designed for:

- **Clear role separation** - Orchestrator vs Implementor domains
- **Information asymmetry** - Hidden verification criteria
- **Transient exchange** - Clean handovers between roles
- **Complete audit trail** - All task artifacts archived
- **Transportability** - Self-contained, works in any project

---

## Canonical Structure

> **This is the authoritative folder structure per Bible Section 6.1.**

```
.orchestra/
├── manifest.yaml                      # Task definitions, dependencies, ordering
├── progress.yaml                      # Current state, completion status
│
├── common/                            # SHARED RESOURCES
│   ├── scripts/                       # Platform-specific script implementations
│   │   └── {script-name}.{ext}
│   └── templates/                     # Document templates
│       ├── handover-template.md
│       ├── signal-template.md
│       ├── verification-criteria-template.yaml
│       └── feedback-template.md
│
├── orchestrator/                      # ORCHESTRATOR DOMAIN
│   ├── .orchestrator-only/            # HIDDEN - Only orchestrator reads this
│   │   ├── verification/              # Per-task verification specs
│   │   │   └── task-{id}.yaml
│   │   └── criteria/                  # Reusable criteria definitions
│   │       └── {criteria-name}.yaml
│   ├── processes/                     # Orchestrator process documentation
│   │   └── {process-name}.md
│   └── scripts/                       # Orchestrator-specific scripts
│       └── {script-name}.{ext}
│
├── implementor/                       # IMPLEMENTOR DOMAIN
│   ├── handovers/                     # Task handover documents
│   │   └── task-{id}-handover.md
│   ├── signals/                       # Completion signals
│   │   └── task-{id}-signal.md
│   └── feedback/                      # Orchestrator feedback
│       └── task-{id}-feedback.md
│
├── artifacts/                         # TASK OUTPUTS (archived)
│   └── task-{id}/
│       ├── execution-log.md           # Commands executed
│       ├── gate-check.yaml            # Gate check results
│       ├── verification.yaml          # Verification results
│       └── summary.md                 # Task summary
│
└── docs/                              # PROCESS DOCUMENTATION
    └── {doc-name}.md
```

---

## Folder Purposes

### Root Files

| File | Purpose | Visibility |
|------|---------|------------|
| `manifest.yaml` | Task definitions with success criteria | Orchestrator only |
| `progress.yaml` | Sprint progress tracking | Orchestrator only |

### `common/`

Shared resources accessible to both roles.

| Subfolder | Purpose |
|-----------|---------|
| `scripts/` | Platform-specific utility scripts |
| `templates/` | Document templates for handovers, signals, etc. |

### `orchestrator/`

Everything the orchestrator needs to plan, verify, and track progress.

| Subfolder | Purpose | Visibility |
|-----------|---------|------------|
| `.orchestrator-only/verification/` | Hidden verification criteria | Orchestrator ONLY |
| `.orchestrator-only/criteria/` | Reusable criteria definitions | Orchestrator ONLY |
| `processes/` | Orchestrator process documentation | Public |
| `scripts/` | Orchestrator-specific scripts | Public |

### `implementor/`

Everything the implementor needs to receive work and signal completion.

| Subfolder | Purpose | Visibility |
|-----------|---------|------------|
| `handovers/` | Task handover documents | Implementor reads |
| `signals/` | Completion signal files | Implementor writes |
| `feedback/` | Retry feedback from orchestrator | Implementor reads |

### `artifacts/`

Archived outputs from completed tasks.

| Contents | Purpose |
|----------|---------|
| `task-{id}/` | Complete archive of task artifacts |
| `execution-log.md` | Commands executed during implementation |
| `gate-check.yaml` | Gate check results |
| `verification.yaml` | Verification results |
| `summary.md` | Task completion summary |

---

## Information Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    SPECIFICATION                                  │
│                    (Source of Truth)                              │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────┐
              │         ORCHESTRATOR                │
              │    (Processes specification)        │
              └────────────────────┬────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────┐
         │                         │                     │
         ▼                         ▼                     ▼
┌─────────────────┐       ┌─────────────────┐   ┌─────────────────┐
│    manifest     │       │    progress     │   │   verification  │
│    (hidden)     │       │    (hidden)     │   │    (HIDDEN)     │
└─────────────────┘       └─────────────────┘   └─────────────────┘
         │                         │
         └──────────┬──────────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │  HANDOVER DOCUMENT  │
         │  (Filtered view)    │
         └──────────┬──────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │    IMPLEMENTOR      │
         │  (Receives filtered │
         │   information only) │
         └─────────────────────┘
```

---

## Access Control Matrix

| Resource | Orchestrator | Implementor | Human |
|----------|--------------|-------------|-------|
| `manifest.yaml` | ✅ Read/Write | ❌ NEVER | ✅ Full |
| `progress.yaml` | ✅ Read/Write | ❌ NEVER | ✅ Full |
| `.orchestrator-only/` | ✅ Read/Write | ❌ NEVER | ✅ Full |
| `implementor/handovers/` | ✅ Read/Write | ✅ Read | ✅ Full |
| `implementor/signals/` | ✅ Read | ✅ Read/Write | ✅ Full |
| `implementor/feedback/` | ✅ Read/Write | ✅ Read | ✅ Full |
| `common/` | ✅ Read | ✅ Read | ✅ Full |
| `artifacts/` | ✅ Read/Write | ⚠️ Read (after task) | ✅ Full |
| `docs/` | ✅ Read/Write | ✅ Read | ✅ Full |

---

## File Lifecycle

### Handover Document

**Lifecycle**: TRANSIENT (created per task, cleared after archive)

| Event | Action |
|-------|--------|
| Task preparation | Created by orchestrator via `prepare-handover` |
| Task implementation | Read by implementor |
| Task completion | Archived to `artifacts/task-{id}/` |
| Task closeout | Original deleted |

### Signal File

**Lifecycle**: TRANSIENT (created by implementor, processed by orchestrator)

| Event | Action |
|-------|--------|
| Implementation complete | Created by implementor via `signal-complete` |
| Verification | Read by orchestrator |
| Task completion | Archived and deleted |

### Verification Criteria

**Lifecycle**: PERMANENT (created at sprint init, never modified)

| Event | Action |
|-------|--------|
| Sprint initialization | Created by orchestrator via `sprint-init` |
| Verification | Read by orchestrator (NEVER by implementor) |
| Sprint complete | Archived for audit |

### Artifacts

**Lifecycle**: PERMANENT (immutable after creation)

| Event | Action |
|-------|--------|
| Task archived | Created with full handover + verification results |
| Later review | Read-only, never modified |
| Sprint complete | Remains for audit trail |

---

## Transportability

To use Orchestra in a new project:

1. Copy entire `.orchestra/` folder structure
2. Create `manifest.yaml` for the sprint
3. Create verification criteria for each task
4. Initialize `progress.yaml`
5. Configure platform-specific scripts in `common/scripts/`

The folder is self-contained with no external dependencies.

---

## Key Design Decisions

### Why manifest.yaml at Root?

The Bible specifies manifest at `.orchestra/manifest.yaml` (not nested in `orchestrator/`) because:
- It's the primary configuration file
- Easy to find and reference
- Consistent with `progress.yaml` placement

### Why Separate handovers/signals/feedback?

Clear separation by direction of information flow:
- `handovers/` - Orchestrator → Implementor
- `signals/` - Implementor → Orchestrator
- `feedback/` - Orchestrator → Implementor (on failure)

### Why .orchestrator-only?

The leading dot (`.`) is a visual indicator that this folder is special:
- Hidden by default in many file browsers
- Clear convention that contents are restricted
- Separates from public orchestrator resources

````
