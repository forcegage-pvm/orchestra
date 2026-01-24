# Quick Start: Sprint Management & UI Consistency

**Feature Branch**: `008-sprint-management`  
**Created**: 2026-01-23

## Overview

Quick reference for implementing sprint archive management, filtering, and UI consistency improvements.

---

## Key Files to Modify

### Database Layer

| File                   | Change                                    | Priority |
| ---------------------- | ----------------------------------------- | -------- |
| `src/db/schema.ts`     | Add `is_archived` column to sprints table | P0       |
| `src/db/migrations.ts` | Add migration #18 for is_archived         | P0       |

### MCP Handlers (Signal Fix)

| File                                                      | Change                                    | Priority |
| --------------------------------------------------------- | ----------------------------------------- | -------- |
| `src/mcp-server/handlers/complete-task.ts`                | Add `writeSignal()` call                  | P0       |
| `src/mcp-server/handlers/update-task.ts`                  | Add `writeSignal()` call                  | P0       |
| `src/mcp-server/handlers/reopen-task.ts`                  | Add `writeSignal()` call                  | P0       |
| `src/mcp-server/handlers/submit-verification-judgment.ts` | Add `writeSignal()` call                  | P0       |
| `src/mcp-server/handlers/set-active-sprint.ts`            | Add `writeSignal()` call + auto-unarchive | P0       |
| `src/mcp-server/handlers/add-task.ts`                     | Add `writeSignal()` call                  | P0       |
| `src/mcp-server/handlers/add-phase.ts`                    | Add `writeSignal()` call                  | P0       |
| `src/mcp-server/handlers/remove-task.ts`                  | Add `writeSignal()` call                  | P0       |
| `src/mcp-server/handlers/escalate-task.ts`                | Add `writeSignal()` call                  | P0       |

### MCP Handlers (New)

| File                                          | Change                           | Priority |
| --------------------------------------------- | -------------------------------- | -------- |
| `src/mcp-server/handlers/archive-sprint.ts`   | CREATE: Archive sprint handler   | P1       |
| `src/mcp-server/handlers/unarchive-sprint.ts` | CREATE: Unarchive sprint handler | P1       |
| `src/mcp-server/tools.ts`                     | Register new tools               | P1       |

### Extension

| File                                                     | Change                                | Priority |
| -------------------------------------------------------- | ------------------------------------- | -------- |
| `extension/package.json`                                 | Add commands and menus                | P1       |
| `extension/src/views/treeview/SprintTreeProvider.ts`     | Add filter state and data source      | P1       |
| `extension/src/views/webview/CurrentTaskViewProvider.ts` | Add refresh command handler           | P1       |
| `extension/src/database/queries.ts`                      | Add filter parameter to getAllSprints | P1       |
| `extension/src/commands/archiveSprint.ts`                | CREATE: Archive command               | P1       |
| `extension/src/commands/unarchiveSprint.ts`              | CREATE: Unarchive command             | P1       |

---

## Implementation Patterns

### Adding writeSignal() to a Handler

```typescript
// At the top of the file:
import { writeSignal } from "../db-signal.js";

// At the end of the handler, before return:
writeSignal();
return { success: true, ... };
```

### Filter State in TreeProvider

```typescript
private _filter: SprintFilter = "active";

public async setFilter(filter: SprintFilter): Promise<void> {
  this._filter = filter;
  await this._context.workspaceState.update("sprintFilter", filter);
  this.refresh();
}

public getChildren(): TreeElement[] {
  const sprints = getAllSprints(this._workspaceRoot, this._filter);
  // ... map to tree elements
}
```

### Quick Pick Filter Command

```typescript
vscode.commands.registerCommand("orchestra.filterSprints", async () => {
  const options: vscode.QuickPickItem[] = [
    {
      label: "Active",
      description: "Show non-archived sprints",
      picked: filter === "active",
    },
    {
      label: "Archived",
      description: "Show archived sprints only",
      picked: filter === "archived",
    },
    { label: "All", description: "Show all sprints", picked: filter === "all" },
  ];
  const selected = await vscode.window.showQuickPick(options);
  if (selected) {
    sprintTreeProvider.setFilter(selected.label.toLowerCase() as SprintFilter);
  }
});
```

---

## Testing Checklist

### Signal Mechanism

- [ ] Verify `writeSignal()` is called in all mutating handlers
- [ ] Test that UI updates within 1 second of MCP tool completion
- [ ] Test rapid successive changes don't cause stale state

### Archive/Unarchive

- [ ] Archive inactive sprint succeeds
- [ ] Archive active sprint fails with error
- [ ] Unarchive sprint succeeds
- [ ] Set-active on archived sprint auto-unarchives

### Filter

- [ ] Filter defaults to "Active"
- [ ] Filter state persists across VS Code restarts
- [ ] Archived sprints only visible in "Archived" or "All" filter

### Refresh

- [ ] Current Task card refresh button reloads from database
- [ ] Sprint Explorer refresh button reloads all data

---

## Migration Notes

### Drizzle Migration Command

```bash
cd src/db
npx drizzle-kit generate:sqlite --schema=./schema.ts
```

### Manual Migration (if needed)

```sql
ALTER TABLE sprints ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
CREATE INDEX is_archived_idx ON sprints(is_archived);
```

---

## Commands Reference

| Command ID                     | Label            | Icon         | Context                             |
| ------------------------------ | ---------------- | ------------ | ----------------------------------- |
| `orchestra.archiveSprint`      | Archive Sprint   | `$(archive)` | Sprint context menu (inactive only) |
| `orchestra.unarchiveSprint`    | Unarchive Sprint | `$(package)` | Sprint context menu (archived only) |
| `orchestra.filterSprints`      | Filter Sprints   | `$(filter)`  | Sprint Explorer header              |
| `orchestra.refreshCurrentTask` | Refresh          | `$(refresh)` | Current Task card header            |

---

## Context Menu Visibility

| Command          | `viewItem` Condition                                      |
| ---------------- | --------------------------------------------------------- |
| Archive Sprint   | `sprint-inactive` AND NOT `sprint-archived`               |
| Unarchive Sprint | `sprint-archived`                                         |
| Set as Active    | `sprint-inactive` (includes archived with auto-unarchive) |
