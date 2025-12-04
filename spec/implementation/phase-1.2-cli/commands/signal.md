# Command: orchestra signal

> **Navigation**: [Phase 1.2 Index](../readme.md) | [Task Spec](../tasks/1.2.4-signal-command.md)
>
> **Authority**: [Orchestra Bible Section 8.3 - signal-complete](../../../docs/orchestra-bible.md#signal-complete)

---

## Purpose

Signal that the current task is complete and ready for orchestrator verification. This is an **Implementor** action that creates a signal file for the orchestrator to process.

## Usage

```bash
# Signal completion for current task
orchestra signal --summary "Implemented config loader with error handling"

# Signal with list of artifacts
orchestra signal --summary "Added tests" --files src/config.ts test/config.test.ts

# Signal for specific task
orchestra signal --task 3 --summary "Complete"

# Output as JSON
orchestra signal --json
```

## Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--summary` | `-s` | string | **required** | Brief description of what was done |
| `--task` | `-t` | number | current | Task ID to signal for |
| `--files` | `-f` | string[] | auto-detect | Files created or modified |
| `--tests` | | string[] | auto-detect | Test files added |
| `--notes` | `-n` | string | none | Additional notes or concerns |
| `--json` | | flag | false | Output as JSON |

## Behavior

### Prerequisites

1. Task must exist in manifest
2. Task must be in `in_progress` status
3. Handover must exist (task was prepared)

### Actions

1. Validate task is in correct state
2. Detect changed files (if not specified)
3. Create signal file at `.orchestra/implementor/signals/task-{id}-signal.yaml`
4. Update progress to indicate signal created

### Signal File Format

```yaml
# .orchestra/implementor/signals/task-3-signal.yaml
version: "1.0"
task_id: 3
signaled_at: "2025-12-04T10:30:00Z"
summary: "Implemented config loader with error handling"
artifacts:
  created:
    - src/core/config.ts
    - test/core/config.test.ts
  modified:
    - src/core/index.ts
tests:
  - test/core/config.test.ts
notes: null
```

## Output

### Success (Exit 0)

```
✓ Signal created for task 3

Summary: Implemented config loader with error handling

Artifacts:
  Created: src/core/config.ts, test/core/config.test.ts
  Modified: src/core/index.ts

Signal file: .orchestra/implementor/signals/task-3-signal.yaml

Next: Orchestrator will run 'orchestra accept-signal' to validate
```

### Error Cases (Exit 1)

```
✗ Cannot signal: Task 3 is not in progress
  Current status: pending
  Run 'orchestra prepare --task 3' first

✗ Cannot signal: No handover found for task 3
  The orchestrator must prepare the task first

✗ Cannot signal: --summary is required
```

## JSON Output

```json
{
  "success": true,
  "taskId": 3,
  "summary": "Implemented config loader with error handling",
  "signalPath": ".orchestra/implementor/signals/task-3-signal.yaml",
  "artifacts": {
    "created": ["src/core/config.ts", "test/core/config.test.ts"],
    "modified": ["src/core/index.ts"]
  },
  "signaledAt": "2025-12-04T10:30:00Z",
  "nextStep": "Orchestrator runs accept-signal"
}
```

## Files Affected

### Read

- `.orchestra/orchestrator/.orchestrator-only/manifest.yaml`
- `.orchestra/orchestrator/.orchestrator-only/progress.yaml`
- `.orchestra/handover/current-task.md` (verify handover exists)

### Write

- `.orchestra/implementor/signals/task-{id}-signal.yaml`

## Core Library

```typescript
// src/core/signal.ts (extend existing)
export interface SignalOptions {
  task?: string;
  summary: string;
  files?: string[];
  tests?: string[];
  notes?: string;
  orchestraRoot?: string;
}

export interface SignalResult {
  success: boolean;
  taskId: number;
  summary: string;
  signalPath: string;
  artifacts: {
    created: string[];
    modified: string[];
  };
  signaledAt: string;
  nextStep: string;
}

export async function runSignal(options: SignalOptions): Promise<SignalResult>;
```

## Auto-Detection

When `--files` is not specified, the command can auto-detect changes:

1. Use `git status` to find uncommitted changes
2. Filter to relevant source/test files
3. Categorize as created vs modified

This is a convenience feature - explicit `--files` takes precedence.

## Trust Model

This is an **Implementor** command:
- Creates signal file only
- Does NOT run verification
- Does NOT access hidden criteria
- Orchestrator separately validates with `accept-signal`

## Related Commands

- `orchestra prepare` - Orchestrator prepares handover (must run first)
- `orchestra accept-signal` - Orchestrator validates the signal
- `orchestra verify` - Orchestrator runs hidden verification
- `orchestra feedback` - Orchestrator provides feedback if verification fails
