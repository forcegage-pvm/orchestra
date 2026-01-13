# Sprint 003: Autonomous Orchestration

**Status**: PLANNING  
**Priority**: P0 - Critical Path  
**Total Estimated Duration**: 2-3 weeks  
**Created**: 2025-12-12  

---

## Overview

This epic implements the **core vision of Orchestra**: semi-autonomous agent orchestration that removes the human supervisor from micro-managing agent invocations. The supervisor shifts from "task delegator" to "exception handler".

### The Transformation

| Before | After |
|--------|-------|
| Human invokes each agent manually | System invokes correct agent automatically |
| Human tracks task status | System shows clear status and progress |
| Human constructs prompts | System builds context-rich prompts |
| Human manages sessions | System spawns/clears sessions appropriately |
| Human watches for completion | System progresses automatically |

---

## Sprint Breakdown

This epic is divided into 4 incremental sprints:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     003: Autonomous Orchestration                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │    003A     │    │    003B     │    │    003C     │    │    003D     │  │
│  │             │    │             │    │             │    │             │  │
│  │   Task      │───▶│   Config    │───▶│  Context-   │───▶│ Autonomous  │  │
│  │ Visibility  │    │  & Prompts  │    │ Aware Play  │    │  Workflow   │  │
│  │             │    │             │    │             │    │             │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│     2-3 days           2-3 days           2-3 days           5-7 days      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sprint 003A: Task Visibility & Basic Actions
**[003a-task-visibility/](003a-task-visibility/README.md)**

Improve UI to show clear task status, progress, and provide manual actions.

**Key Deliverables**:
- TreeView status icons and decorations
- Context menu actions per task status
- Status bar improvements
- Task detail panel polish

**Value**: Users can see what's happening and manually trigger actions.

---

### Sprint 003B: Configuration & Prompt System
**[003b-configuration/](003b-configuration/README.md)**

Enable model/mode configuration and build context-rich prompts.

**Key Deliverables**:
- VS Code settings for models per role
- PromptBuilder with stage templates
- AttachmentResolver for file context
- ConfigService for settings access

**Value**: Users can configure preferences and get smart prompts.

---

### Sprint 003C: Context-Aware Play Button
**[003c-context-aware-play/](003c-context-aware-play/README.md)**

Single "Play" action that does the right thing based on task status.

**Key Deliverables**:
- Status → Action mapping
- Chat invocation with correct agent
- File attachment support
- TreeView/status bar integration

**Value**: One-click task progression without remembering agents.

---

### Sprint 003D: Autonomous Workflow Engine
**[003d-autonomous-workflow/](003d-autonomous-workflow/README.md)**

Full autonomous mode where supervisor starts and walks away.

**Key Deliverables**:
- SessionManager (dual sessions)
- WorkflowEngine with auto-progression
- Pause/resume/stop controls
- Escalation handling
- State persistence

**Value**: True semi-autonomous orchestration.

---

## Dependency Chain

```
003A ──▶ 003B ──▶ 003C ──▶ 003D
  │         │        │        │
  │         │        │        └── Full autonomy
  │         │        └── One-click actions
  │         └── Smart prompts & config
  └── Visual foundation
```

Each sprint builds on the previous:
- **003A** provides the UI foundation
- **003B** adds the intelligence layer (config, prompts)
- **003C** ties them together for manual use
- **003D** automates the entire flow

---

## Technical Foundation

Based on [VS Code Chat API research](../05-research/vscode-chat-api-deep-dive.md):

| Capability | API | Sprint |
|------------|-----|--------|
| TreeView icons | `vscode.ThemeIcon` | 003A |
| Context menus | `package.json menus` | 003A |
| Settings | `contributes.configuration` | 003B |
| Open chat | `chat.open` | 003C |
| Mode selection | `mode: 'agent'` | 003C |
| File attachment | `attachFiles` | 003C |
| New chat editor | `chat.newChatEditor` | 003D |
| Session tracking | Workspace state | 003D |

---

## Success Criteria (Epic Level)

### Must Have

- [ ] Clear visual status for all tasks
- [ ] One-click task execution
- [ ] Correct agent invoked per role
- [ ] Autonomous mode works end-to-end
- [ ] Escalation pauses and notifies

### Should Have

- [ ] Model configuration per role
- [ ] File attachments on prompts
- [ ] State persistence across restart
- [ ] TreeView decorations for current task

### Could Have

- [ ] Session history for orchestrator
- [ ] Parallel task support
- [ ] Audit logging

---

## Files Structure

```
spec/sprints/003-autonomous-orchestration/
├── README.md                          # This file
├── sprint-003-autonomous-orchestration.md  # Original research
├── sprint-003-implementation-spec.md       # Detailed tech spec
├── 003a-task-visibility/
│   └── README.md                      # Sprint 003A spec
├── 003b-configuration/
│   └── README.md                      # Sprint 003B spec
├── 003c-context-aware-play/
│   └── README.md                      # Sprint 003C spec
└── 003d-autonomous-workflow/
    └── README.md                      # Sprint 003D spec
```

---

## Next Steps

1. **Review Specs**: Flesh out each sprint spec as needed
2. **Create Tasks**: Generate Orchestra tasks for Sprint 003A
3. **Configure Sprint**: Load into Orchestra database
4. **Implement**: Use Orchestra to build Orchestra! 🎵

---

## References

- [VS Code Chat API Deep Dive](../05-research/vscode-chat-api-deep-dive.md)
- [Original Sprint 003 Research](sprint-003-autonomous-orchestration.md)
- [Implementation Specification](sprint-003-implementation-spec.md)
- [Orchestra Bible](../../docs/orchestra-bible.md)
