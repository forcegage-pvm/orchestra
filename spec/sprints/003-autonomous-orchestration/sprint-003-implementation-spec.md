# Sprint 003: Autonomous Orchestration - Implementation Specification

**Version**: 1.0  
**Created**: 2025-12-12  
**Status**: READY FOR TASK CREATION  
**Prerequisites**: Sprint 002 (Technical Debt) complete  

---

## 1. Executive Summary

This specification defines the implementation details for Sprint 003: Autonomous Orchestration. The sprint transforms Orchestra from manual agent invocation to semi-autonomous workflow progression.

### Key Outcomes

1. Human supervisor starts autonomous mode, walks away
2. Correct agent invoked at each workflow stage with correct mode/model
3. Automatic pause on escalation/error with notification
4. Context-aware Play button adapts to task status

---

## 2. Current State Analysis

### 2.1 Existing Extension Structure

```
extension/src/
├── extension.ts           # Entry point, workspace init, MCP setup
├── chat/
│   ├── context.ts         # Sprint/task context formatting
│   └── participant.ts     # @orchestra chat participant (status, start, context)
├── database/
│   ├── client.ts          # OrchestraDB wrapper
│   ├── queries.ts         # SQL query functions
│   └── watcher.ts         # DatabaseWatcher for change detection
├── mcp/
│   ├── ConfigGenerator.ts # MCP config generation
│   └── ServerManager.ts   # MCP server lifecycle
├── views/
│   ├── dashboard/         # DashboardPanel webview
│   ├── task/              # TaskDetailPanel webview
│   ├── settings/          # SprintSettingsPanel
│   ├── statusbar/         # StatusBarManager
│   ├── treeview/          # SprintTreeProvider
│   └── providers/         # ViewDecorationProvider
└── workspace/
    └── detector.ts        # Orchestra workspace detection
```

### 2.2 Existing Agent Files

| File | Description |
|------|-------------|
| `extension/agents/orchestra.orchestrator.agent.md` | Orchestrator role with `orchestra-orchestrator/*` MCP tools |
| `extension/agents/orchestra.implementor.agent.md` | Implementor role with `orchestra-implementor/*` MCP tools |

### 2.3 Current Chat Participant

The `@orchestra` participant provides:
- `status` - Sprint overview
- `start task <id>` - Task info and guidance
- `context` - Rich context for agents

**Gap**: No programmatic agent invocation with correct mode/model selection.

---

## 3. Technical Design

### 3.1 Session Manager

**Purpose**: Manage two persistent chat sessions for orchestrator and implementor roles.

**Session Strategy**:
- **Orchestrator**: Chat Panel (persistent history across tasks)
- **Implementor**: Chat Editor Tab (cleared per task for isolation)

```typescript
// extension/src/sessions/SessionManager.ts

export interface SessionConfig {
  role: 'orchestrator' | 'implementor';
  agentFile: string;  // Path to .agent.md file
  model?: string;     // Optional model override
}

export class SessionManager {
  private orchestratorActive = false;
  private implementorActive = false;
  
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly orchestraRoot: string,
    private readonly logger: OrchestraLogger
  ) {}
  
  /**
   * Invoke orchestrator in Chat Panel
   * Reuses existing session, preserves history
   */
  async invokeOrchestrator(prompt: string, files?: vscode.Uri[]): Promise<void>;
  
  /**
   * Invoke implementor in Chat Editor Tab
   * Forces new session for isolation
   */
  async invokeImplementor(prompt: string, files?: vscode.Uri[]): Promise<void>;
  
  /**
   * Clear implementor session (called before each implement phase)
   */
  async clearImplementorSession(): Promise<void>;
}
```

**Implementation Notes**:
1. Use `workbench.action.chat.open` with `mode: 'agent'` for orchestrator
2. Use `workbench.action.chat.newChatEditor` + `workbench.action.chat.open` for implementor
3. Agent selection via prompt prefix or `agentId` parameter (needs investigation)

### 3.2 Agent Selection Mechanism

**Investigation Required**: How to programmatically select a specific `.agent.md` file.

**Option A**: Include agent reference in prompt
```typescript
const prompt = `@orchestra.orchestrator.agent Prepare task ${taskId}`;
```

**Option B**: Use agent ID from package.json contribution
```typescript
await vscode.commands.executeCommand('workbench.action.chat.open', {
  query: prompt,
  mode: 'agent',
  agentId: 'orchestra-orchestrator',  // Registered in package.json
});
```

**Option C**: Use mode selector to pick agent
```typescript
// First select the agent via mode picker, then send prompt
await vscode.commands.executeCommand('workbench.action.chat.openModePicker');
```

**Recommendation**: Investigate Option B first (most programmatic control).

### 3.3 Prompt Builder

**Purpose**: Build context-rich prompts for each workflow stage.

```typescript
// extension/src/prompts/PromptBuilder.ts

export interface PromptContext {
  task: Task;
  sprint: Sprint;
  handoverPath?: string;
  contextFiles?: string[];
}

export class PromptBuilder {
  /**
   * Build prompt for PREPARE stage (orchestrator)
   */
  buildPreparePrompt(context: PromptContext): string {
    return `As Orchestrator, prepare Task ${context.task.task_id}: "${context.task.title}".

Use your MCP tools to:
1. Call get_task to review the task specification
2. Call prepare_task with acceptance criteria and verification checks
3. Ensure handover is comprehensive for the implementor

Task Description:
${context.task.description}`;
  }
  
  /**
   * Build prompt for IMPLEMENT stage (implementor)
   */
  buildImplementPrompt(context: PromptContext): string {
    return `Start implementing your current task.

Use get_current_task to receive your handover, then implement according to acceptance criteria.
Signal completion when done.`;
  }
  
  /**
   * Build prompt for VERIFY stage (orchestrator)
   */
  buildVerifyPrompt(context: PromptContext): string {
    return `As Orchestrator, verify Task ${context.task.task_id}: "${context.task.title}".

Use your MCP tools to:
1. Call get_signal to see the implementor's completion signal
2. Call run_verification_checks to execute automated checks
3. Call submit_verification_judgment with your PASS/FAIL decision`;
  }
}
```

### 3.4 Workflow Engine

**Purpose**: Automatically progress tasks through workflow stages.

**State Machine**:
```
IDLE ──[Start Autonomous]──▶ RUNNING ──[Escalation/Error]──▶ PAUSED
  ▲                              │                              │
  │                              │                              │
  └───────[Sprint Complete]──────┘                              │
  └───────────────────────[Resume]──────────────────────────────┘
```

```typescript
// extension/src/workflow/WorkflowEngine.ts

export type WorkflowState = 'IDLE' | 'RUNNING' | 'PAUSED';

export interface WorkflowEngineConfig {
  orchestraRoot: string;
  sessionManager: SessionManager;
  promptBuilder: PromptBuilder;
  dbWatcher: DatabaseWatcher;
  logger: OrchestraLogger;
}

export class WorkflowEngine {
  private state: WorkflowState = 'IDLE';
  private currentTaskId: number | null = null;
  private statusChangeHandler: vscode.Disposable | null = null;
  
  constructor(private readonly config: WorkflowEngineConfig) {}
  
  /**
   * Start autonomous mode
   */
  async start(): Promise<void> {
    if (this.state === 'RUNNING') return;
    
    this.state = 'RUNNING';
    this.emitStateChange();
    
    // Subscribe to database changes
    this.statusChangeHandler = this.config.dbWatcher.onDidChange(() => {
      this.processNextAction();
    });
    
    // Start processing
    await this.processNextAction();
  }
  
  /**
   * Pause autonomous mode (after current action completes)
   */
  pause(): void {
    this.state = 'PAUSED';
    this.emitStateChange();
  }
  
  /**
   * Resume from paused state
   */
  async resume(): Promise<void> {
    if (this.state !== 'PAUSED') return;
    
    this.state = 'RUNNING';
    this.emitStateChange();
    await this.processNextAction();
  }
  
  /**
   * Stop autonomous mode entirely
   */
  stop(): void {
    this.statusChangeHandler?.dispose();
    this.statusChangeHandler = null;
    this.state = 'IDLE';
    this.currentTaskId = null;
    this.emitStateChange();
  }
  
  /**
   * Process next workflow action based on current task status
   */
  private async processNextAction(): Promise<void> {
    if (this.state !== 'RUNNING') return;
    
    const task = getCurrentTask(this.config.orchestraRoot);
    
    if (!task) {
      // No current task - sprint may be complete
      this.stop();
      this.notifyComplete();
      return;
    }
    
    this.currentTaskId = task.task_id;
    
    switch (task.status) {
      case 'PENDING':
        await this.invokePrepare(task);
        break;
        
      case 'IMPLEMENT':
        await this.invokeImplement(task);
        break;
        
      case 'VERIFY':
        // Orchestrator is verifying - wait for status change
        break;
        
      case 'VERIFY_FAILED':
        // Retry implementation
        await this.invokeImplement(task);
        break;
        
      case 'ESCALATED':
        this.pause();
        this.notifyEscalation(task);
        break;
        
      case 'COMPLETE':
        // Move to next task - will be picked up on next status change
        break;
    }
  }
  
  private async invokePrepare(task: Task): Promise<void> {
    const prompt = this.config.promptBuilder.buildPreparePrompt({ task, sprint: getCurrentSprint() });
    await this.config.sessionManager.invokeOrchestrator(prompt);
  }
  
  private async invokeImplement(task: Task): Promise<void> {
    await this.config.sessionManager.clearImplementorSession();
    const prompt = this.config.promptBuilder.buildImplementPrompt({ task, sprint: getCurrentSprint() });
    // NOTE: Handover data comes from database via get_current_task MCP tool.
    // context_files from handover are workspace-relative paths the implementor should read.
    const contextFiles = await this.config.attachmentResolver.getContextFiles(task.task_id);
    await this.config.sessionManager.invokeImplementor(prompt, contextFiles);
  }
}
```

### 3.5 Context-Aware Play Button

**Purpose**: Single "Play" button that adapts behavior based on task status.

**Status → Action Mapping**:

| Task Status | Play Action | Agent | Clears Session |
|-------------|-------------|-------|----------------|
| PENDING | Prepare task | Orchestrator | No |
| IMPLEMENT | Implement task | Implementor | Yes |
| VERIFY | (Disabled - orchestrator working) | - | - |
| VERIFY_FAILED | Retry implementation | Implementor | Yes |
| ESCALATED | Show escalation panel | Human | - |
| COMPLETE | (Disabled - task done) | - | - |

**Implementation**: Update TreeView item context and command handler.

### 3.6 Model Configuration

**Strategy**: Configurable via VS Code settings with sensible defaults.

```typescript
// extension/src/config/models.ts

export interface ModelConfig {
  orchestrator: string;
  implementor: string;
}

export function getModelConfig(): ModelConfig {
  const config = vscode.workspace.getConfiguration('orchestra');
  return {
    orchestrator: config.get('models.orchestrator', 'claude-sonnet-4'),
    implementor: config.get('models.implementor', 'claude-sonnet-4'),
  };
}
```

**package.json contribution**:
```json
{
  "configuration": {
    "properties": {
      "orchestra.models.orchestrator": {
        "type": "string",
        "default": "claude-sonnet-4",
        "description": "Model for orchestrator agent (high-tier recommended)"
      },
      "orchestra.models.implementor": {
        "type": "string",
        "default": "claude-sonnet-4",
        "description": "Model for implementor agent"
      }
    }
  }
}
```

---

## 4. UI Components

### 4.1 Status Bar Integration

**Current**: StatusBarManager exists but may need updates.

**Updates Needed**:
- Show workflow engine state (Idle/Running/Paused)
- Click to toggle autonomous mode or show menu

```
[Orchestra: Running ▶] or [Orchestra: Paused ⏸] or [Orchestra: Idle ⏹]
```

### 4.2 TreeView Decorations

**Updates Needed**:
- Highlight currently executing task
- Show workflow state icon per task

### 4.3 Commands

**New Commands**:

| Command | Title | Description |
|---------|-------|-------------|
| `orchestra.startAutonomous` | Start Autonomous Mode | Begin automatic workflow |
| `orchestra.pauseAutonomous` | Pause Autonomous Mode | Pause after current action |
| `orchestra.resumeAutonomous` | Resume Autonomous Mode | Continue from paused |
| `orchestra.stopAutonomous` | Stop Autonomous Mode | Cancel entirely |
| `orchestra.playTask` | Play Task | Context-aware task action |

### 4.4 Notifications

- **On Start**: "Orchestra: Autonomous mode started"
- **On Pause**: "Orchestra: Paused - [Reason]"
- **On Escalation**: "Orchestra: Task {id} escalated - human intervention required"
- **On Complete**: "Orchestra: Sprint complete!"
- **On Error**: "Orchestra: Error - [message]"

---

## 5. File Changes Summary

### 5.1 New Files

| Path | Purpose |
|------|---------|
| `extension/src/sessions/SessionManager.ts` | Chat session management |
| `extension/src/prompts/PromptBuilder.ts` | Stage-specific prompt templates |
| `extension/src/workflow/WorkflowEngine.ts` | Autonomous workflow loop |
| `extension/src/workflow/WorkflowState.ts` | State machine types |

### 5.2 Modified Files

| Path | Changes |
|------|---------|
| `extension/src/extension.ts` | Instantiate WorkflowEngine, register commands |
| `extension/src/views/statusbar/StatusBarItem.ts` | Add workflow state display |
| `extension/src/views/treeview/SprintTreeProvider.ts` | Add task status decorations |
| `extension/package.json` | Add commands, menus, settings |

---

## 6. Dependencies

### 6.1 Internal

- DatabaseWatcher must reliably detect status changes
- MCP tools must be stable and working
- Agent files must be properly registered

### 6.2 External

- VS Code 1.95+ (Chat API with mode/model support)
- Copilot extension active

---

## 7. Testing Strategy

### 7.1 Unit Tests

- SessionManager: Mock vscode.commands.executeCommand
- PromptBuilder: Verify prompt structure per stage
- WorkflowEngine: Test state transitions

### 7.2 Integration Tests

- Full workflow: PENDING → IMPLEMENT → VERIFY → COMPLETE
- Escalation handling: Verify pause and notification
- Error recovery: Agent failure doesn't break engine

### 7.3 Manual Testing

- Start autonomous mode, verify agents are invoked correctly
- Pause/resume during workflow
- Test with actual agent responses

---

## 8. Open Questions (Resolved or For Investigation)

| # | Question | Resolution |
|---|----------|------------|
| 1 | How to select specific .agent.md file? | **Investigate**: Test `agentId` parameter in `chat.open` options |
| 2 | Can we detect when agent response completes? | **Yes**: Use `blockOnResponse: true` in chat.open options |
| 3 | Model selection format? | **Investigate**: Test `modelSelector` parameter format |
| 4 | Proposed APIs needed? | **No**: Stable API sufficient for MVP |

---

## 9. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Agent selection API unclear | Test during Phase 1, have fallback prompt-based approach |
| Chat API behavior changes | Pin VS Code minimum version, document known-working behavior |
| Agent failures break workflow | Robust error handling with auto-retry (max 3) before pause |
| Rapid status changes | Debounce processNextAction calls (500ms) |

---

## 10. Success Criteria

### Must Have (MVP)

- [ ] `orchestra.startAutonomous` starts workflow progression
- [ ] Correct agent invoked at each stage (orchestrator/implementor)
- [ ] Agent mode selected correctly
- [ ] Implementor session cleared between tasks
- [ ] Workflow pauses on escalation
- [ ] Status bar shows current state
- [ ] Play button works per task status

### Should Have

- [ ] Model selection per role (configurable)
- [ ] File attachment to prompts
- [ ] Pause/resume works correctly
- [ ] TreeView shows executing task
- [ ] Notifications on state changes

### Could Have (Future)

- [ ] Session history preserved for orchestrator
- [ ] Audit log of all autonomous actions
- [ ] Parallel task support (different phases)

---

## 11. Next Steps

1. **Spike**: Test agent selection API (`agentId` vs prompt-based)
2. **Create Tasks**: Break down into Orchestra tasks with verification criteria
3. **Configure Sprint**: Set up sprint in Orchestra database
4. **Implement**: Follow the workflow we're building!

---

## Appendix A: Chat API Quick Reference

```typescript
// Force new session in panel
await vscode.commands.executeCommand('workbench.action.chat.newChat');

// Open with options
await vscode.commands.executeCommand('workbench.action.chat.open', {
  query: 'Your prompt here',
  isPartialQuery: false,     // Auto-send
  mode: 'agent',             // Agent mode
  modelSelector: 'claude-sonnet-4',  // Model (format TBD)
  attachFiles: [uri],        // Attach files
  blockOnResponse: true,     // Wait for completion
});

// Open as editor tab
await vscode.commands.executeCommand('workbench.action.chat.newChatEditor');
```

---

## Appendix B: Workflow State Diagram

```
                                    ┌──────────────────────┐
                                    │                      │
                    ┌───────────────┤    IDLE              │
                    │               │                      │
                    │               └──────────────────────┘
                    │                          │
                    │            [Start]       │
                    │                          ▼
                    │               ┌──────────────────────┐
                    │               │                      │
[Sprint Complete]   │               │    RUNNING           │◀────┐
                    │               │                      │     │
                    │               └──────────────────────┘     │
                    │                          │                 │
                    │                          │                 │
                    │        [Escalation/      │     [Resume]    │
                    │         Error]           │                 │
                    │                          ▼                 │
                    │               ┌──────────────────────┐     │
                    │               │                      │     │
                    └───────────────│    PAUSED            │─────┘
                                    │                      │
                                    └──────────────────────┘
```
