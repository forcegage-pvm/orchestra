# Orchestra Workflow Specification

> **Version**: 1.0.0  
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
│  Initialize     Generate       Implementor       Run gate      │
│  sprint from    handover &     does work &       checks        │
│  spec           verification   signals done      (build/test)  │
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
│                         │  RETRY   │           │ COMPLETE │     │
│                         └──────────┘           └──────────┘     │
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

## Workflow Steps Index

### Phase: INIT

| Step | File | CLI Command | Description |
|------|------|-------------|-------------|
| 1 | [init.md](init.md) | `orchestra init` | Initialize Orchestra folder structure |
| 2 | [configure-manifest.md](configure-manifest.md) | (orchestrator agent) | Define sprint tasks and verification criteria |

### Phase: PREPARE

| Step | File | CLI Command | Description |
|------|------|-------------|-------------|
| 3 | [closeout.md](closeout.md) | `orchestra closeout` | Verify previous task closed out |
| 4 | [prepare.md](prepare.md) | `orchestra prepare` | Generate handover and verification |

### Phase: IMPLEMENT

| Step | File | CLI Command | Description |
|------|------|-------------|-------------|
| 5 | [implement.md](implement.md) | (implementor work) | Implementor receives handover, does work, signals |

### Phase: GATE_CHECK / VERIFY

| Step | File | CLI Command | Description |
|------|------|-------------|-------------|
| 6 | [accept-signal.md](accept-signal.md) | `orchestra accept-signal` | Validate signal format |
| 7 | [verify.md](verify.md) | `orchestra verify` | Run verification checks |

### Phase: RETRY

| Step | File | CLI Command | Description |
|------|------|-------------|-------------|
| 8 | [feedback.md](feedback.md) | `orchestra feedback` | Generate retry feedback |

### Phase: COMPLETE

| Step | File | CLI Command | Description |
|------|------|-------------|-------------|
| 9 | [complete.md](complete.md) | `orchestra complete` | Complete task and archive |

### Phase: ESCALATED

| Step | File | CLI Command | Description |
|------|------|-------------|-------------|
| 10 | [escalate.md](escalate.md) | `orchestra escalate` | Escalate to human |

### Sprint-Level

| Step | File | CLI Command | Description |
|------|------|-------------|-------------|
| 11 | [sprint-complete.md](sprint-complete.md) | `orchestra status --metrics` | Sprint completion |

---

## CLI Command Quick Reference

| Command | Primary Step | Phase |
|---------|--------------|-------|
| `orchestra init` | [init.md](init.md) | INIT |
| `orchestra status` | (any) | Any |
| `orchestra closeout` | [closeout.md](closeout.md) | PREPARE |
| `orchestra prepare` | [prepare.md](prepare.md) | PREPARE |
| `orchestra accept-signal` | [accept-signal.md](accept-signal.md) | GATE_CHECK |
| `orchestra verify` | [verify.md](verify.md) | VERIFY |
| `orchestra feedback` | [feedback.md](feedback.md) | RETRY |
| `orchestra complete` | [complete.md](complete.md) | COMPLETE |
| `orchestra escalate` | [escalate.md](escalate.md) | ESCALATED |

---

## Document Format

Each workflow step document follows this structure:

1. **Overview** - Quick reference table (Phase, Role, Trigger, Preconditions)
2. **Purpose** - What the step accomplishes
3. **Philosophy** - Why the step exists, anti-patterns prevented
4. **Actions** - Consolidated action reference with IDs (`A-{STEP}-XX` format)
   - CLI Actions, Agent Actions, Manual Actions, Git Actions
5. **Execution Sequence** - Complete ordered flow of all actions
6. **Agent Process** - Detailed agent steps (references action IDs)
7. **CLI Command** - Full command reference with options
8. **Input** - Required and optional inputs
9. **File Impact** - Created, updated, read, deleted files
10. **Template Details** - Which templates, what format
11. **Git Actions** - Detailed git operations (referenced from Actions)
12. **Outcome** - Success and failure paths
13. **Next Step** - What to do after this step
14. **Evidence Produced** - How to verify completion
15. **Implementation Reference** - Source code links
16. **Troubleshooting** - Common issues and solutions

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Orchestra Bible](../../spec/00-orchestra-bible.md) | Authoritative system specification |
| [Task Lifecycle](../../spec/04-processes/task-lifecycle.md) | Phase and state details |
| [Verification Protocol](../../spec/04-processes/verification-protocol.md) | Verification details |
| [Folder Structure](../../spec/03-components/folder-structure.md) | File organization |

---

*This is the authoritative workflow documentation for Orchestra.*

