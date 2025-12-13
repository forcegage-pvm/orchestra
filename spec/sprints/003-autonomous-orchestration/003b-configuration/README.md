# Sprint 003B: Configuration & Prompt System

**Status**: SPECIFICATION  
**Priority**: P0 - Critical Path  
**Estimated Duration**: 2-3 days  
**Prerequisites**: Sprint 003A complete  
**Parent**: 003-autonomous-orchestration  

---

## Executive Summary

Enable users to configure preferred models/modes for orchestrator and implementor roles, and build a robust prompt system that generates context-rich prompts with file attachments for each workflow stage.

### The Problem Today

- No way to configure which model to use per role
- Prompts are ad-hoc, not structured per workflow stage
- No automatic file attachment (handovers, context files)
- Users must manually construct prompts with context

### The Solution

- VS Code settings for model configuration
- PromptBuilder service with templates per stage
- File attachment logic based on task handover
- Settings UI panel (optional enhancement)

---

## Goals

### Primary Goals

1. **Model Configuration**: Users can set preferred models per role
2. **Prompt Templates**: Stage-specific prompts with proper structure
3. **File Attachments**: Automatic attachment of relevant files

### Non-Goals

- Autonomous execution (Sprint 003D)
- Session management (Sprint 003D)
- UI for triggering prompts (Sprint 003C)

---

## Features

### Feature 1: Model Configuration Settings

**VS Code Settings**:

```json
{
  "orchestra.models.orchestrator": {
    "type": "string",
    "default": "claude-sonnet-4",
    "description": "Model for orchestrator agent (high-tier recommended)",
    "enum": ["claude-sonnet-4", "gpt-4o", "claude-3-opus"]
  },
  "orchestra.models.implementor": {
    "type": "string",
    "default": "claude-sonnet-4", 
    "description": "Model for implementor agent"
  },
  "orchestra.agents.orchestrator": {
    "type": "string",
    "default": "orchestra.orchestrator.agent",
    "description": "Agent file for orchestrator role"
  },
  "orchestra.agents.implementor": {
    "type": "string",
    "default": "orchestra.implementor.agent",
    "description": "Agent file for implementor role"
  }
}
```

**ConfigService**:

```typescript
export interface OrchestraConfig {
  models: {
    orchestrator: string;
    implementor: string;
  };
  agents: {
    orchestrator: string;
    implementor: string;
  };
}

export class ConfigService {
  getConfig(): OrchestraConfig;
  getModelForRole(role: 'orchestrator' | 'implementor'): string;
  getAgentForRole(role: 'orchestrator' | 'implementor'): string;
}
```

### Feature 2: Prompt Builder Service

**Stage Prompts**:

| Stage | Role | Prompt Template |
|-------|------|-----------------|
| PREPARE | Orchestrator | Prepare task with handover and verification |
| IMPLEMENT | Implementor | Get current task and implement |
| VERIFY | Orchestrator | Review signal and run verification |
| RETRY | Implementor | Address feedback and retry |

**PromptBuilder Interface**:

```typescript
export interface PromptContext {
  task: Task;
  sprint: Sprint;
  handoverPath?: string;
  feedbackPath?: string;
  retryCount?: number;
}

export class PromptBuilder {
  buildPreparePrompt(context: PromptContext): string;
  buildImplementPrompt(context: PromptContext): string;
  buildVerifyPrompt(context: PromptContext): string;
  buildRetryPrompt(context: PromptContext): string;
}
```

**Example Prompts**:

```typescript
// PREPARE prompt
buildPreparePrompt(context: PromptContext): string {
  return `As Orchestrator, prepare Task ${context.task.task_id}: "${context.task.title}".

## Your Task
Use your MCP tools to prepare this task for implementation:

1. \`get_task\` - Review the task specification and verification criteria
2. \`prepare_task\` - Create a comprehensive handover with:
   - Clear acceptance criteria
   - File operations (CREATE/UPDATE/DELETE)
   - Deliverables list
   - Context files to reference

## Task Details
- **ID**: ${context.task.task_id}
- **Title**: ${context.task.title}
- **Category**: ${context.task.category}
- **Phase**: ${context.task.phase_id}

## Description
${context.task.description}

## Remember
- Create verification criteria that the implementor CANNOT see
- Be specific about expected file changes
- Include test requirements`;
}

// IMPLEMENT prompt
buildImplementPrompt(context: PromptContext): string {
  return `Start implementing your current task.

## Instructions
1. Call \`get_current_task\` to receive your handover
2. Follow the acceptance criteria exactly
3. Create/update files as specified in file_operations
4. Ensure build passes and tests pass
5. Call \`signal_completion\` when done

## Guidelines
- Read the handover carefully before starting
- Check dependencies are met
- Run tests after implementation
- Signal with accurate artifact list`;
}
```

### Feature 3: File Attachment Logic

**AttachmentResolver**:

```typescript
export interface AttachmentSet {
  files: vscode.Uri[];
  description: string;
}

export class AttachmentResolver {
  constructor(private readonly orchestraRoot: string) {}
  
  /**
   * Get files to attach for PREPARE stage
   */
  getPreparAttachments(task: Task): AttachmentSet {
    // Attach task spec if exists
    return { files: [], description: 'Task specification' };
  }
  
  /**
   * Get files to attach for IMPLEMENT stage
   */
  getImplementAttachments(task: Task): AttachmentSet {
    const files: vscode.Uri[] = [];
    
    // Always attach handover
    const handoverPath = this.getHandoverPath(task.task_id);
    if (fs.existsSync(handoverPath)) {
      files.push(vscode.Uri.file(handoverPath));
    }
    
    // Attach context files from handover
    const handover = this.getHandover(task.task_id);
    if (handover?.context_files) {
      for (const contextFile of handover.context_files) {
        const fullPath = path.join(this.orchestraRoot, '..', contextFile);
        if (fs.existsSync(fullPath)) {
          files.push(vscode.Uri.file(fullPath));
        }
      }
    }
    
    return { files, description: 'Handover and context files' };
  }
  
  /**
   * Get files to attach for RETRY stage
   */
  getRetryAttachments(task: Task): AttachmentSet {
    const files = this.getImplementAttachments(task).files;
    
    // Also attach feedback if exists
    const feedbackPath = this.getFeedbackPath(task.task_id);
    if (fs.existsSync(feedbackPath)) {
      files.push(vscode.Uri.file(feedbackPath));
    }
    
    return { files, description: 'Handover, context, and feedback' };
  }
}
```

### Feature 4: Settings UI Panel (Optional Enhancement)

A dedicated panel for Orchestra settings, alternatively users can use VS Code's native settings UI.

**If Implemented**:
- WebView panel showing current config
- Model dropdowns for orchestrator/implementor
- Test connection buttons
- Link to agent file configuration

**Recommendation**: Start with VS Code native settings, add panel later if needed.

---

## Technical Approach

### Package.json Configuration Contribution

```json
{
  "contributes": {
    "configuration": {
      "title": "Orchestra",
      "properties": {
        "orchestra.models.orchestrator": {
          "type": "string",
          "default": "claude-sonnet-4",
          "description": "Model for orchestrator agent",
          "order": 1
        },
        "orchestra.models.implementor": {
          "type": "string",
          "default": "claude-sonnet-4",
          "description": "Model for implementor agent",
          "order": 2
        },
        "orchestra.agents.orchestrator": {
          "type": "string",
          "default": "orchestra.orchestrator.agent",
          "description": "Agent ID for orchestrator role",
          "order": 3
        },
        "orchestra.agents.implementor": {
          "type": "string",
          "default": "orchestra.implementor.agent",
          "description": "Agent ID for implementor role",
          "order": 4
        }
      }
    }
  }
}
```

### ConfigService Implementation

```typescript
// extension/src/config/ConfigService.ts

import * as vscode from 'vscode';

export class ConfigService {
  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('orchestra');
  }
  
  getModelForRole(role: 'orchestrator' | 'implementor'): string {
    return this.config.get(`models.${role}`, 'claude-sonnet-4');
  }
  
  getAgentForRole(role: 'orchestrator' | 'implementor'): string {
    return this.config.get(`agents.${role}`, `orchestra.${role}.agent`);
  }
  
  onConfigChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('orchestra')) {
        callback();
      }
    });
  }
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `extension/src/config/ConfigService.ts` | CREATE | Configuration access service |
| `extension/src/prompts/PromptBuilder.ts` | CREATE | Stage-specific prompt templates |
| `extension/src/prompts/AttachmentResolver.ts` | CREATE | File attachment logic |
| `extension/package.json` | MODIFY | Add configuration contribution |
| `extension/src/extension.ts` | MODIFY | Instantiate ConfigService |

---

## Success Criteria

- [ ] VS Code settings show Orchestra configuration options
- [ ] ConfigService correctly reads settings
- [ ] PromptBuilder generates appropriate prompts per stage
- [ ] AttachmentResolver finds and returns correct files
- [ ] Configuration changes are detected and applied
- [ ] Unit tests pass for all new services

---

## Task Breakdown (Preliminary)

1. Add configuration contribution to package.json
2. Create ConfigService class
3. Create PromptBuilder with prepare template
4. Add implement template to PromptBuilder
5. Add verify and retry templates
6. Create AttachmentResolver class
7. Implement handover file resolution
8. Implement context file resolution
9. Write unit tests for ConfigService
10. Write unit tests for PromptBuilder
11. Write unit tests for AttachmentResolver
12. Integration testing

---

## Dependencies

- Sprint 003A complete (TreeView and status bar)
- Handover files stored in known location
- Database queries for task/handover data
