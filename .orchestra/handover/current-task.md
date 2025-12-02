# Task 3: Status Command

## Overview

Implement the `orchestra status` command that displays the current state of a sprint, including progress, current task, phase information, and activity history.

## Spec Files

📄 **Task spec**: `spec/implementation/phase-1-cli/tasks/1.3-status-command.md`
📄 **Command spec**: `spec/implementation/phase-1-cli/commands/status.md`

Please read both spec files for full implementation details including code samples.

## Acceptance Criteria

- [ ] `orchestra status` shows sprint overview with progress bar
- [ ] `orchestra status --brief` shows one-line summary
- [ ] `orchestra status --task N` shows task details
- [ ] `orchestra status --metrics` shows sprint metrics
- [ ] `orchestra status --history` shows full task history
- [ ] `orchestra status --json` outputs valid JSON
- [ ] Command exits with code 1 if not initialized
- [ ] Command exits with code 2 if task not found
- [ ] All unit tests pass

## Dependencies

Task 2 (Core Libraries) must be completed first. ✅ **COMPLETE** (commit 595cd9a)

## Objective

Implement a fully functional status command that displays sprint progress in multiple formats (default, brief, JSON, task detail, phase detail, metrics, history) with proper error handling and exit codes.

## File Operations

| Action | File Path | Purpose |
|--------|-----------|---------|
| UPDATE | `src/commands/status.ts` | Replace stub with full status command implementation |
| CREATE | `test/commands/status.test.ts` | Unit tests for status command |

## TDD Requirements

**Test-First Approach**: Write tests before implementing each view mode.

**Test File**: `test/commands/status.test.ts`

**Test Cases Required**:
1. Not initialized scenario → exit code 1
2. Brief output → one-line format
3. JSON output → valid parseable JSON
4. Task detail view → shows task info or exit code 2
5. Default view → shows sprint, progress, current task
6. Metrics view → calculations correct
7. History view → all tasks listed

**Sample Test Data**:
```typescript
const mockManifest: Manifest = {
  version: '1.0.0',
  sprint: {
    id: 'TEST-001',
    name: 'Test Sprint',
    status: 'ACTIVE',
    created_at: '2025-12-02T00:00:00Z'
  },
  tasks: [
    {
      id: 1,
      title: 'Task 1',
      status: 'COMPLETE',
      description: 'First task',
      dependencies: [],
      retry_count: 0,
      max_retries: 3
    },
    {
      id: 2,
      title: 'Task 2',
      status: 'IMPLEMENT',
      description: 'Current task',
      dependencies: [1],
      retry_count: 0,
      max_retries: 3
    }
  ],
  current_task_id: 2
};
```

### UPDATE: `src/commands/status.ts`

**Current state**: Stub with TODO comments

**What to implement**:
- Replace stub with full implementation per spec
- Import from `../core/` modules (config, manifest, progress, output, types)
- Implement `StatusOptions` interface with all flags
- Implement `statusCommand()` function with:
  - Default view: sprint info, progress, current task, recent activity
  - Brief view (`--brief`): one-line summary
  - Task detail view (`--task N`): full task information
  - Phase detail view (`--phase N`): phase status
  - Metrics view (`--metrics`): pass rates, averages
  - History view (`--history`): all tasks
  - JSON output (`--json`): structured JSON for all views
- Error handling with proper exit codes (0=success, 1=not initialized, 2=task not found)

**Code scaffold**:
```typescript
import {
  loadConfig,
  loadManifest,
  loadProgress,
  getTask,
  getCurrentTask,
  getTaskStats,
  isOrchestraInitialized,
} from '../core/index.js';
import * as output from '../core/output.js';
import type { Manifest, Task, ProgressLog } from '../core/types.js';

export interface StatusOptions {
  task?: number;
  phase?: number;
  history?: boolean;
  metrics?: boolean;
  json?: boolean;
  brief?: boolean;
  orchestraRoot?: string;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  // Check initialization
  if (!isOrchestraInitialized(options.orchestraRoot)) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Orchestra not initialized' }));
    } else {
      output.print.error('Orchestra not initialized. Run "orchestra init" first.');
    }
    process.exit(1);
  }

  try {
    const config = loadConfig(options.orchestraRoot);
    const manifest = loadManifest(config.orchestraDir);
    
    // Handle specific views
    if (options.task) {
      await showTaskDetail(manifest, options.task, options.json);
      return;
    }

    if (options.phase !== undefined) {
      await showPhaseDetail(manifest, options.phase, options.json);
      return;
    }

    if (options.brief) {
      showBriefStatus(manifest);
      return;
    }

    // Default full status
    await showFullStatus(manifest, options);
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ error: String(error) }));
    } else {
      output.print.error(String(error));
    }
    process.exit(1);
  }
}

function showBriefStatus(manifest: Manifest): void {
  const stats = getTaskStats(manifest);
  const current = getCurrentTask(manifest);
  const currentId = current?.id ?? 'none';
  const percent = Math.round((stats.completed / stats.total) * 100);
  
  console.log(
    `Orchestra: ${manifest.sprint.id} | ` +
    `Task ${currentId}/${stats.total} | ` +
    `${percent}% complete`
  );
}

// Implement showFullStatus, showTaskDetail, showPhaseDetail
// See spec file for full examples
```

**What to create**:
- Test suite for status command
- Test not initialized scenario (exit code 1)
- Test brief output format
- Test JSON output format
- Test task detail view (valid and invalid task IDs)
- Test phase detail view
- Test metrics and history flags
- Use vitest framework
- Mock filesystem and core functions

**Test scaffold**:
```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { statusCommand } from '../../src/commands/status.js';
import * as core from '../../src/core/index.js';

describe('status command', () => {
  beforeEach(() => {
    // Mock core functions
    vi.spyOn(core, 'isOrchestraInitialized');
    vi.spyOn(core, 'loadManifest');
    vi.spyOn(core, 'getTaskStats');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should exit with code 1 when not initialized', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.mocked(core.isOrchestraInitialized).mockReturnValue(false);

    await statusCommand({ brief: true });
    
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should show brief status', async () => {
    vi.mocked(core.isOrchestraInitialized).mockReturnValue(true);
    vi.mocked(core.loadManifest).mockReturnValue({
      version: '1.0.0',
      sprint: { id: 'TEST-001', name: 'Test Sprint', status: 'ACTIVE', created_at: '2025-12-02' },
      tasks: [
        { id: 1, title: 'Task 1', status: 'COMPLETE', description: '', dependencies: [], retry_count: 0, max_retries: 3 }
      ],
    });
    vi.mocked(core.getTaskStats).mockReturnValue({
      total: 1,
      completed: 0,
      inProgress: 1,
      pending: 0,
      failed: 0,
      escalated: 0,
    });

    const consoleSpy = vi.spyOn(console, 'log');
    
    await statusCommand({ brief: true });
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('TEST-001'));
  });

  // Add more tests per spec requirements
});
```

## Core Functions Available

From `src/core/index.ts` (already implemented in Task 2):

- `isOrchestraInitialized(root?)` - Check if .orchestra exists
- `loadConfig(root?)` - Load orchestra.yaml
- `loadManifest(orchestraDir)` - Load manifest.yaml
- `getTask(manifest, taskId)` - Find task by ID
- `getCurrentTask(manifest)` - Get current task
- `getTaskStats(manifest)` - Calculate task statistics
- `formatTaskStatus(status)` - Format status with icon/color
- `formatTask(task, format)` - Format task for display
- `formatStatus(manifest, format)` - Format sprint status
- `print.success/error/warning/info()` - Colored output
- `divider(char, length)` - Create divider lines
- `createProgressBar(percent, width)` - Progress bar

All types available from `src/core/types.ts`

## Quality Gates

Before signaling completion:

1. **Build**: `npm run build` must succeed
2. **Type check**: `npx tsc --noEmit` must pass with no errors
3. **Tests**: `npm test` must pass all tests
4. **Lint**: `npm run lint` must pass (if configured)

## Completion Protocol

When ready for review:

1. Run pre-signal check:
   ```powershell
   .\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1 -TaskId 3
   ```

2. Update `.orchestra/handover/completion-signal.md` with:
   - Task ID and status
   - What was implemented
   - Test results
   - Any notes

3. Signal ready: Say "ready for review" or "task complete"

---

_This handover was generated by Orchestra. Do not read files in `.orchestra/orchestrator/.orchestrator-only/`._
