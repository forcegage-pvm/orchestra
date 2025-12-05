# Implementor Role

This folder contains implementor-specific files and artifacts.

> **START HERE**: Read `.orchestra/handover/agent_readme.md` for full workflow instructions.
> This readme is a folder structure overview only.

## Folder Structure

```
implementor/
├── .implementor-only/       # Hidden from orchestrator during handover
│   ├── completion-signal.md # Active completion signal (when signaling)
│   └── task-validator.md    # Self-validation checklist
└── artifacts/               # Persistent implementor artifacts
    └── logs/                # Task completion logs
```

## Key Workflows

### Before Starting Work

Read your task assignment in `.orchestra/handover/current-task.md`.

### Before Signaling Completion (MANDATORY)

Ensure all quality gates pass:

- Build succeeds
- Tests pass
- Analyzer is clean

### Signaling Completion

1. Write completion details to `.orchestra/handover/completion-signal.md`
2. Stage all changes: `git add -A`
3. Signal: "ready for review"

The orchestrator will run `orchestra accept-signal` to verify your work.

## Hidden Files (.implementor-only/)

The `.implementor-only/` folder contains files that support the implementor's work:

- **completion-signal.md**: Where you write your completion signal
- **task-validator.md**: Self-check before signaling

## Artifacts

The `artifacts/logs/` folder stores timestamped logs of task completions.
These provide audit trail for the orchestrator.
