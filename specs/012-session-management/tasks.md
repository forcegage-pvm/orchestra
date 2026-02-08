# Tasks: Session Management & Continuation

**Input**: Design documents from `/specs/012-session-management/`  
**Prerequisites**: plan.md, spec.md (5 user stories, 39 FR, 10 NFR), research.md, data-model.md, contracts/

**Tests**: Unit and integration tests are INCLUDED (T006, T011, T017, T025, T032, T037) for verification. TDD/red-phase tests are NOT requested in specification and are excluded per speckit.tasks instructions.

**Organization**: Tasks follow the 6-phase implementation plan from spec.md, organized around technical capabilities rather than user stories (this is an infrastructure feature, not end-user facing).

---

## Post-Master-Merge Audit (2026-02-07)

### Codebase Changes Since Spec Creation (2026-02-04)

The following changes were merged from master and affect implementation details:

1. **Migration system**: Extension uses JS migrations in `extension/src/database/migrations.ts` (array of `{id, description, up}` objects with IDs like `20260207_001_*`), NOT SQL files in `src/db/migrations/`. Session tables are extension-only.

2. **Drizzle ORM**: Extension uses Drizzle ORM via `OrchestraDB.getDrizzleInstance()`. Schema in `extension/src/database/local-schema.ts`. New tables/columns must be added in both the Drizzle schema AND as a JS migration.

3. **Template-based prompts (Sprint 010)**: `PromptBuilder` + `TemplateLoader` with Handlebars templates in `extension/templates/prompts/`. System prompt comes from `.github/agents/orchestra.{role}.agent.md` files via `readAgentInstructions()`. 13 main templates + 3 partials.

4. **Dual AgentSession types**:
   - `extension/src/agents/types.ts` → in-memory session class (AgentRunner internal)
   - `extension/src/agents/sessions/types.ts` → database session interface (repository layer)
   - New fields (stage, parent_session_id, etc.) go on the DATABASE type + schema

5. **UI architecture**: Webview-based (`extension/src/views/agent/`), not SolidJS. Templates in `agentOutputTemplate.ts` / `changedFilesTemplate.ts`.

6. **Existing continuation mechanisms**:
   - `AgentRunner.continueWithMessage(instruction)` - resumes stopped/paused sessions
   - `AgentRunner.redirect(instruction)` - injects into running sessions
   - `WorkflowChain` auto-chains workflow stages
   - `resumeFromStorage()` is DEPRECATED (throws error)

7. **Session events**: `session_events` table already exists with full event stream. `sessionRepository.ts` uses Drizzle ORM patterns.

### Spec Validity Assessment

- **Core concepts VALID**: Message persistence, session resume, session continuation, stage tracking, lineage
- **Architecture VALID**: Dual storage (events + messages), async persistence, agent separation
- **Contracts NEED UPDATE**: File paths, ORM patterns, migration approach, UI technology
- **Tasks UPDATED**: All file paths and implementation details corrected below

---

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

---

## Phase 1: Database Schema & Repository (Setup)

**Purpose**: Create database tables and repository layer for message persistence

**Blocking**: All subsequent phases depend on database schema

- [ ] T001 Add session_messages table definition to extension/src/database/local-schema.ts (Drizzle schema) AND create migration `20260207_001_create_session_messages` in extension/src/database/migrations.ts
- [ ] T002 Add stage/continuation columns to agent_sessions in extension/src/database/local-schema.ts AND create migration `20260207_002_add_session_stage_fields` in extension/src/database/migrations.ts (adds: stage, parent_session_id, attempt, is_continued, continued_at, continuation_count)
- [ ] T003 [P] Verify graceful degradation for sessions without message history (test legacy session queries return empty messages array, existing sessionRepository functions still work)
- [ ] T004 Implement SessionMessageRepository in extension/src/agents/sessions/sessionMessageRepository.ts (using Drizzle ORM patterns from existing sessionRepository.ts as reference — insertMessage, getSessionMessages, getSessionStats, deleteMessagesForSession)
- [ ] T005 Add SessionStage type and extend AgentSession interface in extension/src/agents/sessions/types.ts (SessionStage enum, continuation fields matching new schema columns)
- [ ] T006 [P] Write unit tests for SessionMessageRepository in extension/test/agents/sessionMessageRepository.test.ts

**Checkpoint**: Database schema ready - can now capture and query messages

---

## Phase 2: Message Capture During Execution

**Purpose**: Hook message capture into AgentRunner execution loop (async, non-blocking)

**Dependencies**: Requires Phase 1 complete (repository functions available)

- [ ] T007 Update AgentSession.addMessage() in extension/src/agents/AgentSession.ts to trigger async database insert via SessionMessageRepository (fire-and-forget with error logging, non-blocking)
- [ ] T008 Update AgentRunner.start() in extension/src/agents/AgentRunner.ts to capture system messages (initial agent instructions from readAgentInstructions(), sprint memory context, environment context)
- [ ] T009 Add single-message token estimation helper to SessionMessageRepository (wraps ContextManager.estimateTokens() for single messages, stores in token_count column)
- [ ] T010 Add error logging for failed message inserts in AgentSession.ts (graceful degradation — catch errors, log via console.warn, never throw)
- [ ] T011 [P] Write integration tests for message capture in extension/test/agents/messageCapture.test.ts

**Checkpoint**: Messages automatically persisted during agent execution without blocking

---

## Phase 3: Session Resume Capability

**Purpose**: Reconstruct AgentSession from database for paused/interrupted sessions

**Dependencies**: Requires Phase 2 complete (messages being captured)

- [ ] T012 Implement reconstructSession() in extension/src/agents/AgentRunner.ts (load messages from session_messages via SessionMessageRepository, rebuild in-memory AgentSession state)
- [ ] T013 Implement reconstructToolCalls() in extension/src/agents/AgentRunner.ts (query ToolResultEvent from session_events via existing eventRepository)
- [ ] T014 Implement reconstructFileChanges() in extension/src/agents/AgentRunner.ts (query ToolFileOperationEvent from session_events via existing eventRepository)
- [ ] T015 Replace deprecated resumeFromStorage() with new resumeSession() public API in extension/src/agents/AgentRunner.ts (uses reconstructSession + reconstructToolCalls + reconstructFileChanges, injects system resume message)
- [ ] T016 Add resume context injection (system message: "Session resumed after pause. Background processes/terminals from previous session are no longer available.")
- [ ] T017 [P] Write integration tests for session resume in extension/test/agents/sessionResume.test.ts

**Checkpoint**: Paused orchestrator sessions can be resumed with full context

---

## Phase 4: Session Continuation (Reuse)

**Purpose**: Enable session reuse for fix cycles (orchestrator → implementor feedback)

**Dependencies**: Requires Phase 3 complete (resume capability working)

- [ ] T018 Implement continueSession() in extension/src/agents/sessions/sessionRepository.ts (create new session record with parent_session_id, increment attempt, set stage, using Drizzle ORM)
- [ ] T019 Implement copyMessages() in extension/src/agents/sessions/sessionMessageRepository.ts (copy parent messages to child session, preserving message_index order)
- [ ] T020 Implement markSessionAsContinued() in extension/src/agents/sessions/sessionRepository.ts (set is_continued=true, increment continuation_count, set continued_at timestamp)
- [ ] T021 Implement getSessionChain() in extension/src/agents/sessions/sessionRepository.ts (recursive CTE query via raw SQL on OrchestraDB.getInstance() for parent→child chain traversal)
- [ ] T022 Implement getLatestImplementorSession() in extension/src/agents/sessions/sessionRepository.ts (find most recent implementor session for a given task, for continuation target)
- [ ] T023 Implement continueSessionExecution() in extension/src/agents/AgentRunner.ts (public API: creates continued session, copies messages, injects continuation prompt, resumes agent loop — integrates with existing continueWithMessage pattern)
- [ ] T024 Add validation for continuation depth limit (max 5 levels) in sessionRepository.ts (prevent infinite continuation chains)
- [ ] T025 [P] Write integration tests for session continuation in extension/test/agents/sessionContinuation.test.ts

**Checkpoint**: Implementor sessions can be continued with orchestrator feedback

---

## Phase 5: UI Integration

**Purpose**: Display message history and session chains in Agent Panel

**Dependencies**: Requires Phase 4 complete (all session operations working)

- [ ] T026 [P] Add message history view to Agent Panel webview in extension/src/views/agent/ (HTML template for displaying conversation messages, compatible with existing agentOutputTemplate.ts pattern)
- [ ] T027 [P] Add session chain visualization to Agent Panel webview in extension/src/views/agent/ (tree-style parent→child session display)
- [ ] T028 Integrate message history tab/toggle into existing AgentOutputPanel in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T029 Implement message pagination for 100+ message sessions (lazy loading with offset/limit)
- [ ] T030 Add conversation export (Markdown format) functionality
- [ ] T031 Implement getSessionStats() analytics queries in sessionMessageRepository.ts (token counts, message counts, timing per session)
- [ ] T032 [P] Write UI component tests in extension/test/views/messageHistory.test.ts

**Checkpoint**: Users can view conversation history and session chains in UI

---

## Phase 6: Workflow Integration

**Purpose**: Integrate session continuation into verification workflow

**Dependencies**: Requires Phase 5 complete (full feature ready)

- [ ] T033 Update WorkflowChain in extension/src/agents/WorkflowChain.ts to use continueSessionExecution() on verification failure (instead of spawning new session via handlePlayTask, continue the existing implementor session)
- [ ] T034 Add session stage tracking to PlayTaskHandler.ts (set stage=PREPARE, IMPLEMENT, VERIFY, IMPLEMENT_FIX, CODE_REVIEW when creating sessions via agentRunner.start())
- [ ] T035 Update PlayTaskHandler.ts to create sessions with appropriate stage and pass parent_session_id for retry/fix flows
- [ ] T036 Verify CASCADE DELETE works with retention policy (test with existing session cleanup logic in extension/src/agents/sessions/retention.ts — ensure session_messages are deleted when parent session purged)
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

**Phase 1**: T003, T006 can run in parallel after T001-T002 and T004-T005 complete

**Phase 2**: T011 can run in parallel with T007-T010

**Phase 3**: T017 can run in parallel with T012-T016

**Phase 4**: T025 can run in parallel with T018-T024

**Phase 5**: T026, T027, T032 can run in parallel (different files)

**Phase 6**: T037 can run in parallel with T033-T036

### Critical Path

The minimum sequential path to completion:

```
T001 → T002 → T004 → T005 → T007 → T008 → T012 → T015 → T018 → T023 → T026 → T028 → T033 → T038
```

**Estimated**: ~38 tasks, critical path ~14 tasks

---

## Key Implementation Notes

### Migration Pattern (follow existing)

```typescript
// In extension/src/database/migrations.ts, add to MIGRATIONS array:
{
  id: "20260207_001_create_session_messages",
  description: "Create session_messages table for LLM conversation persistence",
  up: (db) => {
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='session_messages'`
    ).all();
    if (tables.length > 0) return;

    db.exec(`CREATE TABLE session_messages (...)`);
    db.exec(`CREATE INDEX ...`);
  },
},
```

### Drizzle Schema Pattern (follow existing)

```typescript
// In extension/src/database/local-schema.ts:
export const sessionMessages = sqliteTable(
  "session_messages",
  {
    id: text("id").primaryKey(),
    session_id: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    message_index: integer("message_index").notNull(),
    role: text("role").notNull(),
    content: text("content", { mode: "json" }).notNull(),
    token_count: integer("token_count"),
    timestamp: text("timestamp").notNull(),
    iteration: integer("iteration").notNull(),
  },
  (messages) => ({
    sessionIdx: index("idx_messages_session").on(
      messages.session_id,
      messages.message_index,
    ),
  }),
);
```

### Database Access Pattern (follow existing sessionRepository.ts)

```typescript
import { OrchestraDB } from "../../database/client.js";
import * as schema from "../../database/local-schema.js";

export function insertMessage(workspaceRoot: string, message: MessageInput): SessionMessage {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);
  db.insert(schema.sessionMessages).values({...}).run();
  // ...
}
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

- Run relevant unit/integration tests (`npm test` in extension/)
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
