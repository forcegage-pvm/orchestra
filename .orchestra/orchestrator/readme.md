# Orchestrator Role

⚠️ **THIS FOLDER IS FOR ORCHESTRATOR/VERIFIER ONLY** ⚠️

The implementor agent should NEVER read files in this folder except via `handover/`.

🚫 **DO NOT READ `.orchestra/implementor/.implementor-only/`** - that's the implementor's validation rules for checking YOUR work.

---

## 🎯 THE TWO ORCHESTRATOR PROCESSES

The orchestrator has exactly **TWO distinct processes**. Know which one you're doing:

| Process | When | Documentation |
|---------|------|---------------|
| **Process 1: Handover Creation** | Preparing next task for implementor | [📄 01-HANDOVER-CREATION.md](./processes/01-HANDOVER-CREATION.md) |
| **Process 2: Task Verification** | Implementor signals completion | [📄 02-TASK-VERIFICATION.md](./processes/02-TASK-VERIFICATION.md) |

### Quick Reference

**PREPARING NEXT TASK?** → Read [Process 1](./processes/01-HANDOVER-CREATION.md)
- Run `task-closeout-check.ps1` first
- Delete old current-task.md
- Copy template, fill completely
- Create verification YAML
- Invoke implementor

**IMPLEMENTOR SIGNALED DONE?** → Read [Process 2](./processes/02-TASK-VERIFICATION.md)
- Run `accept-signal-check.ps1` first
- Read verification YAML
- Execute all checks
- Visual verification (if INTEGRATION/VISUAL)
- PASS → Commit & closeout
- FAIL → Feedback for rework

---

## Folder Structure

```
orchestrator/
├── processes/               # ⭐ THE TWO ORCHESTRATOR PROCESSES
│   ├── 01-HANDOVER-CREATION.md   # Process 1: Preparing tasks
│   └── 02-TASK-VERIFICATION.md   # Process 2: Verifying completion
├── .orchestrator-only/      # Hidden from implementor
│   ├── manifest.yaml        # Sprint task definitions
│   ├── progress.yaml        # Sprint progress tracking
│   ├── verification/        # Task verification criteria (YAML files)
│   ├── preflight/           # Pre-task orchestrator checklists
│   └── templates/           # Orchestrator-only templates
├── scripts/                 # Orchestrator automation scripts
│   ├── task-closeout-check.ps1   # Run BEFORE Process 1
│   ├── accept-signal-check.ps1   # Run BEFORE Process 2
│   ├── handover-validate.ps1     # Validate handover quality
│   ├── task-coverage.ps1         # SpecKit ↔ Orchestrator sync
│   └── verification-audit.ps1    # Audit verification records
├── results/                 # Verification results and screenshots
│   ├── task-NNN-results.md
│   └── screenshots/
└── readme.md                # This file
```

---

## Scripts Quick Reference

| Script | When to Run | Process |
|--------|-------------|---------|
| `task-closeout-check.ps1` | **FIRST** before preparing next task | Process 1 |
| `accept-signal-check.ps1` | **FIRST** before verifying task | Process 2 |
| `handover-validate.ps1` | After filling current-task.md | Process 1 |
| `task-coverage.ps1` | Sprint planning | Either |
| `verification-audit.ps1` | After verification | Process 2 |

### Script Commands

```powershell
# Always source environment first
. .\.orchestra\common\scripts\set-env.ps1

# Process 1: Before preparing next task
.\.orchestra\orchestrator\scripts\task-closeout-check.ps1

# Process 2: Before verifying implementor's work
.\.orchestra\orchestrator\scripts\accept-signal-check.ps1

# Validate handover quality
.\.orchestra\orchestrator\scripts\handover-validate.ps1
```

---

## Hidden Files (.orchestrator-only/)

The `.orchestrator-only/` folder contains files that the implementor should NEVER read:

| File | Purpose |
|------|---------|
| `manifest.yaml` | Full sprint task list and mappings |
| `progress.yaml` | Sprint progress state |
| `verification/task-XXX.yaml` | Hidden acceptance criteria per task |
| `preflight/` | Orchestrator prep checklists (audit trail) |
| `templates/` | Orchestrator-only templates |

**Why hidden?** Prevents implementors from "gaming" the verification criteria.

---

## Key Principles

1. **Implementor never sees task count** - No "task 3 of 16"
2. **Implementor never sees verification criteria** - Prevents gaming
3. **Each task verified before next** - No bulk completion
4. **Severity is immutable** - Set when YAML created, not during execution
5. **Visual tasks require content verification** - "Exists" ≠ "Correct"

---

## See Also

- [Process 1: Handover Creation](./processes/01-HANDOVER-CREATION.md)
- [Process 2: Task Verification](./processes/02-TASK-VERIFICATION.md)
- [System Documentation](../docs/readme.md)
- [Implementor README](../implementor/readme.md)
