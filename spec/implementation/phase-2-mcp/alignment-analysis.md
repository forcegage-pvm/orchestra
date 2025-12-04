# Phase 2 MCP - Alignment Analysis

> **Date**: 2025-12-04  
> **Status**: Decisions in progress  
> **Purpose**: Document discrepancies between Phase 2 MCP spec and authoritative sources (Bible v0.7.0, Phase 1 CLI implementation)

---

## Executive Summary

The Phase 2 MCP specification was drafted before Phase 1 CLI was complete. Now that Phase 1 is done (7 commands, 346 tests, reusable `src/core/` library), the MCP spec requires updates to align with:

1. **Orchestra Bible v0.7.0** - Authoritative process specification
2. **Phase 1 CLI** - Reference implementation and core library API
3. **Project structure** - Actual folder layout

---

## Complete Gap Analysis: Bible vs CLI

### Bible Section 8 Scripts vs Phase 1 CLI

| Bible Script | Mandatory | Actor | CLI Command | Core Function | Status |
|--------------|-----------|-------|-------------|---------------|--------|
| `sprint-init` | Yes | Orchestrator | `orchestra init` | `runInit()` | ✅ Implemented |
| `sprint-status` | No | Any | `orchestra status` | `statusCommand()` | ✅ Implemented |
| `prepare-handover` | Yes | Orchestrator | `orchestra prepare` | `runPrepare()` | ✅ Implemented |
| `validate-handover` | Yes | Orchestrator | (part of prepare) | (inline) | ✅ Implemented |
| `signal-complete` | Yes | Implementor | ❌ Missing | ❌ Missing | 🔴 **Gap** |
| `pre-signal-check` | No | Implementor | ❌ Missing | ❌ Missing | 🟡 Optional |
| `gate-check` | Yes | System | ❌ Missing | ❌ Missing | 🔴 **Gap** |
| `verification-audit` | Yes | Orchestrator | `orchestra verify` | `runVerification()` | ✅ Implemented |
| `accept-signal-check` | Yes | Orchestrator | `orchestra accept-signal` | `runAcceptSignal()` | ✅ Implemented |
| `task-closeout-check` | Yes | Orchestrator | `orchestra closeout` | `runCloseoutChecks()` | ✅ Implemented |
| `generate-feedback` | Yes | Orchestrator | ❌ Missing | ❌ Missing | 🔴 **Gap** |
| `escalate-failure` | Yes | Orchestrator | ❌ Missing | ❌ Missing | 🔴 **Gap** |

### Gap Summary

| Gap | Bible Script | Severity | Notes |
|-----|--------------|----------|-------|
| 1 | `signal-complete` | 🔴 Critical | Implementor needs to signal completion |
| 2 | `gate-check` | 🔴 Critical | Deterministic checks before verification |
| 3 | `generate-feedback` | 🔴 Critical | Orchestrator-to-implementor communication |
| 4 | `escalate-failure` | 🔴 Critical | Human escalation path |
| 5 | `pre-signal-check` | 🟡 Optional | Implementor self-validation |

### Analysis of Each Gap

#### Gap 1: `signal-complete` (Implementor)

**Bible Definition**: Implementor signals task completion, creates signal file.

**Current State**: 
- No CLI command `orchestra signal`
- Bible Section 7.3 shows this maps to `orchestra signal`
- Currently implementor just writes files manually

**Decision Needed**: Is this truly needed as a CLI command, or is manual file creation sufficient?

**Recommendation**: Add `orchestra signal` command for consistency and to ensure proper signal file format.

#### Gap 2: `gate-check` (System)

**Bible Definition**: Deterministic checks (build, test, lint, files exist) after signal.

**Current State**:
- Bible Section 7.3 shows this maps to `orchestra gate`
- Currently `accept-signal` does some of this, but not separated
- `verify` does hidden verification, not gate checks

**Decision Needed**: Should gate-check be separate from accept-signal?

**Recommendation**: Keep as-is - `accept-signal` handles signal validation which includes basic checks. The separation in the Bible is conceptual; implementation can combine where it makes sense.

#### Gap 3: `generate-feedback` (Orchestrator)

**Bible Definition**: Generate actionable feedback after verification failure.

**Current State**: ❌ No implementation

**Resolution**: **Phase 1.2** - Already spec'd as `orchestra feedback`

#### Gap 4: `escalate-failure` (Orchestrator)

**Bible Definition**: Escalate persistent failures to human.

**Current State**: ❌ No implementation

**Resolution**: **Phase 1.2** - Already spec'd as `orchestra escalate`

#### Gap 5: `pre-signal-check` (Implementor)

**Bible Definition**: Optional self-validation before signaling.

**Current State**: 
- No CLI command `orchestra check`
- Bible marks as "Recommended, not mandatory"

**Recommendation**: Defer - not blocking. Can be added later as convenience feature.

---

## Revised Phase 1.2 Scope

Based on complete gap analysis:

| Command | Priority | Status |
|---------|----------|--------|
| `orchestra feedback` | P0 - Blocking | Spec'd in Phase 1.2 |
| `orchestra escalate` | P0 - Blocking | Spec'd in Phase 1.2 |
| `orchestra signal` | P1 - Should have | **Not yet spec'd** |
| `orchestra check` | P2 - Nice to have | Deferred |
| `orchestra gate` | P3 - Optional | Covered by accept-signal |

---

## Discrepancy Analysis

### 1. Tool Naming vs CLI Commands

The MCP spec tools don't map cleanly to Phase 1 CLI commands or Bible abstract scripts.

| MCP Spec Tool | Bible Abstract Script | Phase 1 CLI Command | Issue |
|---------------|----------------------|---------------------|-------|
| `prepare_task` | `prepare-handover` | `orchestra prepare` | ✅ Aligned |
| `signal_complete` | `signal-complete` + `accept-signal-check` | `orchestra accept-signal` | ⚠️ **Conflates two roles** |
| `get_context` | `sprint-status` | `orchestra status` | ✅ Aligned (name differs) |
| `validate_handover` | `validate-handover` | (part of `prepare`) | ✅ Aligned |
| `complete_task` | `accept-signal-check` | `orchestra complete` | ⚠️ **Overlaps with signal_complete** |
| `log_issue` | `generate-feedback` | ❌ Missing (Phase 1.2) | ⚠️ Wrong name |
| `request_help` | `escalate-failure` | ❌ Missing (Phase 1.2) | ⚠️ Wrong name |
| ❌ Missing | `task-closeout-check` | `orchestra closeout` | **Missing from MCP** |
| ❌ Missing | `verification-audit` | `orchestra verify` | **Missing from MCP** |
| ❌ Missing | `sprint-init` | `orchestra init` | **Missing from MCP** |

### 2. Role Separation Violation

**Bible Requirement** (Section 3.2, 4.2, 4.4):
- `signal-complete` is an **Implementor** action (creates signal file, triggers gate check)
- `accept-signal-check` is an **Orchestrator** action (validates signal, runs verification)
- These roles must operate in **separate contexts**

**MCP Spec Issue**:
- `signal_complete` tool combines both roles
- Response includes `verification` results, which should only be visible to Orchestrator
- Violates "Implementor must not see verification criteria/results"

**Decision Required**: Should MCP tools preserve role separation or combine for convenience?

### 3. Missing Tools

Based on Phase 1 CLI and Bible, these tools are missing from MCP spec:

| Tool Needed | Maps To | Why Required |
|-------------|---------|--------------|
| `closeout` | `orchestra closeout` | Verify previous task closed before preparing next |
| `verify` | `orchestra verify` | Run hidden verification criteria (Orchestrator only) |
| `init` | `orchestra init` | Initialize sprint from specification |

### 4. Folder Path References

**MCP Spec Shows**:
```
tools/orchestra/
├── src/
│   ├── mcp/
│   └── ...
```

**Actual Project Structure**:
```
orchestra/           # Root
├── src/
│   ├── cli.ts
│   ├── commands/
│   ├── core/        # Shared library
│   └── mcp/         # New - Phase 2 will add this
```

The `tools/orchestra/` prefix is incorrect. Project root is `orchestra/`.

### 5. Core Library Import Paths

**MCP Spec Task Files Reference**:
```typescript
import { loadManifest, getTask } from '../../core/manifest.js';
import { runPrepare } from '../../core/prepare.js';
```

**Correct Pattern** (per `src/core/index.ts`):
```typescript
import { loadManifest, getTask, runPrepare } from '../../core/index.js';
// Or use specific exports with aliases for conflicts
```

### 6. Task Table Misalignment

**Current MCP Tasks** (8 tasks):
- 2.1: Project Setup
- 2.2: Server Core
- 2.3: prepare_task Tool
- 2.4: signal_complete Tool
- 2.5: get_context Tool
- 2.6: validate_handover Tool
- 2.7: complete_task Tool
- 2.8: Integration Testing

**Missing Based on Bible/CLI**:
- closeout tool (maps to `orchestra closeout`)
- verify tool (maps to `orchestra verify`)
- Potentially: init tool, feedback tool, escalate tool

### 7. Response Schema Issues

Several tool response schemas don't match Phase 1 core library types:

| Tool | Issue |
|------|-------|
| `prepare_task` | Response doesn't include `category` or template-based fields |
| `signal_complete` | Includes `verification` which Implementor shouldn't see |
| `get_context` | Status enum uses `IMPLEMENT` but Phase 1 uses `in_progress` |

---

## Decisions Record

### Q1: Role Separation in MCP Tools

Should MCP tools preserve the Bible's role separation (Implementor vs Orchestrator), or combine for MCP convenience?

**Option A**: Separate tools ✅ **Decided**
- `accept_signal` - Orchestrator validates signal (wraps `orchestra accept-signal`)
- `verify` - Orchestrator runs hidden verification (wraps `orchestra verify`)
- `complete_task` - Orchestrator marks complete (wraps `orchestra complete`)
- Implementor creates signal file directly (not via MCP tool)

**Option B**: Combined tools ❌ Rejected
- Would violate trust model

**Decision**: Option A - Phase 1 CLI already implements proper separation. MCP just needs to align with existing CLI commands.

### Q2: Missing Tool Coverage

Should Phase 2 MCP include all Phase 1 commands or a subset?

**Option A**: Spec Now, Implement Later
**Option B**: Block on CLI ✅ **Decided**
**Option C**: MCP First

**Decision**: Option B - Phase 1 CLI is incomplete. Created **Phase 1.2** to add missing commands:
- `orchestra feedback` - Generate feedback for implementor
- `orchestra escalate` - Escalate to human supervisor

Phase 2 MCP is **blocked** until Phase 1.2 is complete.

See: [Phase 1.2 CLI Technical Debt](../phase-1.2-cli/readme.md)

### Q3: Tool Naming Convention

Should MCP tools use snake_case, action-noun, or match CLI exactly?

**Option A**: Match CLI exactly ✅ **Decided**
- `init`, `status`, `closeout`, `prepare`, `accept_signal`, `verify`, `complete`, `feedback`, `escalate`

**Option B**: Action-noun style ❌ Rejected
**Option C**: Verb-only style ❌ Rejected

**Decision**: Option A - Match CLI exactly for consistency. MCP tools are wrappers around CLI commands.

### Q4: Status Enum Values

Phase 1 uses lowercase status values (`pending`, `in_progress`, `completed`). MCP spec uses uppercase (`PENDING`, `IMPLEMENT`, `COMPLETE`).

**Option A**: Match Phase 1 exactly (lowercase) ✅ **Decided**
**Option B**: Use uppercase convention ❌ Rejected
**Option C**: Translate between them ❌ Rejected

**Decision**: Option A - Match Phase 1 exactly. One source of truth, no translation bugs.

### Q5: `orchestra signal` Command

Bible specifies `signal-complete` as an Implementor action (CLI: `orchestra signal`). Currently not implemented.

**Option A**: Add to Phase 1.2 scope ✅ **Decided**
**Option B**: Defer (manual file creation) ❌ Rejected
**Option C**: Part of Phase 2 MCP only ❌ Rejected

**Decision**: Option A - Add to Phase 1.2 to consolidate all tech debt. Implementor needs proper tooling.

---

## Recommended Updates

Once all decisions are made:

1. Update `readme.md` - Fix architecture diagram, folder paths
2. Update `tasks.md` - Add missing tasks, renumber if needed
3. Update tool definition files - Fix imports, response schemas
4. Add missing task files - closeout, verify, potentially init
5. Update task files - Fix core library imports
6. Rename tools to match CLI naming convention

---

## References

- [Orchestra Bible v0.7.0](../../../docs/orchestra-bible.md)
- [Phase 1 CLI readme](../phase-1-cli/readme.md)
- [Phase 1.2 CLI Technical Debt](../phase-1.2-cli/readme.md)
- [Core library exports](../../../src/core/index.ts)
