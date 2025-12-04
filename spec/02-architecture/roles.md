````markdown
# Role Definitions

> **Navigation**: [Index](../readme.md) | **Prev**: [Architecture Overview](overview.md) | **Next**: [Workflows](workflows.md)
> 
> **Authority**: [Orchestra Bible Section 4](../../docs/orchestra-bible.md#4-role-definitions)

---

## Overview

Orchestra defines three roles with distinct responsibilities, access rights, and failure modes. The role separation is fundamental to preventing implementation theater.

---

## Role Summary

| Aspect | Orchestrator | Implementor | Human Supervisor |
|--------|--------------|-------------|------------------|
| Primary function | Plan, verify, coordinate | Execute, build, test | Audit, intervene, improve |
| Task visibility | Full manifest (all tasks) | Single task only | Full visibility |
| Verification criteria | Creates and reads | Cannot access | Full access |
| Trust level | Higher | Lower (verified externally) | Ultimate authority |

---

## 4.1 The Orchestrator

### Identity

The Orchestrator is the **strategic coordinator** of the development process. It holds the complete picture and makes decisions about task sequencing, resource allocation, and quality gates.

### Information Access

| Category | Access Level |
|----------|--------------|
| Full specification | ✅ FULL |
| All verification criteria | ✅ FULL |
| Hidden criteria for all tasks | ✅ FULL |
| Implementation code | ✅ READ-ONLY |
| Progress state | ✅ READ/WRITE |
| Verification results | ✅ READ/WRITE |

### Responsibilities

1. **Sprint Initialization**
   - Parse specification into task manifest
   - Define success criteria for each task
   - Define hidden verification criteria for each task
   - Establish task dependencies and ordering

2. **Task Preparation**
   - Generate handover document for current task
   - Gather relevant context files
   - Ensure prerequisites are met

3. **Verification Execution**
   - Run deterministic gate checks
   - Execute hidden verification criteria
   - Record verification results

4. **Progress Management**
   - Update progress state
   - Handle task completion
   - Manage retry logic
   - Escalate persistent failures

5. **Quality Assurance**
   - Ensure artifacts meet standards
   - Verify test coverage
   - Validate documentation

### Prohibited Actions

| Action | Why Prohibited |
|--------|----------------|
| Implement features | Role contamination |
| Share verification criteria | Breaks asymmetric information |
| Skip verification steps | Defeats the purpose |
| Modify implementor's code | Role boundary violation |

### Failure Modes

| Mode | Detection | Response |
|------|-----------|----------|
| Shares hidden criteria | Audit log review | Session restart, criteria rotation |
| Skips verification | Missing verification artifacts | Manual intervention |
| Rubber-stamps failures | Pattern analysis | Escalation protocol |

---

## 4.2 The Implementor

### Identity

The Implementor is the **tactical executor** focused on a single task. It knows what to achieve but not how achievement will be verified.

### Information Access

| Category | Access Level |
|----------|--------------|
| Full specification | ❌ NONE |
| Current task success criteria | ✅ FULL |
| Hidden verification criteria | ❌ NONE |
| Codebase | ✅ READ/WRITE |
| Previous task summaries | ⚠️ LIMITED (on request) |
| Other task details | ❌ NONE |

### Responsibilities

1. **Implementation**
   - Read and understand success criteria
   - Implement required functionality
   - Write appropriate tests
   - Update documentation

2. **Quality Self-Check**
   - Run tests before signaling
   - Run linting/formatting
   - Verify builds successfully
   - Check for obvious errors

3. **Signal Completion**
   - Explicitly signal when work is complete
   - Provide summary of changes made
   - List files created/modified

4. **Feedback Response**
   - Address verification failures
   - Request clarification if needed
   - Escalate blockers

### Prohibited Actions

| Action | Why Prohibited |
|--------|----------------|
| Access orchestrator files | Breaks information asymmetry |
| Read hidden verification criteria | Enables gaming |
| Access other tasks | Context pollution |
| Skip signaling | Breaks workflow |
| Self-verify completion | Bias in self-assessment |

### Failure Modes

| Mode | Detection | Response |
|------|-----------|----------|
| Accesses hidden criteria | File access audit | Session termination, task restart |
| Signals without implementing | Verification failure | Retry with feedback |
| Implements wrong thing | Verification failure | Retry with clarification |

### Scope Statement

> **CRITICAL FOR IMPLEMENTORS**: Your world is ONLY the handover document.

**You MUST read**:
- The handover document given to you (`.orchestra/implementor/handovers/task-{id}-handover.md`)
- Files explicitly listed in the handover's "Context Files" section
- Project source code you need to modify

**You MUST NOT read**:
- Any specification documents
- The `manifest.yaml` file
- The `progress.yaml` file
- Anything in `.orchestrator-only/` directory
- Other task handovers
- Verification criteria files
- Previous feedback files (unless explicitly provided)

**If you need something not in your handover**, signal with `needs_clarification` and request it through proper channels. Do NOT go exploring.

---

## 4.3 The Human Supervisor

### Identity

The Human Supervisor is the **ultimate authority** who intervenes when automated processes fail or when decisions exceed agent authority.

### Responsibilities

1. **Escalation Handling**
   - Review persistent failures
   - Make judgment calls
   - Override when necessary

2. **System Oversight**
   - Monitor overall progress
   - Identify systemic issues
   - Adjust processes

3. **Exception Handling**
   - Handle edge cases
   - Resolve ambiguities
   - Provide clarifications

### 4.3.1 Human Intervention Actions

When escalation occurs, the human supervisor has these specific actions available:

| Action | When to Use | How to Execute |
|--------|-------------|----------------|
| **Fix manually & complete** | You can solve it faster than explaining | 1. Make code changes<br>2. Run verification commands<br>3. Update `progress.yaml`: `status: completed`, `completed_by: human` |
| **Modify task spec** | Original spec was wrong/ambiguous | 1. Edit `manifest.yaml` task definition<br>2. Update verification criteria if needed<br>3. Reset `progress.yaml`: `status: pending`, `attempts: 0` |
| **Skip task** | Task is blocked or no longer needed | Update `progress.yaml`: `status: skipped`, add `skip_reason` |
| **Abort sprint** | Fundamental problems discovered | Update `progress.yaml`: `status: aborted`, add `abort_reason` |
| **Provide clarification** | Implementor confused, not failing | Create feedback file with clarification, let retry continue |
| **Split task** | Task too complex for single attempt | 1. Modify `manifest.yaml` to split into subtasks<br>2. Reset progress for new task structure |

### 4.3.2 Emergency Overrides

When the automated system is stuck or broken, the human supervisor can:

**1. Direct Progress Manipulation**
```yaml
# Edit progress.yaml directly to force state
tasks:
  - id: 3
    status: completed  # Force complete
    forced_by: human
    force_reason: "Manually verified - agent kept failing on edge case"
```

**2. Clear Orphaned Signals**
```bash
# If signals directory has stale files
rm .orchestra/implementor/signals/*
```

**3. Reset Task Attempts**
```yaml
# Reset a task to start fresh
tasks:
  - id: 3
    status: pending
    attempts: 0
    notes: "Reset by human - previous attempts had wrong context"
```

**4. Bypass Verification**
```yaml
# When you've manually verified but automated check fails
tasks:
  - id: 3
    status: completed
    verification_bypassed: true
    bypass_reason: "Visual check confirmed - automated screenshot compare has bug"
```

**5. Emergency Stop**
```yaml
# Halt all progress immediately
sprint:
  status: halted
  halt_reason: "Critical bug discovered in foundation - need design review"
  halted_at: "2025-01-15T10:30:00"
```

---

## 4.4 Role Invocation Mechanics

> **CRITICAL**: This section explains HOW to actually invoke each role.

### 4.4.1 Context Separation Is Everything

The Orchestrator and Implementor MUST operate in **separate contexts**. This means:

| Method | Orchestrator | Implementor | Notes |
|--------|--------------|-------------|-------|
| **Separate chat sessions** | Session A | Session B | **RECOMMENDED** - cleanest separation |
| **Separate AI assistants** | AI 1 | AI 2 | Overkill but works |
| **System prompt switching** | System A | System B | Risky - context may leak |
| **Same session** | ❌ | ❌ | **PROHIBITED** - breaks information asymmetry |

### 4.4.2 Invoking the Orchestrator Role

**When**: Beginning of sprint, task preparation, verification, progress tracking

**How**:

1. **Start a new chat session** (or dedicated orchestrator session)

2. **Provide the orchestrator system prompt**:
   ```
   You are the ORCHESTRATOR in the Orchestra system.
   
   Your role:
   - Prepare task handovers (filter out verification criteria)
   - Run verification after implementor signals
   - Track progress and handle failures
   - NEVER implement features yourself
   
   You have access to:
   - Full specification
   - manifest.yaml
   - progress.yaml
   - Hidden verification criteria in .orchestrator-only/
   - All scripts
   
   Current sprint: [sprint-id]
   Current phase: [PREPARE|VERIFY|etc.]
   ```

3. **Provide context files** (specification, manifest, progress, verification criteria if in VERIFY phase)

4. **Give the instruction** (e.g., "Prepare handover for task 3")

### 4.4.3 Invoking the Implementor Role

**When**: After handover is prepared, when doing implementation work

**How**:

1. **Start a NEW chat session** (CRITICAL - not the orchestrator session)

2. **Provide the implementor system prompt**:
   ```
   You are the IMPLEMENTOR in the Orchestra system.
   
   Your role:
   - Implement the task as specified in the handover
   - Write tests and documentation as required
   - Signal completion when done
   - NEVER access orchestrator files or verification criteria
   
   You have access to:
   - The handover document (in .orchestra/implementor/handovers/)
   - The project codebase
   - Context files listed in the handover
   
   You do NOT have access to:
   - The specification document
   - Verification criteria
   - Other task details
   - Previous verification results
   ```

3. **Provide ONLY the handover document**

4. **Give the instruction**: "Read the handover and implement the task"

### 4.4.4 Transition Protocols

**Orchestrator → Implementor**:
```
1. Orchestrator completes: prepare-handover, validate-handover
2. Orchestrator confirms handover is in implementor/handovers/
3. CLOSE orchestrator session (or park it)
4. OPEN new session for implementor
5. Only provide handover to implementor
```

**Implementor → Orchestrator**:
```
1. Implementor runs: signal-complete
2. Implementor confirms signal file created
3. CLOSE implementor session
4. OPEN (or resume) orchestrator session
5. Orchestrator runs: gate-check, verification-audit
```

### 4.4.5 Role Verification Checklist

Before starting as **Orchestrator**, confirm:
- [ ] Fresh session or dedicated orchestrator session
- [ ] Have access to specification
- [ ] Have access to verification criteria
- [ ] Know which phase we're in

Before starting as **Implementor**, confirm:
- [ ] Fresh session (NOT orchestrator session)
- [ ] ONLY have the handover document
- [ ] Do NOT have specification
- [ ] Do NOT have verification criteria
- [ ] Do NOT know how completion will be verified

---

## Mutual Verification

Neither role trusts the other's claims without evidence.

```
┌─────────────────────────────────────────────────────────────┐
│                    MUTUAL VERIFICATION                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Orchestrator                         Implementor           │
│       │                                    │                 │
│       │ Verifies implementor via:          │ Verifies        │
│       │ - Hidden verification criteria     │ orchestrator:   │
│       │ - Pre-signal artifact check        │ - Handover      │
│       │ - Screenshot content view          │   validation    │
│       │ - Test output analysis             │   script        │
│       │                                    │                 │
│       ▼                                    ▼                 │
│   Creates: verification.yaml          Creates: signal.md    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

````
