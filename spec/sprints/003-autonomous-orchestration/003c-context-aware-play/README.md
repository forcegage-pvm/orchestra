# Sprint 003C: Context-Aware Play Button

**Status**: SPECIFICATION  
**Priority**: P0 - Critical Path  
**Estimated Duration**: 2-3 days  
**Prerequisites**: Sprint 003A, 003B complete  
**Parent**: 003-autonomous-orchestration  

---

## Executive Summary

Implement a single "Play" action that intelligently does the right thing based on task status. This provides one-click task progression without requiring users to remember which agent to invoke or what prompt to use.

### The Problem Today

- Users must manually decide which agent to invoke
- Must construct prompts manually
- Must remember to attach relevant files
- Different actions needed at different stages

### The Solution

- Single "Play" command that adapts to task status
- Automatically selects correct agent (orchestrator/implementor)
- Uses correct model from configuration
- Builds appropriate prompt with file attachments
- Opens in current chat window (no session management yet)

---

## Goals

### Primary Goals

1. **One-Click Action**: Single button does the right thing
2. **Status-Aware**: Behavior changes based on task status
3. **Correct Agent**: Automatically selects orchestrator or implementor
4. **Proper Context**: Uses configured model and attaches files

### Non-Goals

- Session spawning/management (Sprint 003D)
- Automatic workflow progression (Sprint 003D)
- Multiple concurrent sessions (Sprint 003D)

---

## Features

### Feature 1: Play Button Behavior

**Status → Action Mapping**:

| Task Status | Action | Agent | Opens |
|-------------|--------|-------|-------|
| PENDING | Prepare Task | Orchestrator | Current chat |
| IMPLEMENT | Start Implementation | Implementor | Current chat |
| VERIFY | (Disabled) | - | - |
| VERIFY_FAILED | Retry Implementation | Implementor | Current chat |
| ESCALATED | Show Escalation | - | Task detail panel |
| COMPLETE | (Disabled) | - | - |

### Feature 2: Chat Invocation

**Using VS Code Chat API**:

```typescript
async function invokeChat(options: ChatInvocationOptions): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: options.prompt,
    isPartialQuery: false,  // Auto-send
    mode: 'agent',
    // Note: agentId and modelSelector need investigation
    attachFiles: options.files,
  });
}
```

**ChatInvocationOptions**:

```typescript
interface ChatInvocationOptions {
  prompt: string;
  role: 'orchestrator' | 'implementor';
  model: string;
  files: vscode.Uri[];
}
```

### Feature 3: Play Command Handler

```typescript
// extension/src/commands/playTask.ts

export async function handlePlayTask(
  orchestraRoot: string,
  taskId: number,
  configService: ConfigService,
  promptBuilder: PromptBuilder,
  attachmentResolver: AttachmentResolver,
  logger: OrchestraLogger
): Promise<void> {
  const task = getTask(orchestraRoot, taskId);
  if (!task) {
    vscode.window.showErrorMessage(`Task ${taskId} not found`);
    return;
  }
  
  const sprint = getCurrentSprint(orchestraRoot);
  const context: PromptContext = { task, sprint };
  
  switch (task.status) {
    case 'PENDING':
      await invokePrepare(context, configService, promptBuilder, attachmentResolver);
      break;
      
    case 'IMPLEMENT':
      await invokeImplement(context, configService, promptBuilder, attachmentResolver);
      break;
      
    case 'VERIFY_FAILED':
      await invokeRetry(context, configService, promptBuilder, attachmentResolver);
      break;
      
    case 'ESCALATED':
      await vscode.commands.executeCommand('orchestra.openTaskDetail', task.id);
      vscode.window.showWarningMessage(
        `Task ${taskId} is escalated. Review the escalation details.`
      );
      break;
      
    case 'VERIFY':
      vscode.window.showInformationMessage(
        `Task ${taskId} is being verified. Please wait.`
      );
      break;
      
    case 'COMPLETE':
      vscode.window.showInformationMessage(
        `Task ${taskId} is already complete.`
      );
      break;
      
    default:
      vscode.window.showErrorMessage(`Unknown task status: ${task.status}`);
  }
}

async function invokePrepare(
  context: PromptContext,
  configService: ConfigService,
  promptBuilder: PromptBuilder,
  attachmentResolver: AttachmentResolver
): Promise<void> {
  const prompt = promptBuilder.buildPreparePrompt(context);
  const attachments = attachmentResolver.getPrepareAttachments(context.task);
  const model = configService.getModelForRole('orchestrator');
  
  await invokeAgent('orchestrator', prompt, attachments.files, model);
}

async function invokeImplement(
  context: PromptContext,
  configService: ConfigService,
  promptBuilder: PromptBuilder,
  attachmentResolver: AttachmentResolver
): Promise<void> {
  const prompt = promptBuilder.buildImplementPrompt(context);
  const attachments = attachmentResolver.getImplementAttachments(context.task);
  const model = configService.getModelForRole('implementor');
  
  await invokeAgent('implementor', prompt, attachments.files, model);
}

async function invokeRetry(
  context: PromptContext,
  configService: ConfigService,
  promptBuilder: PromptBuilder,
  attachmentResolver: AttachmentResolver
): Promise<void> {
  const prompt = promptBuilder.buildRetryPrompt(context);
  const attachments = attachmentResolver.getRetryAttachments(context.task);
  const model = configService.getModelForRole('implementor');
  
  await invokeAgent('implementor', prompt, attachments.files, model);
}
```

### Feature 4: Agent Invocation

**Investigation Required**: Exact mechanism to select agent.

**Option A - Agent in Prompt** (Fallback):
```typescript
async function invokeAgent(
  role: 'orchestrator' | 'implementor',
  prompt: string,
  files: vscode.Uri[],
  model: string
): Promise<void> {
  // Include agent reference in prompt
  const agentPrefix = role === 'orchestrator' 
    ? '@orchestra.orchestrator.agent' 
    : '@orchestra.implementor.agent';
  
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: `${agentPrefix} ${prompt}`,
    isPartialQuery: false,
    mode: 'agent',
    attachFiles: files,
  });
}
```

**Option B - Agent ID Parameter** (Preferred if available):
```typescript
async function invokeAgent(
  role: 'orchestrator' | 'implementor',
  prompt: string,
  files: vscode.Uri[],
  model: string
): Promise<void> {
  const agentId = role === 'orchestrator' 
    ? 'orchestra-orc' 
    : 'orchestra-imp';
  
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: prompt,
    isPartialQuery: false,
    mode: 'agent',
    agentId: agentId,
    modelSelector: model,
    attachFiles: files,
  });
}
```

### Feature 5: UI Integration

**TreeView Play Button**:
- Inline button on hovering task item
- Context menu "Play" action
- Keyboard shortcut (Enter on selected task)

**Status Bar**:
- Click current task → Play action

**Task Detail Panel**:
- Primary action button

**Package.json Commands**:
```json
{
  "commands": [
    {
      "command": "orchestra.playTask",
      "title": "Play Task",
      "icon": "$(play)"
    }
  ],
  "menus": {
    "view/item/context": [
      {
        "command": "orchestra.playTask",
        "when": "view == orchestraTasks && viewItem =~ /task-(pending|implement|verify_failed)/",
        "group": "inline"
      }
    ]
  }
}
```

---

## Technical Approach

### Spike: Agent Selection API

Before implementation, run a quick spike to test:

1. Does `agentId` parameter work in `chat.open`?
2. Does `modelSelector` accept model name strings?
3. Does `@agentname` prefix in query work?

**Spike Code**:
```typescript
// Test agent selection
await vscode.commands.executeCommand('workbench.action.chat.open', {
  query: 'Hello, which agent are you?',
  isPartialQuery: false,
  mode: 'agent',
  agentId: 'orchestra-orc',  // Test this
});
```

### Command Registration

```typescript
// extension/src/extension.ts

context.subscriptions.push(
  vscode.commands.registerCommand('orchestra.playTask', async (item: TaskTreeItem) => {
    const taskId = item?.taskId ?? getCurrentTask(orchestraRoot)?.task_id;
    if (!taskId) {
      vscode.window.showErrorMessage('No task selected');
      return;
    }
    await handlePlayTask(orchestraRoot, taskId, configService, promptBuilder, attachmentResolver, logger);
  })
);
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `extension/src/commands/playTask.ts` | CREATE | Play command handler |
| `extension/src/chat/invoker.ts` | CREATE | Chat invocation utilities |
| `extension/package.json` | MODIFY | Add play command, menus, keybindings |
| `extension/src/extension.ts` | MODIFY | Register play command |
| `extension/src/views/treeview/SprintTreeProvider.ts` | MODIFY | Add inline play button |

---

## Success Criteria

- [ ] Play button appears on playable tasks (PENDING, IMPLEMENT, VERIFY_FAILED)
- [ ] Clicking Play opens chat with correct prompt
- [ ] Correct agent is selected (orchestrator or implementor)
- [ ] Files are attached to the chat
- [ ] Model from config is used (if API supports)
- [ ] Non-playable states show appropriate message
- [ ] Escalated tasks open detail panel

---

## Task Breakdown (Preliminary)

1. **Spike**: Test chat.open API with agentId and modelSelector
2. Create chat invoker utility
3. Create playTask command handler
4. Implement PENDING → Prepare flow
5. Implement IMPLEMENT → Implement flow
6. Implement VERIFY_FAILED → Retry flow
7. Handle ESCALATED state
8. Add play button to TreeView (inline)
9. Add play to context menu
10. Add keyboard shortcut
11. Connect status bar click to play
12. Write integration tests
13. Manual testing with real agents

---

## Dependencies

- Sprint 003A complete (TreeView context values, status bar)
- Sprint 003B complete (ConfigService, PromptBuilder, AttachmentResolver)
- VS Code Chat API (chat.open command)
- Agent files registered in workspace

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| agentId parameter not supported | Fall back to @agent prefix in prompt |
| modelSelector format unknown | Test during spike, use default if fails |
| File attachment fails | Log warning, continue without files |

---

## Open Questions

1. **Agent Selection**: How exactly to select .agent.md file programmatically?
2. **Model Format**: What format does modelSelector expect?
3. **Error Handling**: What happens if chat.open fails?

These will be answered in the spike task.
