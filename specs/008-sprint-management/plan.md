# Implementation Plan: Sprint Management & UI Consistency

**Branch**: `008-sprint-management` | **Date**: 2026-01-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-sprint-management/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature addresses three critical areas of the Orchestra VS Code extension:

1. **Sprint Archive Management** - Add `is_archived` column to the sprints table, with archive/unarchive MCP tools and context menu commands
2. **Sprint Explorer Filtering** - Single dropdown filter in treeview header to show Active (default), Archived, or All sprints with persisted state
3. **Task Status UI Consistency** - Fix unreliable `.signal` file mechanism by auditing all MCP handlers for missing `writeSignal()` calls, adding sequence tracking, and providing manual refresh capabilities

Technical approach:

- Database migration to add `is_archived` boolean column (default false)
- New MCP tools: `archive_sprint`, `unarchive_sprint` with auto-unarchive on set-active
- Extension filter state persisted via VS Code configuration API
- Audit and fix all 48 MCP handlers to ensure `writeSignal()` is called after database mutations
- Add refresh commands for Current Task card and Sprint Explorer

## Technical Context

**Language/Version**: TypeScript 5.x (ESM with `exactOptionalPropertyTypes: true`)  
**Primary Dependencies**: Drizzle ORM, better-sqlite3, VS Code Extension API (TreeDataProvider, WebviewViewProvider, FileSystemWatcher)  
**Storage**: SQLite database at `.orchestra/orchestra.db`  
**Testing**: Vitest (with shared database cache pattern per `test/setup/db-cache.ts`)  
**Target Platform**: VS Code Extension (Electron runtime) + Node.js MCP Server bundle  
**Project Type**: VS Code Extension with embedded MCP server  
**Performance Goals**: UI updates within 1 second of database changes; <50ms signal file detection latency  
**Constraints**: Signal file mechanism is cross-process (MCP server → extension); native module compatibility  
**Scale/Scope**: Typical workspace has 1-10 sprints; 5-50 tasks per sprint; 1-10 phases per sprint

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### I. Core-First Architecture ✅

- New archive/unarchive logic will be implemented in MCP handlers (`src/mcp-server/handlers/`)
- Extension UI commands will be thin wrappers that invoke MCP tools or database queries
- Shared query functions in `extension/src/database/queries.ts` already follow this pattern

### II. Hidden Verification (NON-NEGOTIABLE) ✅

- This feature does not affect the orchestrator/implementor trust boundary
- Archive status is metadata visible to all roles
- No changes to verification criteria paths

### III. Zod-Validated YAML ✅

- Not applicable - this feature uses SQLite database, not YAML config files
- New MCP tool inputs will use existing Zod schema patterns in handlers

### IV. Structured Error Hierarchy ✅

- New errors (if any) will extend `OrchestraError` with appropriate codes
- Archive validation errors will use `ValidationError` class

### V. ESM with Strict TypeScript ✅

- All imports will use `.js` extensions
- Optional properties will use conditional addition, not `undefined` assignment
- Unused variables will be prefixed with `_`

### VI. Extension Build & Packaging Discipline (NON-NEGOTIABLE) ✅

- No new native modules introduced
- Existing `better-sqlite3` build process unchanged
- Standard extension build via `extension/build.md`

**Gate Status**: ✅ PASSED - No violations detected

## Project Structure

### Documentation (this feature)

```text
specs/008-sprint-management/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── db/
│   ├── schema.ts           # UPDATE: Add is_archived column to sprints table
│   ├── migrations.ts       # UPDATE: Add migration for is_archived column
│   └── queries.ts          # UPDATE: Add filter parameter to getActiveSprint variants
└── mcp-server/
    ├── db-signal.ts        # REVIEW: Consider adding sequence number to signal
    ├── tools.ts            # UPDATE: Register archive_sprint, unarchive_sprint tools
    └── handlers/
        ├── archive-sprint.ts       # CREATE: Archive sprint handler
        ├── unarchive-sprint.ts     # CREATE: Unarchive sprint handler
        ├── set-active-sprint.ts    # UPDATE: Add auto-unarchive logic
        ├── complete-task.ts        # UPDATE: Add writeSignal() call
        ├── update-task.ts          # UPDATE: Add writeSignal() call
        ├── reopen-task.ts          # UPDATE: Add writeSignal() call
        └── submit-verification-judgment.ts  # UPDATE: Add writeSignal() call

extension/
├── package.json            # UPDATE: Add commands, menus for archive/unarchive/filter/refresh
└── src/
    ├── commands/
    │   ├── archiveSprint.ts        # CREATE: Archive sprint command
    │   ├── unarchiveSprint.ts      # CREATE: Unarchive sprint command
    │   └── refreshCurrentTask.ts   # CREATE: Refresh current task command
    ├── database/
    │   ├── queries.ts      # UPDATE: Add getAllSprints(filter) with archive support
    │   └── watcher.ts      # UPDATE: Consider sequence-based change detection
    └── views/
        ├── treeview/
        │   └── SprintTreeProvider.ts   # UPDATE: Add filter state, filtered data source
        └── webview/
            └── CurrentTaskViewProvider.ts  # UPDATE: Add refresh command handler

test/
├── mcp-server/
│   └── handlers/
│       ├── archive-sprint.test.ts      # CREATE: Archive handler tests
│       └── unarchive-sprint.test.ts    # CREATE: Unarchive handler tests
└── db/
    └── queries.test.ts     # UPDATE: Add filter query tests
```

**Structure Decision**: Orchestra uses a split architecture with MCP server logic in `src/` and VS Code extension in `extension/`. This feature follows the existing pattern where:

- Database schema/migrations live in `src/db/`
- MCP tool handlers live in `src/mcp-server/handlers/`
- Extension UI components live in `extension/src/views/`
- Extension commands live in `extension/src/commands/`

## Complexity Tracking

> No Constitution Check violations - this section is empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| N/A       | N/A        | N/A                                  |
