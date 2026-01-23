# TD-016: Database Change Notification Architecture

**Created**: 2025-12-12
**Priority**: MEDIUM
**Category**: Architecture Limitation
**Discovered During**: Sprint 002 - Extension TreeView auto-refresh debugging

## Problem Statement

The VS Code extension TreeView does not auto-update when the MCP server writes to the database. Users must manually click "Refresh" to see task status changes.

**Root cause**: SQLite has no cross-process change notification mechanism.

## Current Architecture

```
┌─────────────────────────┐     ┌─────────────────────────┐
│   VS Code Extension     │     │      MCP Server         │
│   (extension host)      │     │   (child process)       │
│                         │     │                         │
│  ┌─────────────────┐    │     │  ┌─────────────────┐    │
│  │ better-sqlite3  │    │     │  │ better-sqlite3  │    │
│  │  (connection 1) │    │     │  │  (connection 2) │    │
│  └────────┬────────┘    │     │  └────────┬────────┘    │
│           │             │     │           │             │
└───────────┼─────────────┘     └───────────┼─────────────┘
            │                               │
            └───────────┬───────────────────┘
                        ▼
              ┌─────────────────┐
              │  orchestra.db   │
              └─────────────────┘
```

The MCP server runs as a child process spawned by VS Code for Copilot Chat. It communicates via stdio (MCP protocol requirement). Both processes access the same SQLite database file.

## SQLite Limitation Analysis

SQLite is an *embedded* database designed for single-process use. It has no server component.

### What SQLite Offers (Same Connection Only)

| Mechanism | Purpose | Cross-Process? |
|-----------|---------|----------------|
| `sqlite3_update_hook()` | C callback on row change | ❌ No |
| `sqlite3_commit_hook()` | C callback on commit | ❌ No |
| SQL Triggers | Execute SQL on change | ❌ No |

### What better-sqlite3 Exposes

The `better-sqlite3` Node.js binding doesn't expose `update_hook` - it's a synchronous API that doesn't fit callback patterns.

### Comparison to Client-Server Databases

| Database | Cross-Process Notification |
|----------|---------------------------|
| PostgreSQL | `LISTEN/NOTIFY` ✅ |
| MySQL | Binlog streaming ✅ |
| MongoDB | Change Streams ✅ |
| Redis | Pub/Sub ✅ |
| **SQLite** | ❌ Nothing |

## Current Workaround

Implemented 2-second polling fallback in `extension/src/database/watcher.ts`:

```typescript
// Poll every 2 seconds checking mtime of .db and .db-wal files
this.pollTimer = setInterval(() => {
  const currentMtime = this.getLatestMtime();
  if (currentMtime > this.lastMtime) {
    this.lastMtime = currentMtime;
    this.handleChange();
  }
}, 2000);
```

**Issues with this approach:**
- 2 second latency before UI updates
- Constant file stat operations (minor CPU overhead)
- Feels "sluggish" compared to instant updates
- Not architecturally clean

## Alternative Solutions Considered

### Option 1: Signal File (Recommended for Future)

**MCP server writes a signal file after any database write:**
```typescript
// In every MCP handler after db.run()
fs.writeFileSync('.orchestra/.signal', Date.now().toString());
```

**Extension watches the signal file:**
```typescript
// Signal files trigger file watchers reliably (unlike binary .db files)
vscode.workspace.createFileSystemWatcher('.orchestra/.signal');
```

**Pros:**
- Near-instant updates (~50ms)
- Simple implementation (~20 lines total)
- File watchers work reliably on small text files

**Cons:**
- Extra file write on every DB operation
- Signal file could get out of sync

### Option 2: Change Log Table + Efficient Poll

```sql
-- Add trigger to track last change time
CREATE TRIGGER track_changes AFTER UPDATE ON tasks
BEGIN
  UPDATE meta SET value = datetime('now') WHERE key = 'last_change';
END;
```

**Extension polls the meta table:**
```typescript
const lastChange = db.prepare("SELECT value FROM meta WHERE key = 'last_change'").get();
```

**Pros:**
- Semantic - knows something changed
- Single quick query vs file stats
- Could track which tables changed

**Cons:**
- Still polling (just more efficient)
- Requires trigger setup on every table

### Option 3: Switch to PostgreSQL

Use a real client-server database with `LISTEN/NOTIFY`.

**Pros:**
- Proper cross-process notification
- Better concurrency primitives
- Industry standard

**Cons:**
- Requires PostgreSQL installation
- Massive overkill for local dev tool
- Breaks "just works" single-file database

### Option 4: IPC Channel

MCP server sends notification to extension via Node IPC or named pipe.

**Pros:**
- Instant notification
- No file system involvement

**Cons:**
- Complex to set up
- MCP server would need to know extension is listening
- Error handling for disconnection

### Option 5: HTTP Webhook

MCP server calls a local HTTP endpoint exposed by extension.

**Pros:**
- Well-understood pattern
- Decoupled

**Cons:**
- Extension would need to run HTTP server
- Port management
- Firewall issues

## Recommendation

**Short term (current):** Keep 2-second polling. It works and 2s latency is acceptable for human supervisor use case.

**Medium term:** Implement signal file approach. Simple, effective, near-instant.

**Long term consideration:** If Orchestra scales to multi-user or server deployment, reconsider PostgreSQL.

## Implementation Notes for Signal File Approach

### MCP Server Changes

1. Create utility function:
```typescript
// src/core/signal.ts
export function notifyDatabaseChange(): void {
  const signalPath = path.join(process.cwd(), '.orchestra', '.signal');
  fs.writeFileSync(signalPath, Date.now().toString());
}
```

2. Call after every write operation in handlers (or wrap in db helper)

### Extension Changes

1. Update `DatabaseWatcher` to watch `.orchestra/.signal` instead of polling
2. Remove polling timer
3. Keep file watcher on `.signal` file only

### Estimated Effort

- MCP server: Add `notifyDatabaseChange()` calls to ~26 handlers
- Extension: Simplify watcher (remove polling, watch .signal)
- Total: ~2 hours

## Files Affected

- `extension/src/database/watcher.ts` - Current polling implementation
- `src/mcp-server/handlers/*.ts` - Would need signal writes
- `.orchestra/.signal` - New file (should be in .gitignore)

## Related Issues

- TreeView doesn't auto-update (user complaint)
- StatusBar doesn't auto-update (same root cause)
- Dashboard webview doesn't auto-update (same root cause)

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-12 | Implement 2s polling | Quick fix to unblock users |
| 2025-12-12 | Log as TD for future | Signal file approach better but needs design |

## Success Criteria (Future Implementation)

- [ ] TreeView updates within 200ms of database change
- [ ] No polling timers running
- [ ] Signal file approach implemented and tested
- [ ] Works reliably on Windows, macOS, Linux
