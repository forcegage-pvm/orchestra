# Extension Commands Contract: Sprint Management

**Feature Branch**: `008-sprint-management`  
**Created**: 2026-01-23

## Overview

This document defines the VS Code extension command contracts for sprint management.

---

## Command: `orchestra.archiveSprint`

Archive the selected sprint from the Sprint Explorer context menu.

### Activation

- **Where**: Sprint Explorer tree view context menu
- **Condition**: `viewItem =~ /^sprint-inactive/` AND NOT `viewItem =~ /archived/`
- **Icon**: `$(archive)`

### Input

```typescript
interface ArchiveSprintArgs {
  sprintId: string; // From tree item context
}
```

### Behavior

1. Validate sprint is not active
2. Call MCP tool `archive_sprint` or direct database update
3. Write signal file to trigger UI refresh
4. Show info message: "Sprint '{name}' archived"

### Error Handling

| Condition        | Action                                         |
| ---------------- | ---------------------------------------------- |
| Sprint is active | Show error: "Cannot archive the active sprint" |
| Database error   | Show error with details                        |

---

## Command: `orchestra.unarchiveSprint`

Unarchive the selected sprint from the Sprint Explorer context menu.

### Activation

- **Where**: Sprint Explorer tree view context menu
- **Condition**: `viewItem =~ /sprint-archived/`
- **Icon**: `$(package)`

### Input

```typescript
interface UnarchiveSprintArgs {
  sprintId: string; // From tree item context
}
```

### Behavior

1. Call MCP tool `unarchive_sprint` or direct database update
2. Write signal file to trigger UI refresh
3. Show info message: "Sprint '{name}' unarchived"

---

## Command: `orchestra.filterSprints`

Open Quick Pick to select sprint filter.

### Activation

- **Where**: Sprint Explorer header (view/title menu)
- **Group**: `navigation`
- **Icon**: `$(filter)`

### Input

None (command opens Quick Pick)

### Behavior

1. Show Quick Pick with options:
   - Active (default) - Show non-archived sprints
   - Archived - Show archived sprints only
   - All - Show all sprints
2. On selection, update filter state in workspaceState
3. Refresh Sprint Explorer tree view

### State Persistence

```typescript
// Key: "sprintFilter"
// Values: "active" | "archived" | "all"
await context.workspaceState.update("sprintFilter", selectedFilter);
```

---

## Command: `orchestra.refreshCurrentTask`

Force refresh the Current Task card from database.

### Activation

- **Where**: Current Task webview header button
- **Icon**: `$(refresh)`

### Input

None

### Behavior

1. Query database directly for current task state
2. Update webview with fresh data
3. Clear any cached state

### Implementation

```typescript
// In CurrentTaskViewProvider
public refresh(): void {
  // Force re-query from database
  this._refresh();
}

// Called from webview message handler
case "refresh":
  this.refresh();
  break;
```

---

## Menu Contributions

### view/title (Sprint Explorer Header)

```json
{
  "command": "orchestra.filterSprints",
  "when": "view == orchestra.sprintExplorer",
  "group": "navigation"
}
```

### view/item/context (Sprint Context Menu)

```json
{
  "command": "orchestra.archiveSprint",
  "when": "view == orchestra.sprintExplorer && viewItem =~ /^sprint-inactive(?!.*archived)/",
  "group": "navigation@5"
},
{
  "command": "orchestra.unarchiveSprint",
  "when": "view == orchestra.sprintExplorer && viewItem =~ /sprint-archived/",
  "group": "navigation@5"
}
```

---

## viewItem Values

| Value                            | Description                     | Available Commands                      |
| -------------------------------- | ------------------------------- | --------------------------------------- |
| `sprint-active`                  | Currently active sprint         | Set as Active (disabled), Open Settings |
| `sprint-inactive`                | Non-active, non-archived sprint | Set as Active, Archive                  |
| `sprint-inactive-archived`       | Non-active, archived sprint     | Set as Active, Unarchive                |
| `sprint-pending-review`          | Sprint awaiting review          | Launch Controller                       |
| `sprint-pending-review-archived` | Archived sprint awaiting review | Launch Controller, Unarchive            |

---

## Configuration

### New Configuration Property

```json
{
  "orchestra.sprintFilter": {
    "type": "string",
    "enum": ["active", "archived", "all"],
    "default": "active",
    "description": "Default filter for Sprint Explorer: 'active' shows non-archived sprints, 'archived' shows only archived, 'all' shows everything"
  }
}
```

Note: Using `workspaceState` for per-workspace persistence is preferred over global configuration.
