# Feature Specification: Sprint Management & UI Consistency

**Feature Branch**: `008-sprint-management`  
**Created**: 2026-01-23  
**Status**: Draft  
**Input**: User requirements for sprint archiving, filtering, and UI consistency improvements

## Executive Summary

This specification addresses three critical areas:

1. **Sprint Archive Management** - Ability to archive/unarchive sprints to declutter the workspace
2. **Sprint Explorer Filtering** - Filter toggles to show active, archived, or all sprints
3. **Task Status UI Consistency** - Reliable, consistent task status updates across all UI components

The current implementation suffers from inconsistent UI updates due to reliance on a `.signal` file mechanism that doesn't always trigger correctly, leading to stale or incorrect task displays.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Archive a Sprint (Priority: P1)

As an Orchestrator or Developer, I want to archive completed or abandoned sprints, so that my Sprint Explorer remains focused on active work without losing historical sprint data.

**Why this priority**: As projects progress, the Sprint Explorer becomes cluttered with old sprints. Users need a way to hide irrelevant sprints without deleting them.

**Independent Test**: Can be tested by archiving a sprint via context menu and verifying it disappears from the default view but remains in the "Archived" filter view.

**Acceptance Scenarios**:

1. **Given** an inactive sprint in the Sprint Explorer, **When** I right-click and select "Archive Sprint", **Then** the sprint is marked as archived and disappears from the default view.

2. **Given** an active sprint, **When** I attempt to archive it, **Then** the system prevents archiving with a message: "Cannot archive the active sprint. Set a different sprint as active first."

3. **Given** an archived sprint, **When** I view the Sprint Explorer with "Archived" filter, **Then** the archived sprint is visible with a visual indicator showing its archived status.

---

### User Story 2 - Unarchive a Sprint (Priority: P1)

As an Orchestrator or Developer, I want to unarchive a previously archived sprint, so that I can resume work on it or make it visible in my normal workflow.

**Why this priority**: Users may need to revisit archived sprints for reference or to resume work.

**Independent Test**: Can be tested by switching to "Archived" filter, right-clicking an archived sprint, selecting "Unarchive", and verifying it appears in the default view.

**Acceptance Scenarios**:

1. **Given** an archived sprint visible in the "Archived" filter view, **When** I right-click and select "Unarchive Sprint", **Then** the sprint is restored and visible in the default "Active" filter view.

2. **Given** an unarchived sprint, **When** I set it as the active sprint, **Then** it becomes the current working sprint with full functionality.

---

### User Story 3 - Filter Sprint View (Priority: P1)

As an Orchestrator or Developer, I want to filter the Sprint Explorer to show only active sprints, only archived sprints, or all sprints, so that I can focus on relevant sprints based on my current task.

**Why this priority**: Core usability feature - users need to quickly switch between viewing contexts.

**Independent Test**: Can be tested by clicking filter toggles in the Sprint Explorer header and verifying the sprint list updates accordingly.

**Acceptance Scenarios**:

1. **Given** the Sprint Explorer view, **When** I click the "Show Active" filter toggle (default), **Then** only non-archived sprints are displayed.

2. **Given** the Sprint Explorer view, **When** I click the "Show Archived" filter toggle, **Then** only archived sprints are displayed.

3. **Given** the Sprint Explorer view, **When** I click the "Show All" filter toggle, **Then** all sprints (both active and archived) are displayed.

4. **Given** a filter is selected, **When** I close and reopen VS Code, **Then** the filter preference is persisted and restored.

---

### User Story 4 - Refresh Current Task Card from Database (Priority: P1)

As an Implementor or Orchestrator, I want a refresh button on the Current Task card that loads the true current state directly from the database, so that I always see accurate task information regardless of caching issues.

**Why this priority**: Critical for trust in the UI. Users currently experience stale task displays, leading to confusion about actual sprint/task state.

**Independent Test**: Can be tested by modifying task status via MCP tool, then clicking refresh on Current Task card and verifying the updated status is shown.

**Acceptance Scenarios**:

1. **Given** the Current Task card is displayed, **When** I click the "Refresh" button, **Then** the card reloads with the current task state directly from the database.

2. **Given** no task is currently in progress, **When** I click "Refresh", **Then** the card shows the next pending task or "No task currently in progress" message.

3. **Given** the task status changed externally (via MCP tool), **When** I click "Refresh", **Then** the Current Task card reflects the new status immediately.

---

### User Story 5 - Refresh Sprint Explorer from Database (Priority: P1)

As an Orchestrator or Developer, I want the Sprint Explorer refresh button to reload all sprint data directly from the database, so that task statuses, phases, and sprint details are always accurate.

**Why this priority**: The existing refresh mechanism relies on the `.signal` file which is unreliable. Direct database reads ensure accuracy.

**Independent Test**: Can be tested by modifying task status via MCP tool, clicking the Sprint Explorer refresh button, and verifying all task statuses update correctly.

**Acceptance Scenarios**:

1. **Given** the Sprint Explorer view, **When** I click the "Refresh" button in the view header, **Then** all sprint data is reloaded from the database.

2. **Given** task statuses were modified externally, **When** I click "Refresh", **Then** all task status icons and decorations update to reflect the true database state.

3. **Given** a new phase or task was added via MCP tool, **When** I click "Refresh", **Then** the new items appear in the tree view.

---

### User Story 6 - Consistent Task Status Updates (Priority: P0)

As a user of Orchestra, I want task status changes to be consistently and accurately reflected across all UI components (Sprint Explorer tree view, Current Task card, Task Detail panel), so that I can trust the UI shows the actual state.

**Why this priority**: This is the root cause of user frustration. The current `.signal` file mechanism is unreliable, leading to inconsistent UI states.

**Independent Test**: Can be tested by performing a series of task status transitions via MCP tools and verifying all UI components update consistently.

**Acceptance Scenarios**:

1. **Given** a task status changes from PENDING to IMPLEMENT, **When** the MCP tool completes, **Then** the Sprint Explorer tree, Current Task card, and any open Task Detail panel all reflect the new status within 1 second.

2. **Given** multiple rapid status changes occur, **When** the changes complete, **Then** all UI components show the final correct state without stale intermediate states.

3. **Given** the `.signal` file mechanism fails, **When** a database poll interval fires (fallback), **Then** the UI still updates correctly from the database.

4. **Given** the Current Task card shows a task, **When** that task transitions to COMPLETE, **Then** the Current Task card automatically shows the next pending task or "No task in progress" message.

---

### Edge Cases

- **Archive during active work** → Prevent archiving active sprint with clear error message
- **Filter persistence** → Store filter state in extension global state, persisted across sessions
- **Concurrent modifications** → UI refresh should always read fresh database state, not cached values
- **Database locked** → Graceful error handling with retry mechanism
- **Large sprint lists** → Filtering should be performant even with 50+ sprints
- **Set archived sprint as active** → Auto-unarchive when setting as active (see Design Decisions)
- **Current Task scope** → Always shows tasks from active sprint only, regardless of tree view filter

---

## Design Decisions _(resolved)_

### DD-001: Filter Toggle UI Style

**Decision**: Single dropdown button showing current filter state.

**Rationale**: VS Code view title bar has limited space. A single dropdown button with the current filter label (e.g., "Filter: Active ▼") is more space-efficient than three separate toggle buttons. Clicking opens a Quick Pick menu with all three options.

**Implementation**:

```json
{
  "command": "orchestra.selectSprintFilter",
  "title": "Filter: Active",
  "icon": "$(filter)"
}
```

---

### DD-002: Active Sprint + Archive Interaction

**Decision**: Auto-unarchive when setting an archived sprint as active.

**Rationale**: The active sprint is the "working" sprint and should always be visible in the default view. It would be confusing to have an active sprint that's hidden. Auto-unarchiving provides a seamless user experience.

**Behavior**:

1. User views archived sprints filter
2. User right-clicks archived sprint → "Set as Active Sprint"
3. System sets sprint as active AND sets `is_archived = false`
4. Sprint now visible in "Active" filter view

---

### DD-003: Current Task Card Scope

**Decision**: Current Task card always shows tasks from the active sprint only.

**Rationale**: The active sprint represents the user's current working context. Even when browsing archived sprints in the tree view (for reference), the Current Task card should remain focused on the actual work in progress. This prevents confusion about which sprint's tasks are being displayed.

**Behavior**:

- Tree view filter changes → No effect on Current Task card
- Current Task card always queries: "in-progress task from active sprint"
- If no in-progress task, shows next pending task from active sprint

---

### DD-004: Bulk Archive Operations

**Decision**: Defer to future enhancement (out of scope for v1).

**Rationale**: Single-sprint archive/unarchive covers the primary use case. Bulk operations add complexity and can be added later if user demand warrants it.

**Future considerations**:

- "Archive all completed sprints" command
- "Archive sprints older than X days" command

---

### DD-005: Signal File Backward Compatibility

**Decision**: Gracefully handle both old (plain timestamp) and new (JSON with sequence) formats.

**Rationale**: MCP server and extension may be updated independently. The extension should not break if it encounters an old-format signal file during transition.

**Implementation**:

```typescript
private parseSignalContent(content: string): { sequence: number; timestamp: number } {
  try {
    // Try JSON format first
    return JSON.parse(content);
  } catch {
    // Fallback: old format is just a timestamp
    return { sequence: 0, timestamp: parseInt(content, 10) };
  }
}
```

---

## Requirements _(mandatory)_

### Functional Requirements - Sprint Archiving

- **FR-001**: System MUST provide an `is_archived` column on the `sprints` table to track archive status (boolean, default false).

- **FR-002**: System MUST provide a context menu action "Archive Sprint" on non-active, non-archived sprints in the Sprint Explorer.

- **FR-003**: System MUST provide a context menu action "Unarchive Sprint" on archived sprints when viewing archived or all sprints.

- **FR-004**: System MUST prevent archiving the currently active sprint with a clear error message.

- **FR-005**: System MUST provide an MCP tool `archive_sprint(sprint_id)` for orchestrator use that sets `is_archived = true`.

- **FR-006**: System MUST provide an MCP tool `unarchive_sprint(sprint_id)` for orchestrator use that sets `is_archived = false`.

### Functional Requirements - Sprint Explorer Filtering

- **FR-010**: Sprint Explorer MUST display a filter dropdown button in the view title bar area that opens a Quick Pick menu (see DD-001 and wireframe in Appendix A).

- **FR-011**: System MUST provide three filter states: "Active" (default, non-archived), "Archived", and "All".

- **FR-011a**: When setting an archived sprint as active, the system MUST auto-unarchive it (see DD-002).

- **FR-012**: Filter selection MUST persist across VS Code sessions using extension global state.

- **FR-013**: Archived sprints MUST display with a distinct visual indicator (e.g., archive icon, muted color, or strikethrough).

- **FR-014**: The `getAllSprints()` query MUST accept a filter parameter: `{ filter: 'active' | 'archived' | 'all' }`.

### Functional Requirements - UI Refresh Mechanism

- **FR-020**: Current Task card MUST include a visible "Refresh" button that triggers an immediate database reload.

- **FR-021**: Sprint Explorer refresh button MUST trigger a complete tree data reload from database (not from cache).

- **FR-022**: All refresh operations MUST bypass any caching and read directly from the database file.

- **FR-023**: Refresh operations MUST invalidate any internal state (e.g., code review status cache in `SprintTreeProvider`).

### Functional Requirements - Task Status Consistency

- **FR-030**: Task status changes in database MUST trigger UI updates in all visible components within 1 second under normal conditions.

- **FR-031**: `DatabaseWatcher` MUST emit change events for both `.signal` file changes AND direct database file mtime changes.

- **FR-032**: All UI components (SprintTreeProvider, CurrentTaskViewProvider, TaskDetailPanel) MUST subscribe to `DatabaseWatcher.onDidChange` for updates.

- **FR-033**: Current Task card MUST re-evaluate "current task" logic on every refresh (in-progress first, then next pending).

- **FR-033a**: Current Task card MUST always show tasks from the active sprint only, regardless of Sprint Explorer filter state (see DD-003).

- **FR-034**: System MUST handle the case where the displayed task transitions to COMPLETE by automatically refreshing to show next task.

- **FR-035**: Task status display MUST use the centralized `getStatusDisplay()` function for consistent status text and icons.

### Functional Requirements - Database Signal Enhancement

- **FR-040**: MCP server MUST write to `.signal` file after EVERY database mutation (not just selected operations).

- **FR-041**: Signal file writes MUST include a monotonically increasing sequence number to detect missed signals.

- **FR-041a**: Extension MUST gracefully handle both old (plain timestamp) and new (JSON with sequence) signal file formats for backward compatibility (see DD-005).

- **FR-042**: Extension MUST implement a periodic database mtime check (10-second fallback) as a safety net for missed signals.

- **FR-043**: Extension MUST log when signal-based updates are missed and fallback polling triggers an update.

### Key Entities

- **Sprint Archive Status**: A boolean flag (`is_archived`) indicating whether a sprint should be hidden from default views.

- **Sprint Filter**: An enumeration (`active` | `archived` | `all`) controlling which sprints are displayed in the Sprint Explorer.

- **Database Signal**: A file-based notification mechanism (`.orchestra/.signal`) used to trigger UI updates after database mutations.

- **Database Watcher**: The extension component that monitors for database changes and emits events to UI components.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can archive and unarchive sprints via context menu actions (100% functionality coverage).

- **SC-002**: Sprint Explorer filter toggles work correctly, showing appropriate sprints for each filter state.

- **SC-003**: Filter preference persists across VS Code sessions (verified by restart test).

- **SC-004**: Refresh buttons on Current Task card and Sprint Explorer load fresh data from database (verified by external modification test).

- **SC-005**: Task status changes are reflected in all UI components within 1 second of database mutation (95th percentile).

- **SC-006**: Zero instances of stale/incorrect task display when using refresh buttons.

- **SC-007**: Archived sprints display with clear visual differentiation from active sprints.

---

## Technical Design

### Database Schema Changes

```sql
-- Add is_archived column to sprints table
ALTER TABLE sprints ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS is_archived_idx ON sprints(is_archived);
```

### Sprint Filter Implementation

```typescript
// SprintTreeProvider.ts - Filter support
type SprintFilter = "active" | "archived" | "all";

export class SprintTreeProvider {
  private _currentFilter: SprintFilter = "active";

  setFilter(filter: SprintFilter): void {
    this._currentFilter = filter;
    // Persist to extension global state
    this._context.globalState.update("orchestra.sprintFilter", filter);
    this.refresh();
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      const sprints = getAllSprints(workspaceRoot, {
        filter: this._currentFilter,
      });
      // ... rest of implementation
    }
  }
}
```

### Refresh Button Placement (View Actions)

```json
// package.json contribution
{
  "view/title": [
    {
      "command": "orchestra.refreshCurrentTask",
      "when": "view == orchestra.currentTask",
      "group": "navigation"
    }
  ]
}
```

### Enhanced Database Watcher

```typescript
// Enhanced signal detection with sequence tracking
export class DatabaseWatcher {
  private lastSignalSequence: number = 0;

  private handleSignalChange(): void {
    const content = fs.readFileSync(signalPath, "utf8");
    const { sequence, timestamp } = JSON.parse(content);

    if (sequence > this.lastSignalSequence) {
      this.lastSignalSequence = sequence;
      this.emitter.fire(); // Trigger UI update
    }
  }
}
```

---

## Appendix A: UI Wireframe

### Sprint Explorer with Filter Dropdown

```
┌─────────────────────────────────────────────────┐
│ SPRINT EXPLORER        [🔽 Active] [🔄] [⚙️]    │  ← Filter dropdown + Refresh
├─────────────────────────────────────────────────┤
│ ▼ 🚀 Interface Contract Validation              │
│   ▼ 📁 Phase 1                                  │
│     ✅ Task 1: Schema validation                │
│     🔄 Task 2: Agent instructions               │
│   ▶ 📁 Phase 2                                  │
│ ▶ 📦 Code Review Workflow (inactive)            │
│ ▶ 📦 TDD Implementation (inactive)              │
└─────────────────────────────────────────────────┘

Filter Dropdown Click → Quick Pick Menu:
┌─────────────────────────────────────────────────┐
│ Select Sprint Filter                            │
├─────────────────────────────────────────────────┤
│ ● Active Sprints (default)                      │
│ ○ Archived Sprints                              │
│ ○ All Sprints                                   │
└─────────────────────────────────────────────────┘
```

### Archived Sprints View

```
┌─────────────────────────────────────────────────┐
│ SPRINT EXPLORER      [🔽 Archived] [🔄] [⚙️]    │
├─────────────────────────────────────────────────┤
│ ▶ 📦 Old Sprint 1 (archived)                    │  ← Muted + archive indicator
│ ▶ 📦 Abandoned Feature (archived)               │
│ ▶ 📦 Test Sprint (archived)                     │
└─────────────────────────────────────────────────┘

Right-click Context Menu on Archived Sprint:
┌─────────────────────────────────────────────────┐
│ Unarchive Sprint                                │
│ Set as Active Sprint                            │  ← Also unarchives
│ ─────────────────────                           │
│ View Sprint Details                             │
└─────────────────────────────────────────────────┘
```

### Current Task Card

```
┌─────────────────────────────────────────────────┐
│ CURRENT TASK                            [🔄]    │  ← Refresh button
├─────────────────────────────────────────────────┤
│ Task 2: Agent Instructions Update               │
│ Status: 🔄 In Progress                          │
│ Phase: Phase 1 - Core Infrastructure            │
│                                                 │
│ Description: Update agent instructions to...    │
│                                                 │
│ [View Details]  [Signal Completion]             │
└─────────────────────────────────────────────────┘

Note: Always shows active sprint's current task,
regardless of Sprint Explorer filter selection.
```

---

## Appendix B: Current Issues Analysis

### Problem 1: Signal File Unreliability

**Current State**: The `.orchestra/.signal` file is watched by `DatabaseWatcher`, but:

- Not all MCP handlers write to the signal file
- File system watchers can miss rapid successive changes
- No sequence tracking means missed signals go undetected

**Solution**:

1. Ensure ALL MCP database mutations write to signal file
2. Add sequence numbers to signal content
3. Maintain database mtime polling as reliable fallback

### Problem 2: Cached State in UI Components

**Current State**: `SprintTreeProvider` caches code review status internally:

```typescript
private _codeReviewStatusByTaskId: Map<number, string> = new Map();
```

This cache may become stale if change events are missed.

**Solution**:

1. Refresh button explicitly clears all caches before reload
2. Change events also clear relevant caches

### Problem 3: Current Task Logic Edge Cases

**Current State**: `getCurrentTask()` returns in-progress tasks, falling back to next pending. However:

- Task transitions may not immediately update the display
- Completed task may still show briefly before refresh

**Solution**:

1. Explicit refresh clears any task display assumptions
2. Status transitions trigger immediate re-evaluation

---

## Assumptions

- Single-user workflow (no concurrent users modifying same database)
- VS Code file system watcher is functional for `.signal` file
- Database operations are fast enough that 1-second UI update target is achievable
- Users have write access to `.orchestra/` directory

---

## Out of Scope

- Multi-user/collaborative sprint management
- Sprint deletion (only archive/unarchive)
- Historical sprint analytics or reporting
- Sprint import/export functionality
- Bulk archive operations (see DD-004 - deferred to future)
