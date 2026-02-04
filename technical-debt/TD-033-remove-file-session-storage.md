# TD-033: Remove File-Based Session Storage

**Status**: ✅ Completed  
**Date**: 2026-02-04  
**Priority**: Medium

## Problem

Orchestra was maintaining **dual session persistence**:

1. **Database** (SQLite) - `agent_sessions` and `session_events` tables
2. **File system** - JSON files in `.orchestra/sessions/`

This created:

- **Redundant storage**: 272+ session JSON files duplicating database data
- **Auto-save overhead**: Every state change triggered file I/O
- **Complexity**: Two systems to maintain and keep in sync
- **Lock file management**: File locking for concurrent access

The database already contains all necessary session data for UI and queries.

## Solution

Removed file-based session storage mechanism:

### Changes Made

1. **AgentSession.ts**
   - Removed all `triggerAutoSave()` calls from state change methods:
     - `recordFileChange()`
     - `incrementIteration()`
     - `pause()`, `stop()`, `resume()`
     - `complete()`, `fail()`
   - Removed `triggerAutoSave()` and `runAutoSave()` methods

2. **AgentRunner.ts**
   - Removed `SessionStorage` import
   - Added missing `AgentSessionInfo`, `SessionStatus`, `ToolCategory` imports
   - Deprecated `resumeFromStorage()` method (throws error)
   - Kept method as commented-out reference for future database-based resume

3. **resumeAgent.ts**
   - Changed to query database via `getRecentSessions()` instead of file system
   - Updated types from `SessionMetadata` to `AgentSession`
   - Added timestamp formatting for better UX
   - Shows warning that resume will be reimplemented

4. **agents/index.ts**
   - Commented out `SessionStorage` export

5. **extension.ts**
   - Removed `SessionStorage` import
   - Updated lock file cleanup to note deprecation

6. **.gitignore**
   - Added `.orchestra/sessions/` to ignore deprecated session files

### Files NOT Changed

- **SessionStorage.ts** - Class kept in codebase for reference but unused
- Can be fully removed in a future cleanup

## Benefits

- ✅ No more file I/O on every state change
- ✅ Single source of truth (database)
- ✅ Simpler architecture
- ✅ No lock file management
- ✅ Database retention policy already handles cleanup

## Future Work

1. **Implement database-based resume** (when needed)
   - Query `getSession()` to load session metadata
   - Query `getEvents()` to reconstruct state
   - Rebuild messages/tool calls from event stream
2. **Remove SessionStorage.ts entirely** (low priority)
   - Currently harmless since it's not imported anywhere
3. **Clean up existing session files** (user action)
   - Users can safely delete `.orchestra/sessions/` directory
   - Extension will no longer generate files there

## Testing

- ✅ No TypeScript errors
- ✅ AgentRunner still creates database sessions
- ✅ Events still stream to database
- ✅ Resume command shows appropriate message

## Migration Notes

**For users with existing session files:**

- Old session files in `.orchestra/sessions/` are now unused
- Can be safely deleted to free disk space (272+ files in dev workspace)
- Database already has all session/event data
