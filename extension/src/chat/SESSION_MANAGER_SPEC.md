# SessionManager Rewrite Specification

## Overview

Rewrite SessionManager to use label-based session tracking with database persistence.

## Research Findings

| Capability | Status | Notes |
|------------|--------|-------|
| Create session with mode | ✅ Works | `chat.open` with `mode: "orchestra.{role}"` |
| Send messages to focused tab | ✅ Works | `chat.open` with `query` param |
| Capture label after first response | ✅ Works | Tab renames after AI responds |
| Find tab by label | ✅ Works | `tabGroups.all` iteration |
| `/clear` to reset session | ✅ Works | Clears context, keeps session |
| Programmatic rename | ❌ Blocked | Requires internal session object |
| Programmatic history restore | ❌ Blocked | Requires internal session object |
| History picker | ✅ Works | `workbench.action.chat.history` opens picker |

## Session Strategy

```
ORCHESTRATOR: Persistent across tasks
  → Keep context, never clear
  → Same session for entire sprint

IMPLEMENTOR: Reused but cleared per task
  → Send /clear before each new task
  → Same session, fresh context each time
```

## Task List

### Task 1: Create chat_sessions DB table

**Status:** Not started

**Schema (GLOBAL - no sprint_id):**
```sql
CREATE TABLE chat_sessions (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('orchestrator', 'implementor')) UNIQUE,
  tab_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
```

**Location:** `extension/src/database/DatabaseService.ts` (inline table creation)

**Decision:** Q1 answered - Global sessions, not per-sprint.

---

### Task 2: Add DB methods for session persistence

**Status:** Not started

**Methods (no sprintId - global):**
```typescript
getSessionLabel(role: 'orchestrator' | 'implementor'): string | null
saveSessionLabel(role: 'orchestrator' | 'implementor', label: string): void
clearSessionLabel(role: 'orchestrator' | 'implementor'): void
```

**Location:** `extension/src/database/DatabaseService.ts`

---

### Task 3: Rewrite findTabByLabel()

**Status:** Not started

**Signature:**
```typescript
findTabByLabel(label: string): { tab: vscode.Tab, index: number, tabGroup: vscode.TabGroup } | null
```

**Implementation:**
- Search all `vscode.window.tabGroups.all`
- Match by exact label string
- Return first match with position info

---

### Task 4: Rewrite initSession()

**Status:** Not started

**Flow:**
```
1. Load label from DB for (sprintId, role)
2. If label exists → findTabByLabel()
3. If tab found → focus it, return ready
4. If tab NOT found → promptUserToSelectSession()
5. After user selects → capture new label, save to DB
6. For implementor: send /clear after init
```

---

### Task 5: Implement promptUserToSelectSession()

**Status:** Not started

**Flow (User confirms approach):**
```
1. Show info message: "{Role} session not found. Please select from chat history."
2. Execute workbench.action.chat.history
3. Show modal dialog: "Click OK after selecting the {role} session"
4. User clicks OK
5. Capture active tab label
6. Save to DB
7. Return ready
```

**Decision:** Q2 answered - User confirms via dialog after selecting.

---

### Task 6: Rewrite sendMessage()

**Status:** Not started

**Flow (with auto-reinit):**
```
1. Get stored label for role from DB
2. Find tab by label
3. If not found → call initSession(role) to prompt user
4. Focus tab via openEditorAtIndex
5. Execute workbench.action.chat.open with:
   - query: message
   - mode: orchestra.{role}
   - isPartialQuery: false
```

**Decision:** Q3 answered - Auto-reinit if tab not found.

**Open Questions:**
- [ ] Q3: If tab not found during send, throw or auto-reinit? → ANSWER: TBD

---

### Task 7: Implement clearImplementorContext()

**Status:** Not started

**Flow:**
```
1. Find implementor tab by label
2. Focus it
3. Send /clear command
4. Wait briefly for clear to complete (~500ms)
```

---

### Task 8: Update all handlers

**Status:** Not started

**Decision:** Q4 answered - Update all 4 handlers.

**Handlers to update:**

| Handler | File | Current Method | New Method |
|---------|------|----------------|------------|
| `handlePlayTask` | PlayTaskHandler.ts | `invokeImplementor()` | `sendMessage('implementor', ...)` |
| `handleInvokeOrchestrator` | extension.ts | `invokeOrchestrator()` | `sendMessage('orchestrator', ...)` |
| `handleInvokeImplementor` | extension.ts | `invokeImplementor()` | `sendMessage('implementor', ...)` |
| `handleStartTask` | extension.ts | `invokeImplementor()` | `sendMessage('implementor', ...)` |

**PlayTaskHandler changes:**
```typescript
// Before task execution:
await sessionManager.clearImplementorContext()

// Send handover:
await sessionManager.sendMessage('implementor', handoverContent)

// Orchestrator updates:
await sessionManager.sendMessage('orchestrator', statusMessage)
```

**extension.ts changes:**
```typescript
// handleInvokeOrchestrator:
await sessionManager.sendMessage('orchestrator', message)

// handleInvokeImplementor:
await sessionManager.sendMessage('implementor', message)

// handleStartTask:
await sessionManager.clearImplementorContext()
await sessionManager.sendMessage('implementor', taskMessage)
```

---

### Task 9: Add session status check API

**Status:** Not started

**Methods:**
```typescript
isSessionReady(role: 'orchestrator' | 'implementor'): boolean
getSessionInfo(): {
  orchestrator: { label: string | null, ready: boolean },
  implementor: { label: string | null, ready: boolean }
}
```

---

### Task 10: Integration test

**Status:** Not started

**Test Cases:**
1. Fresh start (no DB labels) → prompts for session selection
2. Label saved → finds tab on restart
3. Tab closed → prompts again
4. Implementor /clear works between tasks
5. Messages route to correct sessions

---

## Open Questions Summary

| # | Question | Answer |
|---|----------|--------|
| Q1 | Should sessions be per-sprint or global? | **Global** - one orchestrator + one implementor for all sprints |
| Q2 | How to detect user selection from history picker? | **User confirms** - show "Click OK when done" dialog after picker |
| Q3 | If tab not found during send, throw error or auto-reinit? | **Auto-reinit** - automatically prompt user to select session, then send |
| Q4 | Any other handlers besides PlayTaskHandler need updating? | **Update all 4**: PlayTaskHandler, handleInvokeOrchestrator, handleInvokeImplementor, handleStartTask |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-01 | Use label-capture approach | Programmatic rename/restore requires internal VS Code objects |
| 2026-01-01 | Reuse implementor with /clear | Prevents session proliferation |
| 2026-01-01 | Use history picker for recovery | Built-in, user can select correct session |
