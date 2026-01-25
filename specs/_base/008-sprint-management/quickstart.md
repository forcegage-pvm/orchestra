# Sprint Management - Quick Start Guide

**Spec**: 008-sprint-management  
**Created**: 2026-01-23

## Overview

This specification adds sprint archive management, filtering, and improved UI consistency to Orchestra.

## Key Features

### 1. Sprint Archiving

Archive old sprints to keep the Sprint Explorer clean:

```
Right-click sprint → "Archive Sprint"
```

**Rules**:

- Cannot archive the active sprint
- Archived sprints hidden by default
- Unarchive anytime to restore visibility

### 2. Sprint Filter

Filter sprints in the Sprint Explorer:

| Filter               | Shows                 |
| -------------------- | --------------------- |
| **Active** (default) | Non-archived sprints  |
| **Archived**         | Only archived sprints |
| **All**              | All sprints           |

Filter buttons appear in the Sprint Explorer header.

### 3. Refresh Buttons

- **Current Task Card**: Refresh button reloads task from database
- **Sprint Explorer**: Refresh button reloads all sprint data

Use refresh when UI seems stale or after external MCP operations.

## Implementation Priority

### Phase 1 (Critical)

- [ ] Database schema: Add `is_archived` column
- [ ] Query functions with filter support
- [ ] Current Task refresh button

### Phase 2 (Important)

- [ ] Filter toggle UI in Sprint Explorer
- [ ] Archive/Unarchive context menu actions
- [ ] Signal file audit for consistency

### Phase 3 (Enhancement)

- [ ] Sequence tracking for signal reliability
- [ ] Auto-refresh on task completion
- [ ] Visual polish for archived sprints

## Files to Modify

### Database Layer

- `src/db/schema.ts` - Add `is_archived` column
- `src/db/migrations.ts` - Add migration
- `src/db/queries.ts` - Add filter support

### MCP Server

- `src/mcp-server/tools.ts` - Register archive tools
- `src/mcp-server/handlers/` - Add archive handlers
- All handlers - Audit signal file writes

### Extension

- `extension/package.json` - Commands and menus
- `extension/src/views/treeview/SprintTreeProvider.ts` - Filter support
- `extension/src/views/webview/CurrentTaskViewProvider.ts` - Refresh command
- `extension/src/database/watcher.ts` - Enhanced signal handling
- `extension/src/database/queries.ts` - Filter support (extension copy)

## Testing Checklist

- [ ] Archive sprint via context menu
- [ ] Unarchive sprint via context menu
- [ ] Cannot archive active sprint
- [ ] Filter toggles work correctly
- [ ] Filter persists across restart
- [ ] Refresh buttons load fresh data
- [ ] Task status updates consistently
- [ ] Archived sprints show visual indicator

## Related Specs

- **007-interface-contract-validation**: Current active sprint
- **006-code-review-fix-workflow**: Code review integration
- **004-controller-agent**: Sprint review states
