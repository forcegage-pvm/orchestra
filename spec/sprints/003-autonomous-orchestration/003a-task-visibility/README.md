# Sprint 003A: Task Visibility & UI Excellence

**Status**: SPECIFICATION  
**Priority**: P0 - Critical Path  
**Estimated Duration**: 3-4 days  
**Prerequisites**: Extension foundation complete  
**Parent**: 003-autonomous-orchestration  

---

## Executive Summary

Transform the Orchestra TreeView into a professional, information-dense, user-experience-driven interface. This sprint establishes the visual foundation for all subsequent orchestration features.

### Design Principles

1. **Professional Aesthetics**: No emojis. Only VS Code codicons (ThemeIcon)
2. **Information Density**: Show relevant data without clutter
3. **Visual Hierarchy**: Clear distinction between states, actions, priorities
4. **Discoverability**: Actions and information are obvious and accessible
5. **Intuitive Labels**: User-friendly status names, not technical jargon

### The Problem Today

From current UI analysis:
- Double checkmarks ("✓, ✓") on completed tasks - redundant and confusing
- Technical status names (GATE_CHECK, VERIFY_FAILED) not user-friendly
- No inline task details or expanded info panel
- No action buttons visible - must right-click to discover
- No visual distinction between task states
- Phase headers have no actions
- Current task not visually prominent

### The Solution

- GitLens-style "Current Task" expanded section with actions
- Professional codicon icons with semantic colors
- Status translation layer (VERIFY_FAILED → "Needs Attention")
- Inline action buttons on hover
- Section header actions (refresh, filter, settings)
- Progress indicators on phases
- Clear visual hierarchy with proper indentation and weight

---

## Goals

### Primary Goals

1. **Professional UI**: Clean, dense, no frivolous elements
2. **Status Clarity**: Instant visual recognition of task state
3. **Action Discoverability**: Primary actions visible, secondary in context menu
4. **Current Task Focus**: Expanded panel showing task details and actions

### Non-Goals

- Model/mode configuration (Sprint 003B)
- Smart prompt building (Sprint 003B)
- Autonomous execution (Sprint 003D)

---

## Architecture: Multi-View Pattern (GitLens Style)

The Orchestra sidebar uses **multiple views** in one viewContainer, following the GitLens pattern:

```
┌─────────────────────────────────────────────────────────┐
│ ORCHESTRA                                     [↻] [⚙]  │ ← Activity bar icon
├─────────────────────────────────────────────────────────┤
│ ▼ CURRENT TASK                                    [▶]  │ ← WebviewView (collapsible)
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Task 5: MCP Server Setup                            │ │
│ │ Status: In Progress                                 │ │
│ │                                                     │ │
│ │ Implement the MCP server with tool handlers         │ │
│ │ for orchestrator and implementor roles.             │ │
│ │                                                     │ │
│ │ Category: INTEGRATION     Attempt: 1/3              │ │
│ │                                                     │ │
│ │ [▶ Continue Implementation]    [View Handover]      │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ ▼ SPRINT EXPLORER                                      │ ← TreeView (collapsible)
│   ▼ Phase 1: Core Infrastructure                 (2/4) │
│       ○ Task 1: Database Schema                  Ready │
│       ● Task 2: MCP Server Setup           In Progress │
│       ○ Task 3: API Endpoints                    Ready │
│       ✓ Task 4: Basic Tests                  Complete  │
│   ▶ Phase 2: Integration                         (0/3) │
│   ▶ Phase 3: Testing                             (0/2) │
├─────────────────────────────────────────────────────────┤
│ ▶ WORKFLOW CONTROLS                                    │ ← WebviewView (collapsible)
└─────────────────────────────────────────────────────────┘
```

### View Container Registration

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "orchestra",
        "title": "Orchestra",
        "icon": "resources/orchestra-icon.svg"
      }]
    },
    "views": {
      "orchestra": [
        {
          "id": "orchestra.currentTask",
          "name": "Current Task",
          "type": "webview",
          "visibility": "visible"
        },
        {
          "id": "orchestra.sprintExplorer", 
          "name": "Sprint Explorer",
          "type": "tree",
          "visibility": "visible"
        },
        {
          "id": "orchestra.workflowControls",
          "name": "Workflow Controls",
          "type": "webview",
          "visibility": "collapsed"
        }
      ]
    }
  }
}
```

### View Responsibilities

| View | Type | Purpose |
|------|------|---------|
| **Current Task** | WebviewView | Rich panel with task details, action buttons, stats |
| **Sprint Explorer** | TreeView | Hierarchical navigation of phases/tasks |
| **Workflow Controls** | WebviewView | Autonomous mode controls (future sprint) |

---

## Features

### Feature 1: Status Translation System

**Problem**: Technical status names are not user-friendly.

**Solution**: Translation layer for all user-facing status text.

```typescript
// extension/src/views/statusTranslation.ts

export interface StatusDisplay {
  label: string;           // User-friendly name
  icon: string;            // Codicon name (without $())
  color: string;           // ThemeColor name  
  description: string;     // Tooltip/detail text
  actionLabel?: string;    // Primary action button text
}

export const STATUS_DISPLAY: Record<string, StatusDisplay> = {
  'PENDING': {
    label: 'Ready',
    icon: 'circle-outline',
    color: 'descriptionForeground',
    description: 'Task is ready to be prepared',
    actionLabel: 'Prepare',
  },
  'IMPLEMENT': {
    label: 'In Progress',
    icon: 'play-circle',
    color: 'charts.blue',
    description: 'Task is being implemented',
    actionLabel: 'Continue',
  },
  'VERIFY': {
    label: 'Reviewing',
    icon: 'eye',
    color: 'charts.yellow',
    description: 'Implementation is being verified',
  },
  'VERIFY_FAILED': {
    label: 'Needs Attention',
    icon: 'warning',
    color: 'charts.orange',
    description: 'Verification failed - review feedback',
    actionLabel: 'View Feedback',
  },
  'GATE_CHECK': {
    label: 'Quality Check',
    icon: 'checklist',
    color: 'charts.yellow',
    description: 'Running quality gates',
  },
  'ESCALATED': {
    label: 'Escalated',
    icon: 'alert',
    color: 'charts.red',
    description: 'Requires human intervention',
    actionLabel: 'Review',
  },
  'COMPLETE': {
    label: 'Complete',
    icon: 'pass-filled',
    color: 'charts.green',
    description: 'Task completed successfully',
  },
};
```

### Feature 2: Current Task WebviewView

**Purpose**: Rich panel showing current task with full details and action buttons.

**Implementation**: `WebviewViewProvider` registered for `orchestra.currentTask`.

```typescript
// extension/src/views/currentTask/CurrentTaskViewProvider.ts

export class CurrentTaskViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'orchestra.currentTask';
  
  private _view?: vscode.WebviewView;
  
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _orchestraRoot: string,
    private readonly _dbWatcher: DatabaseWatcher
  ) {
    // Refresh when database changes
    this._dbWatcher.onDidChange(() => this._refresh());
  }
  
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    
    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'playTask':
          vscode.commands.executeCommand('orchestra.playTask', message.taskId);
          break;
        case 'viewHandover':
          vscode.commands.executeCommand('orchestra.viewHandover', message.taskId);
          break;
      }
    });
  }
  
  private _refresh(): void {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }
  
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const task = getCurrentTask(this._orchestraRoot);
    const status = task ? STATUS_DISPLAY[task.status] : null;
    
    // Return styled HTML with task details and buttons
    return `<!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: var(--vscode-font-family); padding: 12px; }
        .task-card { /* card styles */ }
        .task-title { font-size: 14px; font-weight: 600; }
        .task-status { color: var(--vscode-descriptionForeground); }
        .task-description { margin: 12px 0; }
        .task-meta { display: flex; gap: 16px; color: var(--vscode-descriptionForeground); }
        .actions { display: flex; gap: 8px; margin-top: 12px; }
        button { /* VS Code button styles */ }
        button.primary { background: var(--vscode-button-background); }
      </style>
    </head>
    <body>
      ${task ? this._renderTask(task, status) : this._renderNoTask()}
    </body>
    </html>`;
  }
}
```

**Card Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ Task 5: MCP Server Setup                                │ ← Title
│ Status: In Progress                                     │ ← Status (user-friendly)
│                                                         │
│ Implement the MCP server with tool handlers for         │ ← Description
│ orchestrator and implementor roles. Include proper      │
│ error handling and logging.                             │
│                                                         │
│ Category: INTEGRATION          Attempt: 1/3             │ ← Metadata
│                                                         │
│ [▶ Continue Implementation]    [View Handover]          │ ← Action buttons
└─────────────────────────────────────────────────────────┘
```

### Feature 3: Sprint Explorer TreeView

**Purpose**: Hierarchical navigation of sprint phases and tasks.

**Target State**:
```
▼ SPRINT EXPLORER                                   [↻]
  ▼ Phase 1: Core Infrastructure                  (2/4)
      ○ Task 1: Database Schema                   Ready
      ● Task 2: MCP Server Setup             In Progress
      ○ Task 3: API Endpoints                     Ready
      ✓ Task 4: Basic Tests                    Complete
  ▶ Phase 2: Integration                          (0/3)
  ▶ Phase 3: Testing                              (0/2)
```

**Key Elements**:
- Phase headers with progress count (X/Y)
- Single status icon per task (no badges, no double indicators)
- User-friendly status in description (not VERIFY_FAILED)
- Inline action button on hover (play icon)
- Click task → focuses CurrentTaskViewProvider

### Feature 4: Professional Icon System

**Using VS Code Codicons** (ThemeIcon):

| Status | Codicon | Color Variable |
|--------|---------|----------------|
| PENDING/Ready | `circle-outline` | `descriptionForeground` |
| IMPLEMENT/In Progress | `play-circle` | `charts.blue` |
| VERIFY/Reviewing | `eye` | `charts.yellow` |
| VERIFY_FAILED/Needs Attention | `warning` | `charts.orange` |
| ESCALATED | `alert` | `charts.red` |
| COMPLETE | `pass-filled` | `charts.green` |
| BLOCKED (dependencies) | `lock` | `disabledForeground` |

**Phase Icons**:
| State | Codicon |
|-------|---------|
| Collapsed | `chevron-right` |
| Expanded | `chevron-down` |
| All Complete | `pass` |
| Has Escalated | `alert` |

**Header Actions**:
| Action | Codicon | Tooltip |
|--------|---------|---------|
| Refresh | `refresh` | Refresh sprint data |
| Settings | `gear` | Sprint settings |
| Filter | `filter` | Filter tasks |

### Feature 5: Section Header Actions

**Phase Headers** should have inline actions:

```json
{
  "menus": {
    "view/item/context": [
      {
        "command": "orchestra.startPhase",
        "when": "viewItem == phase",
        "group": "inline"
      }
    ]
  }
}
```

**TreeView Title Actions**:

```json
{
  "menus": {
    "view/title": [
      {
        "command": "orchestra.refresh",
        "group": "navigation"
      },
      {
        "command": "orchestra.openSettings",
        "group": "navigation"
      }
    ]
  }
}
```

### Feature 6: Inline Task Actions

**On Hover**: Show primary action button inline.

```json
{
  "menus": {
    "view/item/context": [
      {
        "command": "orchestra.playTask",
        "when": "viewItem =~ /task-(pending|implement|verify_failed)/",
        "group": "inline"
      },
      {
        "command": "orchestra.viewDetails",
        "when": "viewItem =~ /task-.*/",
        "group": "inline"
      }
    ]
  }
}
```

**Icons for Inline Actions**:
| Action | Codicon |
|--------|---------|
| Play/Start | `play` |
| View Details | `info` |
| View Handover | `file-text` |
| View Feedback | `comment` |

### Feature 7: Fix Double Checkmark Issue

**Problem**: Completed tasks show "✓, ✓" 

**Root Cause**: Likely both icon AND description showing checkmarks.

**Fix**: Single status indicator via icon only.

```typescript
getTreeItem(element: TaskTreeItem): vscode.TreeItem {
  const status = STATUS_DISPLAY[element.status];
  
  const item = new vscode.TreeItem(element.label);
  item.iconPath = new vscode.ThemeIcon(status.icon, new vscode.ThemeColor(status.color));
  
  // Description shows user-friendly status, NOT a checkmark
  item.description = status.label;
  
  // Remove any decoration that might add second checkmark
  return item;
}
```

### Feature 8: Status Bar Improvements

**Current**: Basic indicator

**Target**:
```
$(play-circle) Task 5: In Progress   $(checklist) 8/22 (36%)
```

**Components**:
- Current task with status icon and user-friendly label
- Sprint progress with count and percentage
- Click handlers for navigation

---

## Technical Approach

### TreeView Provider Refactor

```typescript
// extension/src/views/treeview/SprintTreeProvider.ts

export class SprintTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  
  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.type === 'phase') {
      return this.buildPhaseItem(element);
    } else if (element.type === 'task') {
      return this.buildTaskItem(element);
    }
    throw new Error(`Unknown node type: ${element.type}`);
  }
  
  private buildTaskItem(task: TaskNode): vscode.TreeItem {
    const display = STATUS_DISPLAY[task.status] || STATUS_DISPLAY['PENDING'];
    
    const item = new vscode.TreeItem(
      `Task ${task.taskId}: ${task.title}`,
      vscode.TreeItemCollapsibleState.None
    );
    
    // Professional icon with semantic color
    item.iconPath = new vscode.ThemeIcon(
      display.icon,
      new vscode.ThemeColor(display.color)
    );
    
    // User-friendly status as description
    item.description = display.label;
    
    // Rich tooltip
    item.tooltip = new vscode.MarkdownString();
    item.tooltip.appendMarkdown(`**${task.title}**\n\n`);
    item.tooltip.appendMarkdown(`Status: ${display.label}\n\n`);
    item.tooltip.appendMarkdown(task.description);
    
    // Context value for menus
    item.contextValue = `task-${task.status.toLowerCase()}`;
    
    // Command to update CurrentTaskViewProvider when clicked
    item.command = {
      command: 'orchestra.selectTask',
      title: 'Select Task',
      arguments: [task.taskId]
    };
    
    return item;
  }
  
  private buildPhaseItem(phase: PhaseNode): vscode.TreeItem {
    const completed = phase.tasks.filter(t => t.status === 'COMPLETE').length;
    const total = phase.tasks.length;
    
    const item = new vscode.TreeItem(
      phase.name,
      vscode.TreeItemCollapsibleState.Expanded
    );
    
    // Progress in description
    item.description = `(${completed}/${total})`;
    
    // Icon based on phase state
    if (completed === total && total > 0) {
      item.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
    } else if (phase.tasks.some(t => t.status === 'ESCALATED')) {
      item.iconPath = new vscode.ThemeIcon('alert', new vscode.ThemeColor('charts.red'));
    }
    
    item.contextValue = 'phase';
    
    return item;
  }
}
```

### Package.json Menus

```json
{
  "contributes": {
    "menus": {
      "view/title": [
        {
          "command": "orchestra.refresh",
          "when": "view == orchestraTasks",
          "group": "navigation@1"
        },
        {
          "command": "orchestra.openSettings",
          "when": "view == orchestraTasks", 
          "group": "navigation@2"
        }
      ],
      "view/item/context": [
        {
          "command": "orchestra.playTask",
          "when": "view == orchestraTasks && viewItem =~ /task-(pending|implement|verify_failed)/",
          "group": "inline@1"
        },
        {
          "command": "orchestra.viewTaskDetails",
          "when": "view == orchestraTasks && viewItem =~ /task-.*/",
          "group": "inline@2"
        },
        {
          "command": "orchestra.viewHandover",
          "when": "view == orchestraTasks && viewItem == task-implement",
          "group": "1_actions@1"
        },
        {
          "command": "orchestra.viewFeedback",
          "when": "view == orchestraTasks && viewItem == task-verify_failed",
          "group": "1_actions@1"
        }
      ]
    },
    "commands": [
      {
        "command": "orchestra.playTask",
        "title": "Start Task",
        "icon": "$(play)"
      },
      {
        "command": "orchestra.viewTaskDetails",
        "title": "View Details",
        "icon": "$(info)"
      },
      {
        "command": "orchestra.refresh",
        "title": "Refresh",
        "icon": "$(refresh)"
      },
      {
        "command": "orchestra.openSettings",
        "title": "Settings",
        "icon": "$(gear)"
      }
    ]
  }
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `extension/src/views/statusTranslation.ts` | CREATE | Status → user-friendly display mapping |
| `extension/src/views/webview/CurrentTaskViewProvider.ts` | CREATE | WebviewView for current task details panel |
| `extension/src/views/webview/currentTask.html` | CREATE | HTML template for current task webview |
| `extension/src/views/webview/currentTask.css` | CREATE | Styles for current task webview |
| `extension/src/views/treeview/SprintTreeProvider.ts` | MODIFY | Professional icons, remove badges, fix double checkmark |
| `extension/src/views/treeview/nodes.ts` | CREATE | TreeNode types (PhaseNode, TaskNode) |
| `extension/src/views/providers/ViewDecorationProvider.ts` | MODIFY | Remove checkmark badges (icons-only approach) |
| `extension/src/views/statusbar/StatusBarItem.ts` | MODIFY | User-friendly status, proper icons |
| `extension/package.json` | MODIFY | Add webview view, menus, commands, icons |
| `extension/src/extension.ts` | MODIFY | Register CurrentTaskViewProvider and new commands |

---

## Success Criteria

- [ ] No emojis anywhere in UI - only codicons (ThemeIcon)
- [ ] Single status indicator per task (no double checkmarks)
- [ ] User-friendly status labels (not VERIFY_FAILED, GATE_CHECK)
- [ ] Current task WebviewView displays rich task details
- [ ] WebviewView has action buttons (Prepare, View Handover, etc.)
- [ ] Inline action buttons visible on TreeView task hover
- [ ] Section headers have refresh/settings actions
- [ ] Phase headers show progress (X/Y)
- [ ] Professional color scheme using ThemeColors
- [ ] All tooltips provide useful context
- [ ] Multi-view architecture matches GitLens pattern

---

## Task Breakdown

### Phase 1: Foundation (Day 1)
1. Create statusTranslation.ts with all status mappings
2. Create nodes.ts with TreeNode type hierarchy
3. Fix double checkmark: remove badges from ViewDecorationProvider

### Phase 2: Multi-View Architecture (Day 1-2)
4. Update package.json with multi-view registration (webview + tree)
5. Create CurrentTaskViewProvider WebviewView
6. Create HTML/CSS templates for current task panel
7. Register CurrentTaskViewProvider in extension.ts

### Phase 3: TreeView Refactor (Day 2)
8. Implement professional icon system with ThemeIcon
9. Remove all badge decorations (icons-only)
10. Add phase progress indicators (X/Y complete)
11. Add proper tooltips with MarkdownString

### Phase 4: Actions & Menus (Day 2-3)
12. Add view/title actions (refresh, settings)
13. Add inline task actions (play, info)
14. Add context menu actions per status
15. Register all new commands in extension.ts

### Phase 5: Current Task Panel Content (Day 3)
16. Implement action buttons in webview (Prepare, View Handover, etc.)
17. Add message passing between webview and extension
18. Connect to database for live task updates
19. Style with VS Code CSS variables for theme support

### Phase 6: Status Bar (Day 3-4)
20. Update StatusBarManager with user-friendly labels
21. Add proper icons and colors
22. Implement click handlers

### Phase 7: Polish (Day 4)
23. Fix any visual inconsistencies
24. Test all status transitions
25. Manual UX testing
26. Write/update tests

---

## Design Reference: GitLens Multi-View Pattern

GitLens uses multiple independent views within a single viewContainer:
- **HOME** (`type: "webview"`): Rich HTML panel with icons, buttons, actions
- **LAUNCHPAD** (`type: "webview"`): Another collapsible webview section
- **COMMITS** (`type: "tree"`): Traditional TreeView for hierarchical data

Each view is registered separately in package.json and can be:
- Collapsed/expanded independently
- Has its own title bar with actions
- WebviewViews can display rich HTML content
- TreeViews handle hierarchical navigation

**Key Pattern**: Combine rich WebviewViews for "current context" panels with TreeViews for exploration/navigation. This provides information density without TreeView limitations.

---

## Dependencies

- Current extension builds and runs
- DatabaseWatcher provides task updates
- TreeView refresh works on data changes
- VS Code 1.95+ for latest ThemeIcon colors
- WebviewView API (available since VS Code 1.49)
