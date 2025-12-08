# Implementor Role

This folder contains implementor-specific artifacts.

> **START HERE**: Read `.orchestra/handover/agent_readme.md` for full workflow instructions.
> This readme is a folder structure overview only.

## Folder Structure

```
implementor/
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

All communication goes through the **handover/** folder (neutral zone):

1. Fill out the `signal.md` template in `.orchestra/handover/`
2. Stage all changes: `git add -A`
3. Signal: "ready for review"

The orchestrator will run `orchestra accept-signal` to verify your work.

### After Failed Verification

Read feedback from `.orchestra/handover/feedback.md` and retry.

## Artifacts

The `artifacts/logs/` folder stores timestamped logs of task completions.
These provide audit trail for the orchestrator.
