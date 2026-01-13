# Phase 2 CLI Testing Log

**Date**: 2025-12-04  
**Spec**: `spec/implementation/phase-2-mcp`  
**Reference**: `case-study/.orchestra.latest`

---

## Decision: SpecKit-First Approach

**Date**: 2025-12-04

### Context
During testing, we discovered the CLI had drifted from the original Orchestra design which was tightly integrated with SpecKit. We were trying to generalize too early.

### Decision
Orchestra will have a **hard dependency on SpecKit** for v1.0. Generalization to arbitrary specs is deferred to future release.

### Implications

1. **CLI Flag**: `--speckit <path>` instead of `--spec <path>`
   - Clear about what we expect
   - Enables validation of SpecKit structure

2. **Config Structure** (orchestra.yaml):
   ```yaml
   speckit:
     root: "spec/implementation/phase-2-mcp"  # SpecKit spec folder
   ```
   - Verbose and clear
   - Future: can add `speckit.tasks`, `speckit.spec` overrides if needed

3. **Auto-Detection** (future):
   - Validate SpecKit structure (spec.md, tasks.md exist)
   - For now: just store path, trust user

4. **Traceability**:
   - manifest.yaml tasks have `speckit_task_ref: ["T001", "T002"]`
   - After task completion: update both manifest AND tasks.md
   - This was in original design, needs to be restored

### Required Changes (Phase 1 Technical Debt)

| Change | File(s) | Priority |
|--------|---------|----------|
| Rename `--spec` to `--speckit` | `src/commands/init.ts` | HIGH |
| Change `spec_path` to `speckit.root` in config | `src/core/types.ts`, `src/commands/init.ts` | HIGH |
| Update orchestra.yaml template | `src/commands/init.ts` | HIGH |
| Update manifest.yaml template to match SpecKit format | `src/commands/init.ts` | HIGH |
| Update Orchestra Bible with SpecKit-first decision | `docs/orchestra-bible.md` | HIGH |
| Add `speckit_task_ref` to task schema | `src/core/types.ts` | MEDIUM |
| Update tasks.md on task completion | `src/core/complete.ts` | MEDIUM |
| Validate SpecKit structure exists | `src/commands/init.ts` | LOW (future) |

### manifest.yaml Template Changes

Current CLI generates a flat task list. Should match SpecKit-aligned format:

```yaml
# Target manifest.yaml format (aligned with case-study/.orchestra-original)
sprint: "phase-2-mcp"
spec: "spec/implementation/phase-2-mcp/readme.md"
speckit_tasks: "spec/implementation/phase-2-mcp/tasks.md"
created: "2025-12-04"
status: "not-started"

phases:
  - id: "setup"
    name: "Setup"
    description: "Project initialization"
    tasks:
      - id: 1
        title: "Project Setup"
        status: "not-started"
        speckit_tasks: ["T012"]           # Maps to SpecKit task IDs
        consolidation_rationale: "..."    # Why tasks were grouped
        category: "infrastructure"
        
current_task: null
current_phase: null

speckit_coverage:
  total_tasks: 8
  mapped_tasks: 8
  completed_tasks: 0
  coverage_percent: 100
```

Key additions:
- `speckit_tasks` path in header
- `phases` grouping (optional but useful)
- `speckit_tasks: ["T001"]` on each task for traceability
- `consolidation_rationale` for grouped tasks
- `speckit_coverage` summary section

---

## Issues Found

### Issue 1: Missing AGENT_README.md
**Severity**: HIGH  
**Status**: OPEN  
**Found In**: `orchestra init`

**Problem**: The `init` command doesn't create `handover/AGENT_README.md`. This is a critical file that guides the implementor agent.

**Expected**: Case study has `handover/AGENT_README.md` with:
- Role explanation
- Workflow steps (validate → implement → pre-signal → signal)
- References to orchestra commands (not scripts)
- Quality standards

**Fix**: Update `init` command to create AGENT_README.md with orchestra CLI commands instead of script references.

---

### Issue 2: completion-signal.md Created Too Early
**Severity**: HIGH  
**Status**: OPEN  
**Found In**: `orchestra prepare`

**Problem**: The `prepare` command creates `handover/completion-signal.md`. This file should NOT exist until the implementor signals completion.

**Expected**: 
- `completion-signal.md` should be a TEMPLATE in `common/templates/`
- Only created when implementor runs `orchestra signal` (or equivalent)

**Fix**: Remove completion-signal.md generation from `prepare` command. Keep as template only.

---

### Issue 3: SpecKit Integration (SUPERSEDED by Decision Above)
**Severity**: HIGH  
**Status**: REDESIGN REQUIRED  
**Found In**: `orchestra init --spec`

**Original Problem**: orchestra.yaml has `spec_path` but no reference to tasks.md

**New Design** (per SpecKit-First Decision):
```yaml
# orchestra.yaml
speckit:
  root: "spec/implementation/phase-2-mcp"
```

**Changes Required**:
1. Rename CLI flag: `--spec` → `--speckit`
2. Rename config: `spec_path` → `speckit.root`
3. Add `speckit_task_ref` to manifest task schema
4. Update tasks.md on task completion (restore original behavior)

---

### Issue 4: Template Architecture (HBS/YAML/MD) - DEFER
**Severity**: MEDIUM  
**Status**: DEFERRED  
**Found In**: `--format yaml` feature

**Problem**: We implemented `--format yaml` but the full workflow isn't clear.

**Decision**: Defer this complexity. For now:
- Remove `--format` flag (premature)
- Generate only `current-task.md` 
- Orchestrator agent enriches handover manually (as in case study)
- Revisit template architecture after core flow is solid

**Rationale**: We're going down a rabbit hole. Get basic flow working first.

---

### Issue 5: manifest.yaml Location (Information Hiding)
**Severity**: LOW (for now)  
**Status**: DEFERRED  
**Found In**: Directory structure comparison

**Problem**: Case study has manifest.yaml in `.orchestrator-only/` (hidden from implementor). CLI puts it at `.orchestra/` root.

**Case Study Pattern**:
```
.orchestra/
├── orchestrator/
│   └── .orchestrator-only/
│       ├── manifest.yaml      # HIDDEN
│       └── progress.yaml      # HIDDEN
```

**CLI Pattern**:
```
.orchestra/
├── manifest.yaml              # VISIBLE
├── progress.yaml              # VISIBLE
```

**Decision**: Defer this. For CLI tool, simplicity may trump information hiding. The script-based approach needed hiding because agents could wander. With explicit commands, less critical.

---

### Issue 6: current-task.md Content Too Sparse
**Severity**: MEDIUM  
**Status**: OPEN  
**Found In**: `orchestra prepare` output

**Problem**: Generated current-task.md is minimal compared to case study examples.

**Current Output**:
```markdown
# Task 1: Project Setup

## Overview
Add MCP SDK dependency, create src/mcp/ folder structure with stubs

## Spec Files
📄 **Task spec**: `spec/implementation/phase-2-mcp/tasks/2.1-project-setup.md`

## ⚠️ BEFORE YOU START - MANDATORY VALIDATION
...
```

**Case Study Example** includes:
- Task Overview table (ID, Title, Category, Status, Dependencies)
- Objective section
- Acceptance Criteria (numbered list)
- File Operations table
- Command Interface (if applicable)
- TDD Requirements with test structure
- Core Interfaces (TypeScript)
- Implementation Flow
- Code Scaffolds
- Verification Criteria
- Handover Checklist

**Fix Options**:
1. Read spec file content and include in handover
2. Use YAML template → orchestrator fills → render to MD
3. Hybrid: CLI reads spec, orchestrator enriches

---

## Test Commands Run

```powershell
# Init with spec
cd tools/orchestra
orchestra init --spec "spec/implementation/phase-2-mcp" --force

# Manually populated manifest.yaml with 8 tasks

# Check status
orchestra status
# Result: Shows 8 pending tasks ✓

# Prepare task 1 with both formats
orchestra prepare --task 1 --format both
# Result: Creates task-1.yaml, current-task.md, completion-signal.md (wrong!)
```

---

## Next Steps

### Phase 1 Technical Debt (Before Phase 2)
1. [ ] **Issue 3**: Rename `--spec` to `--speckit`, update config structure
2. [ ] **Issue 3**: Update manifest.yaml template to SpecKit-aligned format
3. [ ] **Issue 2**: Remove completion-signal.md from prepare command  
4. [ ] **Issue 1**: Add AGENT_README.md to init command
5. [ ] **Issue 4**: Remove `--format` flag (defer template architecture)
6. [ ] Add `speckit_task_ref` field to manifest task schema
7. [ ] Update tasks.md on task completion
8. [ ] Update Orchestra Bible (docs/orchestra-bible.md) with SpecKit-first decision

### Phase 2 Testing (After Tech Debt Fixed)
1. [ ] Create proper SpecKit spec for Phase 2 MCP
2. [ ] Test `orchestra init --speckit <path>`
3. [ ] Test full workflow with SpecKit integration

---

## Discussion: Template Architecture (HBS/YAML/MD)

**Status**: Needs discussion before implementation

### Current State
We implemented:
- `handover.hbs` - Handlebars master template
- `--format yaml` - Generates `task-N.yaml` with TODO placeholders
- `--format markdown` - Generates `current-task.md`
- `--format both` - Generates both files
- `template-converter.ts` - Parses HBS, generates YAML templates

### The Original Vision
Single source of truth (HBS) that can generate multiple output formats on-the-fly.

### Open Questions

1. **Who fills in the YAML?**
   - Orchestrator agent reads spec files and fills YAML?
   - CLI reads spec files and pre-fills some fields?
   - Human fills it manually?

2. **What's the flow?**
   ```
   Option A: HBS → YAML (with TODOs) → Orchestrator fills → render → MD
   Option B: HBS → MD directly (orchestrator edits MD)
   Option C: CLI reads spec files → pre-populates → generates rich MD
   ```

3. **Is YAML needed at all?**
   - Pro: Structured, easier to validate, agent-friendly
   - Con: Extra step, complexity, may not add value

4. **What about the case study approach?**
   - Case study: Orchestrator agent creates rich current-task.md manually
   - No YAML intermediate, no templates
   - Just a well-structured markdown handover

### Recommendation (for discussion)

**Defer the template architecture.** For v1.0:
- Remove `--format` flag
- Generate minimal current-task.md stub
- Let orchestrator agent enrich it (as in case study)
- Revisit templates when we have MCP server (agent can call render tool)

**Rationale**: The template architecture adds complexity without clear benefit until we have:
1. A clear consumer (MCP tool that can render)
2. A clear workflow (who fills what, when)
3. Proven value over manual enrichment

---

## 📋 Phase 1.2 Plan: Template Registry Implementation

**Created**: 2025-12-04  
**Document**: `docs/TEMPLATE_REGISTRY.md`

The template registry now defines:
- Every generated file → source template mapping
- Format decisions (YAML vs MD) based on use case
- Immutable vs mutable files
- Single active file convention (current-task.md not task-N.md)
- Anti-patterns to avoid

### High-Priority Fixes (Phase 1.2)

1. **Create `agent-readme.hbs`** - Missing entirely  
   - Agent onboarding document (immutable)
   - Lists file locations, workflow, what not to touch
   - Generated by `orchestra init`

2. **Fix `completion-signal.hbs` generation** - Currently generated by prepare (WRONG)  
   - Should be reference template only
   - Agent copies manually when task complete
   - Keeps as YAML (agent fills out structured fields)

3. **Update `manifest.hbs`** - Needs SpecKit format  
   - Add phases array with speckit_task_ref
   - Enable task traceability to SpecKit
   - Support consolidation tracking

4. **Remove `--format` flag** - Defer complexity  
   - Keep HBS as template source
   - Generate YAML or MD per registry use case
   - No multi-format support in v1.0

5. **Update Orchestra Bible** - Reference registry  
   - Add pointer to TEMPLATE_REGISTRY.md
   - Document template system principles
   - Cross-reference to case study

### Implementation Path

After Phase 1.2 fixes:
1. Implement remaining 8 technical debt items
2. Create proper SpecKit spec for Phase 2 MCP
3. Re-test full workflow with corrected architecture
4. Verify against case-study reference

---

*Log created: 2025-12-04*
*Updated: 2025-12-04 - SpecKit-First Decision, Template Registry*

---

## Test Session: 2025-12-06

### Issue 7: Feedback Not Visible to Implementor

**Severity**: HIGH  
**Status**: OPEN  
**Found In**: Verification failure workflow

**Problem**: When orchestrator generates feedback via `orchestra feedback --task 1`, the feedback file is created at `.orchestra/handover/feedback/task-001-signal-rejected.md` (or similar). However:

1. **`orchestra next` doesn't show feedback state** - Still shows "Current Step: Verify" even after feedback exists
2. **`orchestra status` shows "Verify"** instead of "Retry" or "Feedback Available"
3. **Implementor doesn't know where to find feedback** - The workflow doesn't guide them to the feedback file

**Root Cause Analysis**:

1. `workflow-state.ts` line 168 checks for `feedback.md` at `paths.handovers + "feedback.md"`:
   ```typescript
   const feedbackPath = path.join(paths.handovers, "feedback.md");
   const feedbackExists = fs.existsSync(feedbackPath);
   ```
   But feedback is actually created in a `feedback/` subdirectory with task-specific names.

2. `feedback.ts` line 193 writes to:
   ```typescript
   const feedbackPath = path.join(paths.feedback, `task-${taskId}-feedback.md`);
   ```
   Which creates `.orchestra/handover/task-1-feedback.md` (with paths.feedback = "handover")

3. The actual file observed was manually created at:
   `.orchestra/handover/feedback/task-001-signal-rejected.md`

**Three Sub-Issues**:

| # | Issue | Impact |
|---|-------|--------|
| 7a | `workflow-state.ts` looks for wrong feedback path | `orchestra next` never shows RETRY step |
| 7b | `feedback.ts` writes different filename than state expects | State detection broken |
| 7c | No documentation tells implementor where feedback is | Implementor lost after rejection |

**Expected Behavior**:

1. When feedback exists, `orchestra next` should show:
   ```
   🔍 Current Step: Retry
   
   Sprint: mcp-server-001 (ACTIVE)
   Task 1: Add @modelcontextprotocol/sdk dependency [IMPLEMENT]
   
   ▸ Address feedback and retry
   
   Verification failed. Feedback is available.
   
   Read feedback:
     cat .orchestra/handover/feedback.md
   
   After addressing issues:
     orchestra complete --signal
   ```

2. Feedback should be at a known, documented location (e.g., `.orchestra/handover/feedback.md`)

**Proposed Fix Options**:

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Change `feedback.ts` to always write to `feedback.md` | Simple, matches state detection | Loses history per-attempt |
| B | Change `workflow-state.ts` to scan `feedback/` directory | Keeps history | More complex detection |
| C | Keep per-attempt files, symlink/copy to `feedback.md` | Both history AND simple detection | Extra file operation |

**Recommendation**: Option C - Create feedback files with attempt number for history, but also create/overwrite `.orchestra/handover/feedback.md` as the "current feedback" file that implementor always checks.

---

### Issue 8: progress.yaml Not Updated After Verification Failure

**Severity**: MEDIUM  
**Status**: OPEN  
**Found In**: `orchestra feedback` workflow

**Problem**: After running `orchestra accept-signal` (which failed), the progress.yaml still shows:
```yaml
entries:
  - task_id: 1
    status: "PREPARE"
```

Expected: Status should be "IMPLEMENT" after implementor signaled, then "RETRY" after feedback.

**Root Cause**: The progress state transitions are not being recorded consistently through the workflow.

**Fix**: Ensure `accept-signal` and `feedback` commands update progress.yaml appropriately.

---

### Issue 9: agent_readme.md Missing Feedback Workflow

**Severity**: MEDIUM  
**Status**: OPEN  
**Found In**: `templates/handover/agent_readme.md`

**Problem**: The agent readme tells implementor what to do for completion signal, but doesn't explain:
- What happens if verification fails
- Where to find feedback
- How to re-signal after addressing feedback

**Fix**: Add "If Your Signal is Rejected" section to agent_readme.md with:
1. How to find feedback file
2. How to address issues
3. How to re-run pre-signal check
4. How to re-signal

---

### Issue 10: `orchestra feedback` Command Not Standalone

**Severity**: HIGH  
**Status**: OPEN  
**Found In**: `src/core/feedback.ts`

**Problem**: The `orchestra feedback` command requires a verification result to be passed in programmatically. It cannot be run standalone after verification fails.

```typescript
// feedback.ts line 147-151
const verifyResult = options.verificationResult;
if (!verifyResult) {
  throw new OrchestraError(
    "No verification results provided. Run 'orchestra verify' first.",
```

**Impact**: Orchestrator cannot run `orchestra feedback --task 1` after `orchestra accept-signal` fails - the commands are disconnected.

**Current State**:
- `accept-signal` runs verification and saves result to `.orchestra/orchestrator/results/task-001-verification.yaml`
- `feedback` expects verification result passed in memory, not read from disk
- Orchestrator has to manually create feedback file

**Fix Options**:

| Option | Description |
|--------|-------------|
| A | Make `feedback` read verification result from disk if not provided |
| B | Have `accept-signal` automatically generate feedback on failure |
| C | Both A and B |

**Recommendation**: Option C - `accept-signal` should auto-generate feedback on failure AND `feedback` should work standalone by reading from disk.

---

### Issue 11: `accept-signal` Doesn't Update Progress on Failure

**Severity**: HIGH  
**Status**: OPEN  
**Found In**: `src/commands/accept-signal.ts`

**Problem**: When `orchestra accept-signal` fails verification, it doesn't:
1. Update progress.yaml to RETRY status
2. Generate feedback for implementor
3. Guide orchestrator on next steps

**Current progress.yaml after verification failure**:
```yaml
entries:
  - task_id: 1
    status: "PREPARE"  # Should be RETRY or VERIFY_FAILED
```

**Expected Workflow**:
```
accept-signal (fail) →
  1. Write verification result (✓ done)
  2. Update progress to VERIFY_FAILED
  3. Auto-generate feedback to known location
  4. Output: "Feedback written to .orchestra/handover/feedback.md"
  5. Output: "Run 'orchestra next' for guidance"
```

**Fix**: Add failure handling to `accept-signal` that:
1. Updates progress.yaml with RETRY/VERIFY_FAILED status
2. Calls feedback generation automatically
3. Writes feedback to canonical location

---

### Issue 12: Feedback File Location Inconsistency

**Severity**: MEDIUM  
**Status**: OPEN  
**Found In**: `src/core/feedback.ts` vs `src/core/workflow-state.ts`

**Problem**: Three different locations for feedback files:

| Component | Expected Location |
|-----------|-------------------|
| `workflow-state.ts` | `.orchestra/handover/feedback.md` |
| `feedback.ts` | `.orchestra/handover/task-${id}-feedback.md` |
| Manual (observed) | `.orchestra/handover/feedback/task-001-signal-rejected.md` |

**Impact**: `orchestra next` never detects feedback exists, so never shows RETRY step.

**Fix**: Standardize on single canonical location:
- `.orchestra/handover/feedback.md` = current/active feedback (always check here)
- `.orchestra/handover/feedback/task-{id}-attempt-{n}.md` = history (optional)

---

## Feedback Workflow Analysis

### Current State (Broken)

```
Implementor signals → accept-signal fails → ??? → Implementor stuck

  1. orchestra accept-signal
     ├── Runs verification ✓
     ├── Writes verification result to orchestrator/results/ ✓
     ├── Outputs "FAILED" message ✓
     ├── Updates progress.yaml ✗ (still shows PREPARE)
     ├── Generates feedback ✗ (not called)
     └── Guides next step ✗ (just exits)
     
  2. Orchestrator manually creates feedback file
     └── Implementor doesn't know where to look
     
  3. Implementor runs orchestra next
     └── Shows "Verify" step (wrong - should show RETRY)
```

### Expected State (Fixed)

```
Implementor signals → accept-signal fails → feedback generated → Implementor reads feedback → retries

  1. orchestra accept-signal
     ├── Runs verification ✓
     ├── Writes verification result ✓
     ├── Updates progress.yaml to VERIFY_FAILED ← FIX
     ├── Auto-generates feedback to handover/feedback.md ← FIX
     └── Outputs: "Feedback at .orchestra/handover/feedback.md" ← FIX
     
  2. Implementor runs orchestra next
     ├── Detects feedback exists ✓ (if file location fixed)
     └── Shows "RETRY" step with guidance ✓
     
  3. Implementor reads feedback.md
     ├── Fixes issues
     ├── Re-runs pre-signal-check
     └── Re-signals with orchestra complete --signal
```

### Commands Involved

| Command | Role | Current | Needed |
|---------|------|---------|--------|
| `accept-signal` | Orchestrator | Verify only | Verify + feedback on fail |
| `feedback` | Orchestrator | Requires programmatic input | Read from disk |
| `next` | Both | Checks wrong path | Check correct path |
| `status` | Both | Shows VERIFY | Show RETRY when feedback exists |

---
