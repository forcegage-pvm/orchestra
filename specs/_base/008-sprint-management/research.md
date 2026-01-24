# Sprint Management - Research Notes

**Spec**: 008-sprint-management  
**Created**: 2026-01-23

## Current Implementation Analysis

### Signal File Mechanism

**Location**: `extension/src/database/watcher.ts`

The current `DatabaseWatcher` implementation uses a dual approach:

1. **Primary**: File system watcher on `.orchestra/.signal` file
2. **Fallback**: 10-second polling interval checking database mtime

```typescript
// Current signal file handling
this.signalWatcher.onDidChange((uri) => {
  console.log(`[Orchestra] Signal file changed: ${uri.fsPath}`);
  this.handleChange();
});
```

**Issues Identified**:

1. Signal file content is just a timestamp - no sequence tracking
2. Not all MCP handlers write to signal file
3. VS Code file watcher can miss rapid successive changes
4. No detection of missed signals

### Sprint Tree Provider

**Location**: `extension/src/views/treeview/SprintTreeProvider.ts`

Current implementation:

- Subscribes to `DatabaseWatcher.onDidChange`
- Caches code review status per task
- No archive filtering support
- `getAllSprints()` returns all sprints unconditionally

```typescript
// Current cache that can become stale
private _codeReviewStatusByTaskId: Map<number, string> = new Map();
private _codeReviewStatusSprintId: string | null = null;
```

### Current Task View Provider

**Location**: `extension/src/views/webview/CurrentTaskViewProvider.ts`

Current implementation:

- Subscribes to `DatabaseWatcher.onDidChange`
- Uses `getCurrentTask()` → `getNextPendingTask()` fallback
- No explicit refresh button command
- No cache invalidation on refresh

### Database Schema

**Location**: `src/db/schema.ts`

Current sprints table columns:

- `id`, `name`, `status`, `workflow_step`, `config`
- `is_active`, `created_at`, `updated_at`, `completed_at`
- **Missing**: `is_archived`

---

## VS Code Tree View Filter Patterns

### Option 1: View Title Buttons (Recommended)

Use `viewsWelcome` and `view/title` contributions:

```json
{
  "menus": {
    "view/title": [
      {
        "command": "orchestra.setSprintFilter.active",
        "when": "view == orchestra.sprintExplorer",
        "group": "navigation@1"
      }
    ]
  }
}
```

**Pros**: Standard VS Code pattern, discoverable
**Cons**: Limited space for multiple toggles

### Option 2: Quick Pick Filter

Use command palette quick pick:

```typescript
const filter = await vscode.window.showQuickPick([
  { label: "Active Sprints", value: "active" },
  { label: "Archived Sprints", value: "archived" },
  { label: "All Sprints", value: "all" },
]);
```

**Pros**: Can show more options
**Cons**: Extra click, less discoverable

### Option 3: Context Value Toggle

Use single toggle button that cycles through states:

```json
{
  "command": "orchestra.cycleSprintFilter",
  "title": "Filter: Active",
  "icon": "$(filter)"
}
```

**Pros**: Single button, saves space
**Cons**: State not immediately visible

**Recommendation**: Combination approach - primary filter button in view title that opens quick pick for filter selection, with current filter shown in button tooltip.

---

## Alternatives to Signal File

### Option A: SQLite Change Notification (Not Viable)

SQLite doesn't support native change notifications. The `sqlite3_update_hook` API is per-connection and doesn't work across processes.

### Option B: File Locking with Notification (Complex)

Use a lock file with PID and notification mechanism. Too complex for the benefit.

### Option C: Enhanced Signal File (Recommended)

Keep signal file approach but enhance:

1. Add sequence numbers for missed signal detection
2. Ensure ALL handlers write signals
3. JSON format for extensibility

```json
{ "seq": 42, "ts": 1706012345678, "op": "task_update", "task_id": 5 }
```

### Option D: IPC via Named Pipes (Overkill)

Use inter-process communication. Too complex for this use case.

**Recommendation**: Option C - Enhanced Signal File

---

## Refresh Button Best Practices

### Current Task Card

The Current Task card is a WebviewView. Refresh can be triggered by:

1. View title action (command button)
2. Webview message from refresh button in HTML

**Recommendation**: Both - view title button for quick access, inline button for discoverability.

### Sprint Explorer

TreeDataProvider supports `refresh()` method which fires `onDidChangeTreeData` event.

Current refresh command: `orchestra.refreshStatus`

**Enhancement needed**: Ensure refresh clears ALL caches, not just fires the event.

---

## UI Consistency Patterns

### Status Display Centralization

All components should use `getStatusDisplay()` from `extension/src/views/statusTranslation.ts`:

```typescript
export function getStatusDisplay(status: string): {
  label: string;
  icon: string;
  color: ThemeColor;
};
```

### Event Subscription Pattern

All UI components should:

1. Subscribe to `DatabaseWatcher.onDidChange`
2. Clear local caches on change event
3. Re-render with fresh database data

Current subscribers:

- `SprintTreeProvider` ✓
- `CurrentTaskViewProvider` ✓
- `TaskDetailPanel` - needs verification
- `CodeReviewTreeProvider` - needs verification

---

## Archive Feature Precedents

### VS Code Extensions with Archive Pattern

1. **GitHub Pull Requests**: Has "Hidden" filter for closed PRs
2. **GitLens**: Has stash archive functionality
3. **Project Manager**: Has project archive feature

Common patterns:

- Visual indicator (icon change, muted color)
- Filter in view header
- Context menu to archive/unarchive
- Prevent archiving active/current item

---

## Performance Considerations

### Database Query Impact

Adding `is_archived` filter:

- Indexed column = minimal query overhead
- `WHERE is_archived = 0` is efficient
- No need for pagination with typical sprint counts (<100)

### Tree View Rendering

Filtering happens in `getChildren()`:

- Only filtered sprints are rendered
- No lazy loading needed for typical sprint counts
- Archive indicator is simple icon swap

### Signal File Overhead

JSON parsing overhead:

- Signal file is tiny (<100 bytes)
- Parse once per change event
- Negligible compared to database queries

---

## Testing Strategy

### Unit Tests

1. **Schema migration**: Verify `is_archived` column added
2. **Query functions**: Test all filter combinations
3. **Archive validation**: Cannot archive active sprint
4. **Signal parsing**: Handle old format gracefully

### Integration Tests

1. **MCP tools**: Archive/unarchive via tools
2. **UI commands**: Filter toggle commands work
3. **Persistence**: Filter survives restart

### Manual Testing

1. Archive sprint → disappears from default view
2. Switch filter → see archived sprints
3. Unarchive → appears in default view
4. Refresh buttons → load fresh data
5. External change → UI updates correctly
