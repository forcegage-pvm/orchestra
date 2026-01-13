# Sprint 001: VS Code Extension Foundation (Phase 3)

> **Phase**: VS Code Extension | **Sprint**: 001 | **Status**: DRAFT

---

## Sprint Overview

**Goal**: Build read-only VS Code extension that visualizes Orchestra database state with real-time updates via DB triggers/file watchers. Enable agent invocation with role-based MCP server integration.

**Scope**: Dashboard webview, TreeView navigation, database reactivity, chat participant registration, MCP server lifecycle management.

**Out of Scope**: Write operations (task editing, manual verification controls), configuration UI, screenshot gallery viewer.

**Success Criteria**:
- Extension activates and detects `.orchestra/` workspace
- Dashboard displays current sprint/task with live updates
- TreeView shows sprint → phase → task hierarchy with status icons
- Database changes trigger UI updates within 500ms
- Chat participant `@orchestra` registered and provides handover context
- Both MCP servers (orchestrator/implementor) auto-start on extension activation

---

## Phases

### Phase 1: Foundation & Scaffolding
**Tasks**: 1-4  
**Goal**: Extension boilerplate, database client, basic activation

### Phase 2: Database Integration
**Tasks**: 5-9  
**Goal**: Database queries, reactive updates, SQLite trigger system

### Phase 3: UI Components
**Tasks**: 10-15  
**Goal**: Webview dashboard, TreeView navigation, task detail views

### Phase 4: Agent Integration
**Tasks**: 16-19  
**Goal**: Chat participant, MCP server management, agent context provider

### Phase 5: Polish & Testing
**Tasks**: 20-22  
**Goal**: Error handling, status bar, integration testing

---

## Tasks

### Phase 1: Foundation & Scaffolding

#### Task 1: Extension Scaffold
**Category**: INFRASTRUCTURE  
**Dependencies**: []  
**Description**: Create VS Code extension boilerplate with TypeScript, esbuild bundling, and activation events.

**Deliverables**:
- `extension/package.json` with extension manifest
- `extension/tsconfig.json` (extends root, targets ES2020)
- `extension/src/extension.ts` with `activate()` and `deactivate()`
- `extension/.vscodeignore`
- `extension/esbuild.config.js` for bundling
- Update root `package.json` scripts: `build:extension`, `watch:extension`

**Verification**:
- Extension activates in Extension Development Host
- No TypeScript errors
- Bundled extension.js < 500KB

---

#### Task 2: Workspace Detection
**Category**: INFRASTRUCTURE  
**Dependencies**: [1]  
**Description**: Detect `.orchestra/` folder in workspace and validate database exists.

**Deliverables**:
- `extension/src/workspace/detector.ts`
  - `findOrchestraRoot(): string | null` - searches workspace folders
  - `validateOrchestraWorkspace(root: string): boolean` - checks for `orchestra.db`
- Show information message if `.orchestra/` not found
- Deactivate extension gracefully if no Orchestra workspace

**Verification**:
- Opens non-Orchestra workspace → extension stays inactive
- Opens Orchestra workspace → extension activates and logs root path
- Unit tests: detector with mock workspace structure

---

#### Task 3: Database Client Singleton
**Category**: INFRASTRUCTURE  
**Dependencies**: [2]  
**Description**: Create read-only SQLite database client using better-sqlite3 with Drizzle ORM integration.

**Deliverables**:
- `extension/src/database/client.ts`
  - `OrchestraDB` singleton class
  - `getInstance(workspaceRoot: string): Database` - lazy initialization
  - `close()` method for cleanup
  - Read-only mode (`{ readonly: true }`)
- `extension/src/database/schema.ts` - import from `../../src/db/schema.ts`
- Error handling for missing/corrupted DB

**Verification**:
- Can open existing `orchestra.db`
- Cannot write to database (throws error)
- Singleton returns same instance on multiple calls
- Database closes on extension deactivate
- Unit tests: singleton behavior, error cases

---

#### Task 4: Extension Configuration
**Category**: INFRASTRUCTURE  
**Dependencies**: [1]  
**Description**: Define extension configuration settings and contribution points.

**Deliverables**:
- `package.json` contributions:
  - `configuration`: `orchestra.autoStartMCP`, `orchestra.updateInterval`
  - `commands`: `orchestra.openDashboard`, `orchestra.refreshStatus`
  - `viewsContainers.activitybar`: Orchestra icon
  - `views`: `orchestraExplorer` TreeView
- `extension/src/config/settings.ts` - typed config accessors

**Verification**:
- Settings appear in VS Code settings UI
- Commands registered (visible in Command Palette)
- TreeView container appears in activity bar
- Default values applied correctly

---

### Phase 2: Database Integration

#### Task 5: Database Query Layer
**Category**: INFRASTRUCTURE  
**Dependencies**: [3]  
**Description**: Create Drizzle ORM query helpers for common data access patterns.

**Deliverables**:
- `extension/src/database/queries.ts`
  - `getCurrentSprint(): Sprint | null`
  - `getCurrentTask(): Task & { handover: Handover } | null`
  - `getTasksForSprint(sprintId: string): Task[]`
  - `getPhases(sprintId: string): Phase[]`
  - `getTaskHistory(taskId: number): Progress[]`
  - `getVerificationResults(taskId: number, attempt: number): VerificationResult[]`
- All queries use Drizzle ORM with proper joins
- Return types match database schema (Zod inferred)

**Verification**:
- Queries return correct data from test database
- Joins work correctly (task with handover)
- Null handling for missing data
- Unit tests: each query with fixture data

---

#### Task 6: File Watcher Setup
**Category**: INFRASTRUCTURE  
**Dependencies**: [3]  
**Description**: Watch `orchestra.db` for changes using VS Code file system watcher.

**Deliverables**:
- `extension/src/database/watcher.ts`
  - `DatabaseWatcher` class
  - `onDidChange(callback: () => void): Disposable` - event emitter
  - Debounced updates (500ms) to prevent rapid-fire
  - Watches `**/.orchestra/orchestra.db`
- Register watcher in extension activation
- Dispose watcher on deactivation

**Verification**:
- DB change triggers callback within 500ms
- Multiple rapid changes debounced to single callback
- Watcher disposed on extension deactivate
- Unit tests: debounce behavior, disposal

---

#### Task 7: SQLite Trigger System (Optional Enhancement)
**Category**: INFRASTRUCTURE  
**Dependencies**: [6]  
**Description**: Implement SQLite triggers for more granular change detection (alternative to file watcher).

**Deliverables**:
- `extension/src/database/triggers.ts`
  - `setupTriggers(db: Database)` - creates triggers on tasks, signals, feedback
  - Triggers insert into `notifications` table with event type
  - `pollNotifications(): Notification[]` - queries new notifications
- Poll notifications every 1 second (more efficient than file watcher)
- Clear processed notifications

**Verification**:
- Task status change → notification created
- Signal received → notification created
- Notifications cleared after processing
- Performance: polling adds < 10ms overhead
- Unit tests: trigger creation, notification lifecycle

---

#### Task 8: Data Provider Base Class
**Category**: INFRASTRUCTURE  
**Dependencies**: [5]  
**Description**: Create abstract data provider with reactive update mechanism.

**Deliverables**:
- `extension/src/views/providers/BaseProvider.ts`
  - Abstract class with `refresh()` method
  - Subscribes to database watcher
  - Emits `onDidChangeTreeData` on DB change
  - Cache invalidation strategy
- `extension/src/views/providers/index.ts` - exports

**Verification**:
- DB change triggers provider refresh
- Cache cleared on refresh
- Subclasses can override refresh behavior
- Unit tests: refresh mechanism, cache invalidation

---

#### Task 9: Error Boundary & Logging
**Category**: INFRASTRUCTURE  
**Dependencies**: [3, 6]  
**Description**: Implement error handling and logging for database operations.

**Deliverables**:
- `extension/src/utils/logger.ts`
  - `OrchestraLogger` class using VS Code OutputChannel
  - Log levels: debug, info, warn, error
  - Structured logging with context
- `extension/src/utils/errors.ts`
  - `DatabaseError`, `WorkspaceError` custom error classes
  - Error boundary wrapper for database queries
- Wrap all database calls in try-catch with logging

**Verification**:
- Database errors logged to output channel
- Errors don't crash extension (graceful degradation)
- Output channel visible in "Output" panel
- Unit tests: error logging, error classes

---

### Phase 3: UI Components

#### Task 10: Dashboard Webview Panel
**Category**: VISUAL  
**Dependencies**: [4, 8]  
**Description**: Create main dashboard webview panel with sprint overview.

**Deliverables**:
- `extension/src/views/dashboard/DashboardPanel.ts`
  - Singleton webview panel
  - HTML/CSS/JS bundle (Svelte or React)
  - Message passing: extension ↔ webview
  - `update(data: DashboardData)` method
- `extension/src/views/dashboard/index.html` - webview HTML template
- `extension/src/views/dashboard/main.ts` - webview script
- Command: `orchestra.openDashboard`

**Verification**:
- Dashboard opens in editor area
- Displays sprint name and status
- Survives webview disposal/recreation
- Unit tests: panel creation, message passing

---

#### Task 11: Dashboard Sprint Summary
**Category**: VISUAL  
**Dependencies**: [10]  
**Description**: Display sprint overview with progress metrics on dashboard.

**Deliverables**:
- Dashboard sections:
  - Sprint header: ID, name, status badge
  - Progress bar: completed/total tasks with percentage
  - Phase breakdown: task counts per phase
  - Status distribution: pie chart (pending/in-progress/completed)
- CSS styling with VS Code theme colors (`var(--vscode-*)`)
- Responsive layout (min-width: 600px)

**Verification**:
- Displays correct task counts from database
- Progress bar animates on update
- Phase breakdown matches database
- Works in light and dark themes
- Manual test: verify against actual sprint data

---

#### Task 12: Dashboard Current Task Card
**Category**: VISUAL  
**Dependencies**: [10]  
**Description**: Display current task being worked on with live status updates.

**Deliverables**:
- Current Task Card component:
  - Task ID and title
  - Status badge (PENDING/IMPLEMENT/VERIFY/COMPLETE)
  - Category icon (INFRASTRUCTURE/INTEGRATION/VISUAL/REFACTOR)
  - Progress indicator (if verification in progress)
  - Last updated timestamp
  - "View Details" button → opens task detail view
- Empty state: "No active task"
- Auto-updates on DB change

**Verification**:
- Displays current task from `getCurrentTask()` query
- Status updates within 500ms of DB change
- Empty state when no active task
- Click "View Details" → task detail panel opens
- Manual test: start task, verify card updates

---

#### Task 13: Dashboard Timeline
**Category**: VISUAL  
**Dependencies**: [10]  
**Description**: Display chronological timeline of task events (signals, feedback, status changes).

**Deliverables**:
- Timeline component:
  - Reverse chronological order (newest first)
  - Event types: task_started, signal_received, verification_passed, verification_failed, feedback_sent
  - Each event: timestamp, icon, description, task link
  - Max 20 events (paginated)
  - Auto-scroll to top on new event
- Query `progress` and `signals` tables for events

**Verification**:
- Timeline displays last 20 events
- New event appears at top within 500ms
- Timestamps formatted relative (e.g., "2 minutes ago")
- Click task link → opens task detail view
- Manual test: signal task, verify timeline updates

---

#### Task 14: TreeView Sprint Explorer
**Category**: VISUAL  
**Dependencies**: [4, 8]  
**Description**: Create TreeView in activity bar showing sprint → phase → task hierarchy.

**Deliverables**:
- `extension/src/views/treeview/SprintTreeProvider.ts`
  - Implements `TreeDataProvider<TreeItem>`
  - Root: Sprint item
  - Children: Phase items
  - Grandchildren: Task items
  - Icons: status-based (pending/in-progress/completed)
  - Tooltip: task description
  - Click: opens task detail webview
- Register TreeView: `vscode.window.registerTreeDataProvider`

**Verification**:
- TreeView shows sprint hierarchy
- Icons match task status
- Click task → task detail opens
- Refresh on DB change
- Manual test: expand phases, verify structure

---

#### Task 15: Task Detail Webview
**Category**: VISUAL  
**Dependencies**: [10, 14]  
**Description**: Create detailed task view showing handover, verification results, feedback, and history.

**Deliverables**:
- `extension/src/views/task/TaskDetailPanel.ts`
  - Webview panel (one per task, reusable)
  - Sections: Task Info, Handover, Verification Results, Feedback, History
  - Tabs or accordion for organization
  - Markdown rendering for handover content
  - Collapsible verification checks
  - History timeline (similar to dashboard)
- Command: `orchestra.openTaskDetail`

**Verification**:
- Opens task detail on TreeView click
- Displays all task data correctly
- Markdown rendered properly
- Verification results show pass/fail status
- History timeline shows task-specific events
- Manual test: open task with feedback, verify display

---

### Phase 4: Agent Integration

#### Task 16: MCP Server Manager
**Category**: INTEGRATION  
**Dependencies**: [2]  
**Description**: Manage lifecycle of orchestrator and implementor MCP servers.

**Deliverables**:
- `extension/src/mcp/ServerManager.ts`
  - `startServer(role: 'orchestrator' | 'implementor'): ChildProcess`
  - `stopServer(role: string): void`
  - `restartServer(role: string): void`
  - Spawns `node dist/mcp-server/index.js --role <role>`
  - Logs server output to OutputChannel
  - Handles crashes and restarts
- Auto-start both servers on extension activation
- Register for cleanup on deactivation

**Verification**:
- Servers start on extension activation
- Server output visible in output channel
- Servers stop on extension deactivation
- Crash detection and restart within 5s
- Unit tests: start/stop lifecycle

---

#### Task 17: Chat Participant Registration
**Category**: INTEGRATION  
**Dependencies**: [16]  
**Description**: Register `@orchestra` chat participant for agent invocation.

**Deliverables**:
- `extension/src/chat/participant.ts`
  - `vscode.chat.createChatParticipant('orchestra', handler)`
  - Handler processes commands: `@orchestra status`, `@orchestra start task <id>`
  - Returns formatted response with current sprint/task info
  - Links to dashboard/task detail views
- Icon: Orchestra logo
- Description: "Orchestra task orchestration assistant"

**Verification**:
- `@orchestra` appears in chat participant list
- `@orchestra status` returns current sprint info
- Response includes clickable links to views
- Manual test: invoke in chat, verify response

---

#### Task 18: Agent Context Provider
**Category**: INTEGRATION  
**Dependencies**: [5, 17]  
**Description**: Provide handover and task context to agents via chat variables.

**Deliverables**:
- `extension/src/chat/context.ts`
  - Implements `vscode.ChatVariableResolver`
  - Variables: `#orchestra:current-task`, `#orchestra:handover`, `#orchestra:sprint`
  - Resolves to task content, handover markdown, sprint summary
  - Attaches to agent prompts automatically
- Register context provider in extension activation

**Verification**:
- Variables appear in chat autocomplete
- `#orchestra:current-task` resolves to task data
- `#orchestra:handover` returns handover markdown
- Agent receives context in prompt
- Manual test: use variable in chat, verify context

---

#### Task 19: Agent Invocation Commands
**Category**: INTEGRATION  
**Dependencies**: [16, 17]  
**Description**: Create commands to invoke orchestrator/implementor agents with pre-filled context.

**Deliverables**:
- Commands:
  - `orchestra.invokeOrchestrator` - opens chat with orchestrator agent
  - `orchestra.invokeImplementor` - opens chat with implementor agent
  - `orchestra.startTask <taskId>` - invokes implementor with task handover
- Pre-fill chat message with task context
- Automatically attach handover as variable
- CodeLens in TreeView: "Start Task" button on pending tasks

**Verification**:
- Command opens chat with correct agent
- Chat message pre-filled with task info
- Handover attached as context variable
- CodeLens visible on pending tasks
- Manual test: click "Start Task", verify chat opens

---

### Phase 5: Polish & Testing

#### Task 20: Status Bar Integration
**Category**: VISUAL  
**Dependencies**: [5, 14]  
**Description**: Display current task status in VS Code status bar.

**Deliverables**:
- `extension/src/views/statusbar/StatusBarItem.ts`
  - Status bar item: `$(orchestra) Task 5: IMPLEMENT`
  - Color: green (completed), yellow (in-progress), white (pending)
  - Tooltip: task title and phase
  - Click: opens dashboard
  - Updates on DB change
- Hide when no active sprint

**Verification**:
- Status bar shows current task
- Color matches status
- Click opens dashboard
- Updates within 500ms of DB change
- Manual test: change task status, verify update

---

#### Task 21: Error States & Empty States
**Category**: VISUAL  
**Dependencies**: [10, 14, 15]  
**Description**: Handle error states and empty states gracefully across all views.

**Deliverables**:
- Empty states:
  - No sprint: "Initialize a sprint to get started" with action button
  - No tasks: "No tasks in this sprint"
  - No active task: "No task currently in progress"
- Error states:
  - Database error: "Could not connect to Orchestra database"
  - Query error: "Failed to load data" with retry button
- Consistent styling and iconography
- Retry mechanisms for transient errors

**Verification**:
- Empty sprint workspace shows empty state
- Database disconnect shows error state
- Retry button re-attempts query
- All views degrade gracefully
- Manual test: simulate errors, verify states

---

#### Task 22: Integration Testing & Documentation
**Category**: INFRASTRUCTURE  
**Dependencies**: [1-21]  
**Description**: End-to-end integration tests and user documentation.

**Deliverables**:
- Integration tests:
  - Activate extension in test workspace
  - Database queries return expected data
  - Webview panels open and update
  - TreeView renders correctly
  - MCP servers start/stop
- `extension/README.md` - user guide
- `extension/CHANGELOG.md` - release notes
- Demo GIFs/screenshots for marketplace

**Verification**:
- All integration tests pass
- Test coverage > 70%
- README has installation instructions
- Screenshots show key features
- Manual test: walkthrough entire extension workflow

---

## Verification Strategy

### Structural Verification
- [ ] Extension package.json valid (vsce package succeeds)
- [ ] All commands registered and functional
- [ ] TreeView and webview contributions load
- [ ] Database client read-only enforced
- [ ] No TypeScript errors (strict mode)

### Behavioral Verification
- [ ] Extension activates on `.orchestra/` workspace
- [ ] Database changes trigger UI updates < 500ms
- [ ] All queries return correct data
- [ ] MCP servers auto-start and restart on crash
- [ ] Chat participant responds to commands

### Quality Verification
- [ ] Unit tests: > 80% coverage
- [ ] Integration tests: all core workflows
- [ ] Performance: UI updates < 500ms, queries < 100ms
- [ ] Memory: no leaks on DB updates (10,000 updates)
- [ ] Accessibility: webviews keyboard navigable

### Visual Verification
- [ ] Dashboard layout responsive (600px - 2000px)
- [ ] Works in light and dark themes
- [ ] Icons consistent and recognizable
- [ ] Typography follows VS Code guidelines
- [ ] Empty/error states clear and actionable

---

## Dependencies

```
Task 1: Extension Scaffold
├─ Task 2: Workspace Detection
│  └─ Task 3: Database Client
│     ├─ Task 5: Query Layer
│     │  ├─ Task 8: Data Provider
│     │  │  ├─ Task 10: Dashboard Webview
│     │  │  │  ├─ Task 11: Sprint Summary
│     │  │  │  ├─ Task 12: Current Task Card
│     │  │  │  └─ Task 13: Timeline
│     │  │  ├─ Task 14: TreeView
│     │  │  │  └─ Task 15: Task Detail View
│     │  │  └─ Task 20: Status Bar
│     │  └─ Task 17: Chat Participant
│     │     └─ Task 18: Context Provider
│     │        └─ Task 19: Agent Commands
│     ├─ Task 6: File Watcher
│     │  └─ Task 7: SQLite Triggers (optional)
│     ├─ Task 9: Error Handling
│     └─ Task 16: MCP Server Manager
│        └─ Task 17: Chat Participant
├─ Task 4: Configuration
│  ├─ Task 10: Dashboard
│  └─ Task 14: TreeView
└─ Task 21: Error States
   └─ Task 22: Integration Testing
```

---

## Technical Decisions

### Database Access Pattern
- **Read-only mode**: Phase 1 extension cannot modify database
- **Drizzle ORM**: Type-safe queries matching existing schema
- **Singleton pattern**: One DB connection per workspace
- **Reactivity**: File watcher + optional SQLite triggers

### UI Framework
- **Webview**: HTML/CSS/JS (Svelte or React for components)
- **TreeView**: Native VS Code API
- **Styling**: CSS with VS Code theme variables
- **No external UI libraries**: Keep bundle size small

### MCP Integration
- **Auto-start**: Both servers start on extension activation
- **Output channels**: Separate channel per server for debugging
- **Crash recovery**: Auto-restart on unexpected exit
- **Config override**: Users can disable auto-start

### Agent Integration
- **Chat participant**: `@orchestra` for commands
- **Context variables**: `#orchestra:current-task`, etc.
- **Pre-filled prompts**: Commands open chat with context
- **CodeLens**: "Start Task" button on pending tasks

---

## Success Metrics

- **Performance**: DB query → UI update < 500ms (P99)
- **Reliability**: MCP servers uptime > 99.9%
- **Usability**: User can navigate sprint → task → detail in < 3 clicks
- **Adoption**: 100% of current Orchestra users activate extension
- **Feedback**: Net Promoter Score > 8/10

---

## Rollout Plan

1. **Alpha**: Internal dogfooding (you + early testers)
2. **Beta**: Public preview on VS Code marketplace (unlisted)
3. **GA**: General availability with marketing push

---

## Out of Scope (Future Sprints)

- **Write operations**: Task editing, manual verification
- **Configuration UI**: Visual sprint/task editor
- **Screenshot gallery**: Visual regression viewer
- **Performance profiling**: Agent execution metrics
- **RAG integration**: Semantic search for past tasks
- **Multi-workspace**: Orchestra in mono-repo subfolders
