# Orchestra Workflow Specification

> **Version**: 1.1.0  
> **Last Updated**: 2025-12-05  
> **Aligned with**: Orchestra Bible v0.7.0  
> **Authority**: This folder contains the SINGLE SOURCE OF TRUTH for the Orchestra workflow.

---

## Purpose

This folder contains detailed documentation for each step in the Orchestra workflow. Each step has its own file with comprehensive details about:

- What the step accomplishes (purpose)
- Why the step exists (philosophy)  
- How to execute it (CLI command)
- What files are affected (file impact)
- What templates are used
- Expected outcomes and evidence

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SPRINT LIFECYCLE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐    ┌─────────┐    ┌───────────┐    ┌──────────┐   │
│  │  INIT   │───▶│ PREPARE │───▶│ IMPLEMENT │───▶│GATE_CHECK│   │
│  └─────────┘    └─────────┘    └───────────┘    └──────────┘   │
│       │              │              │                 │         │
│       ▼              ▼              ▼                 ▼         │
│  Initialize     Generate       Implementor       Validate      │
│  sprint &       handover &     does work &       signal &      │
│  manifest       verification   signals done      run checks    │
│                                                       │         │
│                                                       ▼         │
│                                              ┌──────────────┐   │
│                                              │    VERIFY    │   │
│                                              └──────────────┘   │
│                                                       │         │
│                               ┌───────────────────────┼─────────┤
│                               │                       │         │
│                               ▼                       ▼         │
│                         ┌──────────┐           ┌──────────┐     │
│                         │  RETRY   │◀──────────│ COMPLETE │     │
│                         └──────────┘   fail    └──────────┘     │
│                               │                       │         │
│                               │ (max 3)               ▼         │
│                               ▼                  Next task      │
│                         ┌──────────┐            or sprint       │
│                         │ESCALATED │            complete        │
│                         └──────────┘                            │
│                               │                                 │
│                               ▼                                 │
│                         Human fixes                             │
│                         or skips                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

For new users, follow this sequence:

```bash
# 1. Initialize Orchestra in your project
orchestra init

# 2. Edit manifest to define tasks
# (manual editing of .orchestra/manifest.yaml)

# 3. Prepare first task
orchestra prepare --task 1

# 4. (Implementor works on task, signals when done)

# 5. Accept the signal
orchestra accept-signal

# 6. Verify the implementation
orchestra verify

# 7a. If PASSED: Complete the task
orchestra complete

# 7b. If FAILED: Generate feedback for retry
orchestra feedback
# (Implementor retries, or escalate if max attempts)
```

---

## Workflow Steps Index

### Phase: INIT

| Step | Document | CLI Command | Description |
|------|----------|-------------|-------------|
| 1 | [init.md](init.md) | `orchestra init` | Initialize Orchestra folder structure |
| 2 | [configure-manifest.md](configure-manifest.md) | *(manual)* | Define sprint tasks in manifest.yaml |

### Phase: PREPARE  

| Step | Document | CLI Command | Description |
|------|----------|-------------|-------------|
| 3 | [closeout.md](closeout.md) | `orchestra closeout` | Verify previous task cleanly closed |
| 4 | [prepare.md](prepare.md) | `orchestra prepare` | Generate handover and hidden verification |

### Phase: IMPLEMENT

| Step | Document | CLI Command | Description |
|------|----------|-------------|-------------|
| 5 | [implement.md](implement.md) | *(agent work)* | Implementor receives handover, does work, signals |

### Phase: GATE_CHECK

| Step | Document | CLI Command | Description |
|------|----------|-------------|-------------|
| 6 | [accept-signal.md](accept-signal.md) | `orchestra accept-signal` | Validate signal and pre-signal artifacts |

### Phase: VERIFY

| Step | Document | CLI Command | Description |
|------|----------|-------------|-------------|
| 7 | [verify.md](verify.md) | `orchestra verify` | Run hidden verification checks |

### Phase: RETRY (on failure)

| Step | Document | CLI Command | Description |
|------|----------|-------------|-------------|
| 8 | [feedback.md](feedback.md) | `orchestra feedback` | Generate actionable feedback (no criteria leak) |

### Phase: COMPLETE (on success)

| Step | Document | CLI Command | Description |
|------|----------|-------------|-------------|
| 9 | [complete.md](complete.md) | `orchestra complete` | Archive task, update status, clear handover |

### Phase: ESCALATED (on max retries)

| Step | Document | CLI Command | Description |
|------|----------|-------------|-------------|
| 10 | [escalate.md](escalate.md) | `orchestra escalate` | Escalate to human supervisor |

### Support Documents

| Document | Purpose |
|----------|---------|
| [failure-types.md](failure-types.md) | Taxonomy of all failure types |
| [failures.md](failures.md) | Failure handling workflows |
| [technical-debt.md](technical-debt.md) | Tracked technical debt items (TD-XXX) |

---

## CLI Command Quick Reference

| Command | Primary Document | Phase | Description |
|---------|------------------|-------|-------------|
| `orchestra init` | [init.md](init.md) | INIT | Initialize Orchestra structure |
| `orchestra status` | *(built-in)* | Any | Show current sprint/task status |
| `orchestra closeout` | [closeout.md](closeout.md) | PREPARE | Check previous task closed |
| `orchestra prepare` | [prepare.md](prepare.md) | PREPARE | Generate handover |
| `orchestra accept-signal` | [accept-signal.md](accept-signal.md) | GATE_CHECK | Validate signal |
| `orchestra verify` | [verify.md](verify.md) | VERIFY | Run verification |
| `orchestra feedback` | [feedback.md](feedback.md) | RETRY | Generate feedback |
| `orchestra complete` | [complete.md](complete.md) | COMPLETE | Complete task |
| `orchestra escalate` | [escalate.md](escalate.md) | ESCALATED | Escalate to human |

### Command Flow Diagram

```
orchestra init
     │
     ▼
orchestra prepare ◀─────────────────────────────┐
     │                                          │
     ▼                                          │
(implementor works)                             │
     │                                          │
     ▼                                          │
orchestra accept-signal                         │
     │                                          │
     ▼                                          │
orchestra verify ──────┬─── PASS ───▶ orchestra complete
                       │                        │
                       │                        ▼
                       │                   (next task)
                       │                        │
                       └─── FAIL ───▶ orchestra feedback
                                            │
                                   ┌────────┴────────┐
                                   │                 │
                                   ▼                 ▼
                              (retry)        orchestra escalate
                                   │                 │
                                   ▼                 ▼
                           (back to work)     (human fixes)
```

---

## Document Format

Each workflow step document follows this standardized structure:

| Section | Purpose |
|---------|---------|
| **Overview** | Quick reference table (Phase, Role, Trigger, Preconditions) |
| **Purpose** | What the step accomplishes |
| **Philosophy** | Why the step exists, anti-patterns prevented |
| **Actions** | Consolidated action reference with IDs (`A-{STEP}-XX`) |
| **Execution Sequence** | Complete ordered flow of all actions |
| **Agent Process** | Detailed agent steps with expected outputs |
| **CLI Command** | Full command reference with options, examples |
| **Input** | Required and optional inputs |
| **File Impact** | Read, written, created, deleted files |
| **Template Details** | Templates used, variables, conversion |
| **Git Actions** | Git operations and enforcement levels |
| **Outcome** | Success and failure paths |
| **Next Step** | What to do after this step |
| **Evidence Produced** | How to verify completion |
| **Implementation Reference** | Source code links |
| **Troubleshooting** | Common issues and solutions |
| **Version History** | Document change log |

---

## Key Concepts

### Hidden Verification Pattern

Orchestra's core innovation is **hidden verification criteria**:

- Orchestrator creates verification checks BEFORE handover
- Implementor never sees the exact checks
- This prevents "teaching to the test"
- Feedback describes **what** failed, not **how** detected

### Trust Boundary

| Zone | Access |
|------|--------|
| `.orchestra/orchestrator/.orchestrator-only/` | Orchestrator ONLY |
| `.orchestra/handover/` | Both roles (neutral zone) |
| `.orchestra/implementor/` | Implementor primary |

### Retry Flow

```
VERIFY fails
    │
    ▼
orchestra feedback (attempt N of 3)
    │
    ▼
Implementor reads .orchestra/handover/feedback.md
    │
    ▼
Implementor makes targeted fixes
    │
    ▼
Implementor signals again
    │
    ▼
orchestra accept-signal → orchestra verify
    │
    ├── PASS → orchestra complete
    └── FAIL → (if N < 3) feedback again
              (if N >= 3) orchestra escalate
```

---

## Related Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Orchestra Bible | [spec/00-orchestra-bible.md](../../spec/00-orchestra-bible.md) | Authoritative system specification |
| Task Lifecycle | [spec/04-processes/task-lifecycle.md](../../spec/04-processes/task-lifecycle.md) | Phase and state details |
| Failure Handling | [spec/04-processes/failure-handling.md](../../spec/04-processes/failure-handling.md) | Retry and escalation |
| Verification Protocol | [spec/04-processes/verification-protocol.md](../../spec/04-processes/verification-protocol.md) | Verification details |
| Folder Structure | [spec/03-components/folder-structure.md](../../spec/03-components/folder-structure.md) | File organization |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2025-12-05 | Added Quick Start, Command Flow Diagram, Key Concepts, improved index |
| 1.0.0 | 2025-12-04 | Initial specification |

---

*This is the authoritative workflow documentation for Orchestra.*

