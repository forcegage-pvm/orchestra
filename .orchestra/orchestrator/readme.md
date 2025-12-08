# Orchestrator Role

⚠️ **THIS FOLDER IS FOR ORCHESTRATOR/VERIFIER ONLY** ⚠️

The implementor agent should NEVER read files in this folder except via `handover/`.

🚫 **DO NOT READ `.orchestra/implementor/.implementor-only/`** - that's the implementor's validation rules for checking YOUR work.

---

## 🎯 THE THREE ORCHESTRATOR PROCESSES

The orchestrator has exactly **THREE distinct processes**. Know which one you're doing:

| Process                              | When                                | Documentation                                                             |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------- |
| **Process 0: Sprint Initialization** | Starting a new sprint/feature       | [📄 00-sprint-initialization.md](./processes/00-sprint-initialization.md) |
| **Process 1: Handover Creation**     | Preparing next task for implementor | [📄 01-handover-creation.md](./processes/01-handover-creation.md)         |
| **Process 2: Task Verification**     | Implementor signals completion      | [📄 02-task-verification.md](./processes/02-task-verification.md)         |

### Quick Reference

**STARTING NEW SPRINT?** → Read [Process 0](./processes/00-sprint-initialization.md)

- Analyze source requirements (SpecKit, feature doc)
- Create manifest.yaml with tasks/phases
- Create verification YAML for each task
- Initialize progress.yaml
- Clear handover folder

**PREPARING NEXT TASK?** → Read [Process 1](./processes/01-handover-creation.md)

- Run `orchestra closeout` first
- Delete old current-task.md
- Copy template, fill completely
- Create verification YAML
- Invoke implementor

**IMPLEMENTOR SIGNALED DONE?** → Read [Process 2](./processes/02-task-verification.md)

- Run `orchestra accept-signal` first
- Read verification YAML
- Execute all checks
- Visual verification (if INTEGRATION/VISUAL)
- PASS → `orchestra complete --task N --commit --push`
- FAIL → Feedback for rework

---

## Folder Structure

```
orchestrator/
├── processes/               # ⭐ THE THREE ORCHESTRATOR PROCESSES
│   ├── 00-sprint-initialization.md   # Process 0: Sprint setup
│   ├── 01-handover-creation.md       # Process 1: Preparing tasks
│   └── 02-task-verification.md       # Process 2: Verifying completion
├── .orchestrator-only/      # Hidden from implementor
│   ├── manifest.yaml        # Sprint task definitions
│   ├── progress.yaml        # Sprint progress tracking
│   ├── verification/        # Task verification criteria (YAML files)
│   ├── preflight/           # Pre-task orchestrator checklists
│   └── templates/           # Orchestrator-only templates
├── results/                 # Verification results and screenshots
│   ├── task-NNN-results.md
│   └── screenshots/
└── readme.md                # This file
```

---

## CLI Commands Quick Reference

| Command                        | When to Run                          | Process   |
| ------------------------------ | ------------------------------------ | --------- |
| `orchestra closeout`           | **FIRST** before preparing next task | Process 1 |
| `orchestra prepare --task N`   | Prepare handover for task N          | Process 1 |
| `orchestra init --verify`      | Validate verification YAML schemas   | Process 0 |
| `orchestra accept-signal`      | **FIRST** before verifying task      | Process 2 |
| `orchestra verify --task N`    | Run verification checks              | Process 2 |
| `orchestra complete --task N`  | Mark task complete                   | Process 2 |

> ⚠️ **CRITICAL**: Run `orchestra init --verify` after creating verification YAMLs to validate schemas.

### Command Examples

```bash
# Process 0: Validate verification YAML schemas
orchestra init --verify

# Process 1: Before preparing next task
orchestra closeout

# Process 1: Prepare handover scaffold
orchestra prepare --task 3

# Process 1: [Complete handover content and verification YAML]

# Process 2: Before verifying implementor's work
orchestra accept-signal

# Process 2: Run verification
orchestra verify --task 3

# Process 2: Complete and commit
orchestra complete --task 3 --commit --push
```

---

## Hidden Files (.orchestrator-only/)

The `.orchestrator-only/` folder contains files that the implementor should NEVER read:

| File                         | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `manifest.yaml`              | Full sprint task list and mappings         |
| `progress.yaml`              | Sprint progress state                      |
| `verification/task-XXX.yaml` | Hidden acceptance criteria per task        |
| `preflight/`                 | Orchestrator prep checklists (audit trail) |
| `templates/`                 | Orchestrator-only templates                |

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

- [Process 0: Sprint Initialization](./processes/00-sprint-initialization.md)
- [Process 1: Handover Creation](./processes/01-handover-creation.md)
- [Process 2: Task Verification](./processes/02-task-verification.md)
- [Implementor readme](../implementor/readme.md)
