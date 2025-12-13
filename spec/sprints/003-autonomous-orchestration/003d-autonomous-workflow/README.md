# Sprint 003D: Autonomous Workflow Engine

**Status**: SPECIFICATION  
**Priority**: P1 - High Value  
**Estimated Duration**: 5-7 days  
**Prerequisites**: Sprint 003A, 003B, 003C complete  
**Parent**: 003-autonomous-orchestration  

---

## Executive Summary

Implement true semi-autonomous orchestration where the human supervisor starts the workflow and can walk away. The system automatically progresses tasks through stages, invokes the correct agents, manages chat sessions, and pauses on escalation or error.

### The Problem Today

- Each task action requires manual invocation
- Users must track what stage each task is in
- Must remember to start verification after implementation
- Must manually clear context between tasks

### The Solution

- WorkflowEngine that auto-progresses through stages
- SessionManager for dual chat sessions (orchestrator panel, implementor editor)
- Automatic session clearing between implementor tasks
- Pause/resume controls
- Escalation notification and handling

---

## Goals

### Primary Goals

1. **Autonomous Progression**: Tasks flow PENDING → IMPLEMENT → VERIFY → COMPLETE automatically
2. **Dual Sessions**: Separate sessions for orchestrator and implementor
3. **Session Isolation**: Implementor gets fresh session per task
4. **Escalation Handling**: Auto-pause and notify on escalation/error

### Secondary Goals

1. **Pause/Resume**: Manual intervention capability
2. **State Persistence**: Resume after VS Code restart
3. **Progress Visibility**: Clear indication of autonomous mode state

### Non-Goals

- Parallel task execution (future enhancement)
- Mobile notifications (future)
- Cross-workspace orchestration (future)

---

## Features

### Feature 1: Session Manager

**Dual Session Strategy**:
- **Orchestrator**: Chat Panel (persistent, keeps history for context)
- **Implementor**: Chat Editor Tab (cleared per task for isolation)

```typescript
// extension/src/sessions/SessionManager.ts

export class SessionManager {
  private orchestratorSessionActive = false;
  private implementorEditorUri: vscode.Uri | null = null;
  
  constructor(
    private readonly configService: ConfigService,
    private readonly promptBuilder: PromptBuilder,
    private readonly attachmentResolver: AttachmentResolver,
    private readonly logger: OrchestraLogger
  ) {}
  
  /**
   * Invoke orchestrator in Chat Panel
   * Uses existing panel session (preserves history)
   */
  async invokeOrchestrator(context: PromptContext): Promise<void> {
    const prompt = this.promptBuilder.buildPreparePrompt(context);
    const files = this.attachmentResolver.getPrepareAttachments(context.task);
    const model = this.configService.getModelForRole('orchestrator');
    
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: prompt,
      isPartialQuery: false,
      mode: 'agent',
      attachFiles: files.files,
      // Model selection TBD from spike
    });
    
    this.orchestratorSessionActive = true;
  }
  
  /**
   * Invoke implementor in Chat Editor Tab
   * Forces new session for task isolation
   */
  async invokeImplementor(context: PromptContext): Promise<void> {
    // Clear previous implementor session
    await this.clearImplementorSession();
    
    // Open new chat editor
    await vscode.commands.executeCommand('workbench.action.chat.newChatEditor');
    
    // Now invoke with prompt
    const prompt = this.promptBuilder.buildImplementPrompt(context);
    const files = this.attachmentResolver.getImplementAttachments(context.task);
    const model = this.configService.getModelForRole('implementor');
    
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: prompt,
      isPartialQuery: false,
      mode: 'agent',
      attachFiles: files.files,
    });
  }
  
  /**
   * Invoke orchestrator for verification
   */
  async invokeVerification(context: PromptContext): Promise<void> {
    const prompt = this.promptBuilder.buildVerifyPrompt(context);
    const model = this.configService.getModelForRole('orchestrator');
    
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: prompt,
      isPartialQuery: false,
      mode: 'agent',
    });
  }
  
  /**
   * Clear implementor session (close editor tab)
   */
  async clearImplementorSession(): Promise<void> {
    // Find and close any chat editor tabs
    // Implementation depends on VS Code API exploration
    this.logger.debug('Clearing implementor session');
  }
}
```

### Feature 2: Workflow Engine

**State Machine**:
```
IDLE ──[Start]──▶ RUNNING ──[Escalation/Error]──▶ PAUSED
  ▲                   │                              │
  │                   │                              │
  └───[Complete]──────┘                              │
  └─────────────────────[Resume]─────────────────────┘
```

**Core Loop**:

```typescript
// extension/src/workflow/WorkflowEngine.ts

export type WorkflowState = 'IDLE' | 'RUNNING' | 'PAUSED';

export class WorkflowEngine extends vscode.Disposable {
  private state: WorkflowState = 'IDLE';
  private currentTaskId: number | null = null;
  private dbWatcherSubscription: vscode.Disposable | null = null;
  private processingLock = false;
  
  private readonly _onStateChange = new vscode.EventEmitter<WorkflowState>();
  readonly onStateChange = this._onStateChange.event;
  
  constructor(
    private readonly orchestraRoot: string,
    private readonly sessionManager: SessionManager,
    private readonly dbWatcher: DatabaseWatcher,
    private readonly logger: OrchestraLogger
  ) {
    super(() => this.dispose());
  }
  
  get currentState(): WorkflowState {
    return this.state;
  }
  
  /**
   * Start autonomous mode
   */
  async start(): Promise<void> {
    if (this.state === 'RUNNING') {
      this.logger.warn('Workflow already running');
      return;
    }
    
    this.logger.info('Starting autonomous workflow');
    this.state = 'RUNNING';
    this._onStateChange.fire(this.state);
    
    // Subscribe to database changes
    this.dbWatcherSubscription = this.dbWatcher.onDidChange(() => {
      this.scheduleProcessing();
    });
    
    // Show notification
    vscode.window.showInformationMessage('Orchestra: Autonomous mode started');
    
    // Start processing
    await this.processNextAction();
  }
  
  /**
   * Pause autonomous mode
   */
  pause(reason?: string): void {
    if (this.state !== 'RUNNING') return;
    
    this.logger.info(`Pausing workflow: ${reason || 'manual'}`);
    this.state = 'PAUSED';
    this._onStateChange.fire(this.state);
    
    vscode.window.showWarningMessage(
      `Orchestra: Paused${reason ? ` - ${reason}` : ''}`
    );
  }
  
  /**
   * Resume from paused state
   */
  async resume(): Promise<void> {
    if (this.state !== 'PAUSED') return;
    
    this.logger.info('Resuming workflow');
    this.state = 'RUNNING';
    this._onStateChange.fire(this.state);
    
    vscode.window.showInformationMessage('Orchestra: Resumed');
    await this.processNextAction();
  }
  
  /**
   * Stop autonomous mode
   */
  stop(): void {
    this.logger.info('Stopping workflow');
    
    this.dbWatcherSubscription?.dispose();
    this.dbWatcherSubscription = null;
    this.state = 'IDLE';
    this.currentTaskId = null;
    this._onStateChange.fire(this.state);
    
    vscode.window.showInformationMessage('Orchestra: Stopped');
  }
  
  /**
   * Debounced processing trigger
   */
  private scheduleProcessing = debounce(() => {
    this.processNextAction();
  }, 500);
  
  /**
   * Process next workflow action
   */
  private async processNextAction(): Promise<void> {
    if (this.state !== 'RUNNING') return;
    if (this.processingLock) return;
    
    this.processingLock = true;
    
    try {
      const sprint = getCurrentSprint(this.orchestraRoot);
      if (!sprint) {
        this.stop();
        return;
      }
      
      const task = getCurrentTask(this.orchestraRoot);
      
      if (!task) {
        // Check if sprint is complete
        const progress = getSprintProgress(this.orchestraRoot);
        if (progress.completed === progress.total) {
          this.logger.info('Sprint complete!');
          this.stop();
          vscode.window.showInformationMessage('🎉 Orchestra: Sprint complete!');
        }
        return;
      }
      
      this.currentTaskId = task.task_id;
      
      const context: PromptContext = { task, sprint };
      
      switch (task.status) {
        case 'PENDING':
          this.logger.info(`Preparing task ${task.task_id}`);
          await this.sessionManager.invokeOrchestrator(context);
          break;
          
        case 'IMPLEMENT':
          this.logger.info(`Implementing task ${task.task_id}`);
          await this.sessionManager.invokeImplementor(context);
          break;
          
        case 'VERIFY':
          // Orchestrator is verifying - wait for completion
          this.logger.debug(`Task ${task.task_id} in verification`);
          break;
          
        case 'VERIFY_FAILED':
          this.logger.info(`Retrying task ${task.task_id}`);
          await this.sessionManager.invokeImplementor({
            ...context,
            retryCount: task.retry_count,
          });
          break;
          
        case 'ESCALATED':
          this.handleEscalation(task);
          break;
          
        case 'COMPLETE':
          // Move to next task on next db change
          this.logger.debug(`Task ${task.task_id} complete`);
          break;
      }
    } catch (error) {
      this.logger.error('Workflow processing error', error);
      this.pause(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      this.processingLock = false;
    }
  }
  
  /**
   * Handle escalated task
   */
  private handleEscalation(task: Task): void {
    this.pause(`Task ${task.task_id} escalated`);
    
    // Show notification with action
    vscode.window.showWarningMessage(
      `Orchestra: Task ${task.task_id} "${task.title}" was escalated`,
      'View Details'
    ).then(action => {
      if (action === 'View Details') {
        vscode.commands.executeCommand('orchestra.openTaskDetail', task.id);
      }
    });
  }
  
  dispose(): void {
    this.dbWatcherSubscription?.dispose();
    this._onStateChange.dispose();
  }
}
```

### Feature 3: Workflow Controls UI

**Status Bar Updates**:
```
[Orchestra: ⏹ Idle] or [Orchestra: ▶ Running] or [Orchestra: ⏸ Paused]
```

Click actions:
- Idle → Start autonomous mode
- Running → Show menu (Pause, Stop)
- Paused → Show menu (Resume, Stop)

**Commands**:

| Command | Title | When |
|---------|-------|------|
| `orchestra.startAutonomous` | Start Autonomous Mode | state == IDLE |
| `orchestra.pauseAutonomous` | Pause | state == RUNNING |
| `orchestra.resumeAutonomous` | Resume | state == PAUSED |
| `orchestra.stopAutonomous` | Stop | state != IDLE |

### Feature 4: State Persistence

**Store State on Pause/Stop**:
```typescript
interface PersistedState {
  state: WorkflowState;
  currentTaskId: number | null;
  pausedAt: string;
  reason?: string;
}

// Save to workspace state
context.workspaceState.update('orchestra.workflowState', state);

// Restore on activation
const persisted = context.workspaceState.get<PersistedState>('orchestra.workflowState');
```

**Behavior on Restart**:
- If was RUNNING → Start in PAUSED, prompt to resume
- If was PAUSED → Stay PAUSED
- If was IDLE → Stay IDLE

### Feature 5: Error Recovery

**Retry Strategy**:
- Agent invocation failure → Retry up to 3 times
- Persistent failure → Pause and notify
- Database error → Pause and notify

**Graceful Degradation**:
- If chat.open fails → Log error, don't crash
- If file attachment fails → Continue without files
- If model selection fails → Use default model

---

## Technical Approach

### Debounce Implementation

```typescript
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): T {
  let timeoutId: NodeJS.Timeout | null = null;
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}
```

### Package.json Updates

```json
{
  "commands": [
    {
      "command": "orchestra.startAutonomous",
      "title": "Orchestra: Start Autonomous Mode",
      "icon": "$(play)"
    },
    {
      "command": "orchestra.pauseAutonomous", 
      "title": "Orchestra: Pause",
      "icon": "$(debug-pause)"
    },
    {
      "command": "orchestra.resumeAutonomous",
      "title": "Orchestra: Resume",
      "icon": "$(play)"
    },
    {
      "command": "orchestra.stopAutonomous",
      "title": "Orchestra: Stop",
      "icon": "$(debug-stop)"
    }
  ],
  "menus": {
    "commandPalette": [
      {
        "command": "orchestra.startAutonomous",
        "when": "orchestra.workflowState == 'IDLE'"
      },
      {
        "command": "orchestra.pauseAutonomous",
        "when": "orchestra.workflowState == 'RUNNING'"
      },
      {
        "command": "orchestra.resumeAutonomous",
        "when": "orchestra.workflowState == 'PAUSED'"
      },
      {
        "command": "orchestra.stopAutonomous",
        "when": "orchestra.workflowState != 'IDLE'"
      }
    ]
  }
}
```

### Context Key for State

```typescript
// Set context for menu visibility
vscode.commands.executeCommand(
  'setContext', 
  'orchestra.workflowState', 
  this.state
);
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `extension/src/sessions/SessionManager.ts` | CREATE | Dual session management |
| `extension/src/workflow/WorkflowEngine.ts` | CREATE | Autonomous workflow loop |
| `extension/src/workflow/types.ts` | CREATE | State types and interfaces |
| `extension/src/utils/debounce.ts` | CREATE | Debounce utility |
| `extension/package.json` | MODIFY | Add commands, menus, context keys |
| `extension/src/extension.ts` | MODIFY | Instantiate engine, register commands |
| `extension/src/views/statusbar/StatusBarItem.ts` | MODIFY | Add workflow state display |

---

## Success Criteria

### Must Have

- [ ] `orchestra.startAutonomous` begins auto-progression
- [ ] Correct agent invoked at each stage
- [ ] Implementor session cleared between tasks
- [ ] Workflow pauses on escalation
- [ ] Status bar shows current state
- [ ] Pause/resume works correctly

### Should Have

- [ ] State persists across restart
- [ ] Error recovery with retry
- [ ] Notifications on state changes
- [ ] Progress tracking during run

### Could Have

- [ ] Estimated time remaining
- [ ] Audit log of all actions
- [ ] Parallel phase execution

---

## Task Breakdown (Preliminary)

1. Create workflow types and interfaces
2. Create debounce utility
3. Create SessionManager class
4. Implement invokeOrchestrator
5. Implement invokeImplementor with session clear
6. Implement invokeVerification
7. Create WorkflowEngine skeleton
8. Implement start/pause/resume/stop
9. Implement processNextAction
10. Implement escalation handling
11. Add state persistence
12. Update StatusBarManager for workflow state
13. Add workflow commands to package.json
14. Register commands in extension.ts
15. Add context key for menu visibility
16. Implement error recovery
17. Write unit tests for SessionManager
18. Write unit tests for WorkflowEngine
19. Integration testing
20. Manual E2E testing

---

## Dependencies

- Sprint 003A complete (TreeView, status bar foundation)
- Sprint 003B complete (ConfigService, PromptBuilder, AttachmentResolver)
- Sprint 003C complete (PlayTask, Chat invocation)
- DatabaseWatcher reliably detects changes
- MCP tools stable

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Chat session management unstable | High | Extensive testing, fallback to single session |
| Rapid status changes cause race conditions | Medium | Debounce + processing lock |
| Agent failures break flow | High | Robust error handling, auto-retry |
| State persistence corrupted | Low | Validate on load, default to IDLE |

---

## Testing Strategy

### Unit Tests

- WorkflowEngine state transitions
- SessionManager invocation methods
- Error handling paths

### Integration Tests

- Full workflow: PENDING → COMPLETE
- Escalation pause
- Resume after pause
- Error recovery

### Manual E2E Tests

- Start autonomous, complete 3 tasks
- Force escalation, verify pause
- Close VS Code during run, verify resume prompt
- Rapid status changes
