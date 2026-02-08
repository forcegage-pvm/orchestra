# Orchestra Performance Analysis

**Date:** 2025-01-20  
**Scope:** Extension + MCP Server  
**Status:** ✅ IMPLEMENTED (P0 + P1)

## Executive Summary

This document identifies performance hotspots across the Orchestra codebase after removing debug logging in the previous phase. The analysis covers UI rendering, database queries, memory management, and timer usage patterns.

**Implementation Status:**

- ✅ Logger singleton pattern - COMPLETED
- ✅ TimelineView incremental processing - COMPLETED
- ✅ SprintTreeProvider caching - COMPLETED
- 📝 JSON parsing memoization - DOCUMENTED (P2, requires protocol changes)

---

## 🔴 Critical Issues (High Impact)

### 1. OrchestraLogger Creates Multiple OutputChannels ✅ FIXED

**Location:** [extension/src/utils/logger.ts](extension/src/utils/logger.ts#L45)

**Problem:** Each `new OrchestraLogger()` call creates a new VS Code OutputChannel. Found 20+ instantiation points including:

- Multiple times per function in `PlayTaskHandler.ts` (6+ instances)
- Every TreeProvider, ViewProvider, Panel creates its own
- Function-level (not module-level) instantiation means repeated creation on every invocation

**Impact:** Memory bloat, potential OutputChannel fragmentation, unnecessary resource allocation on every command execution.

**Fix Applied:**

```typescript
// Singleton logger instance (extension/src/utils/logger.ts)
let sharedLoggerInstance: OrchestraLogger | null = null;

export function getLogger(): OrchestraLogger {
  if (!sharedLoggerInstance) {
    sharedLoggerInstance = new OrchestraLogger();
  }
  return sharedLoggerInstance;
}

// Updated 15+ files to use getLogger() instead of new OrchestraLogger()
```

### 2. TimelineView.tsx - Full Event Array Iteration on Every Change ✅ FIXED

**Location:** [extension/src/webviews/agent-panel/views/TimelineView.tsx](extension/src/webviews/agent-panel/views/TimelineView.tsx#L101-L150)

**Problem:** The `timelineItems` createMemo iterates through ALL events on any event change, creating new TimelineItem objects and a new Set for deduplication each time.

**Impact:** For sessions with 1000+ events, this causes noticeable UI lag on every event update.

**Fix Applied:**

```typescript
// Incremental processing with caching
let cachedItems: TimelineItem[] = [];
let lastEventCount = 0;
let lastToolCallCount = 0;
const processedToolCalls = new Set<string>(); // Persisted across renders

const timelineItems = createMemo(() => {
  const eventArray = getEventsArray();
  const toolCallsMap = toolCalls;

  // Only process NEW events if no structural change
  if (
    eventArray.length >= lastEventCount &&
    toolCallsMap.size >= lastToolCallCount &&
    cachedItems.length > 0
  ) {
    const newEvents = eventArray.slice(lastEventCount - lastToolCallCount);
    // Process only new events...
  }
  // Update cache pointers and return merged items
});
```

### 3. SprintTreeProvider - Synchronous DB Queries in getChildren() ✅ FIXED

**Location:** [extension/src/views/treeview/SprintTreeProvider.ts](extension/src/views/treeview/SprintTreeProvider.ts#L115-L145)

**Problem:** Every TreeView expansion triggers synchronous database queries.

**Impact:** UI freezes during tree expansion, especially with many tasks.

**Fix Applied:**

```typescript
// Added caching for all database queries
private _sprintsCache: SprintRow[] | null = null;
private _phasesCache = new Map<string, PhaseRow[]>();
private _tasksCache = new Map<string, TaskRow[]>();

private _getCachedSprints(): SprintRow[] {
  if (!this._sprintsCache) {
    this._sprintsCache = getAllSprints(this._workspaceRoot);
  }
  return this._sprintsCache;
}

refresh(): void {
  // Clear all caches on database change
  this._sprintsCache = null;
  this._phasesCache.clear();
  this._tasksCache.clear();
  this._onDidChangeTreeData.fire(undefined);
}
```

---

## 🟡 Medium Issues (Moderate Impact)

### 4. Event Filtering Without Memoization

**Location:** [extension/src/webviews/agent-panel/stores/eventsStore.ts](extension/src/webviews/agent-panel/stores/eventsStore.ts#L100-L130)

**Problem:** `filteredEvents()` is a regular function (not a memo) that creates search text for every event on each call.

**Impact:** Filtering large event sets on every keystroke could be slow.

**Recommended Fix:**

- Pre-compute searchable text when events are added (store alongside event)
- Use createMemo for the filtered result
- Consider debouncing filter input

### 5. JSON.parse/stringify on Every Render

**Locations:**

- [extension/src/views/task/index.html](extension/src/views/task/index.html#L724-L980) - Multiple JSON.parse calls
- [extension/src/views/webview/CurrentTaskViewProvider.ts](extension/src/views/webview/CurrentTaskViewProvider.ts#L176-L298)

**Problem:** Handover fields like `dependencies`, `context_files`, `acceptance_criteria` are stored as JSON strings and parsed on every render.

**Impact:** Unnecessary CPU work, especially for complex handovers.

**Recommended Fix:**

- Parse JSON once when data is fetched
- Store parsed objects in component state
- Consider parsing at query layer

### 6. Database Watcher Poll Interval

**Location:** [extension/src/database/watcher.ts](extension/src/database/watcher.ts#L37-L95)

**Problem:** 10-second poll interval as fallback + 500ms debounce from configuration.

**Observation:** This is reasonable, but the signal file mechanism should be verified to be working reliably. If signal file fails silently, users would see 10-second delays.

**Recommended Fix:** Add telemetry to track which notification source triggers updates.

---

## 🟢 Good Patterns Found

### Database Indexing

All critical query paths have proper indexes:

- `sprint_task_idx` on (sprint_id, task_id)
- `status_idx` on task status
- `task_handover_idx` on handovers
- And 15+ more indexes

### Event Batching

The `EventBatcher` class properly batches database writes with a 50ms window - this is a good pattern.

### Disposable Cleanup

VS Code Disposable pattern is consistently used across providers, panels, and watchers.

### JOIN Usage

Database queries properly use JOINs instead of N+1 patterns (verified in queries.ts).

### SolidJS Reactivity

Using `<Index>` component for list rendering and proper signal/memo patterns in most places.

---

## 📊 Performance Optimization Priority Matrix

| Issue                    | Impact | Effort | Priority | Status        |
| ------------------------ | ------ | ------ | -------- | ------------- |
| Logger singleton         | High   | Low    | **P0**   | ✅ Done       |
| TimelineView iteration   | High   | Medium | **P0**   | ✅ Done       |
| SprintTree caching       | Medium | Medium | **P1**   | ✅ Done       |
| JSON parsing memoization | Medium | Medium | **P2**   | 📝 Documented |
| Event filtering memo     | Low    | Low    | **P2**   | 📝 Documented |
| Watcher telemetry        | Low    | Low    | **P3**   | -             |

---

## Implementation Plan

### Phase 1: Quick Wins (P0 + easy P1) ✅ COMPLETE

1. ✅ Convert OrchestraLogger to singleton pattern
2. ✅ Cache sprint/phase/task data in TreeProvider
3. ✅ Implement incremental event processing in TimelineView

### Phase 2: Deferred (P2) - Requires Architectural Changes

1. 📝 JSON parsing memoization - Requires changing webview protocol to send parsed objects
2. 📝 Pre-compute searchable text for events - Requires event storage changes

### Phase 3: Future Polish (P3)

1. Add watcher source telemetry
2. Profile and optimize any remaining hot paths

---

## Appendix: Files Analyzed

### Extension Core

- [extension/src/extension.ts](extension/src/extension.ts)
- [extension/src/utils/logger.ts](extension/src/utils/logger.ts)
- [extension/src/database/watcher.ts](extension/src/database/watcher.ts)
- [extension/src/database/queries.ts](extension/src/database/queries.ts) (1834 lines)

### UI Components

- [extension/src/webviews/agent-panel/views/TimelineView.tsx](extension/src/webviews/agent-panel/views/TimelineView.tsx)
- [extension/src/webviews/agent-panel/stores/eventsStore.ts](extension/src/webviews/agent-panel/stores/eventsStore.ts)
- [extension/src/webviews/agent-panel/stores/sessionStore.ts](extension/src/webviews/agent-panel/stores/sessionStore.ts)
- [extension/src/views/treeview/SprintTreeProvider.ts](extension/src/views/treeview/SprintTreeProvider.ts)

### MCP Server

- [src/mcp-server/index.ts](src/mcp-server/index.ts)
- [src/mcp-server/tools.ts](src/mcp-server/tools.ts)
- [src/db/schema.ts](src/db/schema.ts)

### Sessions

- [extension/src/agents/sessions/eventBatcher.ts](extension/src/agents/sessions/eventBatcher.ts)
- [extension/src/agents/sessions/eventEmitter.ts](extension/src/agents/sessions/eventEmitter.ts)
- [extension/src/agents/sessions/eventBus.ts](extension/src/agents/sessions/eventBus.ts)
