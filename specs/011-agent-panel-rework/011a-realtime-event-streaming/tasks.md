# Tasks: Agent Panel Real-Time Event Streaming

**Input**: specs/011-agent-panel-rework/011a-realtime-event-streaming/spec.md  
**Parent Spec**: specs/011-agent-panel-rework/spec.md  
**Gap**: Missing real-time event delivery from AgentRunner to AgentPanelProvider

---

## Summary

This addendum fills the critical gap in 011-agent-panel-rework: **events currently only persist to database** with no real-time streaming to the webview. This task list implements an in-memory `EventBus` using VS Code's standard `EventEmitter` pattern.

---

## Phase 1: EventBus Infrastructure

**Purpose**: Create the singleton EventBus for real-time event distribution

- [ ] T101 Create `EventBusPayload` type union (`session_start`, `session_end`, `session_event`) in `extension/src/agents/sessions/types.ts`
- [ ] T102 Create `AgentSessionInfo` interface for session_start payload in `extension/src/agents/sessions/types.ts`
- [ ] T103 Create `AgentEventBus` class with `vscode.EventEmitter<EventBusPayload>`, `onEvent` property, `emit()` method, and `dispose()` in `extension/src/agents/sessions/eventBus.ts`
- [ ] T104 Export `getAgentEventBus()` singleton accessor and `disposeAgentEventBus()` cleanup function in `extension/src/agents/sessions/eventBus.ts`
- [ ] T105 [P] Write unit tests for `AgentEventBus` (emit/subscribe, multiple subscribers, dispose) in `extension/test/agents/sessions/eventBus.test.ts`
- [ ] T106 Add `eventBus.ts` export to barrel file `extension/src/agents/sessions/index.ts`

**Checkpoint**: EventBus exists, can emit and subscribe, has tests

---

## Phase 2: SessionEventEmitter Updates

**Purpose**: Add real-time emission to all event methods (dual-write: DB + EventBus)

- [ ] T107 Add `emitSessionStart(session: AgentSessionInfo)` method to `SessionEventEmitter` that calls `getAgentEventBus().emit({ type: "session_start", session })` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T108 Add `emitSessionEnd(status: SessionStatus)` method to `SessionEventEmitter` that calls `getAgentEventBus().emit({ type: "session_end", sessionId, status })` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T109 Update `emitPrompt()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T110 Update `emitThinking()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T111 Update `emitStatusChange()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T112 Update `emitError()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T113 Update `emitToolCall()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T114 Update `emitToolProgress()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T115 Update `emitToolOutput()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T116 Update `emitToolFileOperation()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T117 Update `emitToolMetadata()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T118 Update `emitToolResult()` to call `getAgentEventBus().emit({ type: "session_event", event })` after `insertEvent()` in `extension/src/agents/sessions/eventEmitter.ts`
- [ ] T119 [P] Update unit tests for `SessionEventEmitter` to verify EventBus emission in `extension/test/agents/sessions/eventEmitter.test.ts`

**Checkpoint**: All SessionEventEmitter methods dual-write to DB and EventBus

---

## Phase 3: AgentRunner Integration

**Purpose**: Call session lifecycle methods at appropriate points

- [ ] T120 Call `emitSessionStart()` in `AgentRunner` immediately after creating session and `SessionEventEmitter` in `extension/src/agents/AgentRunner.ts`
- [ ] T121 Call `emitSessionEnd()` in `AgentRunner` when loop completes successfully in `extension/src/agents/AgentRunner.ts`
- [ ] T122 Call `emitSessionEnd()` in `AgentRunner` when loop fails/errors in `extension/src/agents/AgentRunner.ts`
- [ ] T123 Call `emitSessionEnd()` in `AgentRunner` when agent is stopped/cancelled in `extension/src/agents/AgentRunner.ts`
- [ ] T124 [P] Write integration test for AgentRunner session lifecycle emissions in `extension/test/agents/AgentRunner.integration.test.ts`

**Checkpoint**: AgentRunner emits session_start and session_end at correct lifecycle points

---

## Phase 4: AgentPanelProvider Updates

**Purpose**: Replace database polling with real-time EventBus subscription

- [ ] T125 Remove `DatabaseWatcher` parameter from `AgentPanelProvider` constructor in `extension/src/views/agentPanelProvider.ts`
- [ ] T126 Remove `dbWatcher.onDidChange()` subscription from constructor in `extension/src/views/agentPanelProvider.ts`
- [ ] T127 Add `getAgentEventBus().onEvent()` subscription in constructor, store disposable in `extension/src/views/agentPanelProvider.ts`
- [ ] T128 Implement `_handleEventBusPayload(payload: EventBusPayload)` method with switch for `session_start`, `session_end`, `session_event` in `extension/src/views/agentPanelProvider.ts`
- [ ] T129 In `session_start` handler: set `_currentSessionId`, post `session_update` message with empty events in `extension/src/views/agentPanelProvider.ts`
- [ ] T130 In `session_event` handler: filter by `_currentSessionId`, post single `event` message in `extension/src/views/agentPanelProvider.ts`
- [ ] T131 In `session_end` handler: post `session_update` message with final status in `extension/src/views/agentPanelProvider.ts`
- [ ] T132 Keep `_pollForEvents()` as fallback for loading historical events when panel opens mid-session in `extension/src/views/agentPanelProvider.ts`
- [ ] T133 Update `resolveWebviewView()` to check for active session and load history if needed in `extension/src/views/agentPanelProvider.ts`
- [ ] T134 [P] Write unit tests for `AgentPanelProvider` EventBus subscription in `extension/test/views/agentPanelProvider.test.ts`

**Checkpoint**: AgentPanelProvider receives real-time events from EventBus, posts to webview

---

## Phase 5: Extension Lifecycle Updates

**Purpose**: Update extension activation/deactivation for EventBus

- [ ] T135 Remove `dbWatcher` parameter from `AgentPanelProvider` instantiation in `extension/src/extension.ts`
- [ ] T136 Import `disposeAgentEventBus` in `extension/src/extension.ts`
- [ ] T137 Call `disposeAgentEventBus()` in `deactivate()` function in `extension/src/extension.ts`
- [ ] T138 [P] Verify extension activates and deactivates cleanly with manual testing

**Checkpoint**: Extension lifecycle correctly manages EventBus

---

## Phase 6: Webview Message Handler Updates

**Purpose**: Ensure webview correctly handles single-event messages

- [ ] T139 Verify webview message handler supports `{ type: "event"; event: AgentEvent }` message in `extension/src/webviews/agent-panel/protocol/handler.ts`
- [ ] T140 If not present, add handler for `event` message type that appends to events store in `extension/src/webviews/agent-panel/protocol/handler.ts`
- [ ] T141 [P] Write unit test for single-event message handling in `extension/test/webviews/agent-panel/protocol/handler.test.ts`

**Checkpoint**: Webview can receive and display individual events in real-time

---

## Dependency Graph

```
T101-T102 → T103 → T104 → T105,T106
                      ↓
T107-T108 → T109-T118 → T119
                      ↓
T120-T123 → T124
                      ↓
T125-T126 → T127-T131 → T132-T133 → T134
                      ↓
T135-T137 → T138
                      ↓
T139-T140 → T141
```

---

## Critical Path

```
T103 → T104 → T109 → T120 → T127 → T128 → T135 → T139
```

Minimum tasks to achieve real-time streaming: 8 tasks

---

## Verification Criteria

After completion:

1. **Real-time test**: Run agent, observe events appearing in panel immediately (<100ms latency)
2. **Streaming test**: Observe tool_output chunks streaming character-by-character
3. **Session lifecycle test**: Panel shows session start, running status, completion
4. **Mid-session open test**: Open panel after agent starts, should load history then stream new events
5. **No database polling**: Confirm `DatabaseWatcher` not used for event delivery

---

## Files Created/Modified

| File                                                     | Action                                         |
| -------------------------------------------------------- | ---------------------------------------------- |
| `extension/src/agents/sessions/eventBus.ts`              | CREATE                                         |
| `extension/src/agents/sessions/types.ts`                 | UPDATE (add EventBusPayload, AgentSessionInfo) |
| `extension/src/agents/sessions/eventEmitter.ts`          | UPDATE (add EventBus emit to all methods)      |
| `extension/src/agents/sessions/index.ts`                 | UPDATE (add eventBus export)                   |
| `extension/src/agents/AgentRunner.ts`                    | UPDATE (add session lifecycle calls)           |
| `extension/src/views/agentPanelProvider.ts`              | UPDATE (replace dbWatcher with EventBus)       |
| `extension/src/extension.ts`                             | UPDATE (remove dbWatcher param, add dispose)   |
| `extension/src/webviews/agent-panel/protocol/handler.ts` | UPDATE (if needed for single event)            |
| `extension/test/agents/sessions/eventBus.test.ts`        | CREATE                                         |
| `extension/test/agents/sessions/eventEmitter.test.ts`    | UPDATE                                         |
| `extension/test/views/agentPanelProvider.test.ts`        | CREATE or UPDATE                               |
