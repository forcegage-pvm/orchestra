# Tasks: Sprint Management & UI Consistency

**Input**: Design documents from `/specs/008-sprint-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in specification - test tasks not included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- Include exact file paths in descriptions

## Path Conventions

This project uses a split architecture:

- **MCP Server**: `src/db/`, `src/mcp-server/`
- **Extension**: `extension/src/`
- **Tests**: `test/` (MCP server), `extension/test/` (extension)

---

## Phase 1: Setup (Database Schema)

**Purpose**: Add `is_archived` column to sprints table

- [ ] T001 Add `is_archived` column to sprints table schema in src/db/schema.ts
- [ ] T002 Add migration for `is_archived` column in src/db/migrations.ts
- [ ] T003 [P] Add `SprintFilter` type definition in extension/src/database/queries.ts

---

## Phase 2: Foundational (Signal File Fixes - P0)

**Purpose**: Fix missing `writeSignal()` calls in all database-mutating MCP handlers

**⚠️ CRITICAL**: This phase fixes the root cause of UI inconsistency. All signal handlers must be fixed before UI work begins.

- [ ] T004 [P] Add `writeSignal()` call to src/mcp-server/handlers/complete-task.ts
- [ ] T005 [P] Add `writeSignal()` call to src/mcp-server/handlers/update-task.ts
- [ ] T006 [P] Add `writeSignal()` call to src/mcp-server/handlers/reopen-task.ts
- [ ] T007 [P] Add `writeSignal()` call to src/mcp-server/handlers/submit-verification-judgment.ts
- [ ] T008 [P] Add `writeSignal()` call to src/mcp-server/handlers/set-active-sprint.ts
- [ ] T009 [P] Add `writeSignal()` call to src/mcp-server/handlers/add-task.ts
- [ ] T010 [P] Add `writeSignal()` call to src/mcp-server/handlers/add-phase.ts
- [ ] T011 [P] Add `writeSignal()` call to src/mcp-server/handlers/remove-task.ts
- [ ] T012 [P] Add `writeSignal()` call to src/mcp-server/handlers/escalate-task.ts
- [ ] T013 [P] Add `writeSignal()` call to src/mcp-server/handlers/enhance-feedback.ts
- [ ] T014 [P] Add `writeSignal()` call to src/mcp-server/handlers/fix-code-review.ts
- [ ] T015 [P] Add `writeSignal()` call to src/mcp-server/handlers/submit-code-review.ts

**Checkpoint**: All MCP handlers now write signal file after database mutations

---

## Phase 3: User Story 1 - Consistent Task Status Updates (Priority: P0) 🎯 MVP

**Goal**: Task status changes are consistently reflected across all UI components within 1 second

**Independent Test**: Perform task status transitions via MCP tools and verify all UI components update consistently

### Implementation for User Story 1

- [ ] T016 [US1] Update `getAllSprints()` in extension/src/database/queries.ts to accept filter parameter
- [ ] T016a [US1] Update DatabaseWatcher in extension/src/database/watcher.ts to also monitor .orchestra/orchestra.db mtime as fallback change signal (FR-031)
- [ ] T017 [US1] Ensure SprintTreeProvider in extension/src/views/treeview/SprintTreeProvider.ts clears all caches on refresh
- [ ] T018 [US1] Verify CurrentTaskViewProvider in extension/src/views/webview/CurrentTaskViewProvider.ts subscribes to DatabaseWatcher
- [ ] T019 [US1] Add cache invalidation to `_refresh()` in extension/src/views/treeview/SprintTreeProvider.ts

**Checkpoint**: Task status updates now propagate to all UI components reliably

---

## Phase 4: User Story 2 - Archive a Sprint (Priority: P1)

**Goal**: Users can archive inactive sprints to declutter the Sprint Explorer

**Independent Test**: Archive a sprint via context menu and verify it disappears from default view

### Implementation for User Story 2

- [ ] T020 [P] [US2] Create MCP handler src/mcp-server/handlers/archive-sprint.ts with validation (cannot archive active sprint)
- [ ] T021 [US2] Register `archive_sprint` tool in src/mcp-server/tools.ts with orchestrator role
- [ ] T022 [US2] Add archive sprint command in extension/src/commands/archiveSprint.ts
- [ ] T023 [US2] Add `orchestra.archiveSprint` command registration in extension/src/extension.ts
- [ ] T024 [US2] Add Archive Sprint context menu item in extension/package.json (viewItem: sprint-inactive)

**Checkpoint**: Users can archive sprints via context menu; archived sprints disappear from default view

---

## Phase 5: User Story 3 - Unarchive a Sprint (Priority: P1)

**Goal**: Users can unarchive a previously archived sprint

**Independent Test**: Switch to "Archived" filter, unarchive a sprint, verify it appears in default view

### Implementation for User Story 3

- [ ] T025 [P] [US3] Create MCP handler src/mcp-server/handlers/unarchive-sprint.ts
- [ ] T026 [US3] Register `unarchive_sprint` tool in src/mcp-server/tools.ts with orchestrator role
- [ ] T027 [US3] Add unarchive sprint command in extension/src/commands/unarchiveSprint.ts
- [ ] T028 [US3] Add `orchestra.unarchiveSprint` command registration in extension/src/extension.ts
- [ ] T029 [US3] Add Unarchive Sprint context menu item in extension/package.json (viewItem: sprint-archived)
- [ ] T030 [US3] Update set-active-sprint handler in src/mcp-server/handlers/set-active-sprint.ts to auto-unarchive

**Checkpoint**: Users can unarchive sprints; setting archived sprint as active auto-unarchives it

---

## Phase 6: User Story 4 - Filter Sprint View (Priority: P1)

**Goal**: Users can filter Sprint Explorer to show Active, Archived, or All sprints

**Independent Test**: Click filter dropdown and verify sprint list updates according to selection

### Implementation for User Story 4

- [ ] T031 [US4] Add filter state property to SprintTreeProvider in extension/src/views/treeview/SprintTreeProvider.ts
- [ ] T032 [US4] Create filter sprints command in extension/src/commands/filterSprints.ts using Quick Pick
- [ ] T033 [US4] Add `orchestra.filterSprints` command registration in extension/src/extension.ts
- [ ] T034 [US4] Add filter button to Sprint Explorer header in extension/package.json (view/title menu)
- [ ] T035 [US4] Persist filter state using workspaceState in extension/src/views/treeview/SprintTreeProvider.ts
- [ ] T036 [US4] Update getChildren() in SprintTreeProvider to filter sprints based on current filter state
- [ ] T037 [US4] Add visual indicator for archived sprints in tree view (archive icon or muted styling)
- [ ] T038 [US4] Update viewItem values to include archived status (sprint-inactive-archived)

**Checkpoint**: Filter dropdown works; filter state persists across sessions; archived sprints show visual indicator

---

## Phase 7: User Story 5 - Refresh Current Task Card (Priority: P1)

**Goal**: Refresh button on Current Task card loads true state from database

**Independent Test**: Modify task status via MCP tool, click refresh, verify updated status shown

### Implementation for User Story 5

- [ ] T039 [US5] Add refresh button to Current Task webview HTML in extension/src/views/webview/currentTaskTemplate.ts
- [ ] T040 [US5] Add refresh message handler in CurrentTaskViewProvider in extension/src/views/webview/CurrentTaskViewProvider.ts
- [ ] T041 [US5] Ensure refresh bypasses any caching and reads directly from database
- [ ] T042 [US5] Add CSS styling for refresh button to match VS Code theme

**Checkpoint**: Refresh button works; clicking it shows fresh data from database

---

## Phase 8: User Story 6 - Refresh Sprint Explorer (Priority: P1)

**Goal**: Sprint Explorer refresh button reloads all data directly from database

**Independent Test**: Modify task status via MCP tool, click Sprint Explorer refresh, verify all statuses update

### Implementation for User Story 6

- [ ] T043 [US6] Verify existing refresh command `orchestra.refreshStatus` clears all caches before reloading
- [ ] T044 [US6] Ensure `refresh()` in SprintTreeProvider invalidates `_codeReviewStatusByTaskId` cache
- [ ] T045 [US6] Add logging to identify when refresh is triggered vs signal-based update
- [ ] T045a [US6] Add logging in DatabaseWatcher when fallback polling detects change that signal file missed (FR-043)

**Checkpoint**: Sprint Explorer refresh reliably shows current database state

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T046 [P] Update extension/package.json with all new commands and menu contributions
- [ ] T047 [P] Add JSDoc comments to new handlers and commands
- [ ] T048 Verify Current Task card always shows active sprint tasks only (FR-033a)
- [ ] T049 [P] Run build and verify no TypeScript errors
- [ ] T050 Manual testing: complete walkthrough of all user stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 for schema - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 for signal fixes - critical path
- **User Stories 2-6 (Phases 4-8)**: All depend on Phase 2 completion; can proceed in parallel after US1
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

| Story    | Depends On              | Can Parallel With    |
| -------- | ----------------------- | -------------------- |
| US1 (P0) | Phase 2                 | None - must be first |
| US2 (P1) | US1                     | US3, US4, US5, US6   |
| US3 (P1) | US1, US2 (for viewItem) | US4, US5, US6        |
| US4 (P1) | US1                     | US2, US3, US5, US6   |
| US5 (P1) | US1                     | US2, US3, US4, US6   |
| US6 (P1) | US1                     | US2, US3, US4, US5   |

### Within Each User Story

- MCP handler before extension command
- Command before menu contribution
- Core implementation before UI integration

### Parallel Opportunities

```bash
# Phase 2 - all signal fixes can run in parallel:
T004 through T015 (12 handlers)

# Phase 4 & 5 - archive/unarchive handlers:
T020 [US2] and T025 [US3] can run in parallel

# Phase 9 - all polish tasks marked [P]:
T046, T047, T049 can run in parallel
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (database schema)
2. Complete Phase 2: Foundational (signal fixes) ← **Root cause fix**
3. Complete Phase 3: User Story 1 (status consistency)
4. **STOP and VALIDATE**: Test that UI updates reliably
5. This alone delivers significant value

### Incremental Delivery

1. Phase 1 + 2 → Signal mechanism now reliable
2. Add US1 → Test UI consistency → **MVP Complete!**
3. Add US2 + US3 → Archive/unarchive works
4. Add US4 → Filter dropdown works
5. Add US5 + US6 → Manual refresh works
6. Each story adds value without breaking previous stories

---

## Summary

| Phase           | Tasks  | Parallel | Description             |
| --------------- | ------ | -------- | ----------------------- |
| 1: Setup        | 3      | 1        | Database schema changes |
| 2: Foundational | 12     | 12       | Signal file fixes (P0)  |
| 3: US1          | 5      | 0        | Task status consistency |
| 4: US2          | 5      | 1        | Archive sprint          |
| 5: US3          | 6      | 1        | Unarchive sprint        |
| 6: US4          | 8      | 0        | Filter view             |
| 7: US5          | 4      | 0        | Refresh Current Task    |
| 8: US6          | 4      | 0        | Refresh Sprint Explorer |
| 9: Polish       | 5      | 3        | Final cleanup           |
| **Total**       | **52** | **18**   |                         |

**Parallel Opportunities**: 18 tasks can run in parallel (36%)
**Independent Test Criteria**: Each user story has clear verification steps
**Suggested MVP**: Complete through Phase 3 (User Story 1) for immediate value
