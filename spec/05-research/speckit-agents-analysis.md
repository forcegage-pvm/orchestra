# SpecKit Agents & Commands Analysis

> Research on how GitHub Spec-Kit uses agents and commands to formalize AI workflows, and how Orchestra can leverage similar patterns.

---

## Overview

SpecKit (github/spec-kit) uses a sophisticated system of **slash commands** and **agents** to guide AI assistants through a structured Spec-Driven Development workflow. Key insight from their CHANGELOG:

> "Support for VS Code/Copilot agents, and moving away from prompts to proper agents with hand-offs."

---

## Key Concepts from SpecKit

### 1. Command File Format

Commands are Markdown files with YAML frontmatter that define:

```markdown
---
description: "Command description shown in IDE"
mode: speckit.command-name           # For Copilot Chat mode
handoffs:                            # Agent-to-agent transitions
  - label: Create Tasks
    agent: speckit.tasks
    prompt: Break the plan into tasks
    send: true
scripts:
  sh: scripts/bash/setup-plan.sh --json
  ps: scripts/powershell/setup-plan.ps1 -Json
---

## User Input
$ARGUMENTS

## Outline
[Command instructions for the agent]
```

### 2. Agent Handoffs

SpecKit implements **agent handoffs** - structured transitions between different specialized agents:

```yaml
handoffs:
  - label: Create Tasks           # UI label
    agent: speckit.tasks          # Target agent
    prompt: Break the plan into tasks
    send: true                    # Auto-send on completion
```

This allows workflow like:
- `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`

### 3. Agent-Specific File Locations

| Agent | Directory | Format |
|-------|-----------|--------|
| GitHub Copilot | `.github/agents/` | Markdown |
| Claude Code | `.claude/commands/` | Markdown |
| Cursor | `.cursor/commands/` | Markdown |
| Gemini CLI | `.gemini/commands/` | TOML |

### 4. Agent Context Files

SpecKit maintains agent context files that get updated with project information:
- `CLAUDE.md`, `GEMINI.md`, `COPILOT_FILE` at repo root
- Updated by `update-agent-context.sh/ps1` scripts
- Contains: technologies, project structure, commands, code style

---

## Benefits for Orchestra

### 1. Formalized Role Instructions

Instead of relying on `.github/copilot-instructions.md` (which applies to ALL agents), we can create:

```
.github/
  agents/
    orchestra.orchestrator.md     # Orchestrator agent instructions
    orchestra.implementor.md      # Implementor agent instructions
```

Each agent gets:
- **Clear role definition** (trust boundaries enforced in system prompt)
- **Available commands** (what they can/cannot do)
- **Handoff points** (when to transition to another agent)

### 2. Trust Boundary Enforcement

Critical for Orchestra's hidden verification pattern:

**Orchestrator Agent:**
```markdown
---
mode: orchestra.orchestrator
description: Orchestrator agent for task preparation and verification
---

# Orchestrator Agent

## Access Permissions
- ✅ Full access to `.orchestra/orchestrator/.orchestrator-only/`
- ✅ Can read/write verification criteria
- ✅ Can verify implementor signals

## Trust Boundary
- ❌ Never reveal verification criteria to chat
- ❌ Never include hidden criteria in handover
```

**Implementor Agent:**
```markdown
---
mode: orchestra.implementor
description: Implementor agent for task execution
---

# Implementor Agent

## Access Restrictions
- ❌ NEVER read `.orchestra/orchestrator/.orchestrator-only/`
- ❌ NEVER read `verification/task-*.yaml` files
- ✅ Read handovers from `.orchestra/handover/`
- ✅ Write signals to `.orchestra/handover/signals/`
```

### 3. Workflow Commands as Slash Commands

Instead of `orchestra prepare`, agents invoke `/orchestra.prepare`:

```markdown
---
description: Prepare handover for the next task
mode: orchestra.prepare
handoffs:
  - label: Start Implementation
    agent: orchestra.implementor
    prompt: Read the handover and implement the task
    send: true
---

## Prepare Phase

Run `orchestra prepare --task {N}` and create handover documentation...
```

### 4. Agent-to-Agent Handoffs

Orchestra workflow becomes explicit agent transitions:

```
┌─────────────────────┐
│ orchestra.orchestrator │
│ (prepare phase)     │
└─────────┬───────────┘
          │ handoff: "Start Implementation"
          ▼
┌─────────────────────┐
│ orchestra.implementor │
│ (implement phase)   │
└─────────┬───────────┘
          │ handoff: "Signal Completion"
          ▼
┌─────────────────────┐
│ orchestra.orchestrator │
│ (verify phase)      │
└─────────────────────┘
```

---

## Implementation Plan

### Phase 2.5: Agent Definitions (Before VS Code Extension)

1. **Create Agent Definition Files**
   ```
   .github/
     agents/
       orchestra.orchestrator.md
       orchestra.implementor.md
   ```

2. **Define Slash Commands**
   ```
   .github/
     prompts/                      # Or agents/ depending on Copilot version
       orchestra.init.md
       orchestra.prepare.md
       orchestra.implement.md
       orchestra.signal.md
       orchestra.verify.md
       orchestra.complete.md
   ```

3. **Update `.github/copilot-instructions.md`**
   - Reference agent-specific instructions
   - Define which agent is active based on context

### Phase 3: VS Code Extension Integration

When we build the VS Code extension:

1. **Custom Agent Participants**
   - Register `@orchestrator` and `@implementor` chat participants
   - Each has its own system prompt enforcing trust boundaries

2. **Command Palette Integration**
   - Commands like "Orchestra: Switch to Orchestrator Mode"
   - Automatically loads correct agent context

3. **Handoff UI**
   - Show handoff buttons in chat after phase completion
   - "Ready to hand off to Implementor" button

---

## Key Differences from SpecKit

| Aspect | SpecKit | Orchestra |
|--------|---------|-----------|
| **Purpose** | Spec-Driven Development | Task Orchestration with Verification |
| **Trust Model** | Single agent, different phases | Strict separation (hidden verification) |
| **Handoffs** | Same agent, different prompts | Different agents with access restrictions |
| **Verification** | Human review | Hidden criteria, automated checks |

---

## Next Steps

1. **Prototype**: Create `.github/agents/` structure for Orchestra
2. **Test**: Verify Copilot recognizes agent modes
3. **Iterate**: Refine based on agent behavior
4. **Document**: Add to Phase 2 (MCP) or Phase 3 (Extension) spec

---

## References

- [SpecKit AGENTS.md](https://github.com/github/spec-kit/blob/main/AGENTS.md)
- [SpecKit Command Templates](https://github.com/github/spec-kit/tree/main/templates/commands)
- [Copilot Chat Modes](https://docs.github.com/en/copilot/using-github-copilot/using-extensions-to-integrate-external-tools-with-copilot-chat)
