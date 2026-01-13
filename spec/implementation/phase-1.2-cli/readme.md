# Phase 1.2: CLI Technical Debt

> **Navigation**: [Implementation Index](../readme.md) | **Prev**: [Phase 1: CLI](../phase-1-cli/readme.md) | **Next**: [Phase 2: MCP Server](../phase-2-mcp/readme.md)

---

## Status: ✅ COMPLETE

**Prerequisites**: Phase 1 CLI ✅ Complete  
**Unblocks**: Phase 2 MCP Server

---

## Overview

Phase 1 CLI was marked complete but was **missing two mandatory commands** per Orchestra Bible v0.7.0:

1. **`orchestra feedback`** - Generate feedback for implementor after verification failure (Section 8.5)
2. **`orchestra escalate`** - Escalate persistent failures to human supervisor (Section 8.5)

These are **mandatory scripts** that complete the task lifecycle. Without them:
- Orchestrator cannot communicate verification failures to the implementor

> **Note on Signaling**: The `signal-complete` abstract script is NOT a CLI command. The original design has `orchestra prepare` create a `signal.md` template that the implementor fills out manually. This was clarified during implementation - see "Design Clarification" section below.

## Discovery

During Phase 2 MCP alignment analysis (2025-12-04), we discovered:

| Script (Bible) | CLI Command | Core Function | Status |
|----------------|-------------|---------------|--------|
| `generate-feedback` (8.5) | ❌ Missing | ❌ Missing | **Must Add** |
| `escalate-failure` (8.5) | ❌ Missing | ❌ Missing | **Must Add** |

**Note**: `accept-signal` exists and validates signal files created manually by the implementor.

**Existing Infrastructure** (already in place):
- `FeedbackDocumentSchema` in `src/core/types.ts`
- `paths.feedback` configured in `src/core/config.ts`
- `feedback-template.md` template exists
- `ESCALATED` status supported in manifest

## Design Clarification

During implementation, we clarified the original design intent for signaling:

- **Original Design**: `orchestra prepare` creates a `signal.md` template in `.orchestra/handover/`. The implementor fills this out manually to signal completion.
- **Incorrect Interpretation**: An `orchestra signal` command was initially implemented but later **removed** because it was not part of the original design.
- **Correct Flow**: Prepare → Implementor fills signal.md → Accept-signal validates

The signal template is a transient file in the handover folder, cleared on each new task.

## Goals

1. **Complete task lifecycle** - Enable proper verify → feedback flow
2. **Maintain core-first architecture** - Add to `src/core/` first, then CLI wrapper
3. **Preserve trust model** - Feedback must NOT reveal verification criteria
4. **Enable MCP** - These commands are required before Phase 2 can proceed

## Success Criteria

- [x] `orchestra feedback` generates feedback file from verification results
- [x] `orchestra escalate` marks task as escalated and creates report
- [x] Feedback does NOT reveal hidden verification criteria
- [x] Integration with existing `verify` command flow
- [x] All existing tests still pass
- [x] New commands have full test coverage

## Commands

| Command | Bible Script | Purpose | Actor |
|---------|--------------|---------|-------|
| `orchestra feedback` | `generate-feedback` | Create feedback for implementor | Orchestrator |
| `orchestra escalate` | `escalate-failure` | Escalate to human supervisor | Orchestrator |

### Command Flow (Updated)

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPLETE TASK LIFECYCLE                      │
│                                                                 │
│   IMPLEMENTOR                                                   │
│   ───────────                                                   │
│   (fills out signal.md template) ──► Signal file ready          │
│                                            │                    │
│   ORCHESTRATOR                             ▼                    │
│   ────────────                                                  │
│   orchestra accept-signal ──► orchestra verify ──┬──► PASS ──► orchestra complete
│   (validate signal)          (run checks)        │
│                                                  │
│                                                  └──► FAIL ──► orchestra feedback
│                                                                      │
│                                                                      ▼
│                                                  IMPLEMENTOR: retries with signal
│                                                                      │
│                                                                      ▼
│                                                  (max retries?) ──► orchestra escalate
│                                                                      │
│                                                                      ▼
│                                                              Human intervention
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

### New Files

```
src/
├── commands/
│   ├── feedback.ts        # NEW - orchestra feedback
│   └── escalate.ts        # NEW - orchestra escalate
└── core/
    ├── feedback.ts        # NEW - runFeedback()
    └── escalate.ts        # NEW - runEscalate()
```

### Core Library Additions

```typescript
// src/core/feedback.ts
export interface FeedbackOptions {
  task?: string;           // Task ID (defaults to current)
  verificationResult: VerifyResult;  // From orchestra verify
  attempt?: number;        // Current attempt number
}

export interface FeedbackResult {
  success: boolean;
  taskId: number;
  attempt: number;
  feedbackPath: string;
  issues: FeedbackIssue[];
  canRetry: boolean;       // false if max attempts reached
}

export async function runFeedback(options: FeedbackOptions): Promise<FeedbackResult>;
```

```typescript
// src/core/escalate.ts
export interface EscalateOptions {
  task?: string;           // Task ID (defaults to current)
  reason: string;          // Why escalating
  context?: string;        // Additional context
}

export interface EscalateResult {
  success: boolean;
  taskId: number;
  previousStatus: string;
  escalationPath: string;
  reportPath: string;
}

export async function runEscalate(options: EscalateOptions): Promise<EscalateResult>;
```

## Tasks

| ID | Task | Status | Description |
|----|------|--------|-------------|
| 1.2.1 | [Feedback Command](tasks/1.2.1-feedback-command.md) | ✅ Complete | Implement `orchestra feedback` |
| 1.2.2 | [Escalate Command](tasks/1.2.2-escalate-command.md) | ✅ Complete | Implement `orchestra escalate` |
| 1.2.3 | [Integration Testing](tasks/1.2.3-integration-testing.md) | ✅ Complete | E2E failure path testing |

> **Removed**: Task 1.2.4 (Signal Command) was removed - see "Design Clarification" section above.

## Dependencies

No new npm dependencies required. Uses existing:
- `handlebars` for template rendering
- `js-yaml` for YAML output
- Existing core library infrastructure

## Relationship to Phase 2

Once Phase 1.2 is complete:

| CLI Command | MCP Tool |
|-------------|----------|
| `orchestra feedback` | `feedback` |
| `orchestra escalate` | `escalate` |

> **Note**: Signaling is done via manual file editing, not a command. MCP can provide a `signal` tool if needed.

## References

- [Orchestra Bible v0.7.0 - Section 8.5](../../../docs/orchestra-bible.md#85-failure-handling-scripts)
- [Phase 2 Alignment Analysis](../phase-2-mcp/alignment-analysis.md)
- [Feedback Template](../../../templates/common/templates/feedback-template.md)
