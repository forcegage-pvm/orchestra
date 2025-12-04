# Phase 1.2: CLI Technical Debt

> **Navigation**: [Implementation Index](../readme.md) | **Prev**: [Phase 1: CLI](../phase-1-cli/readme.md) | **Next**: [Phase 2: MCP Server](../phase-2-mcp/readme.md)

---

## Status: 🔴 BLOCKING Phase 2

**Prerequisites**: Phase 1 CLI ✅ Complete  
**Blocks**: Phase 2 MCP Server

---

## Overview

Phase 1 CLI was marked complete but is **missing three mandatory commands** per Orchestra Bible v0.7.0:

1. **`orchestra feedback`** - Generate feedback for implementor after verification failure (Section 8.5)
2. **`orchestra escalate`** - Escalate persistent failures to human supervisor (Section 8.5)
3. **`orchestra signal`** - Implementor signals task completion (Section 8.3)

These are **mandatory scripts** that complete the task lifecycle. Without them:
- Orchestrator cannot communicate verification failures to the implementor
- Implementor cannot properly signal completion (currently using `accept-signal` incorrectly)

## Discovery

During Phase 2 MCP alignment analysis (2025-12-04), we discovered:

| Script (Bible) | CLI Command | Core Function | Status |
|----------------|-------------|---------------|--------|
| `generate-feedback` (8.5) | ❌ Missing | ❌ Missing | **Must Add** |
| `escalate-failure` (8.5) | ❌ Missing | ❌ Missing | **Must Add** |
| `signal-complete` (8.3) | ❌ Missing | Partial | **Must Add** |

**Note**: `accept-signal` exists but is the orchestrator's validation of a signal, not the implementor's creation of one.

**Existing Infrastructure** (already in place):
- `FeedbackDocumentSchema` in `src/core/types.ts`
- `paths.feedback` configured in `src/core/config.ts`
- `feedback-template.md` template exists
- `ESCALATED` status supported in manifest
- `src/core/signal.ts` has signal utilities (extend for `runSignal`)

## Goals

1. **Complete task lifecycle** - Enable proper signal → verify → feedback flow
2. **Maintain core-first architecture** - Add to `src/core/` first, then CLI wrapper
3. **Preserve trust model** - Feedback must NOT reveal verification criteria
4. **Enable MCP** - These commands are required before Phase 2 can proceed

## Success Criteria

- [ ] `orchestra signal` creates signal file for implementor
- [ ] `orchestra feedback` generates feedback file from verification results
- [ ] `orchestra escalate` marks task as escalated and creates report
- [ ] Feedback does NOT reveal hidden verification criteria
- [ ] Integration with existing `verify` command flow
- [ ] All existing tests still pass
- [ ] New commands have full test coverage

## Commands

| Command | Bible Script | Purpose | Actor |
|---------|--------------|---------|-------|
| `orchestra signal` | `signal-complete` | Create signal file | Implementor |
| `orchestra feedback` | `generate-feedback` | Create feedback for implementor | Orchestrator |
| `orchestra escalate` | `escalate-failure` | Escalate to human supervisor | Orchestrator |

### Command Flow (Updated)

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPLETE TASK LIFECYCLE                      │
│                                                                 │
│   IMPLEMENTOR                                                   │
│   ───────────                                                   │
│   orchestra signal ──► Creates signal file                      │
│                              │                                  │
│   ORCHESTRATOR               ▼                                  │
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
│   ├── signal.ts          # NEW - orchestra signal
│   ├── feedback.ts        # NEW - orchestra feedback
│   └── escalate.ts        # NEW - orchestra escalate
└── core/
    ├── signal.ts          # EXTEND - add runSignal()
    ├── feedback.ts        # NEW - runFeedback()
    └── escalate.ts        # NEW - runEscalate()
```

### Core Library Additions

```typescript
// src/core/signal.ts (extend existing)
export interface SignalOptions {
  task?: string;           // Task ID (defaults to current)
  summary: string;         // What was completed (required)
  files?: string[];        // Files modified (auto-detect if omitted)
  tests?: string[];        // Test files added
  notes?: string;          // Additional notes
}

export interface SignalResult {
  success: boolean;
  taskId: number;
  summary: string;
  signalPath: string;
  artifacts: { created: string[]; modified: string[] };
  signaledAt: string;
  nextStep: string;
}

export async function runSignal(options: SignalOptions): Promise<SignalResult>;
```

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
| 1.2.1 | [Feedback Command](tasks/1.2.1-feedback-command.md) | Not Started | Implement `orchestra feedback` |
| 1.2.2 | [Escalate Command](tasks/1.2.2-escalate-command.md) | Not Started | Implement `orchestra escalate` |
| 1.2.3 | [Integration Testing](tasks/1.2.3-integration-testing.md) | Not Started | E2E failure path testing |
| 1.2.4 | [Signal Command](tasks/1.2.4-signal-command.md) | ✅ Complete | Implement `orchestra signal` |

## Dependencies

No new npm dependencies required. Uses existing:
- `handlebars` for template rendering
- `js-yaml` for YAML output
- Existing core library infrastructure

## Relationship to Phase 2

Once Phase 1.2 is complete:

| CLI Command | MCP Tool |
|-------------|----------|
| `orchestra signal` | `signal` |
| `orchestra feedback` | `feedback` |
| `orchestra escalate` | `escalate` |

The MCP spec will be updated to use these proper names instead of `signal_complete`, `log_issue` and `request_help`.

## References

- [Orchestra Bible v0.7.0 - Section 8.3](../../../docs/orchestra-bible.md#83-signal-complete)
- [Orchestra Bible v0.7.0 - Section 8.5](../../../docs/orchestra-bible.md#85-failure-handling-scripts)
- [Phase 2 Alignment Analysis](../phase-2-mcp/alignment-analysis.md)
- [Feedback Template](../../../templates/common/templates/feedback-template.md)
