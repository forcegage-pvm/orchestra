# Agent Panel Real-Time Event Streaming - Addendum Specification

**Version**: 0.1.0  
**Status**: Design Complete  
**Parent Spec**: specs/011-agent-panel-rework/spec.md  
**Gap Identified**: 2026-02-02

---

## Problem Statement

The parent specification (011-agent-panel-rework) defines:

- ✅ Event types and data model
- ✅ Database persistence via SessionEventEmitter → insertEvent()
- ✅ Message protocol (Extension → Webview)
- ✅ Webview UI components

**Missing**: The spec does NOT define how events flow from `SessionEventEmitter` to `AgentPanelProvider` in real-time. The current implementation incorrectly uses `DatabaseWatcher` (file system polling) as a workaround, which:

- Introduces latency (not real-time)
- Re-reads entire event list on each poll
- Creates unnecessary file system overhead
- Fails to provide streaming updates

---

## Solution: In-Memory Event Bus

### Architecture

```
┌─────────────┐
│ AgentRunner │ (executing loop)
└──────┬──────┘
       │
       │ Uses SessionEventEmitter
       ↓
┌──────────────────────┐
│ SessionEventEmitter  │
├──────────────────────┤
│ emitToolCall()       │──┬──→ insertEvent() [persist to DB]
│ emitThinking()       │  │
│ emitToolResult()     │  └──→ EventBus.emit() [real-time] ★ NEW
│ ...                  │
└──────────────────────┘
                              │
                              ↓
                    ┌─────────────────┐
                    │    EventBus     │ (singleton, in-memory)
                    │ vscode.Event<T> │
                    └────────┬────────┘
                             │
         ┌───────────────────┴───────────────────┐
         ↓                                       ↓
┌───────────────────────┐              ┌─────────────────┐
│ AgentPanelProvider    │              │ (Future: other  │
│ subscribes to events  │              │  subscribers)   │
└─────────┬─────────────┘              └─────────────────┘
          │
          │ postMessage({ type: "event", event })
          ↓
┌───────────────────────┐
│   WebView (Panel)     │
│   Real-time updates   │
└───────────────────────┘
```

---

## Design Decisions

| #   | Topic             | Decision                                       | Rationale                                                         |
| --- | ----------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Event delivery    | In-memory EventBus using `vscode.EventEmitter` | Standard VS Code pattern, synchronous, zero latency               |
| 2   | Singleton pattern | Global EventBus instance                       | Multiple components need to subscribe (panel, future: status bar) |
| 3   | Event batching    | Preserve existing EventBatcher (50ms)          | Spec requirement for performance, applies at webview layer        |
| 4   | Database write    | Keep dual-write (DB + EventBus)                | DB for history/persistence, EventBus for real-time                |
| 5   | Session lifecycle | EventBus emits session_start, session_end      | Panel needs to know when sessions begin/end                       |
| 6   | Disposal          | EventBus disposed on extension deactivation    | Prevent memory leaks                                              |

---

## 1. EventBus Definition

### 1.1 Event Types

```typescript
/**
 * Events emitted through the real-time EventBus
 */
type EventBusPayload =
  | { type: "session_start"; session: AgentSessionInfo }
  | { type: "session_end"; sessionId: string; status: SessionStatus }
  | { type: "session_event"; event: AgentEvent };

interface AgentSessionInfo {
  id: string;
  role: AgentRole;
  status: SessionStatus;
  startedAt: string;
  taskId?: number;
  taskTitle?: string;
}
```

### 1.2 EventBus Interface

```typescript
import * as vscode from "vscode";

/**
 * Singleton EventBus for real-time agent event streaming
 */
class AgentEventBus implements vscode.Disposable {
  private readonly _onEvent = new vscode.EventEmitter<EventBusPayload>();

  /**
   * Subscribe to real-time agent events
   */
  readonly onEvent: vscode.Event<EventBusPayload> = this._onEvent.event;

  /**
   * Emit an event to all subscribers
   */
  emit(payload: EventBusPayload): void {
    this._onEvent.fire(payload);
  }

  dispose(): void {
    this._onEvent.dispose();
  }
}

// Singleton instance
let eventBus: AgentEventBus | undefined;

export function getAgentEventBus(): AgentEventBus {
  if (!eventBus) {
    eventBus = new AgentEventBus();
  }
  return eventBus;
}

export function disposeAgentEventBus(): void {
  eventBus?.dispose();
  eventBus = undefined;
}
```

---

## 2. SessionEventEmitter Updates

The existing `SessionEventEmitter` must be updated to emit events through the EventBus in addition to database persistence.

### 2.1 Dual-Write Pattern

```typescript
// BEFORE (current - database only)
emitToolCall(...): ToolCallEvent {
  const event = { /* ... */ };
  insertEvent(this.workspaceRoot, event);  // DB only
  return event;
}

// AFTER (database + real-time)
emitToolCall(...): ToolCallEvent {
  const event = { /* ... */ };
  insertEvent(this.workspaceRoot, event);  // Persist to DB
  getAgentEventBus().emit({                // Real-time to subscribers
    type: "session_event",
    event
  });
  return event;
}
```

### 2.2 Session Lifecycle Events

Add methods to emit session start/end:

```typescript
class SessionEventEmitter {
  // NEW: Emit session start (call from AgentRunner when session begins)
  emitSessionStart(session: AgentSessionInfo): void {
    getAgentEventBus().emit({ type: "session_start", session });
  }

  // NEW: Emit session end (call from AgentRunner when session completes)
  emitSessionEnd(status: SessionStatus): void {
    getAgentEventBus().emit({
      type: "session_end",
      sessionId: this.sessionId,
      status,
    });
  }
}
```

---

## 3. AgentPanelProvider Updates

Replace DatabaseWatcher subscription with EventBus subscription.

### 3.1 Constructor Changes

```typescript
// BEFORE (database polling - WRONG)
constructor(
  extensionUri: vscode.Uri,
  workspaceRoot: string,
  dbWatcher: DatabaseWatcher,  // Remove this
) {
  this._disposables.push(
    dbWatcher.onDidChange(() => {
      this._pollForEvents();  // Polls database - slow!
    }),
  );
}

// AFTER (real-time subscription - CORRECT)
constructor(
  extensionUri: vscode.Uri,
  workspaceRoot: string,
) {
  // Subscribe to real-time events
  this._disposables.push(
    getAgentEventBus().onEvent((payload) => {
      this._handleEventBusPayload(payload);
    }),
  );
}
```

### 3.2 Event Handler

```typescript
private _handleEventBusPayload(payload: EventBusPayload): void {
  if (!this._view) return;

  switch (payload.type) {
    case "session_start":
      this._currentSessionId = payload.session.id;
      this.postMessage({
        type: "session_update",
        session: payload.session,
        events: [],
      });
      break;

    case "session_end":
      this.postMessage({
        type: "session_update",
        session: {
          id: payload.sessionId,
          status: payload.status,
        },
        events: [],
      });
      break;

    case "session_event":
      // Only forward events for current session
      if (payload.event.sessionId === this._currentSessionId) {
        this.postMessage({
          type: "event",
          event: payload.event,
        });
      }
      break;
  }
}
```

---

## 4. AgentRunner Updates

AgentRunner must call session lifecycle methods on SessionEventEmitter.

### 4.1 Session Start

```typescript
// In AgentRunner.run() or similar
const session = createSession(workspaceRoot, { role, taskId, ... });
this._eventEmitter = new SessionEventEmitter(workspaceRoot, session.id);
this._eventEmitter.emitSessionStart({
  id: session.id,
  role: session.role,
  status: "running",
  startedAt: session.startedAt,
  taskId: session.taskId,
  taskTitle: session.taskTitle,
});
```

### 4.2 Session End

```typescript
// In AgentRunner when loop completes or errors
this._eventEmitter.emitSessionEnd(finalStatus);
```

---

## 5. Extension Lifecycle

### 5.1 Activation

```typescript
// In extension.ts activate()
import {
  getAgentEventBus,
  disposeAgentEventBus,
} from "./agents/sessions/eventBus.js";

export function activate(context: vscode.ExtensionContext) {
  // EventBus is lazy-initialized on first access
  // No explicit initialization needed

  // AgentPanelProvider no longer needs dbWatcher
  const agentPanelProvider = new AgentPanelProvider(
    context.extensionUri,
    orchestraRoot,
    // dbWatcher removed
  );
}
```

### 5.2 Deactivation

```typescript
export function deactivate() {
  disposeAgentEventBus();
}
```

---

## 6. Backward Compatibility

### 6.1 Database Still Required

The database remains the source of truth for:

- Session history (view past sessions)
- Session switching (load_session message)
- Export functionality
- Retention policy

### 6.2 Fallback Behavior

If AgentPanelProvider is opened AFTER a session has started:

1. Load current session from AgentRunner.getSession()
2. Load historical events from database
3. Subscribe to EventBus for future events

---

## 7. Message Protocol Updates

### 7.1 New Message Type

Add single-event message type (already in spec but not used):

```typescript
type ExtensionMessage =
  | { type: "session_update"; session: AgentSession; events: AgentEvent[] }
  | { type: "event"; event: AgentEvent }  // ★ Single event, real-time
  | { type: "events_batch"; sessionId: string; events: AgentEvent[] }
  | /* ... other types ... */
```

---

## 8. Performance Characteristics

| Metric        | Before (DB polling)       | After (EventBus)       |
| ------------- | ------------------------- | ---------------------- |
| Event latency | 100-500ms (file watcher)  | <1ms (synchronous)     |
| CPU overhead  | High (re-read all events) | Minimal (single event) |
| Memory        | N/A                       | O(1) per event         |
| Scalability   | Degrades with event count | Constant time          |

---

## 9. Testing Requirements

- Unit tests for EventBus emit/subscribe
- Unit tests for SessionEventEmitter dual-write
- Integration test: AgentRunner → EventBus → AgentPanelProvider
- Manual test: Real-time streaming visible in panel during agent execution

---

## 10. Files Affected

| File                                            | Change                                        |
| ----------------------------------------------- | --------------------------------------------- |
| `extension/src/agents/sessions/eventBus.ts`     | NEW - EventBus singleton                      |
| `extension/src/agents/sessions/eventEmitter.ts` | UPDATE - Add EventBus emit to all methods     |
| `extension/src/agents/AgentRunner.ts`           | UPDATE - Call emitSessionStart/emitSessionEnd |
| `extension/src/views/agentPanelProvider.ts`     | UPDATE - Replace dbWatcher with EventBus      |
| `extension/src/extension.ts`                    | UPDATE - Remove dbWatcher param, add dispose  |
| `extension/src/agents/sessions/types.ts`        | UPDATE - Add EventBusPayload types            |

---

## Appendix: Why Database Polling Failed

The original implementation attempted to use `DatabaseWatcher` which:

1. Watches the SQLite database FILE for changes
2. Uses file system polling (100ms+ latency minimum)
3. On change, re-reads ALL events from database
4. Sends entire event list to webview

This approach:

- ❌ Is not real-time (polling delay)
- ❌ Wastes CPU (re-reading entire event table)
- ❌ Wastes bandwidth (sending all events repeatedly)
- ❌ Doesn't work well with rapid event bursts

The EventBus approach:

- ✅ Synchronous event delivery
- ✅ O(1) per event (no database reads for live events)
- ✅ Works with existing batching at webview layer
- ✅ Standard VS Code extension pattern
