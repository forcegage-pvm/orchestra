# Orchestra System Documentation

⚠️ **THIS FOLDER IS FOR ORCHESTRATOR/VERIFIER ONLY** ⚠️

The implementor agent should NEVER be directed to read files outside of the `handover/` folder.

🚫 **ORCHESTRATOR: DO NOT READ `.orchestra/implementor/.implementor-only/`** 🚫

---

## 🎯 ORCHESTRATOR: START HERE

The orchestrator role has exactly **TWO processes**. Always know which one you're doing:

### The Two Orchestrator Processes

| # | Process | When | Location |
|---|---------|------|----------|
| 1 | **Handover Creation** | Preparing next task for implementor | [📄 orchestrator/processes/01-HANDOVER-CREATION.md](../orchestrator/processes/01-HANDOVER-CREATION.md) |
| 2 | **Task Verification** | Implementor signals completion | [📄 orchestrator/processes/02-TASK-VERIFICATION.md](../orchestrator/processes/02-TASK-VERIFICATION.md) |

### Decision Tree

```
What are you doing?
│
├─► Preparing the NEXT task for implementor?
│   └─► READ: orchestrator/processes/01-HANDOVER-CREATION.md
│
└─► Implementor signaled COMPLETION?
    └─► READ: orchestrator/processes/02-TASK-VERIFICATION.md
```

### Quick Entry Points

| You want to... | First command | Then read |
|----------------|---------------|-----------|
| Prepare next task | `task-closeout-check.ps1` | [Process 1](../orchestrator/processes/01-HANDOVER-CREATION.md) |
| Verify completed task | `accept-signal-check.ps1` | [Process 2](../orchestrator/processes/02-TASK-VERIFICATION.md) |

---

## Folder Structure

```
.orchestra/
├── orchestrator/                    # Orchestrator role
│   ├── processes/                   # ⭐ THE TWO ORCHESTRATOR PROCESSES
│   │   ├── 01-HANDOVER-CREATION.md  # Process 1: Preparing tasks
│   │   └── 02-TASK-VERIFICATION.md  # Process 2: Verifying completion
│   ├── .orchestrator-only/          # HIDDEN from implementor
│   │   ├── manifest.yaml            # Sprint task definitions
│   │   ├── progress.yaml            # Sprint progress tracking
│   │   ├── verification/            # Task verification criteria (YAML)
│   │   ├── preflight/               # Pre-task orchestrator checklists
│   │   └── templates/               # Orchestrator-only templates
│   ├── scripts/                     # Orchestrator automation scripts
│   │   ├── task-closeout-check.ps1  # ⭐ Run BEFORE Process 1
│   │   ├── accept-signal-check.ps1  # ⭐ Run BEFORE Process 2
│   │   ├── handover-validate.ps1    # Validate current-task.md
│   │   ├── task-coverage.ps1        # SpecKit ↔ Orchestrator sync
│   │   └── verification-audit.ps1   # Audit verification records
│   ├── results/                     # Verification results & screenshots
│   │   ├── task-NNN-results.md
│   │   └── screenshots/
│   └── readme.md                    # Orchestrator role guide
│
├── implementor/                     # Implementor role
│   ├── .implementor-only/           # 🚫 ORCHESTRATOR DO NOT READ 🚫
│   │   └── scripts/                 # Implementor validation scripts
│   ├── artifacts/                   # Persistent implementor artifacts
│   │   └── pre-signal/              # Pre-signal check logs
│   └── readme.md                    # Implementor role guide
│
├── common/                          # Shared resources
│   ├── scripts/                     # Shared utilities
│   │   ├── set-env.ps1              # ⭐ Source FIRST always
│   │   └── check-utils.ps1          # Check utilities
│   └── templates/                   # Shared templates
│       ├── current-task-template.md
│       ├── task-results-template.md
│       └── orchestrator-preflight-template.md
│
├── handover/                        # TRANSIENT exchange zone (VISIBLE to implementor)
│   ├── agent_readme.md              # ⭐ Implementor starts here
│   ├── current-task.md              # Current task (replaced each task)
│   └── task-context.md              # Sprint background
│
└── docs/                            # Persistent documentation
    ├── readme.md                    # This file
    └── research_log.md              # Issue/learning log
```

---

## Key Principles

### Role-Based Separation

| Owner | Owns | Hidden From |
|-------|------|-------------|
| Orchestrator | `.orchestrator-only/`, `scripts/`, `results/` | Implementor |
| Implementor | `.implementor-only/`, `artifacts/` | Orchestrator |
| Shared | `common/scripts/`, `common/templates/` | Neither |
| Exchange | `handover/` | Neither (cleared between tasks) |

### Why Hidden Files?

- **`.orchestrator-only/`**: Contains verification criteria. If implementor sees them, they could "game" the checks.
- **`.implementor-only/`**: Contains validation of orchestrator's work. If orchestrator sees them, they might (consciously or not) optimize for passing rather than quality.

**Mutual verification creates accountability.**

---

## Workflow Overview

### Complete Cycle

```
┌──────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR                          │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ PROCESS 1: Handover Creation                    │    │
│  │                                                 │    │
│  │ 1. Run task-closeout-check.ps1                  │    │
│  │ 2. Read manifest.yaml for next task             │    │
│  │ 3. Copy template → current-task.md              │    │
│  │ 4. Fill all sections completely                 │    │
│  │ 5. Create verification/task-XXX.yaml            │    │
│  │ 6. Invoke implementor                           │    │
│  └─────────────────────┬───────────────────────────┘    │
│                        │                                 │
│                        ▼                                 │
│         "Read handover/agent_readme.md"                  │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                    IMPLEMENTOR                           │
│                                                          │
│  1. Read agent_readme.md                                 │
│  2. Read current-task.md                                 │
│  3. Implement the task                                   │
│  4. Run pre-signal-check.ps1                             │
│  5. Write completion-signal.md                           │
│  6. Say "ready for review"                               │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR                          │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ PROCESS 2: Task Verification                    │    │
│  │                                                 │    │
│  │ 1. Run accept-signal-check.ps1                  │    │
│  │ 2. Read verification/task-XXX.yaml              │    │
│  │ 3. Execute all verification commands            │    │
│  │ 4. Visual verification (if applicable)          │    │
│  │ 5. Make decision: PASS or FAIL                  │    │
│  │                                                 │    │
│  │ If PASS:                                        │    │
│  │   - Commit changes                              │    │
│  │   - Record results                              │    │
│  │   - Update progress.yaml                        │    │
│  │   - Loop to Process 1                           │    │
│  │                                                 │    │
│  │ If FAIL:                                        │    │
│  │   - Create failure report                       │    │
│  │   - Return to implementor                       │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## Scripts Reference

### Orchestrator Scripts

| Script | Process | Purpose |
|--------|---------|---------|
| `task-closeout-check.ps1` | 1 (before) | Verify previous task fully closed |
| `accept-signal-check.ps1` | 2 (first) | Verify implementor ran pre-signal |
| `handover-validate.ps1` | 1 (after) | Validate current-task.md quality |
| `task-coverage.ps1` | Either | SpecKit ↔ Orchestrator sync |
| `verification-audit.ps1` | 2 (after) | Audit verification records |

### Common Scripts

| Script | Purpose |
|--------|---------|
| `set-env.ps1` | Load environment (ALWAYS run first) |
| `check-utils.ps1` | Shared utility functions |

### Commands

```powershell
# ALWAYS START WITH THIS
. .\.orchestra\common\scripts\set-env.ps1

# Process 1: Before preparing next task
.\.orchestra\orchestrator\scripts\task-closeout-check.ps1

# Process 2: Before verifying task
.\.orchestra\orchestrator\scripts\accept-signal-check.ps1
```

---

## Verification Severity Levels

| Severity | Meaning | If Failed |
|----------|---------|-----------|
| **BLOCKING** | Fundamental requirement | Task FAILED |
| **MAJOR** | Significant quality issue | Task FAILED |
| **MINOR** | Small issue, functional | Task PASSED with note |
| **INFO** | Observation only | Task PASSED |

**⛔ Severity is IMMUTABLE** - Set when YAML created, NOT during execution.

---

## Visual Verification

### Task Categories

| Category | Screenshot Required |
|----------|---------------------|
| INFRASTRUCTURE | ❌ No (nothing to see yet) |
| INTEGRATION | ✅ BLOCKING |
| VISUAL | ✅ BLOCKING |

### Tools by Role

| Role | Tool | Purpose |
|------|------|---------|
| Implementor | `flutter_agent.py` | Run app, capture screenshot |
| Orchestrator | Chrome DevTools MCP | View screenshot, verify content |

**⛔ "Screenshot exists" ≠ "Screenshot is correct"**

Orchestrator MUST view the actual content and verify against criteria.

---

## See Also

- **Process 1**: [orchestrator/processes/01-HANDOVER-CREATION.md](../orchestrator/processes/01-HANDOVER-CREATION.md)
- **Process 2**: [orchestrator/processes/02-TASK-VERIFICATION.md](../orchestrator/processes/02-TASK-VERIFICATION.md)
- **Orchestrator README**: [orchestrator/readme.md](../orchestrator/readme.md)
- **Implementor README**: [implementor/readme.md](../implementor/readme.md)
