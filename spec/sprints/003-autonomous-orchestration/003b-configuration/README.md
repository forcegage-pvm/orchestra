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
- No automatic resolution of context files from handover
- Users must manually construct prompts with context

### The Solution

- VS Code settings for model configuration
- PromptBuilder service with templates per stage (prompts instruct agents to use MCP tools)
- Context file resolution: convert `context_files` from handover DB to workspace URIs
- Settings UI panel (optional enhancement)

**IMPORTANT**: Handovers are stored in the database (`handovers` table), not as files. The implementor retrieves handover data via the `get_current_task` MCP tool.

---

## Goals

### Primary Goals

1. **Model Configuration**: Users can set preferred models per role
2. **Prompt Templates**: Stage-specific prompts that instruct agents to use MCP tools
3. **Context File Resolution**: Resolve `context_files` from handover DB to workspace URIs for chat attachments

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

### Feature 3: Context File Resolution

**ContextFileResolver** (renamed from AttachmentResolver):

Resolves `context_files` from the handover database record to workspace URIs.

**IMPORTANT**: Handovers are NOT files. They are rows in the `handovers` SQLite table. The implementor receives handover data via the `get_current_task` MCP tool. The `context_files` column contains a JSON array of workspace-relative paths that the implementor should read.

```typescript
export interface ContextFileSet {
  files: vscode.Uri[];
  description: string;
}

export class ContextFileResolver {
  constructor(
    private readonly workspaceRoot: string,
    private readonly db: OrchestraDB
  ) {}
  
  /**
   * Get context files for IMPLEMENT stage
   * Resolves context_files from handover DB to workspace URIs
   */
  async getImplementContextFiles(taskId: number): Promise<ContextFileSet> {
    const files: vscode.Uri[] = [];
    
    // Query handover from database
    const handover = await this.db.getHandover(taskId);
    if (!handover) {
      return { files: [], description: 'No handover found' };
    }
    
    // Resolve context_files to workspace URIs
    if (handover.context_files) {
      const contextPaths = JSON.parse(handover.context_files) as string[];
      for (const relativePath of contextPaths) {
        const fullPath = path.join(this.workspaceRoot, relativePath);
        if (fs.existsSync(fullPath)) {
          files.push(vscode.Uri.file(fullPath));
        }
      }
    }
    
    return { files, description: 'Context files from handover' };
  }
  
  /**
   * Get context files for RETRY stage
   * Same as implement, feedback comes from database not files
   */
  async getRetryContextFiles(taskId: number): Promise<ContextFileSet> {
    // Same as implement - feedback is in database, not a file
    return this.getImplementContextFiles(taskId);
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
- [ ] PromptBuilder generates appropriate prompts per stage (instructing use of MCP tools)
- [ ] ContextFileResolver resolves context_files from handover DB to workspace URIs
- [ ] Configuration changes are detected and applied
- [ ] Unit tests pass for all new services

**Architecture Verification**:
- [ ] No references to "handover files" - handovers are DB rows
- [ ] Prompts instruct agents to use MCP tools (get_task, get_current_task, signal_completion, etc.)

---

## Task Breakdown (Preliminary)

1. Add configuration contribution to package.json
2. Create ConfigService class
3. Register ConfigService in extension.ts
4. Create PromptBuilder with prepare template
5. Add implement template to PromptBuilder
6. Add verify and retry templates
7. Create ContextFileResolver class (queries handover from DB)
8. Implement context_files resolution (JSON array → workspace URIs)
9. Write unit tests for ConfigService
10. Write unit tests for PromptBuilder
11. Write unit tests for ContextFileResolver
12. Integration testing

**NOTE**: No "handover file resolution" task - handovers are database rows, not files.

---

## Dependencies

- Sprint 003A complete (TreeView and status bar)
- Database schema with `handovers` table (already exists)
- Database queries for task/handover data (already exist in extension)
