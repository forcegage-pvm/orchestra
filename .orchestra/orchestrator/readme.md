# Orchestrator Role

⚠️ **THIS FOLDER IS FOR ORCHESTRATOR ONLY** ⚠️

The implementor agent should NEVER read files in this folder.

---

## 🎯 THE THREE ORCHESTRATOR PROCESSES

| Process | Document | When | CLI Command |
|---------|----------|------|-------------|
| **Process 0** | [Sprint Initialization](./processes/00-sprint-initialization.md) | Starting a new sprint | `orchestra init --spec <path>` |
| **Process 1** | [Handover Creation](./processes/01-handover-creation.md) | Before each task | `orchestra prepare --task <N>` |
| **Process 2** | [Task Verification](./processes/02-task-verification.md) | After implementor signals | `orchestra verify --task <N>` |

---

## 📂 Folder Structure

```
orchestrator/
├── readme.md                    # This file (entry point)
├── processes/                   # Detailed process documentation
│   ├── 00-sprint-initialization.md
│   ├── 01-handover-creation.md
│   └── 02-task-verification.md
├── .orchestrator-only/          # HIDDEN from implementor
│   └── verification/            # Per-task verification criteria
└── results/                     # Verification results and archives
    └── task-NNN/                # Archived task artifacts
```

---

## 🔧 Quick Reference: CLI Commands

| Command | Purpose |
|---------|---------|
| `orchestra status` | Show current orchestra state |
| `orchestra init --spec <path>` | Initialize from spec file |
| `orchestra closeout` | Verify previous task is closed out |
| `orchestra prepare --task <N>` | Generate handover for task N |
| `orchestra accept-signal` | Check if implementor signal exists |
| `orchestra verify --task <N>` | Run verification checks |
| `orchestra complete --task <N>` | Archive and close out task |

---

## 🚫 Key Rules

1. **Never show verification criteria to implementor** - Prevents gaming
2. **Fresh context for each task** - Prevents learning patterns  
3. **Signals trigger verification, not claims** - "I'm done" means nothing without artifacts
4. **Feedback guides without revealing** - Say what's wrong, not how you detected it
5. **CLI commands are authoritative** - Always use `orchestra` commands, not manual scripts

---

## 📋 Hidden Files (.orchestrator-only/)

| File | Purpose |
|------|---------|
| `verification/task-NNN.yaml` | Hidden acceptance criteria per task |

**Why hidden?** Prevents implementors from "gaming" the verification criteria.

---

## See Also

- [Agent README](../handover/agent_readme.md) - Implementor workflow guide
- [Process 0: Sprint Init](./processes/00-sprint-initialization.md)
- [Process 1: Handover Creation](./processes/01-handover-creation.md)
- [Process 2: Task Verification](./processes/02-task-verification.md)
