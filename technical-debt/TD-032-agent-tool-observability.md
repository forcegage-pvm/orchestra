# TD-032: Agent Tool Observability & Event Streaming

**Created:** 2026-01-31  
**Status:** In Progress  
**Branch:** `010-agent-events`  
**Priority:** High

## Overview

Wire up real-time event emission for ALL agent tools to enable progress tracking, streaming output, and enhanced observability in the Agent Output panel.

## Current State

- ✅ `AgentRunner` emits events via `onOutput` EventEmitter
- ✅ `ToolObserver` interface enhanced with `onFileOperation` and `onMetadata`
- ✅ `ToolInvocationContext` has `observer` field
- ✅ Observer wired in `executeToolCalls()` (Phase 1 complete)
- ✅ UI renders `tool_progress`, `tool_output`, `tool_file_operation`, `tool_metadata` events
- 🔄 Tools being updated to emit events (3/41 done)

## Goals

1. Enable real-time progress updates from ALL tools
2. Stream command/test output as it happens
3. Show granular progress in Agent Output panel
4. Consistent observability across entire tool surface
5. Track file operations for display (create/update/delete/move/copy)

---

## Implementation Phases

### Phase 1: Infrastructure Wiring ✅

**Files:**

- [x] `extension/src/agents/AgentRunner.ts`
- [x] `extension/src/agents/tools/types.ts`

**Tasks:**

- [x] Add `tool_progress`, `tool_output`, `tool_file_operation`, `tool_metadata` to `AgentOutputType`
- [x] Add `progressPercent`, `streamChunk`, `fileOperation`, `metadata` to `AgentOutput` interface
- [x] Add `FileOperationEvent` type with operation, path, targetPath, size, linesChanged
- [x] Add `onFileOperation` and `onMetadata` to `ToolObserver` interface
- [x] Wire up all observer methods in `executeToolCalls()` with emitOutput callbacks

---

### Phase 2: UI Rendering ✅

**Files:**

- [x] `extension/src/views/agent/agentOutputConverter.ts`
- [x] `extension/src/views/agent/templates/agentOutputTemplate.ts`
- [x] `extension/src/views/agent/templates/agentOutputStyles.ts`

**Tasks:**

- [x] Add converter for `tool_progress` output type
- [x] Add converter for `tool_output` output type
- [x] Add converter for `tool_file_operation` output type
- [x] Add converter for `tool_metadata` output type
- [x] Render progress events (message + optional progress bar)
- [x] Render streaming output with tool name and chunk display
- [x] Render file operations with icons per operation type
- [x] Add CSS styles for all new output types
- [ ] Handle rapid updates efficiently (throttle/debounce) - future enhancement

---

### Phase 3: System Tools (16 tools) 🔄

| Tool              | File                          | Events                         | Status |
| ----------------- | ----------------------------- | ------------------------------ | ------ |
| runCommand        | `system/runCommand.ts`        | Stream stdout/stderr, progress | ✅     |
| runTests          | `system/runTests.ts`          | Test progress, stream output   | ⬜     |
| runTask           | `system/runTask.ts`           | Task progress, stream output   | ⬜     |
| runTerminal       | `system/runTerminal.ts`       | Stream terminal output         | ⬜     |
| startProcess      | `system/startProcess.ts`      | Process start/stream           | ⬜     |
| waitForPattern    | `system/waitForPattern.ts`    | Waiting status, partial output | ⬜     |
| getProcessOutput  | `system/getProcessOutput.ts`  | Fetching status                | ⬜     |
| getTerminalOutput | `system/getTerminalOutput.ts` | Fetching status                | ⬜     |
| stopProcess       | `system/stopProcess.ts`       | Stopping status                | ⬜     |
| sendInput         | `system/sendInput.ts`         | Sending status                 | ⬜     |
| listProcesses     | `system/listProcesses.ts`     | Listing status                 | ⬜     |
| findPortProcess   | `system/findPortProcess.ts`   | Scanning status                | ⬜     |
| getProblems       | `system/getProblems.ts`       | Fetching status                | ⬜     |
| getTestFailures   | `system/getTestFailures.ts`   | Fetching status                | ⬜     |
| executeWithRetry  | `system/executeWithRetry.ts`  | Retry progress (attempt N/M)   | ⬜     |

---

### Phase 4: Coding Tools (16 tools) 🔄

| Tool            | File                        | Events                         | Status |
| --------------- | --------------------------- | ------------------------------ | ------ |
| readFile        | `coding/readFile.ts`        | Reading status                 | ⬜     |
| createFile      | `coding/createFile.ts`      | Creating status, file op event | ✅     |
| editFile        | `coding/editFile.ts`        | Editing status, file op event  | ✅     |
| deleteFile      | `coding/deleteFile.ts`      | Deleting status                | ⬜     |
| editLines       | `coding/editLines.ts`       | Editing status                 | ⬜     |
| insertAtLine    | `coding/insertAtLine.ts`    | Inserting status               | ⬜     |
| deleteSection   | `coding/deleteSection.ts`   | Deleting status                | ⬜     |
| smartReplace    | `coding/smartReplace.ts`    | Replacing status               | ⬜     |
| validateEdit    | `coding/validateEdit.ts`    | Validating status              | ⬜     |
| listDirectory   | `coding/listDirectory.ts`   | Listing status                 | ⬜     |
| createDirectory | `coding/createDirectory.ts` | Creating status                | ⬜     |
| grepSearch      | `coding/grepSearch.ts`      | Search progress, files scanned | ⬜     |
| bulkReplace     | `coding/bulkReplace.ts`     | Replace progress (N/M files)   | ⬜     |
| searchFiles     | `coding/searchFiles.ts`     | Search progress                | ⬜     |
| findUsages      | `coding/findUsages.ts`      | Finding status                 | ⬜     |

---

### Phase 5: Filesystem Tools (3 tools) ⬜

| Tool          | File                          | Events         | Status |
| ------------- | ----------------------------- | -------------- | ------ |
| copyFile      | `filesystem/copyFile.ts`      | Copying status | ⬜     |
| moveFile      | `filesystem/moveFile.ts`      | Moving status  | ⬜     |
| moveDirectory | `filesystem/moveDirectory.ts` | Moving status  | ⬜     |

---

### Phase 6: Orchestra Tools (6 tools) ⬜

| Tool                       | File                                      | Events                      | Status |
| -------------------------- | ----------------------------------------- | --------------------------- | ------ |
| runVerificationChecks      | `orchestra/runVerificationChecks.ts`      | Check progress (N/M checks) | ⬜     |
| prepareTask                | `orchestra/prepareTask.ts`                | Preparing status            | ⬜     |
| submitVerificationJudgment | `orchestra/submitVerificationJudgment.ts` | Submitting status           | ⬜     |
| getSprintStatus            | `orchestra/getSprintStatus.ts`            | Fetching status             | ⬜     |
| escalateTask               | `orchestra/escalateTask.ts`               | Escalating status           | ⬜     |
| mcpAdapter                 | `orchestra/mcpAdapter.ts`                 | MCP call status             | ⬜     |

---

## Technical Notes

### Observer Pattern

```typescript
// Context passed to tools
interface ToolInvocationContext {
  observer?: ToolObserver;
}

// Tool calls observer methods
context.observer?.onProgress(callId, "Running tests...", 50);
context.observer?.onOutput(callId, "PASS: test-1\n");
```

### Standard Event Patterns

**Simple tools (quick operations):**

```typescript
// Single status event at start
context.observer?.onProgress(callId, "Reading file...");
// ... do work ...
// Result returned normally
```

**Streaming tools (long-running with output):**

```typescript
context.observer?.onProgress(callId, "Starting command...");
process.stdout.on("data", (chunk) => {
  context.observer?.onOutput(callId, chunk.toString());
});
```

**Progress tools (multi-step operations):**

```typescript
for (let i = 0; i < items.length; i++) {
  const percent = Math.round((i / items.length) * 100);
  context.observer?.onProgress(
    callId,
    `Processing ${i + 1}/${items.length}`,
    percent,
  );
  // ... process item ...
}
```

### UI Considerations

- Throttle rapid updates (max 10/sec)
- Auto-scroll output
- Collapse long output sections
- Visual progress indicator (bar or spinner)

---

## Estimated Effort

| Phase                     | Tools  | Hours     |
| ------------------------- | ------ | --------- |
| Phase 1: Infrastructure   | -      | ✅ Done   |
| Phase 2: UI               | -      | 2-4       |
| Phase 3: System Tools     | 16     | 4-6       |
| Phase 4: Coding Tools     | 16     | 3-4       |
| Phase 5: Filesystem Tools | 3      | 0.5-1     |
| Phase 6: Orchestra Tools  | 6      | 1-2       |
| **Total**                 | **41** | **10-17** |

---

## Progress Log

### 2026-01-31

- Created tracking document
- Created branch `010-agent-events`
- ✅ Phase 1 complete: Infrastructure wired in AgentRunner
  - Added `tool_progress` and `tool_output` output types
  - Added `progressPercent` and `streamChunk` fields
  - Wired observer in `executeToolCalls()` with callbacks
- Starting Phase 2: UI rendering...
