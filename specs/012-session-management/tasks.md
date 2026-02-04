# Tasks: Session Management & Continuation

**Input**: Design documents from `/specs/012-session-management/`  
**Prerequisites**: plan.md, spec.md (5 user stories, 39 FR, 10 NFR), research.md, data-model.md, contracts/

**Tests**: Unit and integration tests are INCLUDED (T006, T011, T017, T025, T032, T037) for verification. TDD/red-phase tests are NOT requested in specification and are excluded per speckit.tasks instructions.

**Organization**: Tasks follow the 6-phase implementation plan from spec.md, organized around technical capabilities rather than user stories (this is an infrastructure feature, not end-user facing).

---

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

---

## Phase 1: Database Schema & Repository (Setup)

**Purpose**: Create database tables and repository layer for message persistence

**Blocking**: All subsequent phases depend on database schema

- [ ] T001 Create migration 018-session-messages-table.sql in src/db/migrations/
- [ ] T002 Create migration 019-session-stage-fields.sql in src/db/migrations/
- [ ] T003 Register migrations in src/db/index.ts (update migrations array)
- [ ] T003a [P] Verify graceful degradation for sessions without message history (test legacy session queries return empty messages array)
- [ ] T004 Implement SessionMessageRepository in extension/src/agents/sessions/sessionMessageRepository.ts
- [ ] T005 Add SessionStage and MessageContent types to extension/src/agents/types.ts
- [ ] T006 [P] Write unit tests for SessionMessageRepository in extension/test/agents/sessionMessageRepository.test.ts

**Checkpoint**: Database schema ready - can now capture and query messages

---

## Phase 2: Message Capture During Execution

**Purpose**: Hook message capture into AgentRunner execution loop (async, non-blocking)

**Dependencies**: Requires Phase 1 complete (repository functions available)

- [ ] T007 Update AgentSession.addMessage() in extension/src/agents/AgentSession.ts to trigger async database insert
- [ ] T008 Update AgentRunner to capture system messages in extension/src/agents/AgentRunner.ts (initial prompt, resume context)
- [ ] T009 Integrate ContextManager.estimateTokens() in sessionMessageRepository.ts for token counting
- [ ] T010 Add error logging for failed message inserts in AgentSession.ts (graceful degradation)
- [ ] T011 [P] Write integration tests for message capture in extension/test/agents/messageCapture.test.ts

**Checkpoint**: Messages automatically persisted during agent execution without blocking

---

## Phase 3: Session Resume Capability

**Purpose**: Reconstruct AgentSession from database for paused/interrupted sessions

**Dependencies**: Requires Phase 2 complete (messages being captured)

- [ ] T012 Implement reconstructSession() in extension/src/agents/AgentRunner.ts (load messages from database)
- [ ] T013 Implement reconstructToolCalls() in extension/src/agents/AgentRunner.ts (query ToolResultEvent from events)
- [ ] T014 Implement reconstructFileChanges() in extension/src/agents/AgentRunner.ts (query ToolFileOperationEvent)
- [ ] T015 Implement resumeSession() public API in extension/src/agents/AgentRunner.ts
- [ ] T016 Add resume context injection (system message: "Session resumed after pause")
- [ ] T017 [P] Write integration tests for session resume in extension/test/agents/sessionResume.test.ts

**Checkpoint**: Paused orchestrator sessions can be resumed with full context

---

## Phase 4: Session Continuation (Reuse)

**Purpose**: Enable session reuse for fix cycles (orchestrator → implementor feedback)

**Dependencies**: Requires Phase 3 complete (resume capability working)

- [ ] T018 Implement continueSession() in extension/src/agents/sessions/sessionRepository.ts (create new session with parent_session_id)
- [ ] T019 Implement copyMessages() in extension/src/agents/sessions/sessionMessageRepository.ts (copy parent messages to child)
- [ ] T020 Implement markSessionAsContinued() in extension/src/agents/sessions/sessionRepository.ts (update parent metadata)
- [ ] T021 Implement getSessionChain() in extension/src/agents/sessions/sessionRepository.ts (recursive CTE query)
- [ ] T022 Implement getLatestImplementorSession() in extension/src/agents/sessions/sessionRepository.ts
- [ ] T023 Implement continueSessionExecution() in extension/src/agents/AgentRunner.ts (public API)
- [ ] T024 Add validation for continuation depth limit (max 5 levels) in sessionRepository.ts
- [ ] T025 [P] Write integration tests for session continuation in extension/test/agents/sessionContinuation.test.ts

**Checkpoint**: Implementor sessions can be continued with orchestrator feedback

---

## Phase 5: UI Integration

**Purpose**: Display message history and session chains in Agent Panel

**Dependencies**: Requires Phase 4 complete (all session operations working)

- [ ] T026 [P] Create MessageHistoryView component in extension/src/views/agentPanel/MessageHistoryView.tsx (SolidJS)
- [ ] T027 [P] Create SessionChainView component in extension/src/views/agentPanel/SessionChainView.tsx (tree visualization)
- [ ] T028 Add message history tab to Agent Panel in extension/src/views/agentPanel/AgentPanelView.tsx
- [ ] T029 Implement message pagination for 100+ message sessions in MessageHistoryView.tsx
- [ ] T030 Add conversation export (Markdown) in MessageHistoryView.tsx
- [ ] T031 Implement getSessionStats() analytics queries in sessionMessageRepository.ts
- [ ] T032 [P] Write UI component tests in extension/test/views/messageHistory.test.ts

**Checkpoint**: Users can view conversation history and session chains in UI

---

## Phase 6: Workflow Integration

**Purpose**: Integrate session continuation into verification workflow

**Dependencies**: Requires Phase 5 complete (full feature ready)

- [ ] T033 Update verification workflow to call continueSession() on failure in extension/src/agents/workflows/verificationWorkflow.ts
- [ ] T034 Add session stage tracking to workflow commands (set stage=PREPARE, IMPLEMENT, VERIFY, etc.)
- [ ] T035 Update task status transitions to create sessions with appropriate stage in extension/src/agents/workflows/taskWorkflow.ts
- [ ] T036 Verify CASCADE DELETE works with retention policy (test with existing session cleanup logic in extension/src/agents/sessions/sessionRepository.ts)
- [ ] T037 [P] Write end-to-end workflow tests in extension/test/integration/verifyFixWorkflow.test.ts
- [ ] T038 Update documentation in docs/ with session management usage examples

**Checkpoint**: Complete feature integrated into Orchestra workflow

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Database Schema)
    ↓
Phase 2 (Message Capture) ← Must wait for database schema
    ↓
Phase 3 (Resume) ← Must wait for messages being captured
    ↓
Phase 4 (Continuation) ← Must wait for resume working
    ↓
Phase 5 (UI) ← Must wait for all session operations working
    ↓
Phase 6 (Workflow Integration) ← Must wait for UI ready
```

### Within-Phase Parallel Opportunities

**Phase 1**: T001, T002, T006 can run in parallel after T003-T005 complete

**Phase 2**: T011 can run in parallel with T007-T010

**Phase 3**: T017 can run in parallel with T012-T016

**Phase 4**: T025 can run in parallel with T018-T024

**Phase 5**: T026, T027, T032 can run in parallel (different files)

**Phase 6**: T037 can run in parallel with T033-T036

### Critical Path

The minimum sequential path to completion:

```
T001 → T002 → T003 → T004 → T005 → T007 → T008 → T012 → T015 → T018 → T023 → T026 → T033 → T038
```

**Estimated**: ~38 tasks, critical path ~15 tasks

---

## Parallel Example: Phase 5 (UI Integration)

```bash
# Launch UI component development in parallel:
Task: "Create MessageHistoryView component in extension/src/views/agentPanel/MessageHistoryView.tsx"
Task: "Create SessionChainView component in extension/src/views/agentPanel/SessionChainView.tsx"
Task: "Write UI component tests in extension/test/views/messageHistory.test.ts"

# Once components ready, integrate:
Task: "Add message history tab to Agent Panel in extension/src/views/agentPanel/AgentPanelView.tsx"
```

---

## Implementation Strategy

### Phase-by-Phase Delivery

1. **Phase 1**: Database foundation → Run migrations, verify tables created
2. **Phase 2**: Message capture → Verify messages appearing in database during agent runs
3. **Phase 3**: Resume → Test resuming paused orchestrator session
4. **Phase 4**: Continuation → Test orchestrator → implementor feedback loop
5. **Phase 5**: UI → Users can view conversation history
6. **Phase 6**: Workflow → Full integration, verification uses continuation

### Incremental Validation

After each phase:

- Run relevant unit/integration tests
- Manually test new capability (e.g., resume a session, continue a session)
- Check database state (messages persisted, indexes working)
- Verify performance (message insert <5ms, retrieval <500ms)

### MVP Milestone (After Phase 4)

**Minimum Viable Product**: Phases 1-4 deliver core functionality

- Messages persisted ✓
- Sessions resumable ✓
- Sessions continuable ✓

Phase 5 (UI) and Phase 6 (Workflow) enhance UX but aren't blocking for core capability.

---

## Implementation Notes

### File Paths

All paths relative to repository root:

- Database migrations: `src/db/migrations/`
- Repository functions: `extension/src/agents/sessions/`
- Agent execution: `extension/src/agents/`
- UI components: `extension/src/views/agentPanel/`
- Tests: `extension/test/agents/`, `extension/test/views/`, `extension/test/integration/`

### Key Integration Points

1. **AgentSession.addMessage()** (T007):

   ```typescript
   addMessage(message: AgentMessage): void {
     this.messages.push(message);
     // NEW: Trigger async database insert
     SessionMessageRepository.insertMessage(this.workspaceRoot, {...}).catch(err => {
       console.error('Failed to persist message:', err);
     });
   }
   ```

2. **AgentRunner.resumeSession()** (T015):

   ```typescript
   async resumeSession(sessionId: string): Promise<AgentResult> {
     const messages = getSessionMessages(workspaceRoot, sessionId);
     const session = reconstructSession(messages);
     return this.continueExecution(session);
   }
   ```

3. **AgentRunner.continueSessionExecution()** (T023):
   ```typescript
   async continueSessionExecution(sessionId: string, prompt: string): Promise<AgentResult> {
     const newSession = continueSession(workspaceRoot, sessionId, prompt, 'IMPLEMENT_FIX');
     return this.resumeSession(newSession.id);
   }
   ```

### Performance Validation

After each phase, verify:

- Message insert: <5ms p95 (use console.time)
- Message retrieval: <500ms for 100 messages (query profiling)
- Continuation: <300ms to copy messages (measure copyMessages duration)
- Database size: <10MB per 50 sessions (check .orchestra/db file size)

### Agent Separation Enforcement

**CRITICAL**: Verify in T025 (continuation tests) that:

- Implementor sessions NEVER see orchestrator messages
- Session C_continued contains ONLY Session C messages + new prompt
- parent_session_id tracks lineage but NOT message inheritance

---

## Completion Criteria

Feature is complete when:

- ✅ All 38 tasks implemented and tested
- ✅ Orchestrator sessions resumable after pause (T017 passing)
- ✅ Implementor sessions continuable with feedback (T025 passing)
- ✅ UI displays conversation history and chains (T032 passing)
- ✅ Workflow uses continuation for fix cycles (T037 passing)
- ✅ Performance metrics met (<5ms insert, <500ms retrieval)
- ✅ Database size acceptable (<10MB per 50 sessions)
- ✅ Agent separation boundary enforced (no cross-agent message access)
- ✅ Documentation updated (T038 complete)

---

## Notes

- No [Story] labels - this is an infrastructure feature, not user-story driven
- Tests excluded per spec (not requested, no TDD requirement)
- Phases are sequential (database → capture → resume → continue → UI → workflow)
- Parallel opportunities within phases marked with [P]
- All file paths use extension/ directory (VS Code Extension architecture)
- Agent separation boundary is constitutional requirement - extensively tested
