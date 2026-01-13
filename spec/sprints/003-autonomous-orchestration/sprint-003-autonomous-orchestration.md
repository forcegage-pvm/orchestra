# Sprint 003: Autonomous Orchestration

**Status**: PLANNED  
**Priority**: P0 - Critical Path  
**Estimated Duration**: 2-3 weeks  
**Prerequisites**: Sprint 002 (Technical Debt) complete  
**Created**: 2025-12-12  

---

## Executive Summary

This sprint implements the **core vision of Orchestra**: semi-autonomous agent orchestration that removes the human supervisor from micro-managing agent invocations. The supervisor shifts from "task delegator" to "exception handler", only intervening on escalations and errors.

### The Problem Today

Currently, the human supervisor must:
1. Create and manage separate chat sessions for orchestrator and implementor
2. Invoke the correct command to the correct agent at each workflow stage
3. Manually set the correct mode (agent role) and model for each session
4. Watch workflows and invoke the next action at each status change
5. Remember to `/clear` the implementor session between tasks
6. Handle escalations and errors manually

### The Solution

Orchestra automatically:
1. Invokes the correct agent with correct parameters at each workflow stage
2. Manages two persistent sessions (orchestrator + implementor)
3. Progresses through workflow stages automatically
4. Pauses on escalation/error and notifies the supervisor
5. Provides a live-updating task list for monitoring
6. Offers context-aware Play button for manual intervention

---

## Goals

### Primary Goals

1. **Autonomous Workflow Progression**: Tasks flow through PENDING → IMPLEMENT → VERIFY → COMPLETE without manual intervention
2. **Dual Session Management**: Orchestrator and Implementor have separate, managed chat sessions
3. **Context-Aware Actions**: Play button and commands adapt to task status
4. **Escalation Handling**: Automatic pause and notification on escalation/error

### Secondary Goals

1. **Pause/Resume**: Supervisor can pause autonomous mode at any time
2. **Status Visibility**: Clear indication of what's running and current state
3. **Error Recovery**: Graceful handling of agent failures
4. **Audit Trail**: Full logging of all autonomous actions

### Non-Goals (Future Sprints)

1. Mobile notifications (future extensibility)
2. Session history persistence across restarts
3. Multi-sprint parallel execution
4. External monitoring integrations

---

## Technical Foundation

### API Research Summary

Based on [VS Code Chat API Deep Dive](05-research/vscode-chat-api-deep-dive.md):

| Capability | API | Status |
|------------|-----|--------|
| Open chat with prompt | `chat.open` | ✅ Stable |
| Auto-send prompt | `isPartialQuery: false` | ✅ Stable |
| Select mode | `mode: 'agent'` | ✅ Stable |
| Select model | `modelSelector` | ✅ Stable |
| Attach files | `attachFiles` | ✅ Stable |
| Force new session | `chat.newChat` | ✅ Stable |
| Chat as editor | `chat.newChatEditor` | ✅ Stable |
| Track session ID | `sessionId` | ⚠️ Proposed |
| Resume session | Session provider | ⚠️ Proposed |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestra Extension                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌─────────────────────────────────┐   │
│  │ Workflow Engine │────▶│ Session Manager                 │   │
│  │                 │     │                                 │   │
│  │ • Watch DB      │     │ • Orchestrator: Chat Panel      │   │
│  │ • Detect stage  │     │ • Implementor: Chat Editor      │   │
│  │ • Trigger next  │     │ • Track active sessions         │   │
│  │ • Handle errors │     │ • Clear implementor per task    │   │
│  └─────────────────┘     └─────────────────────────────────┘   │
│           │                           │                         │
│           ▼                           ▼                         │
│  ┌─────────────────┐     ┌─────────────────────────────────┐   │
│  │ Prompt Builder  │     │ Chat Invoker                    │   │
│  │                 │     │                                 │   │
│  │ • Stage prompts │     │ • Execute chat.open             │   │
│  │ • Role context  │     │ • Execute chat.newChat          │   │
│  │ • File attach   │     │ • Execute chat.newChatEditor    │   │
│  └─────────────────┘     └─────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Autonomous Mode State Machine                                   │
│                                                                  │
│  IDLE ──[Start]──▶ RUNNING ──[Escalation]──▶ PAUSED            │
│    ▲                  │                         │               │
│    │                  │                         │               │
│    └──[Complete]──────┘                         │               │
│    └──────────────────[Resume]──────────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### Feature 1: Session Manager

**Description**: Manages two persistent chat sessions for orchestrator and implementor roles.

**Behavior**:
- Orchestrator session uses Chat Panel (persistent, keeps history)
- Implementor session uses Chat Editor Tab (cleared on each task)
- Sessions are created on first use, reused thereafter
- Implementor session is cleared (`newChat`) before each implement invocation

**Implementation**:
```typescript
class SessionManager {
  private orchestratorActive: boolean = false;
  private implementorActive: boolean = false;
  
  async invokeOrchestrator(prompt: string, files: Uri[]): Promise<void>;
  async invokeImplementor(prompt: string, files: Uri[]): Promise<void>;
  async clearImplementorSession(): Promise<void>;
}
```

### Feature 2: Context-Aware Play Button

**Description**: The Play button behavior changes based on task status.

**Status → Action Mapping**:

| Task Status | Play Action | Agent | Model | Clears Session |
|-------------|-------------|-------|-------|----------------|
| PENDING | Prepare | Orchestrator | High-tier | No |
| IMPLEMENT | Implement | Implementor | Mid-tier | Yes |
| VERIFY | Verify | Orchestrator | High-tier | No |
| ESCALATED | Show Escalation Panel | Human | N/A | No |
| COMPLETE | No action | N/A | N/A | N/A |

**Implementation**:
```typescript
async function handlePlayButton(task: Task): Promise<void> {
  switch (task.status) {
    case 'PENDING':
      await sessionManager.invokeOrchestrator(
        buildPreparePrompt(task),
        [handoverUri]
      );
      break;
    case 'IMPLEMENT':
      await sessionManager.clearImplementorSession();
      await sessionManager.invokeImplementor(
        buildImplementPrompt(task),
        getContextFiles(task)
      );
      break;
    // ... etc
  }
}
```

### Feature 3: Workflow Engine

**Description**: Automatically progresses tasks through workflow stages.

**Trigger**: Database status changes detected by DatabaseWatcher

**State Machine**:
```
PENDING ──[prepare]──▶ IMPLEMENT ──[signal]──▶ VERIFY ──[pass]──▶ COMPLETE
                           │                     │
                           │                     └──[fail]──▶ IMPLEMENT (retry)
                           │
                           └──[max retries]──▶ ESCALATED
```

**Autonomous Mode Loop**:
```typescript
async function runAutonomousMode(sprintId: string): Promise<void> {
  while (!isPaused && !isComplete(sprintId)) {
    const task = getCurrentTask(sprintId);
    
    if (!task) {
      // Sprint complete
      break;
    }
    
    switch (task.status) {
      case 'PENDING':
        await invokeOrchestratorPrepare(task);
        break;
      case 'IMPLEMENT':
        await invokeImplementorImplement(task);
        break;
      case 'VERIFY':
        // Wait for orchestrator to complete verification
        break;
      case 'ESCALATED':
        await pauseAndNotify(task);
        return;
      case 'COMPLETE':
        // Move to next task
        continue;
    }
    
    await waitForStatusChange(task);
  }
}
```

### Feature 4: Prompt Builder

**Description**: Builds context-rich prompts for each workflow stage.

**Prompts by Stage**:

| Stage | Prompt Template |
|-------|-----------------|
| Prepare | "As orchestrator, prepare Task {id}: {title}. Create handover with acceptance criteria and verification checks." |
| Implement | "As implementor, implement Task {id}: {title}. Follow the handover instructions. Signal when complete." |
| Verify | "As orchestrator, verify Task {id}: {title}. Run verification checks and submit judgment." |

**Context by Stage**:

| Stage | Context Source | Notes |
|-------|----------------|-------|
| Prepare | Task from DB | Orchestrator uses `get_task` MCP tool |
| Implement | Handover from DB | Implementor uses `get_current_task` MCP tool, which returns handover data. `context_files` are workspace paths to read. |
| Verify | Signal + verification from DB | Orchestrator uses `get_signal` and `run_verification_checks` MCP tools |

### Feature 5: Autonomous Mode Controls

**Description**: UI controls for starting, pausing, and monitoring autonomous mode.

**Controls**:
- **Start Autonomous**: Begin automatic workflow progression
- **Pause**: Stop after current action completes
- **Resume**: Continue from paused state
- **Stop**: Cancel autonomous mode entirely

**Status Indicators**:
- Status bar item showing current state (Idle/Running/Paused)
- TreeView decoration for currently executing task
- Notification on pause/error/completion

### Feature 6: Escalation Handling

**Description**: Automatic pause and notification when a task is escalated.

**Behavior**:
1. Workflow engine detects ESCALATED status
2. Autonomous mode pauses
3. Notification shown to supervisor
4. Escalation details available in Task Detail panel
5. After resolution, supervisor can Resume or manual Play

---

## Phases

### Phase 1: Session Management (3-4 days)

**Tasks**:
1. Create SessionManager class
2. Implement orchestrator session (Chat Panel)
3. Implement implementor session (Chat Editor)
4. Add session clear functionality
5. Test dual session operation

**Deliverables**:
- `extension/src/sessions/SessionManager.ts`
- Unit tests for session management

### Phase 2: Context-Aware Play Button (2-3 days)

**Tasks**:
1. Refactor handleStartTask to be status-aware
2. Build prompt templates for each stage
3. Implement file attachment logic
4. Configure model selection per role
5. Update TreeView context menu

**Deliverables**:
- Updated `extension/src/extension.ts` (handleStartTask)
- `extension/src/prompts/PromptBuilder.ts`
- Updated package.json menus

### Phase 3: Workflow Engine (4-5 days)

**Tasks**:
1. Create WorkflowEngine class
2. Implement status change detection
3. Implement autonomous mode loop
4. Add pause/resume logic
5. Implement error handling
6. Add state persistence

**Deliverables**:
- `extension/src/workflow/WorkflowEngine.ts`
- `extension/src/workflow/WorkflowState.ts`
- Integration tests

### Phase 4: UI & Controls (2-3 days)

**Tasks**:
1. Add status bar item
2. Add autonomous mode commands
3. Add TreeView decorations
4. Implement notifications
5. Add escalation panel integration

**Deliverables**:
- Updated `extension/package.json` (commands, menus)
- `extension/src/views/StatusBarManager.ts`
- Updated TreeView with decorations

### Phase 5: Integration & Testing (2-3 days)

**Tasks**:
1. End-to-end testing of full workflow
2. Error scenario testing
3. Performance testing
4. Documentation
5. Bug fixes

**Deliverables**:
- Integration tests
- Updated README
- User documentation

---

## Task Breakdown

### Phase 1: Session Management

| ID | Task | Category | Est |
|----|------|----------|-----|
| 1 | Create SessionManager class skeleton | INFRASTRUCTURE | 2h |
| 2 | Implement invokeOrchestrator (Chat Panel) | INTEGRATION | 4h |
| 3 | Implement invokeImplementor (Chat Editor) | INTEGRATION | 4h |
| 4 | Implement clearImplementorSession | INTEGRATION | 2h |
| 5 | Add session state tracking | INFRASTRUCTURE | 2h |
| 6 | Write SessionManager tests | INFRASTRUCTURE | 4h |

### Phase 2: Context-Aware Play Button

| ID | Task | Category | Est |
|----|------|----------|-----|
| 7 | Create PromptBuilder class | INFRASTRUCTURE | 3h |
| 8 | Add prompt templates per stage | INFRASTRUCTURE | 2h |
| 9 | Implement file attachment logic | INTEGRATION | 3h |
| 10 | Add model selection config | INFRASTRUCTURE | 2h |
| 11 | Refactor handleStartTask | REFACTOR | 4h |
| 12 | Update TreeView menus for status-aware Play | VISUAL | 2h |

### Phase 3: Workflow Engine

| ID | Task | Category | Est |
|----|------|----------|-----|
| 13 | Create WorkflowEngine class skeleton | INFRASTRUCTURE | 2h |
| 14 | Implement status change detection | INTEGRATION | 4h |
| 15 | Implement autonomous mode loop | INTEGRATION | 6h |
| 16 | Add pause/resume state machine | INFRASTRUCTURE | 3h |
| 17 | Implement error handling | INFRASTRUCTURE | 4h |
| 18 | Add workflow state persistence | INFRASTRUCTURE | 3h |
| 19 | Write WorkflowEngine tests | INFRASTRUCTURE | 6h |

### Phase 4: UI & Controls

| ID | Task | Category | Est |
|----|------|----------|-----|
| 20 | Create StatusBarManager | VISUAL | 3h |
| 21 | Add autonomous mode commands | INTEGRATION | 2h |
| 22 | Register commands in package.json | INFRASTRUCTURE | 1h |
| 23 | Add TreeView decorations | VISUAL | 3h |
| 24 | Implement notification system | VISUAL | 2h |
| 25 | Integrate with escalation panel | INTEGRATION | 3h |

### Phase 5: Integration & Testing

| ID | Task | Category | Est |
|----|------|----------|-----|
| 26 | E2E test: Full sprint autonomous | INFRASTRUCTURE | 8h |
| 27 | E2E test: Escalation handling | INFRASTRUCTURE | 4h |
| 28 | E2E test: Error recovery | INFRASTRUCTURE | 4h |
| 29 | Update README and docs | INFRASTRUCTURE | 4h |
| 30 | Bug fixes and polish | REFACTOR | 8h |

**Total Estimated**: ~100 hours (2-3 weeks)

---

## Success Criteria

### Must Have

- [ ] Supervisor can start autonomous mode and walk away
- [ ] Correct agent invoked at each workflow stage
- [ ] Correct mode and model selected per role
- [ ] Workflow pauses on escalation
- [ ] Play button works correctly per task status
- [ ] Two sessions managed (orchestrator panel, implementor editor)
- [ ] Implementor session cleared between tasks

### Should Have

- [ ] Status bar shows current autonomous state
- [ ] TreeView indicates currently executing task
- [ ] Notifications on state changes
- [ ] Pause/resume works correctly
- [ ] Error recovery doesn't break workflow

### Could Have

- [ ] Model selection configurable per category
- [ ] Session history preserved for orchestrator
- [ ] Detailed audit log of autonomous actions

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Chat API behavior changes | Low | High | Pin VS Code version, add fallbacks |
| Session tracking unreliable | Medium | Medium | Use editor tab tracking as backup |
| Agent failures break workflow | Medium | High | Robust error handling, retry logic |
| Performance with rapid status changes | Low | Medium | Debounce status change handling |

---

## Dependencies

### Internal

- Sprint 002 complete (DatabaseWatcher fixes)
- MCP tools stable (prepare_task, signal, verify, etc.)
- Database schema stable

### External

- VS Code 1.95+ (Chat API)
- Copilot extension active
- MCP server running

---

## Open Questions

1. **Session Resume**: Should we attempt proposed API for true session resume, or accept the workaround?
2. **Model Configuration**: Hard-code model per role, or make configurable in settings?
3. **Parallel Tasks**: Support multiple tasks in parallel (different phases)?
4. **Retry Strategy**: How many auto-retries before escalation?

---

## References

- [VS Code Chat API Deep Dive](05-research/vscode-chat-api-deep-dive.md)
- [Orchestra Bible](../docs/orchestra-bible.md)
- [Workflow Specification](04-processes/workflows.md)
- [Extension Architecture](03-components/extension/overview.md)

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-12 | Orchestrator | Initial specification created |
