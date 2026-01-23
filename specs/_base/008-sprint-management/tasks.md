# Sprint Management - Implementation Tasks

**Spec**: 008-sprint-management  
**Created**: 2026-01-23

## Phase 1: Database & Core Infrastructure

### Task 1: Add Sprint Archive Schema

**Category**: INFRASTRUCTURE  
**Priority**: P0  
**Dependencies**: None

**Description**: Add `is_archived` column to sprints table with migration.

**Deliverables**:

- [ ] Migration file: `20260123_001_add_sprint_archive.ts`
- [ ] Updated schema in `src/db/schema.ts`
- [ ] Index on `is_archived` column
- [ ] Unit tests for migration

**Verification**:

```bash
npm test -- --grep "sprint archive migration"
```

---

### Task 2: Implement Archive Query Functions

**Category**: INFRASTRUCTURE  
**Priority**: P0  
**Dependencies**: Task 1

**Description**: Implement `getAllSprints` filter support and archive/unarchive functions.

**Deliverables**:

- [ ] `getAllSprints(workspacePath, { filter })` with filter support
- [ ] `archiveSprint(workspacePath, sprintId)` function
- [ ] `unarchiveSprint(workspacePath, sprintId)` function
- [ ] Validation: cannot archive active sprint
- [ ] Unit tests for all query functions

**Verification**:

```bash
npm test -- --grep "archive sprint|unarchive sprint|getAllSprints filter"
```

---

### Task 3: Add MCP Archive Tools

**Category**: INTEGRATION  
**Priority**: P1  
**Dependencies**: Task 2

**Description**: Add MCP tools for orchestrator to archive/unarchive sprints.

**Deliverables**:

- [ ] `archive_sprint` tool handler
- [ ] `unarchive_sprint` tool handler
- [ ] Tool registration in `src/mcp-server/tools.ts`
- [ ] Signal file write after operations
- [ ] Integration tests

**Verification**:

```bash
npm test -- --grep "archive_sprint|unarchive_sprint"
```

---

## Phase 2: Sprint Explorer Filter UI

### Task 4: Add Filter State Management

**Category**: INFRASTRUCTURE  
**Priority**: P0  
**Dependencies**: Task 2

**Description**: Implement filter state management in SprintTreeProvider with persistence.

**Deliverables**:

- [ ] `SprintFilter` type definition
- [ ] `_currentFilter` state in SprintTreeProvider
- [ ] `setFilter(filter)` method
- [ ] Persistence to `globalState`
- [ ] Restore filter on extension activation
- [ ] Unit tests

**Verification**:

- Filter persists across VS Code restart
- Correct sprints shown for each filter

---

### Task 5: Add Filter Toggle Commands

**Category**: INTEGRATION  
**Priority**: P1  
**Dependencies**: Task 4

**Description**: Register filter toggle commands and add to view title bar.

**Deliverables**:

- [ ] Command: `orchestra.setSprintFilter.active`
- [ ] Command: `orchestra.setSprintFilter.archived`
- [ ] Command: `orchestra.setSprintFilter.all`
- [ ] View title contributions in `package.json`
- [ ] Icons for each filter state
- [ ] Update when clause for active filter indicator

**Verification**:

- Buttons visible in Sprint Explorer title bar
- Clicking changes filter and updates view

---

### Task 6: Add Archive Context Menu Actions

**Category**: INTEGRATION  
**Priority**: P1  
**Dependencies**: Task 3, Task 4

**Description**: Add context menu items for archive/unarchive on sprint items.

**Deliverables**:

- [ ] "Archive Sprint" menu item (when: non-active, non-archived sprint)
- [ ] "Unarchive Sprint" menu item (when: archived sprint)
- [ ] Command handlers calling MCP tools
- [ ] Error handling for active sprint archive attempt
- [ ] Visual feedback on success

**Verification**:

- Right-click menu shows appropriate options
- Actions work correctly

---

### Task 7: Add Archived Sprint Visual Indicator

**Category**: VISUAL  
**Priority**: P2  
**Dependencies**: Task 4

**Description**: Display archived sprints with distinct visual treatment.

**Deliverables**:

- [ ] Archive icon (`$(archive)`) for archived sprints
- [ ] Muted color using `ThemeColor`
- [ ] "(archived)" description suffix
- [ ] Update `_createSprintItem` in SprintTreeProvider

**Verification**:

- Archived sprints clearly distinguishable from active ones

---

## Phase 3: Refresh Button Implementation

### Task 8: Add Current Task Refresh Button

**Category**: INTEGRATION  
**Priority**: P0  
**Dependencies**: None

**Description**: Add refresh button to Current Task card header.

**Deliverables**:

- [ ] Command: `orchestra.refreshCurrentTask`
- [ ] View title contribution for `orchestra.currentTask`
- [ ] `forceRefresh()` method in CurrentTaskViewProvider
- [ ] Clear any cached state before refresh
- [ ] Button with refresh icon

**Verification**:

- Refresh button visible in Current Task header
- Clicking reloads task from database

---

### Task 9: Enhance Sprint Explorer Refresh

**Category**: REFACTOR  
**Priority**: P1  
**Dependencies**: None

**Description**: Ensure Sprint Explorer refresh fully reloads from database.

**Deliverables**:

- [ ] Clear `_codeReviewStatusByTaskId` cache on refresh
- [ ] Clear `_codeReviewStatusSprintId` cache
- [ ] Force new database reads (no caching layer)
- [ ] Add logging for refresh operations

**Verification**:

- External database changes reflected after refresh

---

## Phase 4: Task Status Consistency

### Task 10: Audit MCP Signal File Writes

**Category**: REFACTOR  
**Priority**: P0  
**Dependencies**: None

**Description**: Ensure ALL MCP handlers write to `.signal` file after database mutations.

**Deliverables**:

- [ ] Audit all handlers in `src/mcp-server/handlers/`
- [ ] Add `writeSignalFile()` call to any missing handlers
- [ ] Create central `notifyDbChange()` utility function
- [ ] List of handlers audited and updated

**Verification**:

```bash
grep -r "writeSignalFile\|notifyDbChange" src/mcp-server/handlers/
```

---

### Task 11: Implement Signal Sequence Tracking

**Category**: INFRASTRUCTURE  
**Priority**: P1  
**Dependencies**: Task 10

**Description**: Add sequence numbers to signal file for missed signal detection.

**Deliverables**:

- [ ] Signal file format: `{ sequence, timestamp, operation }`
- [ ] Sequence counter in MCP server (persisted in config table)
- [ ] Extension reads and tracks last seen sequence
- [ ] Log warning when sequences are skipped

**Verification**:

- Sequence numbers increment on each signal
- Skipped sequences logged

---

### Task 12: Enhance DatabaseWatcher Reliability

**Category**: REFACTOR  
**Priority**: P1  
**Dependencies**: Task 11

**Description**: Improve DatabaseWatcher to handle signal failures gracefully.

**Deliverables**:

- [ ] Parse JSON signal file content
- [ ] Track last seen sequence
- [ ] Log when polling fallback catches missed updates
- [ ] Emit change events for both signal and poll triggers
- [ ] Unit tests for watcher

**Verification**:

- UI updates even if signal file watcher fails
- Logs show when fallback triggers

---

### Task 13: Current Task Auto-Refresh on Completion

**Category**: INTEGRATION  
**Priority**: P2  
**Dependencies**: Task 8

**Description**: Automatically refresh Current Task card when displayed task completes.

**Deliverables**:

- [ ] Detect when displayed task status becomes COMPLETE
- [ ] Auto-refresh to show next task
- [ ] Smooth transition (no flicker)

**Verification**:

- Complete a task, Current Task card shows next task automatically

---

## Phase 5: Extension Query Updates

### Task 14: Update Extension Queries for Archive

**Category**: INTEGRATION  
**Priority**: P1  
**Dependencies**: Task 2

**Description**: Update extension database queries to use filter support.

**Deliverables**:

- [ ] Update `getAllSprints` calls in extension
- [ ] Pass filter from SprintTreeProvider state
- [ ] Ensure Current Task only considers non-archived sprints
- [ ] Update any other sprint queries

**Verification**:

- Archived sprints don't appear in task selection
- Filter correctly applied throughout extension

---

## Summary

| Phase                       | Tasks | Priority | Est. Effort |
| --------------------------- | ----- | -------- | ----------- |
| Phase 1: Database & Core    | 1-3   | P0-P1    | 4-6 hours   |
| Phase 2: Filter UI          | 4-7   | P0-P2    | 4-6 hours   |
| Phase 3: Refresh Buttons    | 8-9   | P0-P1    | 2-3 hours   |
| Phase 4: Status Consistency | 10-13 | P0-P2    | 4-6 hours   |
| Phase 5: Extension Updates  | 14    | P1       | 2-3 hours   |

**Total Estimated Effort**: 16-24 hours

## Dependencies Graph

```
Task 1 (Schema)
    └── Task 2 (Queries)
           ├── Task 3 (MCP Tools)
           │      └── Task 6 (Context Menu)
           ├── Task 4 (Filter State)
           │      ├── Task 5 (Filter Commands)
           │      ├── Task 6 (Context Menu)
           │      └── Task 7 (Visual Indicator)
           └── Task 14 (Extension Queries)

Task 8 (Current Task Refresh) ── Independent
    └── Task 13 (Auto-Refresh)

Task 9 (Sprint Explorer Refresh) ── Independent

Task 10 (Signal Audit)
    └── Task 11 (Sequence Tracking)
           └── Task 12 (Watcher Enhancement)
```
