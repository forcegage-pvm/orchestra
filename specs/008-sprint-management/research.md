# Research: Sprint Management & UI Consistency

**Feature Branch**: `008-sprint-management`  
**Created**: 2026-01-23  
**Status**: Complete

## Overview

This document captures research findings that inform the implementation plan for sprint archive management, filtering, and UI consistency improvements.

---

## Research Topic 1: Signal File Mechanism Analysis

### Context

The current `.signal` file mechanism is unreliable, causing inconsistent UI updates across the Sprint Explorer tree view, Current Task card, and Task Detail panels.

### Findings

#### Current Implementation

- **Signal File Location**: `.orchestra/.signal` - contains a Unix timestamp
- **Writer**: `writeSignal()` in `src/mcp-server/db-signal.ts`
- **Reader**: `DatabaseWatcher` in `extension/src/database/watcher.ts`
- **Detection**: VS Code `FileSystemWatcher` + 10-second polling fallback

#### Handlers MISSING `writeSignal()` Calls

Based on grep analysis of `src/mcp-server/handlers/`:

| Handler                           | Modifies Database | Has writeSignal() |
| --------------------------------- | ----------------- | ----------------- |
| `complete-task.ts`                | ✅                | ❌ MISSING        |
| `update-task.ts`                  | ✅                | ❌ MISSING        |
| `reopen-task.ts`                  | ✅                | ❌ MISSING        |
| `submit-verification-judgment.ts` | ✅                | ❌ MISSING        |
| `set-active-sprint.ts`            | ✅                | ❌ MISSING        |
| `add-task.ts`                     | ✅                | ❌ MISSING        |
| `add-phase.ts`                    | ✅                | ❌ MISSING        |
| `remove-task.ts`                  | ✅                | ❌ MISSING        |
| `fix-code-review.ts`              | ✅                | ❌ MISSING        |
| `submit-code-review.ts`           | ✅                | ❌ MISSING        |
| `escalate-task.ts`                | ✅                | ❌ MISSING        |
| `enhance-feedback.ts`             | ✅                | ❌ MISSING        |

#### Handlers WITH `writeSignal()` Calls (correct)

- `configure-sprint.ts` ✅
- `prepare-task.ts` ✅
- `signal-completion.ts` ✅
- `approve-sprint.ts` ✅
- `approve-handover.ts` ✅
- `reject-sprint.ts` ✅
- `reject-handover.ts` ✅
- `resubmit-sprint.ts` ✅
- `resubmit-handover.ts` ✅

### Decision

**Add `writeSignal()` to all database-mutating handlers** - This is the root cause of UI inconsistency. A systematic audit and fix of all handlers is required.

### Rationale

The signal file mechanism is sound in design but incomplete in implementation. Rather than replacing it, we should:

1. Add missing `writeSignal()` calls to all handlers
2. Consider adding sequence numbers to detect missed signals
3. Maintain the 10-second polling as a fallback

### Alternatives Considered

- **Replace with websocket**: Rejected - adds complexity, MCP server doesn't maintain connection
- **Use file locking**: Rejected - cross-process file locking is problematic on Windows
- **Poll more frequently**: Rejected - battery/CPU impact; doesn't solve root cause

---

## Research Topic 2: Sprint Archive Database Schema

### Context

Need to track which sprints are archived without losing any sprint data.

### Findings

#### Current Schema (from `src/db/schema.ts`)

```typescript
export const sprints = sqliteTable("sprints", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  workflow_step: text("workflow_step").notNull(),
  config: text("config"),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  completed_at: text("completed_at"),
});
```

#### Proposed Addition

```typescript
is_archived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
```

#### Migration Considerations

- SQLite supports `ALTER TABLE ADD COLUMN` with default values
- Drizzle ORM migration pattern: add to schema, run `npm run db:generate`
- Backward compatible: existing sprints get `is_archived = false`

### Decision

**Add `is_archived` boolean column with default `false`** - Simple, backward-compatible, follows existing pattern for `is_active`.

### Rationale

- Mirrors the `is_active` pattern already in use
- Boolean is simpler than adding a separate `archived_at` timestamp
- Default `false` ensures all existing sprints remain visible
- Index on `is_archived` enables efficient filtering

### Alternatives Considered

- **Soft delete with `deleted_at`**: Rejected - archive is not delete; different semantics
- **Separate `archived_sprints` table**: Rejected - complicates queries, foreign key issues
- **Use `status = 'ARCHIVED'`**: Rejected - status is workflow state, not visibility

---

## Research Topic 3: Filter UI Pattern for TreeView

### Context

Need to add filter dropdown to Sprint Explorer to switch between Active/Archived/All views.

### Findings

#### VS Code TreeView Header Patterns

VS Code TreeView headers support:

1. **view/title menu** - icons in the header bar (used for refresh, settings)
2. **Quick Pick** - modal dropdown for selection
3. **Custom webview** - full control but complex

#### Current Sprint Explorer Header

```json
{
  "command": "orchestra.refreshStatus",
  "when": "view == orchestra.sprintExplorer",
  "group": "navigation"
},
{
  "command": "orchestra.openSprintSettings",
  "when": "view == orchestra.sprintExplorer",
  "group": "navigation"
}
```

#### Filter Options Pattern

Similar extensions (GitLens, GitHub PRs) use Quick Pick with:

- Single dropdown command in header
- State persisted via VS Code configuration or workspaceState
- Filter icon changes to indicate non-default state

### Decision

**Single dropdown button using Quick Pick** - Matches VS Code conventions, simple implementation.

### Rationale

- Quick Pick is native VS Code UI, consistent UX
- Single button reduces header clutter
- State persistence via `workspaceState.update()` is simple
- Filter icon can show badge/indicator for non-default state

### Alternatives Considered

- **Three separate toggle buttons**: Rejected - clutters header, confusing state
- **Webview header replacement**: Rejected - overcomplicated for filter functionality
- **Context menu only**: Rejected - poor discoverability

---

## Research Topic 4: Auto-Unarchive on Set Active

### Context

Per design decision DD-002, setting an archived sprint as active should auto-unarchive it.

### Findings

#### Current `set-active-sprint.ts` Flow

1. Validate sprint exists
2. Set all sprints `is_active = false`
3. Set target sprint `is_active = true`
4. Return success

#### Proposed Additional Logic

```typescript
// After setting is_active = true:
if (sprint.is_archived) {
  await db
    .update(sprints)
    .set({ is_archived: false, updated_at: new Date().toISOString() })
    .where(eq(sprints.id, sprintId));
}
```

### Decision

**Auto-unarchive when setting archived sprint as active** - Follows principle of least surprise.

### Rationale

- An "active" sprint that's also "archived" is contradictory
- User intent when setting active is to work on it - implying unarchive
- Avoids confusing state where active sprint is hidden by archive filter

### Alternatives Considered

- **Error on setting archived sprint active**: Rejected - adds friction, requires extra step
- **Prompt user to confirm unarchive**: Rejected - MCP tools don't have interactive prompts

---

## Research Topic 5: Backward Compatibility for Signal File

### Context

Per design decision DD-005, we may add sequence numbers to the signal file for improved change detection.

### Findings

#### Current Signal File Format

```
1737654321000
```

Just a Unix timestamp in milliseconds.

#### Proposed Enhanced Format

```
1737654321000:42
```

Timestamp followed by sequence number.

#### Parsing Strategy

```typescript
const content = fs.readFileSync(signalPath, "utf8");
const [timestamp, sequence] = content.split(":");
// If no colon, sequence is undefined (legacy format)
```

### Decision

**Graceful backward compatibility** - Parse new format when present, fall back to timestamp-only for legacy.

### Rationale

- No breaking change for existing installations
- Extension can detect old vs new format
- Sequence number enables detection of rapid successive changes

### Alternatives Considered

- **Version header in file**: Rejected - overengineered for simple use case
- **Separate sequence file**: Rejected - adds file management complexity
- **JSON format**: Rejected - overhead for 2 fields

---

## Summary of Decisions

| Topic                | Decision                                              | Impact                |
| -------------------- | ----------------------------------------------------- | --------------------- |
| Signal Mechanism     | Audit all handlers, add missing `writeSignal()` calls | P0 - Root cause fix   |
| Archive Schema       | Add `is_archived` boolean column                      | P1 - Simple migration |
| Filter UI            | Single Quick Pick dropdown button                     | P1 - Standard pattern |
| Auto-Unarchive       | Unarchive when setting as active                      | P1 - Better UX        |
| Signal Compatibility | Graceful parsing of new format                        | P2 - Future-proof     |

---

## Open Questions (Resolved)

All NEEDS CLARIFICATION items from Technical Context have been resolved through this research:

1. ✅ **Which handlers are missing writeSignal()?** - Full audit completed above
2. ✅ **Best migration approach for is_archived?** - Standard Drizzle migration
3. ✅ **Filter UI pattern?** - Quick Pick dropdown
4. ✅ **Auto-unarchive behavior?** - Yes, on set-active
5. ✅ **Signal file format change?** - Optional sequence with graceful fallback
