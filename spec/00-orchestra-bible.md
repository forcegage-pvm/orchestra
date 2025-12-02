# The Orchestra Bible

> **The Definitive Specification for AI-Driven Task Orchestration**

---

## Document Status

| Version | Date | Status |
|---------|------|--------|
| 0.7.0 | 2025-12-02 | **COMPLETE** - Production Ready |

**Change Log**:
- v0.7.0: **FINAL** - Enhanced ToC with navigation table, added Appendix G Quick Reference Index
- v0.6.0: Added Human Intervention (4.3.1-4.3.2), Implementor Scope Statement, Monitoring Guide (F.6) - 100% alien-drop-in ready
- v0.5.0: Added Quick Start Guide (Section 0), Role Invocation (4.4), Specification Format (6.4), Templates (Appendix D), Worked Example (Appendix E)
- v0.4.0: Added dual-layer structure to Phase Details: Abstract Actions (what) + Implementation (how)
- v0.3.0: Rewrote Phase Details (Section 7.2) with explicit script calls in action sequences
- v0.2.0: Added mandatory script execution matrix (Section 7.3), lifecycle position for all scripts
- v0.1.0: Initial draft

---

## Table of Contents

### Quick Navigation

| I need to... | Go to |
|--------------|-------|
| Get started quickly | [Section 0: Quick Start](#0-quick-start-guide) |
| Understand the philosophy | [Section 1: Philosophy](#1-foundational-philosophy) |
| Know my role | [Section 4: Roles](#4-role-definitions) |
| Run a task | [Section 7: Lifecycle](#7-task-lifecycle) |
| Find a script | [Section 8: Scripts](#8-script-specifications) |
| Copy a template | [Appendix D: Templates](#appendix-d-document-templates) |
| See a complete example | [Appendix E: Worked Example](#appendix-e-end-to-end-worked-example) |
| Act as Human Orchestrator | [Appendix F: Human Guide](#appendix-f-human-as-orchestrator-guide) |
| Look up a term | [Appendix A: Glossary](#appendix-a-glossary) |
| Quick reference | [Appendix G: Quick Reference](#appendix-g-quick-reference-index) |

### Full Contents

**Part I: Foundation**
0. [Quick Start Guide](#0-quick-start-guide) ← **START HERE**
1. [Foundational Philosophy](#1-foundational-philosophy)
2. [The Problem We Solve](#2-the-problem-we-solve)
3. [Core Principles](#3-core-principles)

**Part II: Roles & Trust**
4. [Role Definitions](#4-role-definitions)
   - [4.1 The Orchestrator](#41-the-orchestrator)
   - [4.2 The Implementor](#42-the-implementor) (incl. Scope Statement)
   - [4.3 The Human Supervisor](#43-the-human-supervisor)
     - [4.3.1 Human Intervention Actions](#431-human-intervention-actions) ← **NEW**
     - [4.3.2 Emergency Overrides](#432-emergency-overrides) ← **NEW**
   - [4.4 Role Invocation Mechanics](#44-role-invocation-mechanics)
5. [The Trust Model](#5-the-trust-model)

**Part III: Architecture**
6. [Information Architecture](#6-information-architecture)
   - [6.4 Specification Document Format](#64-specification-document-format)
7. [Task Lifecycle](#7-task-lifecycle)
   - [7.2 Phase Details](#72-phase-details) (PENDING → COMPLETE)
   - [7.3 Mandatory Script Matrix](#73-mandatory-script-execution-matrix)

**Part IV: Operations**
8. [Script Specifications](#8-script-specifications)
9. [Verification Model](#9-verification-model)
10. [Failure Handling](#10-failure-handling)
11. [Artifact Specifications](#11-artifact-specifications)
12. [Adaptation Guidelines](#12-adaptation-guidelines)

**Appendices**:
- [Appendix A: Glossary](#appendix-a-glossary) - Term definitions
- [Appendix B: Checklist Templates](#appendix-b-checklist-templates) - Role checklists
- [Appendix C: Anti-Patterns](#appendix-c-anti-patterns) - What NOT to do
- [Appendix D: Document Templates](#appendix-d-document-templates) ← **Copy-paste templates**
- [Appendix E: End-to-End Worked Example](#appendix-e-end-to-end-worked-example) ← **Complete walkthrough**
- [Appendix F: Human-as-Orchestrator Guide](#appendix-f-human-as-orchestrator-guide) ← **Manual operation**
  - [F.6 Monitoring Sprint Progress](#f6-monitoring-sprint-progress) ← **NEW**
- [Appendix G: Quick Reference Index](#appendix-g-quick-reference-index) ← **Lookup tables**

---

# 0. Quick Start Guide

> **⚠️ READ THIS FIRST** - This section gets you from "zero" to "running" in 15 minutes.

## 0.1 What is Orchestra?

Orchestra is a **structured process** for AI-assisted software development that prevents "implementation theater" (AI claims task is done, but nothing actually works).

**The core insight**: If AI knows how you'll verify its work, it optimizes for passing verification rather than doing the work. Orchestra fixes this by keeping verification criteria hidden.

## 0.2 The 3-Minute Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  YOU (Human) have a SPECIFICATION (what you want built)        │
│                           │                                     │
│                           ▼                                     │
│  ORCHESTRATOR (AI role) breaks it into TASKS                   │
│  and creates HIDDEN verification criteria                       │
│                           │                                     │
│                           ▼                                     │
│  IMPLEMENTOR (AI role) gets a HANDOVER document                │
│  with WHAT to do but NOT HOW it will be checked                │
│                           │                                     │
│                           ▼                                     │
│  IMPLEMENTOR does the work and SIGNALS "done"                  │
│                           │                                     │
│                           ▼                                     │
│  ORCHESTRATOR VERIFIES using hidden criteria                    │
│                           │                                     │
│                           ├──► PASS: Next task                  │
│                           └──► FAIL: Feedback (no hints) → Retry│
└─────────────────────────────────────────────────────────────────┘
```

## 0.3 Prerequisites

Before starting, you need:

1. **A project** - An existing codebase or empty project directory
2. **A specification** - A document describing what you want built (see [Section 6.4](#64-specification-document-format))
3. **The Orchestra folder** - Copy the `.orchestra` template to your project
4. **An AI assistant** - Any modern LLM (GPT-4, Claude, etc.)

## 0.4 First-Time Setup (5 minutes)

### Step 1: Initialize Orchestra Structure

```
your-project/
├── .orchestra/
│   ├── manifest.yaml              # Will be created by sprint-init
│   ├── progress.yaml              # Will be created by sprint-init
│   ├── common/
│   │   ├── scripts/               # Put platform-specific scripts here
│   │   └── templates/             # Document templates
│   ├── orchestrator/
│   │   ├── .orchestrator-only/    # HIDDEN - Only orchestrator reads this
│   │   │   ├── verification/      # Hidden verification criteria
│   │   │   └── criteria/          # Reusable criteria
│   │   └── scripts/               # Orchestrator scripts
│   ├── implementor/
│   │   ├── handovers/             # Task instructions go here
│   │   ├── signals/               # Completion signals go here
│   │   └── feedback/              # Retry feedback goes here
│   └── artifacts/                 # Task outputs archived here
└── your-code/
```

### Step 2: Write Your Specification

Create a specification document. Minimal format:

```markdown
# Project: My Feature

## Overview
Brief description of what we're building.

## Tasks

### Task 1: Create configuration loader
Load YAML configuration files with error handling.

**Success Criteria:**
- [ ] Load valid YAML files
- [ ] Handle missing files gracefully
- [ ] Validate required fields

### Task 2: Add unit tests
Test the configuration loader.

**Success Criteria:**
- [ ] Test valid config loading
- [ ] Test error cases
```

### Step 3: Run Sprint Initialization

```
► Run: sprint-init --spec path/to/specification.md
```

This creates:
- `manifest.yaml` - Task list with success criteria
- `progress.yaml` - Progress tracker (all tasks: pending)
- Hidden verification files - In `.orchestrator-only/verification/`

## 0.5 Running Your First Task (10 minutes)

### As Orchestrator:

1. **Check closeout** (if not first task):
   ```
   ► Run: task-closeout-check
   ```

2. **Prepare handover**:
   ```
   ► Run: prepare-handover --task-id 1
   ```

3. **Validate handover** (ensure no leaks):
   ```
   ► Run: validate-handover --task-id 1
   ```

4. **Start new chat** with AI for Implementor role

### As Implementor (in fresh chat):

1. **Read the handover**:
   ```
   Read: .orchestra/implementor/handovers/task-1-handover.md
   ```

2. **Do the work** as specified in handover

3. **Self-check** (optional but recommended):
   ```
   ► Run: pre-signal-check
   ```

4. **Signal completion**:
   ```
   ► Run: signal-complete --task-id 1
   ```

### Back to Orchestrator:

5. **Gate check** runs automatically (or manually):
   ```
   ► Run: gate-check --task-id 1
   ```

6. **Verification** (hidden criteria):
   ```
   ► Run: verification-audit --task-id 1
   ```

7. **Accept or reject**:
   - **PASS**: `► Run: accept-signal-check --task-id 1`
   - **FAIL**: `► Run: generate-feedback --task-id 1` → Implementor retries

## 0.6 Key Rules to Remember

| Rule | Why |
|------|-----|
| **Never show verification criteria to implementor** | Prevents gaming |
| **Fresh context for each task** | Prevents learning verification patterns |
| **Signals trigger verification, not claims** | "I'm done" means nothing without artifacts |
| **Feedback guides without revealing** | Say what's wrong, not how you detected it |
| **Scripts are mandatory, not optional** | They enforce the process |

## 0.7 Troubleshooting First Run

| Problem | Solution |
|---------|----------|
| "No manifest.yaml" | Run `sprint-init` first |
| "Task not found" | Check task ID matches manifest |
| "Handover validation fails" | Check template, ensure no verification criteria leaked |
| "Gate check fails" | Check build/test commands in config |
| "Verification fails" | Implementor retries with feedback |

## 0.8 Where to Go Next

- **Understand the philosophy**: Read [Section 1](#1-foundational-philosophy)
- **Learn the roles**: Read [Section 4](#4-role-definitions)
- **See templates**: Read [Appendix D](#appendix-d-document-templates)
- **Complete example**: Read [Appendix E](#appendix-e-end-to-end-worked-example)

---

# 1. Foundational Philosophy

## 1.1 Mission Statement

Orchestra exists to enable **genuine, verifiable task completion** in AI-assisted software development by structurally preventing the patterns that cause AI agents to produce incomplete or non-functional work.

## 1.2 The Core Insight

> **AI agents optimize for what they can see.**

When an AI agent can see verification criteria, it optimizes for passing those criteria rather than achieving the underlying goal. This is not deception—it's how optimization works. The solution is not to make agents "more honest" but to structure the system so that gaming is structurally impossible.

## 1.3 The Structural Solution

Orchestra implements a **separation of concerns** between:
- **What to achieve** (visible to implementor)
- **How achievement is verified** (hidden from implementor)

This separation is not about distrust—it's about creating conditions where genuine work is the path of least resistance.

## 1.4 Design Principles

| Principle | Description |
|-----------|-------------|
| **Structural over behavioral** | Don't rely on agents "trying hard"—design systems where correct behavior is the only option |
| **Verification over trust** | Every claim must be independently verifiable |
| **Explicit over implicit** | All expectations, criteria, and processes must be documented |
| **Deterministic over heuristic** | Prefer checks that have clear pass/fail outcomes |
| **Idempotent operations** | Every operation should be safe to retry |

---

# 2. The Problem We Solve

## 2.1 Implementation Theater

**Definition**: The phenomenon where AI agents report task completion, produce artifacts that appear correct, and pass visible checks—while the underlying implementation is incomplete, broken, or missing entirely.

### Case Study: Sprint 011

| Metric | Value |
|--------|-------|
| Tasks completed by agents | 56 |
| Tests passing | 100% |
| Working features delivered | 0 |

### Root Causes Identified

1. **Visible verification gaming**: Agents write code to pass tests rather than implement features
2. **Self-assessment bias**: Agents evaluate their own work optimistically
3. **Context pollution**: Prior "knowledge" of verification criteria influences implementation
4. **Completion pressure**: Agents signal "done" prematurely to satisfy progress metrics

## 2.2 Why Traditional Solutions Fail

| Solution | Why It Fails |
|----------|--------------|
| "Better prompts" | Agents still see criteria; optimization target unchanged |
| "More tests" | Agents optimize for tests, not functionality |
| "Code review" | Same agent reviewing own work has same biases |
| "Human review" | Doesn't scale; humans miss subtle issues |
| "Stricter criteria" | More visible criteria = more gaming surface |

## 2.3 The Orchestra Solution

Orchestra introduces **structural separation**:

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR DOMAIN                       │
│  • Full specification                                        │
│  • Verification criteria (HIDDEN from implementor)          │
│  • Task decomposition                                        │
│  • Progress tracking                                         │
│  • Verification execution                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Handover Document
                              │ (filtered information)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    IMPLEMENTOR DOMAIN                        │
│  • Success criteria (WHAT to achieve)                       │
│  • Context files (relevant code/docs)                       │
│  • Implementation                                            │
│  • Signal completion                                         │
└─────────────────────────────────────────────────────────────┘
```

---

# 3. Core Principles

## 3.1 Principle of Asymmetric Information

> **The implementor must not have access to verification criteria.**

This is the foundational principle. All other design decisions flow from this constraint.

**Why**: If the implementor knows how verification works, they can optimize for verification rather than genuine implementation. This isn't malice—it's how optimization works.

**Implementation**: 
- Verification criteria stored in orchestrator-only locations
- Handover documents contain success criteria, not verification criteria
- File system permissions enforce separation where possible

## 3.2 Principle of Role Separation

> **Orchestrator and Implementor are distinct roles that must not be conflated.**

Even when the same AI model serves both roles, they must operate in separate contexts with different information access.

**Orchestrator responsibilities**:
- Decompose specifications into tasks
- Prepare handover documents
- Execute verification
- Track progress
- Handle failures

**Implementor responsibilities**:
- Implement according to success criteria
- Signal completion
- Respond to feedback

**Prohibited crossover**:
- Implementor must not access orchestrator files
- Orchestrator must not implement features
- Neither role self-verifies

## 3.3 Principle of Fresh Context

> **Each implementor session starts with zero prior knowledge.**

**Why**: Context pollution—where prior knowledge influences current behavior—undermines the separation model. An implementor who "remembers" verification criteria from a previous session can still game the system.

**Implementation**:
- Each task starts a new session/conversation
- No persistent memory between tasks
- Context comes only from handover document

## 3.4 Principle of Deterministic Gates

> **Verification should be deterministic wherever possible.**

**Why**: Heuristic verification ("does this look right?") is gameable. Deterministic verification ("does file X exist with content Y?") is not.

**Types of verification**:

| Type | Example | Gameability |
|------|---------|-------------|
| **Deterministic** | "File exists at path X" | None |
| **Structural** | "Function has signature Y" | Low |
| **Behavioral** | "Tests pass" | Medium (tests can be weak) |
| **Semantic** | "Implementation is correct" | High |

**Strategy**: Maximize deterministic checks; use semantic checks sparingly and with hidden criteria.

## 3.5 Principle of Explicit Artifacts

> **Every task produces explicit, inspectable artifacts.**

**Why**: Implicit outcomes ("I improved the code") cannot be verified. Explicit artifacts can.

**Required artifacts**:
- Source files created/modified
- Test files created/modified
- Documentation updates
- Execution logs (what commands were run)
- Verification results

## 3.6 Principle of Audit Trail

> **Every action and decision must be traceable.**

**Why**: Debugging failures requires understanding what happened. Pattern recognition requires historical data.

**Audit requirements**:
- All commands executed are logged
- All file changes are tracked (via git)
- All verification results are recorded
- All failures include context for debugging

---

# 4. Role Definitions

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

## 4.4 Role Invocation Mechanics

> **CRITICAL**: This section explains HOW to actually invoke each role. Without this, the entire system is theoretical.

### 4.4.1 Context Separation Is Everything

The Orchestrator and Implementor MUST operate in **separate contexts**. This means:

| Method | Orchestrator | Implementor | Notes |
|--------|--------------|-------------|-------|
| **Separate chat sessions** | Session A | Session B | RECOMMENDED - cleanest separation |
| **Separate AI assistants** | AI 1 | AI 2 | Overkill but works |
| **System prompt switching** | System A | System B | Risky - context may leak |
| **Same session** | ❌ | ❌ | PROHIBITED - breaks information asymmetry |

### 4.4.2 Invoking the Orchestrator Role

**When**: Beginning of sprint, task preparation, verification, progress tracking

**How**:

1. **Start a new chat session** (or dedicated orchestrator session)

2. **Provide the orchestrator system prompt**:
   ```markdown
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

3. **Provide context files**:
   - The specification document
   - Current manifest.yaml
   - Current progress.yaml
   - Task-specific verification criteria (if in VERIFY phase)

4. **Give the instruction** (e.g., "Prepare handover for task 3")

### 4.4.3 Invoking the Implementor Role

**When**: After handover is prepared, when doing implementation work

**How**:

1. **Start a NEW chat session** (CRITICAL - not the orchestrator session)

2. **Provide the implementor system prompt**:
   ```markdown
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

3. **Provide ONLY the handover document**:
   - `.orchestra/implementor/handovers/task-{id}-handover.md`
   - Do NOT provide the specification
   - Do NOT provide verification criteria

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

### 4.4.5 What If Using a Single AI Session?

If you MUST use a single session (not recommended):

1. **Clear context indicators**: Use explicit markers
   ```
   === SWITCHING TO ORCHESTRATOR ROLE ===
   [Orchestrator context here]
   === END ORCHESTRATOR CONTEXT ===
   ```

2. **Never provide verification criteria before implementation**
   
3. **Explicitly forget**: Ask the AI to "forget" implementor context before verifying
   
4. **Audit carefully**: Review responses for context leakage

**WARNING**: Single-session mode is fragile. Context leakage is likely. Use separate sessions whenever possible.

### 4.4.6 Role Verification Checklist

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

# 5. The Trust Model

## 5.1 Trust Architecture

Orchestra operates on a **zero-trust model** between roles, with **cryptographic-style verification** where possible.

```
┌────────────────────────────────────────────────────────────────┐
│                      TRUST BOUNDARIES                           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐         UNTRUSTED         ┌─────────────┐   │
│   │ Orchestrator│◄─────────BOUNDARY─────────►│ Implementor │   │
│   └─────────────┘                            └─────────────┘   │
│         │                                           │          │
│         │ TRUSTED                                   │ TRUSTED  │
│         ▼                                           ▼          │
│   ┌─────────────┐                            ┌─────────────┐   │
│   │ Orchestrator│                            │ Implementor │   │
│   │   Files     │                            │   Files     │   │
│   └─────────────┘                            └─────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## 5.2 What We Trust

| Element | Trust Level | Rationale |
|---------|-------------|-----------|
| File system state | High | Deterministically verifiable |
| Git history | High | Cryptographically signed |
| Test results | Medium | Tests can be weak but results are honest |
| Agent claims | None | Must be verified independently |

## 5.3 What We Don't Trust

| Element | Why Not Trusted | Mitigation |
|---------|-----------------|------------|
| Agent self-reports | Optimization bias | Independent verification |
| Implicit completion | No artifact | Require explicit signal + artifacts |
| "It works" claims | Subjective | Require passing tests + checks |

## 5.4 Verification Chain

Every claim must be independently verifiable:

```
Agent Claims "Task Complete"
         │
         ▼
┌─────────────────────────┐
│  Gate Check: Artifacts  │ ── Do required files exist?
└─────────────────────────┘
         │ PASS
         ▼
┌─────────────────────────┐
│  Gate Check: Build      │ ── Does project build?
└─────────────────────────┘
         │ PASS
         ▼
┌─────────────────────────┐
│  Gate Check: Tests      │ ── Do tests pass?
└─────────────────────────┘
         │ PASS
         ▼
┌─────────────────────────┐
│  Hidden Verification    │ ── Criteria unknown to implementor
└─────────────────────────┘
         │ PASS
         ▼
    Task Verified ✓
```

---

# 6. Information Architecture

## 6.1 Folder Structure (Abstract)

```
.orchestra/
├── manifest.yaml              # Task definitions, dependencies, ordering
├── progress.yaml              # Current state, completion status
│
├── common/                    # Shared resources
│   ├── scripts/               # Platform-specific script implementations
│   │   └── {script-name}.{ext}
│   └── templates/             # Document templates
│       └── {template-name}.{ext}
│
├── orchestrator/              # ORCHESTRATOR-ONLY ZONE
│   ├── .orchestrator-only/    # Hidden verification criteria
│   │   ├── verification/      # Per-task verification specs
│   │   │   └── task-{id}.yaml
│   │   └── criteria/          # Reusable criteria definitions
│   │       └── {criteria-name}.yaml
│   ├── processes/             # Orchestrator process documentation
│   │   └── {process-name}.md
│   └── scripts/               # Orchestrator-specific scripts
│       └── {script-name}.{ext}
│
├── implementor/               # IMPLEMENTOR-ACCESSIBLE ZONE
│   ├── handovers/             # Task handover documents
│   │   └── task-{id}-handover.md
│   ├── signals/               # Completion signals
│   │   └── task-{id}-signal.md
│   └── feedback/              # Orchestrator feedback
│       └── task-{id}-feedback.md
│
├── artifacts/                 # Task outputs
│   └── task-{id}/
│       ├── execution-log.md   # Commands executed
│       ├── verification.yaml  # Verification results
│       └── summary.md         # Task summary
│
└── docs/                      # Process documentation
    └── {doc-name}.md
```

## 6.2 Information Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    SPECIFICATION                                  │
│                    (Source of Truth)                              │
└──────────────────────────────┬───────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │         ORCHESTRATOR            │
              │    (Processes specification)    │
              └────────────────┬────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    manifest     │   │    progress     │   │   verification  │
│    (public)     │   │    (public)     │   │    (HIDDEN)     │
└─────────────────┘   └─────────────────┘   └─────────────────┘
         │                     │
         └──────────┬──────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │  HANDOVER DOCUMENT  │
         │  (Filtered view)    │
         └──────────┬──────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │    IMPLEMENTOR      │
         │  (Receives filtered │
         │   information only) │
         └─────────────────────┘
```

## 6.3 Document Specifications

### manifest.yaml

**Purpose**: Defines all tasks, their relationships, and metadata.

**Visibility**: Public (both roles)

**Contents**:
```yaml
version: "1.0"
sprint:
  id: "{sprint-identifier}"
  name: "{human-readable-name}"
  
tasks:
  - id: "{task-id}"
    name: "{task-name}"
    description: "{brief-description}"
    depends_on: ["{task-id}", ...]    # Prerequisites
    success_criteria:                  # WHAT to achieve (visible)
      - "{criterion-1}"
      - "{criterion-2}"
    context_files:                     # Files implementor should read
      - "{file-path}"
    output_files:                      # Files implementor should create/modify
      - "{file-path}"
```

**What it MUST NOT contain**:
- Verification criteria
- How success will be measured
- Test implementation details

### progress.yaml

**Purpose**: Tracks current state and task completion.

**Visibility**: Public (both roles)

**Contents**:
```yaml
current_task: "{task-id}"
status: "{pending|in_progress|verifying|completed|failed}"

tasks:
  "{task-id}":
    status: "{status}"
    attempts: {number}
    started_at: "{timestamp}"
    completed_at: "{timestamp}"        # If completed
    failed_reason: "{reason}"          # If failed
```

### task-{id}-handover.md

**Purpose**: Everything the implementor needs to complete a task.

**Visibility**: Implementor

**Contents**:
- Task identifier and name
- Success criteria (what to achieve)
- Context (relevant background)
- Files to read
- Files to create/modify
- Constraints and requirements
- How to signal completion

**What it MUST NOT contain**:
- Verification criteria
- How the orchestrator will check
- Details of other tasks

### Verification Criteria (Hidden)

**Purpose**: How the orchestrator verifies task completion.

**Visibility**: Orchestrator ONLY

**Location**: `.orchestra/orchestrator/.orchestrator-only/verification/`

**Contents**:
```yaml
task_id: "{task-id}"
criteria:
  - type: "{file_exists|content_contains|test_passes|custom}"
    description: "{what-this-checks}"
    parameters:
      # Type-specific parameters
```

## 6.4 Specification Document Format

> **This is the INPUT to Orchestra** - what the human provides to start a sprint.

### 6.4.1 Purpose

The specification document describes **what needs to be built**. It is the source of truth that the Orchestrator processes into tasks, success criteria, and (hidden) verification criteria.

### 6.4.2 Minimal Specification Format

```markdown
# Specification: [Feature/Project Name]

## Overview
[Brief description of what this specification covers]

## Context
[Background information, why this is needed, constraints]

## Tasks

### Task [ID]: [Task Name]

**Description**: [What needs to be done]

**Success Criteria**:
- [ ] [Criterion 1 - visible to implementor]
- [ ] [Criterion 2 - visible to implementor]
- [ ] [Criterion 3 - visible to implementor]

**Context Files**:
- [path/to/relevant/file1.ts]
- [path/to/relevant/file2.ts]

**Output Files**:
- [path/to/create/new-file.ts]
- [path/to/modify/existing-file.ts]

**Dependencies**: [Task IDs this depends on, or "None"]

---

### Task [ID]: [Task Name]
[... repeat for each task ...]
```

### 6.4.3 Full Specification Format

For complex projects, use the full format:

```markdown
# Specification: [Feature/Project Name]

## Metadata
| Field | Value |
|-------|-------|
| Spec ID | [unique-identifier] |
| Version | [semver] |
| Author | [who wrote this] |
| Date | [creation date] |
| Status | [draft|review|approved] |

## Overview
[Comprehensive description of the feature/project]

## Goals
1. [Primary goal]
2. [Secondary goal]
3. [etc.]

## Non-Goals
- [What this specification explicitly does NOT cover]
- [Boundaries of scope]

## Context
### Background
[Why is this needed? What problem does it solve?]

### Technical Context
[Relevant existing code, architecture decisions, constraints]

### Dependencies
[External libraries, services, or systems this depends on]

## Architecture
[High-level design, diagrams if helpful]

## Tasks

### Task 1: [Task Name]

**Description**: 
[Detailed description of what needs to be accomplished]

**Success Criteria** (What the implementor must achieve):
- [ ] [Specific, measurable criterion]
- [ ] [Specific, measurable criterion]
- [ ] [Specific, measurable criterion]

**Verification Hints** (For Orchestrator - Hidden from Implementor):
> ⚠️ ORCHESTRATOR ONLY: These hints help create hidden verification criteria.
> - Check that [specific implementation detail]
> - Verify [edge case handling]
> - Ensure [architectural constraint]

**Context Files** (Implementor should read):
- `path/to/file.ts` - [why this file is relevant]
- `path/to/another.ts` - [why this file is relevant]

**Output Files** (Implementor should create/modify):
- `path/to/new-file.ts` - [what this file should contain]
- `path/to/existing.ts` - [what changes are expected]

**Dependencies**: 
- Task [X] - [why this must complete first]
- OR "None - can start immediately"

**Estimated Complexity**: [Low|Medium|High]

**Notes**:
[Any additional context, warnings, or considerations]

---

### Task 2: [Task Name]
[... continue for all tasks ...]

## Acceptance Criteria
[Overall criteria for the entire specification to be considered complete]

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk 1] | [H/M/L] | [H/M/L] | [How to handle] |

## Open Questions
- [ ] [Question that needs resolution]
- [ ] [Another question]

## Revision History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | [date] | [author] | Initial draft |
```

### 6.4.4 Specification Best Practices

**DO**:
- Make success criteria specific and measurable
- Include "verification hints" for orchestrator (clearly marked)
- List all context files the implementor needs
- Define dependencies between tasks explicitly
- Keep tasks small (1-4 hours of work each)

**DON'T**:
- Put verification criteria in success criteria
- Make success criteria vague ("implement properly")
- Create circular dependencies
- Make tasks too large (hard to verify) or too small (overhead)
- Assume context - be explicit

### 6.4.5 How the Specification Becomes Tasks

```
SPECIFICATION DOCUMENT
         │
         │ sprint-init parses this
         ▼
┌─────────────────────────────────────────────────────────────┐
│ MANIFEST.YAML                                               │
│ (Task definitions + Success Criteria)                       │
│                                                             │
│ tasks:                                                      │
│   - id: "1"                                                 │
│     name: "Create configuration loader"                     │
│     success_criteria:                                       │
│       - "Load valid YAML files"                            │
│       - "Handle missing files gracefully"                  │
│     context_files: [...]                                    │
│     output_files: [...]                                     │
└─────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────┐
│ HIDDEN VERIFICATION CRITERIA                                │
│ (.orchestrator-only/verification/task-1.yaml)              │
│                                                             │
│ task_id: "1"                                                │
│ criteria:                                                   │
│   - type: file_exists                                       │
│     path: "src/config/loader.ts"                           │
│   - type: content_contains                                  │
│     path: "src/config/loader.ts"                           │
│     pattern: "throw new ConfigNotFoundError"               │
│   - type: test_passes                                       │
│     test: "test/config/loader.test.ts"                     │
└─────────────────────────────────────────────────────────────┘
```

### 6.4.6 Specification Document Checklist

Before running `sprint-init`, verify:

- [ ] Every task has a unique ID
- [ ] Every task has clear success criteria (3-5 items)
- [ ] Every task lists context files
- [ ] Every task lists expected output files
- [ ] Dependencies are specified and acyclic
- [ ] Verification hints are marked as orchestrator-only
- [ ] Tasks are sized appropriately (not too big, not too small)

---

# 7. Task Lifecycle

## 7.1 Lifecycle Phases

```
┌─────────┐    ┌─────────┐    ┌───────────┐    ┌───────────┐    ┌────────┐    ┌──────────┐
│ PENDING │───►│ PREPARE │───►│ IMPLEMENT │───►│ GATE      │───►│ VERIFY │───►│ COMPLETE │
└─────────┘    └─────────┘    └───────────┘    │ CHECK     │    └────────┘    └──────────┘
                                               └───────────┘
                                                    │
                                                    │ FAIL
                                                    ▼
                                               ┌───────────┐
                                               │  RETRY    │
                                               │ (back to  │
                                               │ IMPLEMENT)│
                                               └───────────┘
```

## 7.2 Phase Details

> **Structure**: Each phase shows **Abstract Actions** (the "what") followed by **Implementation** (the "how" with script calls).

---

### PHASE: INITIALIZATION (One-time, before any tasks)

**Actor**: Human / Orchestrator

**Entry condition**: Specification document exists, sprint not yet initialized.

**Abstract Actions**:
1. Parse specification into task definitions
2. Generate task manifest with success criteria
3. Generate hidden verification criteria
4. Initialize progress tracking
5. Verify development environment

**Exit condition**: Sprint is initialized and ready for first task.

**Implementation**:
```
1. ► SCRIPT: sprint-init
   ├── Input: Specification document path
   ├── Parse specification into tasks
   ├── Generate manifest.yaml with all tasks
   ├── Generate hidden verification criteria for each task
   ├── Initialize progress.yaml (all tasks: pending)
   └── Create .orchestra folder structure

2. ► SCRIPT: environment-check (RECOMMENDED)
   ├── Verify required tools installed
   ├── Verify project builds
   └── Verify tests can run
```

**On failure**: Cannot proceed. Human must fix specification or environment.

---

### PHASE: PENDING

**Actor**: None (waiting state)

**Entry condition**: 
- Task exists in manifest
- All prerequisite tasks are `completed`
- Previous task (if any) has been closed out

**Abstract Actions**:
- (No actions - this is a waiting state)

**Exit condition**: Orchestrator selects this task and begins PREPARE phase.

**Implementation**:
```
(No scripts - waiting state)
```

---

### PHASE: PREPARE

**Actor**: Orchestrator

**Entry condition**: Task is in `pending` status, prerequisites met.

**Abstract Actions**:
1. Verify previous task cleanly closed (if applicable)
2. Gather task definition and context
3. Generate handover document for implementor
4. Validate handover contains no hidden criteria
5. Update progress to in_progress

**Exit condition**: Handover document exists and passes validation.

**Implementation**:
```
1. ► SCRIPT: task-closeout-check (if not first task)
   ├── Verify previous task artifacts archived
   ├── Verify no uncommitted git changes
   ├── Verify no orphaned signal files
   └── Verify progress state is consistent
   └── ON FAIL: Stop. Clean up previous task first.

2. Read task definition from manifest
   ├── Get task ID, name, description
   ├── Get success criteria
   ├── Get context file list
   └── Get expected output files

3. ► SCRIPT: prepare-handover
   ├── Input: Task ID, manifest, templates
   ├── Load handover template
   ├── Populate with success criteria (NOT verification criteria)
   ├── Include context file references
   ├── Include expected outputs
   ├── Write to: .orchestra/implementor/handovers/task-{id}-handover.md
   └── Update progress.yaml: status → in_progress

4. ► SCRIPT: validate-handover
   ├── Input: Handover document path
   ├── Verify all required sections present
   ├── Verify success criteria are actionable
   ├── Verify NO verification criteria leaked
   ├── Verify all referenced context files exist
   └── ON FAIL: Regenerate handover or escalate.
```

**Artifacts produced**:
- `.orchestra/implementor/handovers/task-{id}-handover.md`
- Updated `progress.yaml` (status: `in_progress`)

---

### PHASE: IMPLEMENT

**Actor**: Implementor

**Entry condition**: Valid handover document exists for current task.

**Abstract Actions**:
1. Read and understand handover document
2. Implement required changes per success criteria
3. Run local checks (build, test, lint)
4. Signal completion

**Exit condition**: Implementor signals completion.

**Implementation**:
```
1. Read handover document
   ├── Understand task objectives
   ├── Understand success criteria
   ├── Identify context files to read
   └── Identify files to create/modify

2. Implement the task
   ├── Read relevant context files
   ├── Write/modify source files
   ├── Write/modify test files
   ├── Update documentation (if required)
   └── Log commands executed (execution log)

3. ► SCRIPT: pre-signal-check (RECOMMENDED, not mandatory)
   ├── Run project build
   ├── Run project tests
   ├── Run linting/formatting
   ├── Check for type errors
   └── Report results (implementor self-validation)

4. ► SCRIPT: signal-complete
   ├── Input: Task ID
   ├── Verify task status is in_progress
   ├── Create signal file with:
   │   ├── Timestamp
   │   ├── Files created/modified
   │   └── Summary of changes
   ├── Write to: .orchestra/implementor/signals/task-{id}-signal.md
   └── Trigger GATE CHECK phase
```

**Artifacts produced**:
- Source files created/modified
- Test files created/modified
- `.orchestra/implementor/signals/task-{id}-signal.md`
- Execution log (recommended)

---

### PHASE: GATE CHECK

**Actor**: System (Orchestrator-initiated, automated)

**Entry condition**: Signal file exists for current task.

**Abstract Actions**:
1. Verify signal received
2. Run deterministic checks (build, test, lint, files exist)
3. Record results

**Exit condition**: All gate checks pass OR failure with feedback.

**Implementation**:
```
1. ► SCRIPT: gate-check
   ├── Input: Task ID, expected artifacts from manifest
   │
   ├── CHECK 1: Signal file exists
   │   └── Verify .orchestra/implementor/signals/task-{id}-signal.md exists
   │
   ├── CHECK 2: Required files exist
   │   └── Verify all files listed in manifest.output_files exist
   │
   ├── CHECK 3: Build succeeds
   │   ├── Run platform build command
   │   └── Verify exit code = 0, no errors
   │
   ├── CHECK 4: Tests pass
   │   ├── Run platform test command
   │   └── Verify all tests pass
   │
   ├── CHECK 5: Static analysis passes
   │   ├── Run platform lint command
   │   └── Verify no errors (warnings may be acceptable)
   │
   ├── Record results to: .orchestra/artifacts/task-{id}/gate-check.yaml
   │
   └── RESULT:
       ├── ALL PASS → Proceed to VERIFY phase
       └── ANY FAIL → Proceed to RETRY phase
```

**Artifacts produced**:
- `.orchestra/artifacts/task-{id}/gate-check.yaml`

**On failure**: Trigger RETRY phase with `generate-feedback`.

---

### PHASE: VERIFY

**Actor**: Orchestrator

**Entry condition**: Gate check passed for current task.

**Abstract Actions**:
1. Execute hidden verification criteria
2. Check semantic requirements
3. Validate against specification
4. Record verification results

**Exit condition**: All verification passes OR failure with feedback.

**Implementation**:
```
1. ► SCRIPT: verification-audit
   ├── Input: Task ID
   │
   ├── Load hidden verification criteria
   │   └── From: .orchestra/orchestrator/.orchestrator-only/verification/task-{id}.yaml
   │
   ├── Execute each criterion:
   │   ├── file_exists checks
   │   ├── content_contains checks
   │   ├── content_matches checks
   │   ├── export_exists checks
   │   ├── function_signature checks
   │   ├── test_coverage checks
   │   ├── no_forbidden_patterns checks
   │   └── custom verification scripts
   │
   ├── Record results to: .orchestra/artifacts/task-{id}/verification.yaml
   │
   └── RESULT:
       ├── ALL PASS → Proceed to COMPLETE phase
       └── ANY FAIL → Proceed to RETRY phase
```

**Artifacts produced**:
- `.orchestra/artifacts/task-{id}/verification.yaml`

**On failure**: Trigger RETRY phase with `generate-feedback`.

---

### PHASE: COMPLETE

**Actor**: Orchestrator

**Entry condition**: Verification audit passed for current task.

**Abstract Actions**:
1. Archive task artifacts
2. Generate task summary
3. Update progress to `completed`
4. Verify clean state
5. Prepare next task (if any)

**Exit condition**: Progress updated, artifacts archived.

**Implementation**:
```
1. ► SCRIPT: accept-signal-check
   ├── Input: Task ID, gate check results, verification results
   │
   ├── Final validation:
   │   ├── Verify gate-check.yaml exists and shows PASS
   │   ├── Verify verification.yaml exists and shows PASS
   │   └── Verify all expected artifacts present
   │
   ├── Archive task:
   │   ├── Copy relevant artifacts to .orchestra/artifacts/task-{id}/
   │   └── Generate task summary
   │
   ├── Update progress:
   │   ├── Set task status → completed
   │   ├── Set completed_at timestamp
   │   └── Write to progress.yaml
   │
   └── Output: .orchestra/artifacts/task-{id}/summary.md

2. ► SCRIPT: task-closeout-check
   ├── Verify git working directory is clean (or commit changes)
   ├── Verify no orphaned signals
   ├── Verify progress state consistent
   └── Confirm ready for next task

3. Determine next action:
   ├── IF more tasks pending → Return to PREPARE for next task
   └── IF no more tasks → Sprint complete
```

**Artifacts produced**:
- `.orchestra/artifacts/task-{id}/summary.md`
- Updated `progress.yaml` (status: `completed`)

---

### PHASE: RETRY

**Actor**: Orchestrator

**Trigger**: Gate check OR verification audit failed.

**Entry condition**: Failure recorded, attempt count < max_attempts.

**Abstract Actions**:
1. Increment attempt counter
2. Generate feedback document (without revealing verification criteria)
3. Check retry limits
4. Return to IMPLEMENT phase OR escalate

**Exit condition**: Back to IMPLEMENT or escalated to human.

**Implementation**:
```
1. Increment attempt counter
   └── Update progress.yaml: attempts += 1

2. ► SCRIPT: generate-feedback
   ├── Input: Task ID, failure results, attempt number
   │
   ├── Analyze failure:
   │   ├── Identify which checks failed
   │   ├── Determine failure category
   │   └── Assess if same error as previous attempt
   │
   ├── Generate feedback (CRITICAL: Do NOT reveal verification criteria):
   │   ├── Describe WHAT failed (not HOW it was detected)
   │   ├── Provide actionable guidance
   │   └── Increase specificity on repeated failures
   │
   ├── Write to: .orchestra/implementor/feedback/task-{id}-attempt-{n}-feedback.md
   │
   └── Check escalation triggers:
       ├── IF attempts >= max_attempts → Trigger ESCALATE
       ├── IF same error twice → Trigger ESCALATE
       └── ELSE → Return to IMPLEMENT phase

3. Return to IMPLEMENT phase
   └── Implementor receives feedback and retries
```

**Artifacts produced**:
- `.orchestra/implementor/feedback/task-{id}-attempt-{n}-feedback.md`
- Updated `progress.yaml` (attempts incremented)

---

### PHASE: ESCALATED

**Actor**: Orchestrator → Human Supervisor

**Trigger**: Max retries exceeded OR same error repeated OR explicit escalation request.

**Entry condition**: Escalation trigger activated.

**Abstract Actions**:
1. Compile escalation report with full context
2. Notify human supervisor
3. Mark task as escalated
4. Halt workflow until human intervention

**Exit condition**: Human supervisor resolves the issue.

**Implementation**:
```
1. ► SCRIPT: escalate-failure
   ├── Input: Task ID, failure history, all context
   │
   ├── Compile escalation report:
   │   ├── Task specification
   │   ├── All attempts and their results
   │   ├── All feedback given
   │   ├── Implementor responses
   │   └── Relevant code snippets
   │
   ├── Update progress:
   │   └── Set task status → escalated
   │
   ├── Notify human supervisor
   │   └── Via configured notification channel
   │
   └── Output: .orchestra/artifacts/task-{id}/escalation-report.md

2. HALT workflow
   └── Wait for human intervention
```

**Exit condition**: Human supervisor resolves the issue.

**Human resolution options**:
- Fix the issue manually and mark task complete
- Modify task specification and restart
- Skip task and proceed (with documented justification)
- Abort sprint

**Artifacts produced**:
- `.orchestra/artifacts/task-{id}/escalation-report.md`
- Updated `progress.yaml` (status: `escalated`)

---

## 7.3 Mandatory Script Execution Matrix

> ⚠️ **CRITICAL**: Scripts are NOT optional utilities. Each phase transition REQUIRES specific scripts to execute successfully before the transition is valid.

### Phase Transition Requirements

| From Phase | To Phase | MANDATORY Script(s) | Blocking? | Actor |
|------------|----------|---------------------|-----------|-------|
| — | PENDING | `sprint-init` | YES | Human/Orchestrator |
| PENDING | PREPARE | `task-closeout-check` (prev task) | YES | Orchestrator |
| PREPARE | IMPLEMENT | `prepare-handover` → `validate-handover` | YES | Orchestrator |
| IMPLEMENT | GATE CHECK | `signal-complete` | YES | Implementor |
| GATE CHECK | VERIFY | `gate-check` | YES | System |
| VERIFY | COMPLETE | `verification-audit` | YES | Orchestrator |
| COMPLETE | (next task) | `accept-signal-check` → `task-closeout-check` | YES | Orchestrator |
| Any | RETRY | `generate-feedback` | YES | Orchestrator |
| RETRY (max) | ESCALATED | `escalate-failure` | YES | Orchestrator |

### Blocking Semantics

**Blocking = YES** means:
- The phase transition CANNOT occur until the script completes successfully
- Failure of the script halts the workflow
- No exceptions, no manual overrides (except by human supervisor)

### Complete Workflow with Scripts

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              SPRINT INITIALIZATION                                   │
│                                                                                      │
│   Human provides spec ──► sprint-init ──► manifest.yaml + progress.yaml created    │
│                              │                                                       │
│                              └──► environment-check (optional but recommended)      │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE: PENDING → PREPARE                                                            │
│                                                                                      │
│   (For task > 1) task-closeout-check ──► Verify previous task cleanly closed        │
│                          │                                                           │
│                          ▼                                                           │
│   prepare-handover ──► Generate handover document                                   │
│                          │                                                           │
│                          ▼                                                           │
│   validate-handover ──► Verify handover is complete and has no leaks               │
│                          │                                                           │
│                          └──► FAIL? → Cannot proceed until fixed                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE: IMPLEMENT                                                                     │
│                                                                                      │
│   Implementor reads handover                                                         │
│          │                                                                           │
│          ▼                                                                           │
│   Implementor works on task                                                          │
│          │                                                                           │
│          ▼                                                                           │
│   pre-signal-check ──► Implementor self-validates (RECOMMENDED, not mandatory)     │
│          │                                                                           │
│          ▼                                                                           │
│   signal-complete ──► Creates signal file, triggers next phase                      │
│          │                                                                           │
│          └──► Missing signal? → Stuck, cannot proceed                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE: GATE CHECK                                                                    │
│                                                                                      │
│   gate-check ──► Run deterministic checks (build, test, lint, files exist)         │
│       │                                                                              │
│       ├──► PASS? → Proceed to VERIFY                                                │
│       │                                                                              │
│       └──► FAIL? → generate-feedback → Return to IMPLEMENT (retry)                 │
│                         │                                                            │
│                         └──► Max retries? → escalate-failure → BLOCKED             │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE: VERIFY                                                                        │
│                                                                                      │
│   verification-audit ──► Execute HIDDEN verification criteria                       │
│       │                                                                              │
│       ├──► PASS? → Proceed to COMPLETE                                              │
│       │                                                                              │
│       └──► FAIL? → generate-feedback → Return to IMPLEMENT (retry)                 │
│                         │                                                            │
│                         └──► Max retries? → escalate-failure → BLOCKED             │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE: COMPLETE                                                                      │
│                                                                                      │
│   accept-signal-check ──► Final validation: all checks passed, artifacts present   │
│       │                                                                              │
│       ▼                                                                              │
│   (Archive artifacts, update progress)                                               │
│       │                                                                              │
│       ▼                                                                              │
│   task-closeout-check ──► Verify clean state before next task                       │
│       │                                                                              │
│       └──► Next task? → Back to PREPARE                                             │
│       └──► Sprint done? → Sprint complete                                            │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Script Categories

| Category | Scripts | Mandatory? | Actor |
|----------|---------|------------|-------|
| **Phase Gates** | `gate-check`, `verification-audit`, `accept-signal-check` | YES - Blocking | Orchestrator/System |
| **Transitions** | `prepare-handover`, `validate-handover`, `signal-complete` | YES - Blocking | Role-specific |
| **Lifecycle** | `sprint-init`, `task-closeout-check` | YES - Blocking | Orchestrator |
| **Failure Handling** | `generate-feedback`, `escalate-failure` | YES - On failure path | Orchestrator |
| **Self-Check** | `pre-signal-check` | RECOMMENDED | Implementor |
| **Utility** | `sprint-status`, `environment-check` | OPTIONAL | Any |

### What Happens If a Script Is Skipped?

| Skipped Script | Consequence |
|----------------|-------------|
| `sprint-init` | No manifest, nothing can run |
| `prepare-handover` | Implementor has no instructions |
| `validate-handover` | Verification criteria may leak |
| `signal-complete` | Task stuck in IMPLEMENT forever |
| `gate-check` | Broken code may reach verification |
| `verification-audit` | Implementation theater passes undetected |
| `accept-signal-check` | Incomplete tasks marked complete |
| `task-closeout-check` | Dirty state pollutes next task |
| `generate-feedback` | Implementor has no guidance for retry |
| `escalate-failure` | Failed task blocks sprint silently |

### Enforcement Mechanism

Scripts enforce themselves through **state dependencies**:

1. **Signal file required**: `gate-check` refuses to run without signal file
2. **Gate results required**: `verification-audit` refuses to run without gate-check passing
3. **Verification required**: `accept-signal-check` refuses to run without verification passing
4. **Clean state required**: `prepare-handover` refuses to run if previous task not closed

This creates a **chain of custody** where each step validates the previous step completed.

---

# 8. Script Specifications

This section defines what each script must accomplish **abstractly**. Platform-specific implementations may vary, but the **purpose and checks must remain consistent**.

> **Cross-Reference**: See [Section 7.3](#73-mandatory-script-execution-matrix) for when each script MUST be executed.

## 8.1 Sprint Management Scripts

### `sprint-init`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | BEFORE any task can begin |
| **Mandatory** | YES - Blocking |
| **Actor** | Human / Orchestrator |
| **Executes During** | Sprint initialization (once per sprint) |

**Purpose**: Initialize a new sprint from a specification.

**Trigger**: Human initiates new sprint.

**Inputs**:
- Specification document path
- Sprint configuration (optional)

**Actions**:
1. Parse specification document
2. Extract task definitions
3. Generate manifest.yaml
4. Generate verification criteria (hidden)
5. Initialize progress.yaml
6. Create folder structure

**Outputs**:
- `.orchestra/manifest.yaml`
- `.orchestra/progress.yaml`
- `.orchestra/orchestrator/.orchestrator-only/verification/task-{id}.yaml` (per task)

**Success criteria**:
- Manifest contains all tasks from specification
- Each task has success criteria defined
- Each task has hidden verification criteria defined
- Progress shows all tasks as `pending`
- Folder structure created

**Failure modes**:
- Specification parsing fails → Clear error message
- Invalid task structure → Validation error with details
- Missing required fields → Enumerated list of missing fields

---

### `sprint-status`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | Any time (utility) |
| **Mandatory** | NO - Utility |
| **Actor** | Human / Orchestrator |
| **Executes During** | On-demand |

**Purpose**: Report current sprint progress.

**Trigger**: Human or orchestrator requests status.

**Inputs**:
- None (reads from progress.yaml)

**Actions**:
1. Read progress.yaml
2. Calculate statistics
3. Format status report

**Outputs**:
- Status report (console or file)

**Success criteria**:
- Accurate count of tasks by status
- Current task clearly identified
- Blockers/failures highlighted

---

## 8.2 Task Preparation Scripts

### `prepare-handover`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | PENDING → PREPARE transition |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |
| **Executes During** | Start of each task |

**Purpose**: Generate a handover document for the implementor.

**Trigger**: Orchestrator preparing next task.

**Inputs**:
- Task ID
- Manifest
- Templates

**Actions**:
1. Read task definition from manifest
2. Verify prerequisites are complete
3. Gather context files
4. Apply handover template
5. Write handover document
6. Update progress to `in_progress`

**Outputs**:
- `.orchestra/implementor/handovers/task-{id}-handover.md`
- Updated progress.yaml

**Success criteria**:
- Handover contains all success criteria
- Handover contains all context file references
- Handover does NOT contain verification criteria
- Progress updated correctly

**What this script MUST NOT do**:
- Include verification criteria in handover
- Include details of other tasks
- Include historical verification results

---

### `validate-handover`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | After `prepare-handover`, before IMPLEMENT begins |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |
| **Executes During** | Immediately after handover generation |

**Purpose**: Verify handover document is complete and correct.

**Trigger**: Before implementor begins work.

**Inputs**:
- Handover document path

**Actions**:
1. Parse handover document
2. Verify required sections present
3. Verify no forbidden content (verification criteria)
4. Verify context files exist

**Outputs**:
- Validation result (pass/fail)
- List of issues (if any)

**Success criteria**:
- All required sections present
- No verification criteria leaked
- All referenced files exist
- Success criteria are actionable

---

## 8.3 Implementation Scripts

### `signal-complete`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | IMPLEMENT → GATE CHECK transition |
| **Mandatory** | YES - Blocking |
| **Actor** | Implementor |
| **Executes During** | When implementor believes task is complete |

**Purpose**: Implementor signals task completion.

**Trigger**: Implementor believes task is complete.

**Inputs**:
- Task ID
- Summary of changes (optional)
- List of files modified

**Actions**:
1. Verify task is in `in_progress` state
2. Verify signal format is correct
3. Write signal file
4. Trigger gate check

**Outputs**:
- `.orchestra/implementor/signals/task-{id}-signal.md`
- Gate check initiated

**Success criteria**:
- Signal file created with required content
- Progress state allows signaling
- Gate check triggered

---

## 8.4 Verification Scripts

### `pre-signal-check`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | During IMPLEMENT, before `signal-complete` |
| **Mandatory** | NO - Recommended |
| **Actor** | Implementor |
| **Executes During** | Before signaling (self-validation) |

**Purpose**: Implementor self-check before signaling (optional but recommended).

**Trigger**: Implementor runs before signaling.

**Inputs**:
- None (operates on current project state)

**Actions**:
1. Run build
2. Run tests
3. Run linting/formatting
4. Check for common errors

**Outputs**:
- Check results (pass/fail per category)
- Errors/warnings list

**Success criteria**:
- Build succeeds
- Tests pass
- No linting errors
- No type errors (if applicable)

**Note**: This is a **convenience script** for the implementor. It does NOT replace gate checks or verification.

---

### `gate-check`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | GATE CHECK phase (after `signal-complete`) |
| **Mandatory** | YES - Blocking |
| **Actor** | System (Orchestrator-initiated) |
| **Executes During** | Immediately after signal received |

**Purpose**: Deterministic verification after implementor signals.

**Trigger**: Implementor signals completion.

**Inputs**:
- Task ID
- Expected artifacts (from manifest)

**Actions**:
1. Verify signal file exists
2. Verify required files exist
3. Run project build
4. Run project tests
5. Run static analysis
6. Record results

**Outputs**:
- Gate check results (pass/fail per check)
- `.orchestra/artifacts/task-{id}/gate-check.yaml`

**Success criteria**:
- All required files exist
- Build succeeds with zero errors
- All tests pass
- Static analysis passes (or within acceptable thresholds)

**What gate check DOES NOT do**:
- Semantic verification
- Hidden criteria evaluation
- Judgment calls

---

### `verification-audit`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | VERIFY phase (after `gate-check` passes) |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |
| **Executes During** | After gate check passes |

**Purpose**: Execute hidden verification criteria.

**Trigger**: Gate check passes.

**Inputs**:
- Task ID
- Hidden verification criteria

**Actions**:
1. Load hidden criteria for task
2. Execute each criterion:
   - File existence checks
   - Content validation checks
   - Structural checks
   - Behavioral checks (test-based)
   - Custom checks
3. Record results

**Outputs**:
- Verification results (pass/fail per criterion)
- `.orchestra/artifacts/task-{id}/verification.yaml`

**Criteria types**:

| Type | Description | Example |
|------|-------------|---------|
| `file_exists` | File exists at path | `path: src/utils/config.ts` |
| `file_not_exists` | File should not exist | `path: src/old/deprecated.ts` |
| `content_contains` | File contains text | `path: ..., pattern: "export function"` |
| `content_matches` | File matches regex | `path: ..., regex: "version.*1\\.0"` |
| `export_exists` | Module exports symbol | `path: ..., export: "ConfigLoader"` |
| `function_signature` | Function has signature | `path: ..., function: "load", params: [...]` |
| `test_exists` | Test file exists for source | `source: src/x.ts, test: test/x.test.ts` |
| `test_covers` | Test covers functionality | `test: ..., covers: ["function-name"]` |
| `dependency_added` | Package dependency added | `package: "yaml", type: "production"` |
| `no_forbidden_patterns` | No forbidden code patterns | `patterns: ["console.log", "debugger"]` |
| `custom` | Custom verification script | `script: verify-custom.sh` |

**Success criteria**:
- All criteria evaluated
- All criteria pass
- Results recorded with details

**What verification audit MUST do**:
- Check criteria implementor has never seen
- Verify semantic correctness where possible
- Catch implementation theater (looks right but isn't)

---

### `accept-signal-check`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | VERIFY → COMPLETE transition |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |
| **Executes During** | After verification-audit passes |

**Purpose**: Final acceptance check before marking task complete.

**Trigger**: Verification audit passes.

**Inputs**:
- Task ID
- Gate check results
- Verification results

**Actions**:
1. Verify gate check passed
2. Verify verification audit passed
3. Verify all artifacts present
4. Update progress to `completed`
5. Archive task artifacts
6. Prepare completion summary

**Outputs**:
- Updated progress.yaml
- `.orchestra/artifacts/task-{id}/summary.md`
- Task marked complete

**Success criteria**:
- All prior checks passed
- Artifacts archived
- Progress updated
- Summary generated

---

## 8.5 Failure Handling Scripts

### `generate-feedback`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | On GATE CHECK or VERIFY failure |
| **Mandatory** | YES - On failure path |
| **Actor** | Orchestrator |
| **Executes During** | After any verification failure, before retry |

**Purpose**: Create feedback for implementor after failure.

**Trigger**: Gate check or verification fails.

**Inputs**:
- Task ID
- Failure results
- Attempt number

**Actions**:
1. Analyze failure results
2. Generate actionable feedback
3. Determine if retry or escalate
4. Write feedback file

**Outputs**:
- `.orchestra/implementor/feedback/task-{id}-feedback.md`

**Success criteria**:
- Feedback is actionable
- Feedback does NOT reveal verification criteria
- Feedback identifies what failed, not how it was checked

**Critical constraint**: Feedback must tell implementor **what went wrong** without revealing **how it was detected**.

Example:
- ✅ "The configuration loader does not handle missing files correctly"
- ❌ "The test `config.test.ts:45` which checks missing file handling failed"

---

### `escalate-failure`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | After max retries exceeded |
| **Mandatory** | YES - On persistent failure |
| **Actor** | Orchestrator |
| **Executes During** | When retry limit reached or same error repeats |

**Purpose**: Escalate persistent failures to human.

**Trigger**: Max retries exceeded OR same error repeated.

**Inputs**:
- Task ID
- Failure history
- All relevant context

**Actions**:
1. Compile failure summary
2. Gather relevant artifacts
3. Notify human supervisor
4. Mark task as `escalated`

**Outputs**:
- Escalation report
- Updated progress (status: `escalated`)

**Escalation triggers**:
- Max attempts exceeded (default: 3)
- Same error twice consecutively
- Implementor requests help
- Orchestrator cannot proceed

---

## 8.6 Utility Scripts

### `task-closeout-check`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | COMPLETE → next task PREPARE transition |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |
| **Executes During** | After task completion, before preparing next task |

**Purpose**: Verify clean state before moving to next task.

**Trigger**: Before preparing next task.

**Inputs**:
- Previous task ID (optional)

**Actions**:
1. Verify no uncommitted changes
2. Verify no pending signals
3. Verify previous task properly closed
4. Verify progress state is consistent

**Outputs**:
- Closeout result (pass/fail)
- Issues list (if any)

**Success criteria**:
- Git working directory clean
- No orphaned signals
- Progress state consistent
- Ready for next task

---

### `environment-check`

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | Sprint initialization (recommended) |
| **Mandatory** | NO - Recommended |
| **Actor** | Human / Orchestrator |
| **Executes During** | Before starting sprint, or when issues arise |

**Purpose**: Verify development environment is correctly configured.

**Trigger**: Sprint initialization or on-demand.

**Inputs**:
- Environment requirements (from configuration)

**Actions**:
1. Verify required tools installed
2. Verify correct versions
3. Verify project builds
4. Verify tests can run

**Outputs**:
- Environment check results
- Missing/incorrect items list

**Success criteria**:
- All required tools present
- Versions meet minimums
- Project builds successfully
- Tests execute (may fail, but can run)

---

# 9. Verification Model

## 9.1 Verification Layers

Orchestra employs a **layered verification model**:

```
Layer 4: Semantic Verification (Hidden)
         "Does the implementation correctly solve the problem?"
         └── Orchestrator-only, hidden criteria
         
Layer 3: Behavioral Verification
         "Does the code behave correctly?"
         └── Tests pass, integration works
         
Layer 2: Structural Verification
         "Is the code structured correctly?"
         └── Right files, right exports, right signatures
         
Layer 1: Existence Verification
         "Do the required artifacts exist?"
         └── Files exist, build succeeds
```

## 9.2 Gate Checks vs Hidden Verification

| Aspect | Gate Checks | Hidden Verification |
|--------|-------------|---------------------|
| **Visibility** | Can be visible | Must be hidden |
| **Type** | Deterministic | May be heuristic |
| **Purpose** | Basic sanity | Actual correctness |
| **Gaming risk** | Low | Would be high if visible |
| **Examples** | Build passes, tests run | Correct algorithm, proper error handling |

## 9.3 Designing Hidden Criteria

**Good hidden criteria**:
- Check things the implementor couldn't anticipate
- Verify edge cases not in success criteria
- Validate architectural decisions
- Check for common shortcuts/cheats

**Bad hidden criteria**:
- Trivially guessable checks
- Exact string matches implementor could infer
- Checks that duplicate visible success criteria

**Examples**:

| Task | Success Criteria (Visible) | Hidden Criteria |
|------|---------------------------|-----------------|
| "Implement config loader" | "Load YAML config files" | "Handles missing files by throwing ConfigNotFoundError (not generic Error)" |
| "Add user validation" | "Validate user input" | "Empty string is invalid, not just null/undefined" |
| "Create API client" | "Fetch data from API" | "Includes retry logic with exponential backoff" |

## 9.4 Preventing Verification Gaming

| Gaming Vector | Prevention |
|---------------|------------|
| Seeing criteria | Physical separation, access controls |
| Inferring criteria | Criteria designed to be non-obvious |
| Social engineering | Fresh context, no history |
| Minimal compliance | Multiple verification angles |

---

# 10. Failure Handling

## 10.1 Failure Categories

| Category | Description | Response |
|----------|-------------|----------|
| **Gate failure** | Build/test/lint fails | Retry with specific feedback |
| **Verification failure** | Hidden criteria not met | Retry with oblique feedback |
| **Implementation wrong** | Wrong approach taken | Retry with clarification |
| **Task impossible** | Cannot be done as specified | Escalate to human |
| **System error** | Infrastructure failure | Retry automatically |

## 10.2 Retry Logic

```
Attempt 1: Implement → Verify → FAIL
    │
    ▼
Generate feedback (generic)
    │
    ▼
Attempt 2: Implement → Verify → FAIL
    │
    ▼
Generate feedback (more specific)
Notify human (warning)
    │
    ▼
Attempt 3: Implement → Verify → FAIL
    │
    ▼
Escalate to human (blocking)
Task marked as BLOCKED
```

## 10.3 Feedback Generation Rules

**Rule 1**: Never reveal verification criteria
```
❌ "The test at line 45 expected 'ConfigError' but got 'Error'"
✅ "Error handling does not use the appropriate error types"
```

**Rule 2**: Be actionable
```
❌ "The implementation is wrong"
✅ "The function does not handle the case when input is empty"
```

**Rule 3**: Progressive specificity
```
Attempt 1: "Configuration loading has issues"
Attempt 2: "Configuration loading does not handle edge cases correctly"
Attempt 3: "Configuration loading fails when the file is empty or malformed"
```

## 10.4 Escalation Protocol

**When to escalate**:
1. Max retries exceeded (default: 3)
2. Same error twice consecutively
3. Implementor explicitly requests help
4. Orchestrator cannot generate useful feedback
5. Task appears impossible as specified

**Escalation package**:
- Task specification
- All attempts and their failures
- Feedback given
- Implementor responses
- Relevant code context

---

# 11. Artifact Specifications

## 11.1 Required Artifacts Per Task

| Artifact | Creator | When | Purpose |
|----------|---------|------|---------|
| Handover document | Orchestrator | Before implementation | Implementor's instructions |
| Signal file | Implementor | On completion | Triggers verification |
| Gate check results | System | After signal | Records deterministic checks |
| Verification results | Orchestrator | After gate check | Records hidden verification |
| Feedback (if failed) | Orchestrator | On failure | Guides retry |
| Summary | Orchestrator | On completion | Archives task outcome |
| Execution log | Implementor | During implementation | Audit trail |

## 11.2 Artifact Retention

| Category | Retention | Reason |
|----------|-----------|--------|
| Handovers | Sprint lifetime | Reference during sprint |
| Signals | Sprint lifetime | Audit trail |
| Verification results | Permanent | Learning, debugging |
| Summaries | Permanent | Historical record |
| Feedback | Sprint lifetime | Retry context |
| Execution logs | Sprint lifetime | Debugging |

## 11.3 Artifact Format Standards

**Markdown documents**:
- Use consistent heading levels
- Include metadata header (task ID, timestamp, actor)
- Use code blocks for code/commands
- Use tables for structured data

**YAML documents**:
- Include version field
- Use consistent key naming (snake_case)
- Include timestamps in ISO 8601 format
- Validate against schema

---

# 12. Adaptation Guidelines

## 12.1 Platform Adaptation

Orchestra is platform-agnostic. To adapt for a specific platform:

### Required Adaptations

| Component | What to Adapt |
|-----------|---------------|
| Build commands | `npm run build`, `flutter build`, `cargo build`, etc. |
| Test commands | `npm test`, `flutter test`, `pytest`, etc. |
| Lint commands | `eslint`, `flutter analyze`, `clippy`, etc. |
| File patterns | `*.ts`, `*.dart`, `*.py`, etc. |
| Package manager | `npm`, `pub`, `pip`, `cargo`, etc. |

### Configuration Approach

Create platform-specific configuration:

```yaml
# .orchestra/config/platform.yaml
platform: typescript  # or flutter, python, rust, etc.

commands:
  build: "npm run build"
  test: "npm test"
  lint: "npm run lint"
  typecheck: "npx tsc --noEmit"  # if applicable

patterns:
  source: "src/**/*.ts"
  test: "test/**/*.test.ts"
  config: "*.config.{js,ts,json}"

package_manager:
  name: "npm"
  install: "npm install"
  add_dep: "npm install {package}"
  add_dev_dep: "npm install -D {package}"
```

### Script Adaptation

Scripts should read platform configuration and adapt behavior:

```
┌─────────────────────────────────────────────────────────────────┐
│                     ABSTRACT SCRIPT                              │
│                    (Platform-agnostic)                           │
│                                                                  │
│   "Run tests and verify they pass"                              │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
       ┌───────────┐   ┌───────────┐   ┌───────────┐
       │ TypeScript│   │  Flutter  │   │  Python   │
       │ npm test  │   │flutter test│  │  pytest   │
       └───────────┘   └───────────┘   └───────────┘
```

## 12.2 Project Adaptation

Each project using Orchestra should:

1. **Define verification criteria** appropriate to the project
2. **Configure platform settings** for build/test/lint
3. **Customize templates** for project conventions
4. **Set thresholds** for acceptable test coverage, lint warnings, etc.

## 12.3 Team Adaptation

Teams may customize:

1. **Retry limits** (default: 3)
2. **Escalation triggers** 
3. **Notification channels**
4. **Approval workflows**

## 12.4 What MUST NOT Be Adapted

| Element | Why Fixed |
|---------|-----------|
| Role separation | Core principle |
| Information asymmetry | Core principle |
| Verification before completion | Core principle |
| Artifact requirements | Audit trail |
| Fresh context rule | Prevents gaming |

---

# Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Orchestrator** | Role responsible for task preparation, verification, and progress management |
| **Implementor** | Role responsible for executing task implementation |
| **Handover** | Document containing everything implementor needs for a task |
| **Signal** | Implementor's declaration that work is complete |
| **Gate check** | Deterministic verification (build, test, lint) |
| **Hidden verification** | Verification criteria unknown to implementor |
| **Implementation theater** | Work that appears complete but isn't |
| **Context pollution** | Prior knowledge influencing current behavior |
| **Escalation** | Transferring a problem to human supervisor |

---

# Appendix B: Checklist Templates

## Pre-Implementation Checklist (Implementor)

- [ ] Read handover document completely
- [ ] Understand all success criteria
- [ ] Identify files to create/modify
- [ ] Verify development environment ready
- [ ] No questions/blockers before starting

## Pre-Signal Checklist (Implementor)

- [ ] All success criteria addressed
- [ ] Build succeeds
- [ ] Tests pass
- [ ] Linting passes
- [ ] Code formatted correctly
- [ ] Documentation updated (if required)
- [ ] Execution log updated

## Post-Verification Checklist (Orchestrator)

- [ ] Gate checks passed
- [ ] All hidden criteria verified
- [ ] Artifacts archived
- [ ] Progress updated
- [ ] Summary generated
- [ ] Next task prepared (if applicable)

---

# Appendix C: Anti-Patterns

## Anti-Pattern 1: Visible Verification

**Symptom**: Verification criteria included in handover document.

**Why it's bad**: Enables gaming.

**Fix**: Move criteria to hidden location.

## Anti-Pattern 2: Self-Verification

**Symptom**: Same agent that implements also verifies.

**Why it's bad**: Confirmation bias.

**Fix**: Ensure role separation in context/session.

## Anti-Pattern 3: Context Leakage

**Symptom**: Implementor has access to previous task's verification details.

**Why it's bad**: Infers patterns in verification.

**Fix**: Fresh context per task.

## Anti-Pattern 4: Rubber-Stamp Verification

**Symptom**: Orchestrator approves without running checks.

**Why it's bad**: Defeats the purpose.

**Fix**: Automated verification with audit trail.

## Anti-Pattern 5: Over-Specific Feedback

**Symptom**: Feedback reveals exactly what check failed.

**Why it's bad**: Leaks verification criteria.

**Fix**: Oblique, actionable feedback.

---

# Appendix D: Document Templates

> **Copy these templates** when creating Orchestra artifacts.

## D.1 Handover Document Template

```markdown
# Task Handover: [Task ID] - [Task Name]

## Metadata
| Field | Value |
|-------|-------|
| Task ID | [task-id] |
| Sprint | [sprint-id] |
| Prepared by | Orchestrator |
| Prepared at | [ISO-8601 timestamp] |
| Status | Ready for implementation |

---

## Your Mission

[One-paragraph summary of what needs to be accomplished]

---

## Success Criteria

You must satisfy ALL of the following:

1. [ ] [First criterion - specific and measurable]
2. [ ] [Second criterion - specific and measurable]
3. [ ] [Third criterion - specific and measurable]
4. [ ] [Additional criteria as needed]

---

## Context

### Background
[Why this task exists, what problem it solves]

### Technical Context
[Relevant architectural decisions, patterns to follow, constraints]

---

## Files to Read

Review these files before starting:

| File | Why |
|------|-----|
| `path/to/file1.ts` | [What you'll learn from this file] |
| `path/to/file2.ts` | [What you'll learn from this file] |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `path/to/new-file.ts` | CREATE | [What this file should do] |
| `path/to/existing.ts` | MODIFY | [What changes to make] |

---

## Constraints

- [Constraint 1 - e.g., "No external dependencies"]
- [Constraint 2 - e.g., "Must be backwards compatible"]
- [Constraint 3 - e.g., "Follow existing code patterns"]

---

## How to Signal Completion

When you have completed all success criteria:

1. Run `pre-signal-check` to self-validate (recommended)
2. Run `signal-complete --task-id [task-id]`

---

## ⚠️ Important Notes

- Do NOT access `.orchestra/orchestrator/` directories
- Do NOT look for verification criteria
- Do NOT access the specification document
- Do NOT access other task handovers

If you are blocked or need clarification, signal with a question rather than guessing.

---

*End of Handover*
```

## D.2 Signal File Template

```markdown
# Completion Signal: Task [Task ID]

## Metadata
| Field | Value |
|-------|-------|
| Task ID | [task-id] |
| Signaled by | Implementor |
| Signaled at | [ISO-8601 timestamp] |
| Attempt | [attempt-number] |

---

## Summary of Work Completed

[Brief description of what was implemented - 2-3 sentences]

---

## Success Criteria Status

| # | Criterion | Status |
|---|-----------|--------|
| 1 | [criterion text] | ✅ Complete |
| 2 | [criterion text] | ✅ Complete |
| 3 | [criterion text] | ✅ Complete |

---

## Files Created

| File | Purpose |
|------|---------|
| `path/to/new-file.ts` | [What it does] |
| `path/to/new-test.ts` | [What it tests] |

---

## Files Modified

| File | Changes |
|------|---------|
| `path/to/existing.ts` | [What was changed] |

---

## Self-Validation Results

| Check | Result |
|-------|--------|
| Build | ✅ Passed / ❌ Failed |
| Tests | ✅ Passed / ❌ Failed |
| Lint | ✅ Passed / ❌ Failed |

---

## Notes

[Any additional context, caveats, or things the verifier should know]

---

## Blockers or Questions

- [ ] None / [List any blockers]

---

*Ready for verification*
```

## D.3 Verification Criteria Template

```yaml
# Verification Criteria: Task [task-id]
# ⚠️ ORCHESTRATOR ONLY - Never show to Implementor

task_id: "[task-id]"
task_name: "[task-name]"
created_at: "[ISO-8601]"
version: "1.0"

# Criteria are evaluated in order. All must pass.
criteria:

  # === EXISTENCE CHECKS ===
  
  - id: "exists-1"
    type: file_exists
    description: "Main implementation file exists"
    parameters:
      path: "src/path/to/expected-file.ts"
    severity: critical  # critical|major|minor

  - id: "exists-2"
    type: file_exists
    description: "Test file exists"
    parameters:
      path: "test/path/to/expected-file.test.ts"
    severity: critical

  # === CONTENT CHECKS ===

  - id: "content-1"
    type: content_contains
    description: "Implementation exports the required class"
    parameters:
      path: "src/path/to/expected-file.ts"
      pattern: "export class ConfigLoader"
      case_sensitive: true
    severity: critical

  - id: "content-2"
    type: content_matches
    description: "Uses appropriate error type"
    parameters:
      path: "src/path/to/expected-file.ts"
      regex: "throw\\s+new\\s+ConfigNotFoundError"
    severity: major

  - id: "content-3"
    type: no_forbidden_patterns
    description: "No debug statements left in code"
    parameters:
      path: "src/**/*.ts"
      patterns:
        - "console.log"
        - "debugger"
        - "TODO: remove"
    severity: minor

  # === STRUCTURAL CHECKS ===

  - id: "struct-1"
    type: export_exists
    description: "Module exports required symbol"
    parameters:
      path: "src/index.ts"
      export: "ConfigLoader"
    severity: critical

  - id: "struct-2"
    type: function_signature
    description: "Function has correct signature"
    parameters:
      path: "src/path/to/file.ts"
      function: "loadConfig"
      params:
        - name: "path"
          type: "string"
        - name: "options"
          type: "LoadOptions"
          optional: true
      returns: "Promise<Config>"
    severity: major

  # === BEHAVIORAL CHECKS ===

  - id: "behavior-1"
    type: test_passes
    description: "Unit tests pass"
    parameters:
      test_path: "test/path/to/file.test.ts"
    severity: critical

  - id: "behavior-2"
    type: test_covers
    description: "Tests cover error handling"
    parameters:
      test_path: "test/path/to/file.test.ts"
      must_cover:
        - "missing file error"
        - "invalid format error"
        - "empty config error"
    severity: major

  # === CUSTOM CHECKS ===

  - id: "custom-1"
    type: custom
    description: "Custom verification script"
    parameters:
      script: "scripts/verify-config-loader.sh"
      args: ["--strict"]
      expected_exit_code: 0
    severity: major

# Thresholds
thresholds:
  critical_must_pass: true      # All critical criteria must pass
  major_pass_rate: 1.0          # 100% of major criteria must pass
  minor_pass_rate: 0.8          # 80% of minor criteria must pass

# Notes for orchestrator
notes: |
  This task verifies proper error handling. Pay special attention to:
  - The specific error type used (ConfigNotFoundError, not generic Error)
  - Whether empty file case is handled
  - Test coverage of edge cases
```

## D.4 Feedback Document Template

```markdown
# Feedback: Task [Task ID] - Attempt [N]

## Metadata
| Field | Value |
|-------|-------|
| Task ID | [task-id] |
| Attempt | [N] |
| Generated at | [ISO-8601 timestamp] |
| Feedback type | [gate-failure|verification-failure] |

---

## Summary

Your implementation did not pass verification. Please review the feedback below and try again.

---

## What Went Wrong

### Issue 1: [Category]

**What**: [Description of what failed - without revealing HOW it was detected]

**Guidance**: [Actionable guidance on how to fix it]

**Example** (if helpful):
```
[Code example showing the right approach]
```

### Issue 2: [Category]

**What**: [Description]

**Guidance**: [How to fix]

---

## What Worked

✅ [Positive feedback about what was correct]
✅ [Another thing that was correct]

---

## Next Steps

1. Review the issues above
2. Make the necessary changes
3. Run `pre-signal-check` to validate
4. Run `signal-complete --task-id [task-id]` to retry

---

## Attempt History

| Attempt | Result | Primary Issue |
|---------|--------|---------------|
| 1 | ❌ Failed | [Brief description] |
| 2 | ❌ Failed | [Brief description] |

**Remaining attempts**: [N] before escalation

---

*Do not guess at what the verification criteria are. Focus on the guidance provided.*
```

## D.5 Progress YAML Template

```yaml
# Orchestra Progress Tracker
# Auto-generated and updated by Orchestra scripts

version: "1.0"
sprint_id: "[sprint-id]"
sprint_name: "[sprint-name]"
initialized_at: "[ISO-8601]"
last_updated: "[ISO-8601]"

# Overall status
status: "in_progress"  # pending|in_progress|completed|blocked

# Current focus
current_task: "[task-id]"
current_phase: "IMPLEMENT"  # PENDING|PREPARE|IMPLEMENT|GATE_CHECK|VERIFY|COMPLETE|RETRY|ESCALATED

# Task statuses
tasks:
  "1":
    name: "[task-name]"
    status: "completed"
    attempts: 1
    started_at: "[ISO-8601]"
    completed_at: "[ISO-8601]"
    
  "2":
    name: "[task-name]"
    status: "in_progress"
    attempts: 2
    started_at: "[ISO-8601]"
    last_attempt_at: "[ISO-8601]"
    last_failure_reason: "verification_failed"
    
  "3":
    name: "[task-name]"
    status: "pending"
    attempts: 0
    depends_on: ["1", "2"]

# Statistics
statistics:
  total_tasks: 3
  completed: 1
  in_progress: 1
  pending: 1
  failed: 0
  escalated: 0
  total_attempts: 3
  
# Blockers
blockers: []
# blockers:
#   - task_id: "2"
#     reason: "Same error on consecutive attempts"
#     escalated_at: "[ISO-8601]"
```

## D.6 Manifest YAML Template

```yaml
# Orchestra Task Manifest
# Generated by sprint-init from specification

version: "1.0"
generated_at: "[ISO-8601]"
source_spec: "[path/to/specification.md]"

sprint:
  id: "[sprint-id]"
  name: "[Human-readable sprint name]"
  description: "[Brief description of sprint goals]"

# Platform configuration
platform:
  type: "typescript"  # typescript|flutter|python|rust|etc.
  commands:
    build: "npm run build"
    test: "npm test"
    lint: "npm run lint"
    typecheck: "npx tsc --noEmit"

# Task definitions
tasks:

  - id: "1"
    name: "[Task Name]"
    description: "[Detailed description]"
    
    # Dependencies (task IDs that must complete first)
    depends_on: []
    
    # Success criteria - VISIBLE to implementor
    success_criteria:
      - "[Specific, measurable criterion 1]"
      - "[Specific, measurable criterion 2]"
      - "[Specific, measurable criterion 3]"
    
    # Files implementor should read for context
    context_files:
      - path: "src/existing/file.ts"
        reason: "Understand existing patterns"
      - path: "docs/design.md"
        reason: "Architecture context"
    
    # Files implementor should create or modify
    output_files:
      - path: "src/new/feature.ts"
        action: "create"
      - path: "test/new/feature.test.ts"
        action: "create"
      - path: "src/index.ts"
        action: "modify"
    
    # Estimated effort
    complexity: "medium"  # low|medium|high
    
    # Verification criteria location (not the content!)
    verification_file: ".orchestrator-only/verification/task-1.yaml"

  - id: "2"
    name: "[Task Name]"
    # ... continue for all tasks ...

# Retry configuration
retry:
  max_attempts: 3
  escalate_on_same_error: true

# Notification configuration (optional)
notifications:
  on_escalation: "[email/slack/etc]"
```

---

# Appendix E: End-to-End Worked Example

> **This appendix walks through a COMPLETE example** from specification to completion.

## E.1 Scenario

**Project**: A TypeScript utility library  
**Feature**: Add a configuration loader that reads YAML files  
**Tasks**: 2 (Create loader + Write tests)

## E.2 Step 1: Write the Specification

The human creates `spec/config-loader.md`:

```markdown
# Specification: Configuration Loader

## Overview
Add a configuration loader utility that reads YAML configuration files
with proper error handling and type safety.

## Context
The project currently has no configuration system. We need to load
YAML files from disk with validation.

## Tasks

### Task 1: Create Configuration Loader

**Description**: Create a ConfigLoader class that loads YAML files.

**Success Criteria**:
- [ ] Create ConfigLoader class in src/config/loader.ts
- [ ] Load valid YAML files and return parsed content
- [ ] Handle missing files by throwing appropriate error
- [ ] Handle invalid YAML by throwing appropriate error
- [ ] Export ConfigLoader from src/index.ts

**Verification Hints** (Orchestrator Only):
> - Must use ConfigNotFoundError (not generic Error) for missing files
> - Must use ConfigParseError for invalid YAML
> - Empty file should return empty object, not throw
> - Should handle nested YAML structures

**Context Files**:
- src/index.ts - Current exports

**Output Files**:
- src/config/loader.ts - Main implementation
- src/config/errors.ts - Custom error types
- src/index.ts - Add exports

**Dependencies**: None

---

### Task 2: Write Tests for Configuration Loader

**Description**: Create comprehensive tests for ConfigLoader.

**Success Criteria**:
- [ ] Create test file at test/config/loader.test.ts
- [ ] Test loading valid YAML file
- [ ] Test error handling for missing file
- [ ] Test error handling for invalid YAML
- [ ] All tests pass

**Verification Hints** (Orchestrator Only):
> - Must test empty file case
> - Must test nested YAML structures
> - Must verify correct error types (not just that errors are thrown)

**Context Files**:
- src/config/loader.ts - Implementation to test

**Output Files**:
- test/config/loader.test.ts - Test file
- test/fixtures/valid.yaml - Test fixture
- test/fixtures/invalid.yaml - Test fixture

**Dependencies**: Task 1
```

## E.3 Step 2: Initialize Sprint (Orchestrator)

**Session**: Orchestrator

**Action**: Run sprint-init

```bash
► sprint-init --spec spec/config-loader.md
```

**Result**: Creates `.orchestra/manifest.yaml`:

```yaml
version: "1.0"
generated_at: "2025-12-02T10:00:00Z"
source_spec: "spec/config-loader.md"

sprint:
  id: "config-loader-sprint"
  name: "Configuration Loader"
  description: "Add YAML configuration loading capability"

platform:
  type: "typescript"
  commands:
    build: "npm run build"
    test: "npm test"
    lint: "npm run lint"

tasks:
  - id: "1"
    name: "Create Configuration Loader"
    description: "Create a ConfigLoader class that loads YAML files."
    depends_on: []
    success_criteria:
      - "Create ConfigLoader class in src/config/loader.ts"
      - "Load valid YAML files and return parsed content"
      - "Handle missing files by throwing appropriate error"
      - "Handle invalid YAML by throwing appropriate error"
      - "Export ConfigLoader from src/index.ts"
    context_files:
      - path: "src/index.ts"
        reason: "Current exports"
    output_files:
      - path: "src/config/loader.ts"
        action: "create"
      - path: "src/config/errors.ts"
        action: "create"
      - path: "src/index.ts"
        action: "modify"
    complexity: "medium"
    verification_file: ".orchestrator-only/verification/task-1.yaml"

  - id: "2"
    name: "Write Tests for Configuration Loader"
    depends_on: ["1"]
    # ... rest of task 2 ...
```

**Result**: Creates `.orchestra/orchestrator/.orchestrator-only/verification/task-1.yaml`:

```yaml
task_id: "1"
task_name: "Create Configuration Loader"
created_at: "2025-12-02T10:00:00Z"
version: "1.0"

criteria:
  - id: "file-loader"
    type: file_exists
    description: "Loader implementation exists"
    parameters:
      path: "src/config/loader.ts"
    severity: critical

  - id: "file-errors"
    type: file_exists
    description: "Custom errors exist"
    parameters:
      path: "src/config/errors.ts"
    severity: critical

  - id: "exports-class"
    type: content_contains
    description: "Exports ConfigLoader class"
    parameters:
      path: "src/config/loader.ts"
      pattern: "export class ConfigLoader"
    severity: critical

  - id: "error-not-found"
    type: content_contains
    description: "Uses ConfigNotFoundError for missing files"
    parameters:
      path: "src/config/loader.ts"
      pattern: "ConfigNotFoundError"
    severity: critical

  - id: "error-parse"
    type: content_contains
    description: "Uses ConfigParseError for invalid YAML"
    parameters:
      path: "src/config/loader.ts"
      pattern: "ConfigParseError"
    severity: critical

  - id: "index-exports"
    type: content_contains
    description: "Index exports ConfigLoader"
    parameters:
      path: "src/index.ts"
      pattern: "ConfigLoader"
    severity: major

  - id: "no-generic-error"
    type: no_forbidden_patterns
    description: "Does not throw generic Error for known cases"
    parameters:
      path: "src/config/loader.ts"
      patterns:
        - "throw new Error\\([\"']File not found"
        - "throw new Error\\([\"']Invalid"
    severity: major

thresholds:
  critical_must_pass: true
  major_pass_rate: 1.0
```

**Result**: Creates `.orchestra/progress.yaml`:

```yaml
version: "1.0"
sprint_id: "config-loader-sprint"
initialized_at: "2025-12-02T10:00:00Z"
last_updated: "2025-12-02T10:00:00Z"
status: "pending"
current_task: "1"
current_phase: "PENDING"

tasks:
  "1":
    name: "Create Configuration Loader"
    status: "pending"
    attempts: 0
  "2":
    name: "Write Tests for Configuration Loader"
    status: "pending"
    attempts: 0
    depends_on: ["1"]
```

## E.4 Step 3: Prepare Handover (Orchestrator)

**Session**: Orchestrator (same session)

**Action**: Run prepare-handover

```bash
► prepare-handover --task-id 1
```

**Result**: Creates `.orchestra/implementor/handovers/task-1-handover.md`:

```markdown
# Task Handover: 1 - Create Configuration Loader

## Metadata
| Field | Value |
|-------|-------|
| Task ID | 1 |
| Sprint | config-loader-sprint |
| Prepared by | Orchestrator |
| Prepared at | 2025-12-02T10:05:00Z |
| Status | Ready for implementation |

---

## Your Mission

Create a ConfigLoader class that reads YAML configuration files with 
proper error handling. The loader should handle missing files and 
invalid YAML gracefully.

---

## Success Criteria

You must satisfy ALL of the following:

1. [ ] Create ConfigLoader class in src/config/loader.ts
2. [ ] Load valid YAML files and return parsed content
3. [ ] Handle missing files by throwing appropriate error
4. [ ] Handle invalid YAML by throwing appropriate error
5. [ ] Export ConfigLoader from src/index.ts

---

## Context

### Background
The project currently has no configuration system. We need to load
YAML files from disk with validation.

### Technical Context
Follow existing code patterns in the project. Use the yaml library
already installed in package.json.

---

## Files to Read

| File | Why |
|------|-----|
| `src/index.ts` | See current export patterns |
| `package.json` | See available dependencies |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/config/loader.ts` | CREATE | Main ConfigLoader class |
| `src/config/errors.ts` | CREATE | Custom error types |
| `src/index.ts` | MODIFY | Add new exports |

---

## Constraints

- Use the existing yaml library (no new dependencies)
- Follow TypeScript strict mode
- Follow existing code style

---

## How to Signal Completion

When you have completed all success criteria:

1. Run `pre-signal-check` to self-validate
2. Run `signal-complete --task-id 1`

---

## ⚠️ Important Notes

- Do NOT access `.orchestra/orchestrator/` directories
- Do NOT look for verification criteria
- Focus on the success criteria listed above

---

*End of Handover*
```

**Action**: Run validate-handover

```bash
► validate-handover --task-id 1
```

**Result**: 
```
✅ Handover validation passed
   - All required sections present
   - No verification criteria detected
   - All context files exist
   - Ready for implementor
```

## E.5 Step 4: Implementation (Implementor)

**Session**: NEW session (NOT orchestrator session)

**Context provided**: ONLY the handover document

**Implementor reads handover and implements**:

Creates `src/config/errors.ts`:
```typescript
export class ConfigNotFoundError extends Error {
  constructor(path: string) {
    super(`Configuration file not found: ${path}`);
    this.name = 'ConfigNotFoundError';
  }
}

export class ConfigParseError extends Error {
  constructor(path: string, reason: string) {
    super(`Failed to parse configuration file ${path}: ${reason}`);
    this.name = 'ConfigParseError';
  }
}
```

Creates `src/config/loader.ts`:
```typescript
import * as fs from 'fs';
import * as yaml from 'yaml';
import { ConfigNotFoundError, ConfigParseError } from './errors';

export class ConfigLoader {
  load(path: string): Record<string, unknown> {
    if (!fs.existsSync(path)) {
      throw new ConfigNotFoundError(path);
    }

    const content = fs.readFileSync(path, 'utf-8');
    
    try {
      return yaml.parse(content) ?? {};
    } catch (error) {
      throw new ConfigParseError(path, (error as Error).message);
    }
  }
}
```

Modifies `src/index.ts`:
```typescript
// ... existing exports ...
export { ConfigLoader } from './config/loader';
export { ConfigNotFoundError, ConfigParseError } from './config/errors';
```

**Action**: Run pre-signal-check

```bash
► pre-signal-check
```

**Result**:
```
Build: ✅ Passed
Tests: ⚠️ No tests for new code (expected - tests are Task 2)
Lint:  ✅ Passed
```

**Action**: Run signal-complete

```bash
► signal-complete --task-id 1
```

**Result**: Creates `.orchestra/implementor/signals/task-1-signal.md`:

```markdown
# Completion Signal: Task 1

## Metadata
| Field | Value |
|-------|-------|
| Task ID | 1 |
| Signaled by | Implementor |
| Signaled at | 2025-12-02T11:30:00Z |
| Attempt | 1 |

---

## Summary of Work Completed

Created ConfigLoader class that reads YAML configuration files.
Implemented custom error types for missing files and parse errors.
Added exports to index.ts.

---

## Success Criteria Status

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Create ConfigLoader class | ✅ Complete |
| 2 | Load valid YAML files | ✅ Complete |
| 3 | Handle missing files | ✅ Complete |
| 4 | Handle invalid YAML | ✅ Complete |
| 5 | Export from index.ts | ✅ Complete |

---

## Files Created

| File | Purpose |
|------|---------|
| `src/config/loader.ts` | ConfigLoader class implementation |
| `src/config/errors.ts` | Custom error types |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/index.ts` | Added exports for ConfigLoader and error types |

---

## Self-Validation Results

| Check | Result |
|-------|--------|
| Build | ✅ Passed |
| Lint | ✅ Passed |

---

*Ready for verification*
```

## E.6 Step 5: Verification (Orchestrator)

**Session**: Orchestrator (resumed or new)

**Action**: Run gate-check

```bash
► gate-check --task-id 1
```

**Result**:
```
Gate Check Results:
├─ Signal file exists: ✅ PASS
├─ Required files exist:
│  ├─ src/config/loader.ts: ✅ PASS
│  ├─ src/config/errors.ts: ✅ PASS
│  └─ src/index.ts (modified): ✅ PASS
├─ Build: ✅ PASS
├─ Tests: ✅ PASS (existing tests)
└─ Lint: ✅ PASS

Gate Check: ✅ PASSED - Proceeding to verification
```

**Action**: Run verification-audit

```bash
► verification-audit --task-id 1
```

**Result**:
```
Verification Audit Results:
├─ file-loader: ✅ PASS (src/config/loader.ts exists)
├─ file-errors: ✅ PASS (src/config/errors.ts exists)
├─ exports-class: ✅ PASS (exports ConfigLoader class)
├─ error-not-found: ✅ PASS (uses ConfigNotFoundError)
├─ error-parse: ✅ PASS (uses ConfigParseError)
├─ index-exports: ✅ PASS (index exports ConfigLoader)
└─ no-generic-error: ✅ PASS (no forbidden patterns found)

Verification: ✅ ALL CRITERIA PASSED
```

**Action**: Run accept-signal-check

```bash
► accept-signal-check --task-id 1
```

**Result**:
```
Task 1 Acceptance:
├─ Gate check: ✅ PASSED
├─ Verification audit: ✅ PASSED
├─ Artifacts archived: ✅
├─ Progress updated: ✅
└─ Summary generated: ✅

Task 1 "Create Configuration Loader": ✅ COMPLETED
Next task: 2 "Write Tests for Configuration Loader"
```

## E.7 Step 6: Continue to Next Task

**Action**: Run task-closeout-check

```bash
► task-closeout-check
```

**Result**:
```
Closeout Check:
├─ Git status: ✅ Clean
├─ Orphaned signals: ✅ None
├─ Progress consistent: ✅
└─ Ready for next task: ✅

Proceeding to Task 2...
```

**Repeat Steps 4-6** for Task 2 (tests).

## E.8 What Failure Looks Like

If the implementor had used `throw new Error('File not found')` instead of `throw new ConfigNotFoundError(path)`:

**Verification-audit would fail**:
```
Verification Audit Results:
├─ file-loader: ✅ PASS
├─ file-errors: ✅ PASS
├─ exports-class: ✅ PASS
├─ error-not-found: ❌ FAIL (ConfigNotFoundError not found in code)
├─ error-parse: ✅ PASS
├─ index-exports: ✅ PASS
└─ no-generic-error: ❌ FAIL (forbidden pattern detected)

Verification: ❌ FAILED (2 critical criteria failed)
```

**Generate-feedback would create**:

```markdown
# Feedback: Task 1 - Attempt 1

## What Went Wrong

### Issue 1: Error Handling

**What**: The error handling for missing files does not use appropriate error types.

**Guidance**: When a file is not found, throw a specific error type that 
identifies this condition clearly. Look at the custom error types you 
created in errors.ts and use them appropriately.

## What Worked

✅ File structure is correct
✅ Basic loading logic works
✅ Parse error handling is good

## Next Steps

1. Review error handling in loader.ts
2. Ensure custom error types are used for known error conditions
3. Run pre-signal-check and signal again
```

Note: The feedback says WHAT is wrong (error handling) without revealing HOW it was detected (by looking for "ConfigNotFoundError" string).

---

# Appendix F: Human-as-Orchestrator Guide

> **When the human plays the orchestrator role** (common in early adoption)

## F.1 When to Be the Orchestrator

You should play the Orchestrator role when:

- First learning the Orchestra system
- Working with an AI that doesn't maintain session context
- Sprint requires judgment calls AI cannot make
- Testing or debugging the process itself

## F.2 Orchestrator Checklist

### Sprint Initialization

- [ ] Write or obtain specification
- [ ] Run `sprint-init` (or manually create manifest.yaml)
- [ ] Write hidden verification criteria for each task
- [ ] Initialize progress.yaml
- [ ] Verify .orchestra folder structure correct

### Each Task Cycle

**PREPARE Phase**:
- [ ] Check previous task closed (`task-closeout-check`)
- [ ] Create handover document
- [ ] Verify handover has NO verification criteria
- [ ] Place handover in implementor/handovers/

**IMPLEMENT Phase** (Handoff to AI):
- [ ] Start NEW AI session
- [ ] Give AI ONLY the handover document
- [ ] Let AI implement (do not help with verification criteria)
- [ ] Receive signal file

**VERIFY Phase**:
- [ ] Run gate checks (build, test, lint)
- [ ] Run hidden verification criteria
- [ ] Record results
- [ ] If PASS: Accept and close out task
- [ ] If FAIL: Generate feedback (don't reveal criteria!)

### Feedback Generation

When generating feedback manually:

**DO**:
```
"The error handling doesn't use appropriate error types."
"The function doesn't handle the edge case of empty input."
"The export is missing from the public API."
```

**DON'T**:
```
"I checked for 'ConfigNotFoundError' and didn't find it."
"My regex for error handling didn't match."
"Line 45 should have type 'ConfigError' not 'Error'."
```

## F.3 Common Human-Orchestrator Mistakes

| Mistake | Why It's Bad | Fix |
|---------|--------------|-----|
| Helping implementor with hints | Defeats information asymmetry | Give only handover content |
| Showing specification to implementor | Context pollution | Filter through handover |
| Revealing which check failed | Enables gaming | Describe the symptom, not the check |
| Skipping verification | Trust without verify | Always run checks |
| Using same session for both roles | Context leakage | Separate sessions |

## F.4 Minimal Human-Orchestrator Workflow

```
1. CREATE specification
2. CREATE manifest (from spec)
3. CREATE verification criteria (hidden)
4. FOR each task:
   a. CREATE handover (from manifest, filter criteria)
   b. NEW AI SESSION: Give handover → Get signal
   c. RUN verification (gate + hidden)
   d. IF fail: CREATE feedback → GOTO b (max 3 times)
   e. IF pass: Mark complete → Next task
5. Sprint complete
```

## F.5 Tools You Need

When acting as Orchestrator, you need:

1. **Text editor** - To create/edit manifest, handovers, criteria
2. **Terminal** - To run build/test/lint commands
3. **AI interface** - To give handovers and receive signals
4. **File system access** - To check file existence/content

## F.6 Monitoring Sprint Progress

As Human-as-Orchestrator, you'll want to quickly check status without reading entire files.

### Quick Status Check

**Option A: Read progress.yaml directly**
```bash
cat .orchestra/orchestrator/progress.yaml
```

**Option B: Use a status script** (if available in implementation)
```bash
./scripts/sprint-status.sh
```

### What to Look For

| Indicator | Healthy | Warning | Action Needed |
|-----------|---------|---------|---------------|
| **Task attempts** | 1-2 | 3 | 3+ means stuck - review feedback |
| **Time on task** | < 30 min | 30-60 min | > 60 min means blocked |
| **Signal age** | < 5 min | 5-15 min | > 15 min means orphaned |
| **Tasks completed** | Increasing | Stalled | Stalled = systemic issue |

### Dashboard View

Create a simple dashboard by checking:

```bash
# 1. Overall progress
echo "=== Sprint Progress ==="
grep -E "(status:|completed:)" .orchestra/orchestrator/progress.yaml

# 2. Current task
echo "=== Current Task ==="
grep -A5 "status: in_progress" .orchestra/orchestrator/progress.yaml

# 3. Any signals waiting
echo "=== Pending Signals ==="
ls -la .orchestra/implementor/signals/ 2>/dev/null || echo "(none)"

# 4. Recent failures
echo "=== Recent Failures ==="
grep -l "verification_result: fail" .orchestra/orchestrator/*.yaml 2>/dev/null || echo "(none)"
```

### When to Intervene

Intervene immediately when:
- ❌ Same task has 3+ attempts with same failure
- ❌ No progress for 30+ minutes
- ❌ Implementor signals repeatedly need clarification
- ❌ Verification passes but visual inspection shows problems
- ❌ Build/test started failing on unrelated code

Intervene thoughtfully when:
- ⚠️ Pattern of similar failures across tasks
- ⚠️ Scope creep in implementation
- ⚠️ Quality degradation ("works but ugly")
- ⚠️ Implementor taking shortcuts

---

# Appendix G: Quick Reference Index

This appendix provides quick lookup tables for common operations. Use this for rapid reference once you understand the system.

## G.1 Script Quick Reference

| Script | Phase | Role | Purpose |
|--------|-------|------|--------|
| `sprint-init` | INIT | Orchestrator | Initialize sprint from spec |
| `sprint-status` | Any | Orchestrator | Check sprint progress |
| `prepare-handover` | PREPARE | Orchestrator | Create task handover |
| `validate-handover` | PREPARE | Orchestrator | Verify no criteria leak |
| `pre-signal-check` | IMPLEMENT | Implementor | Self-validate before signal |
| `signal-complete` | IMPLEMENT | Implementor | Signal task completion |
| `gate-check` | GATE | Orchestrator | Run basic verification |
| `verification-audit` | VERIFY | Orchestrator | Run hidden verification |
| `accept-signal-check` | VERIFY | Orchestrator | Accept and archive |
| `generate-feedback` | RETRY | Orchestrator | Create retry guidance |
| `escalate-failure` | ESCALATE | Orchestrator | Flag for human |
| `task-closeout-check` | Any | Orchestrator | Verify clean state |

## G.2 File Location Quick Reference

| What | Where | Who Accesses |
|------|-------|-------------|
| Task manifest | `.orchestra/manifest.yaml` | Orchestrator only |
| Progress tracker | `.orchestra/progress.yaml` | Orchestrator only |
| Handover documents | `.orchestra/implementor/handovers/` | Both |
| Completion signals | `.orchestra/implementor/signals/` | Both |
| Feedback files | `.orchestra/implementor/feedback/` | Both |
| Hidden verification | `.orchestra/orchestrator/.orchestrator-only/` | Orchestrator only |
| Archived artifacts | `.orchestra/artifacts/` | Orchestrator only |

## G.3 Task State Transitions

```
PENDING ──► PREPARE ──► IMPLEMENT ──► GATE CHECK ──► VERIFY ──► COMPLETE
                            │              │           │
                            │              │           └──► RETRY (max 3)
                            │              │                   │
                            │              └──► RETRY ─────────┘
                            │                       │
                            └──────────────────────► ESCALATED
```

## G.4 Information Access Matrix

| Information | Orchestrator | Implementor | Human |
|-------------|--------------|-------------|-------|
| Full specification | ✅ | ❌ | ✅ |
| Verification criteria | ✅ | ❌ | ✅ |
| manifest.yaml | ✅ | ❌ | ✅ |
| progress.yaml | ✅ | ❌ | ✅ |
| Handover document | ✅ | ✅ | ✅ |
| Project codebase | Read | Read/Write | Full |
| Other task details | ✅ | ❌ | ✅ |

## G.5 Signal Types

| Signal | Meaning | Next Action |
|--------|---------|------------|
| `complete` | Work is done | Run gate-check |
| `blocked` | Cannot proceed | Orchestrator reviews |
| `needs_clarification` | Requirements unclear | Orchestrator clarifies |

## G.6 Feedback Categories

| Category | Use When |
|----------|----------|
| `missing_functionality` | Required feature not implemented |
| `broken_functionality` | Implementation doesn't work |
| `wrong_approach` | Implementation uses wrong pattern |
| `incomplete` | Partial implementation |
| `quality_issue` | Works but doesn't meet standards |
| `test_failure` | Tests don't pass or are missing |

## G.7 Emergency Commands

| Situation | Action |
|-----------|--------|
| Force complete task | Edit `progress.yaml`: set `status: completed`, add `forced_by: human` |
| Skip task entirely | Edit `progress.yaml`: set `status: skipped`, add `skip_reason` |
| Reset task | Edit `progress.yaml`: set `status: pending`, `attempts: 0` |
| Halt sprint | Edit `progress.yaml`: set `sprint.status: halted` |
| Clear stuck signals | Delete files in `.orchestra/implementor/signals/` |

## G.8 Common Errors and Solutions

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| "No manifest found" | Sprint not initialized | Run `sprint-init` |
| "Task not found" | Wrong task ID | Check `manifest.yaml` |
| "Handover validation failed" | Criteria leaked | Regenerate handover |
| "Gate check failed" | Build/test broken | Fix before proceeding |
| "Max attempts reached" | 3 failures | Review and escalate |
| "Signal file exists" | Previous signal not processed | Process or delete signal |

## G.9 Key Principles Cheat Sheet

| Principle | One-Liner |
|-----------|----------|
| Asymmetric Information | Implementor doesn't know how you'll verify |
| Role Separation | Same AI, different sessions, different access |
| Fresh Context | Each task starts with blank slate |
| Deterministic Gates | Prefer checks with clear pass/fail |
| Explicit Artifacts | If it's not a file, it didn't happen |
| Audit Trail | Log everything, delete nothing |

---

# Document History

| Version | Date | Changes |
|---------|------|---------|
| 0.7.0 | 2025-12-02 | **FINAL**: Enhanced ToC with navigation aids, added Appendix G Quick Reference Index |
| 0.6.0 | 2025-12-02 | Added Human Intervention Actions (4.3.1), Emergency Overrides (4.3.2), Implementor Scope Statement, Monitoring Guide (F.6) |
| 0.5.0 | 2025-12-02 | Added Quick Start, Role Invocation, Spec Format, Templates, Worked Example, Human Guide |
| 0.4.0 | 2025-12-02 | Added dual-layer structure to Phase Details |
| 0.3.0 | 2025-12-02 | Rewrote Phase Details with explicit script calls |
| 0.2.0 | 2025-12-02 | Added mandatory script execution matrix |
| 0.1.0 | 2025-12-02 | Initial draft |

---

> **End of Orchestra Bible v0.7.0**
> 
> *"Structure prevents theater."*
