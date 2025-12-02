````markdown
# Script Specifications

> **Navigation**: [Index](../readme.md) | **Prev**: [File Specifications](file-specifications.md) | **Next**: [Templates](templates.md)
> 
> **Authority**: [Orchestra Bible Section 8](../00-orchestra-bible.md#8-script-specifications)

---

## Overview

Orchestra uses scripts to enforce process and create structural gates. Scripts are mandatory at specific lifecycle transitions—they are NOT optional utilities.

> ⚠️ **CRITICAL**: Scripts are NOT optional. Each phase transition REQUIRES specific scripts to execute successfully before the transition is valid. See [Mandatory Script Matrix](#mandatory-script-matrix).

## Script Categories

| Category | Scripts | Mandatory? | Actor |
|----------|---------|------------|-------|
| **Sprint Management** | `sprint-init`, `sprint-status` | YES (init) / NO (status) | Orchestrator |
| **Task Preparation** | `prepare-handover`, `validate-handover`, `validate-verification-paths` | YES - Blocking | Orchestrator |
| **Implementation** | `signal-complete`, `pre-signal-check` | YES / Recommended | Implementor |
| **Verification** | `gate-check`, `verification-audit`, `accept-signal-check` | YES - Blocking | Orchestrator |
| **Failure Handling** | `generate-feedback`, `escalate-failure` | YES - On failure path | Orchestrator |
| **Utility** | `task-closeout-check`, `environment-check` | YES (closeout) / Recommended | Orchestrator |

---

## Mandatory Script Matrix

> **Cross-Reference**: [Bible Section 7.3](../00-orchestra-bible.md#73-mandatory-script-execution-matrix)

| From Phase | To Phase | MANDATORY Script(s) | Blocking? | Actor |
|------------|----------|---------------------|-----------|-------|
| — | PENDING | `sprint-init` | YES | Human/Orchestrator |
| PENDING | PREPARE | `task-closeout-check` (prev task) | YES | Orchestrator |
| PREPARE (Step 6a) | PREPARE (Step 7) | `validate-verification-paths` | YES | Orchestrator |
| PREPARE | IMPLEMENT | `prepare-handover` → `validate-handover` | YES | Orchestrator |
| IMPLEMENT | GATE CHECK | `signal-complete` | YES | Implementor |
| GATE CHECK | VERIFY | `gate-check` | YES | System |
| VERIFY | COMPLETE | `verification-audit` | YES | Orchestrator |
| COMPLETE | (next task) | `accept-signal-check` → `task-closeout-check` | YES | Orchestrator |
| Any | RETRY | `generate-feedback` | YES | Orchestrator |
| RETRY (max) | ESCALATED | `escalate-failure` | YES | Orchestrator |

---

## Sprint Management Scripts

### sprint-init

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | BEFORE any task can begin |
| **Mandatory** | YES - Blocking |
| **Actor** | Human / Orchestrator |

**Purpose**: Initialize a new sprint from a specification.

**Inputs**:
- Specification document path
- Sprint configuration (optional)

**Actions**:
1. Parse specification document
2. Extract task definitions
3. Generate `manifest.yaml`
4. Generate hidden verification criteria per task
5. Initialize `progress.yaml`
6. Create folder structure

**Outputs**:
- `.orchestra/manifest.yaml`
- `.orchestra/progress.yaml`
- `.orchestra/orchestrator/.orchestrator-only/verification/task-{id}.yaml` (per task)

**Success Criteria**:
- Manifest contains all tasks from specification
- Each task has success criteria defined
- Each task has hidden verification criteria defined
- Progress shows all tasks as `pending`

**Exit Codes**:
- `0`: Success
- `1`: Specification parsing failed
- `2`: Invalid task structure

---

### sprint-status

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | Any time (utility) |
| **Mandatory** | NO - Utility |
| **Actor** | Human / Orchestrator |

**Purpose**: Report current sprint progress.

**Inputs**: None (reads from `progress.yaml`)

**Outputs**: Status report (console or file)

**Success Criteria**:
- Accurate count of tasks by status
- Current task clearly identified
- Blockers/failures highlighted

---

## Task Preparation Scripts

### prepare-handover

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | PENDING → PREPARE transition |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |

**Purpose**: Generate a handover document for the implementor.

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
- Updated `progress.yaml`

**Success Criteria**:
- Handover contains all success criteria
- Handover contains all context file references
- Handover does NOT contain verification criteria
- Progress updated correctly

**What This Script MUST NOT Do**:
- Include verification criteria in handover
- Include details of other tasks
- Include historical verification results

---

### validate-handover

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | After `prepare-handover`, before IMPLEMENT begins |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |

**Purpose**: Verify handover document is complete and contains no hidden criteria leaks.

**Inputs**: Handover document path

**Actions**:
1. Parse handover document
2. Verify required sections present
3. Verify no forbidden content (verification criteria)
4. Verify context files exist

**Outputs**: Validation result (pass/fail) with issues list

**Success Criteria**:
- All required sections present
- No verification criteria leaked
- All referenced files exist
- Success criteria are actionable

---

### validate-verification-paths

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | After creating verification YAML, before handover begins (Process 1, Step 6a) |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |

**Purpose**: Verify all file paths in verification YAML exist in actual project structure, preventing false failures from outdated/wrong paths in spec.

**Inputs**:
- `-TaskId <int>` - Task ID to validate
- `-Fix` (optional) - Auto-fix detected path errors

**Actions**:
1. Parse verification YAML for task
2. Extract all file paths using regex patterns:
   - `path:` fields
   - `file:` fields
   - `pattern:` fields (if they contain paths)
3. For each path, verify it exists in project
4. If path doesn't exist:
   - Search filesystem for correct path
   - Suggest correction (filename match in correct location)
   - If `-Fix` flag: automatically update YAML with correct path
5. Report all validation results

**Outputs**:
- Console report: ✅ valid paths / ❌ invalid paths with suggestions
- If `-Fix`: Updated verification YAML with corrected paths
- Exit code 0 (all valid) or 1 (errors found)

**Success Criteria**:
- All paths in verification YAML exist in project
- No outdated folder structures (e.g., `src/lib/` when actual is `src/core/`)
- No test path errors (e.g., `tests/` when actual is `test/`)

**Why This Exists**:

**Problem**: Orchestrator blindly copies paths from spec file to verification YAML. If spec has wrong/outdated paths, verification will fail even though implementation is correct.

**Example Failures**:
- Spec says `src/lib/templates.ts`, but project uses `src/core/templates.ts`
- Spec says `tests/commands/`, but project uses `test/commands/`
- Implementor correctly follows project structure, but verification YAML has wrong paths from spec

**Solution**: This script catches path errors BEFORE implementor starts work, preventing false failures and wasted implementation time.

**When to Use**:
- **MANDATORY**: After creating verification YAML (Process 1, Step 6a)
- **RECOMMENDED**: After updating spec files with new paths
- **TROUBLESHOOTING**: When verification fails with "file not found" errors

**Script Location**: `.orchestra/orchestrator/scripts/validate-verification-paths.ps1`

**Example Usage**:

```powershell
# Validate paths for Task 4
.\.orchestra\orchestrator\scripts\validate-verification-paths.ps1 -TaskId 4

# Output:
# ❌ INVALID PATHS FOUND
# Issues:
#   - src/lib/templates.ts (should be: src/core/templates.ts)
#   - tests/commands/init.test.ts (should be: test/commands/init.test.ts)

# Auto-fix the errors
.\.orchestra\orchestrator\scripts\validate-verification-paths.ps1 -TaskId 4 -Fix

# Output:
# ✅ Fixed 2 path(s)
# Verification YAML updated

# Re-validate
.\.orchestra\orchestrator\scripts\validate-verification-paths.ps1 -TaskId 4

# Output:
# ✅ ALL PATHS VALID - Verification YAML is correct
```

**Integration with Process 1 (Handover Creation)**:

Step 6a (NEW - MANDATORY):

```
6. Create verification YAML from spec success criteria
   ↓
6a. MANDATORY: Validate paths in verification YAML  ← NEW STEP
    Command: validate-verification-paths.ps1 -TaskId N
    If errors found:
      - Review suggestions
      - Run with -Fix to auto-correct
      - Re-validate until ✅ ALL PATHS VALID
    BLOCKING: Cannot proceed to Step 7 until paths valid
   ↓
7. Create handover document from spec + manifest
```

**Multi-Layered Defense**:

This script is part of a multi-layered defense against path errors:

1. **Layer 1 (Prevention)**: Spec authors write correct paths
2. **Layer 2 (Detection)**: This script validates paths before handover
3. **Layer 3 (Correction)**: Auto-fix with `-Fix` flag
4. **Layer 4 (Process)**: Made mandatory in Process 1 documentation

**Critical**: This does NOT excuse spec authors from writing correct paths. It's a safety net, not a replacement for diligence.

---

## Implementation Scripts

### signal-complete

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | IMPLEMENT → GATE CHECK transition |
| **Mandatory** | YES - Blocking |
| **Actor** | Implementor |

**Purpose**: Implementor signals task completion.

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

---

### pre-signal-check

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | During IMPLEMENT, before `signal-complete` |
| **Mandatory** | NO - Recommended |
| **Actor** | Implementor |

**Purpose**: Implementor self-check before signaling (optional but recommended).

**Actions**:
1. Run build
2. Run tests
3. Run linting/formatting
4. Check for common errors

**Outputs**: Check results (pass/fail per category)

**Note**: This is a convenience script for the implementor. It does NOT replace gate checks or verification.

---

## Verification Scripts

### gate-check

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | GATE CHECK phase (after `signal-complete`) |
| **Mandatory** | YES - Blocking |
| **Actor** | System (Orchestrator-initiated) |

**Purpose**: Deterministic verification after implementor signals.

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

**Success Criteria**:
- All required files exist
- Build succeeds with zero errors
- All tests pass
- Static analysis passes

**What Gate Check DOES NOT Do**:
- Semantic verification
- Hidden criteria evaluation
- Judgment calls

---

### verification-audit

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | VERIFY phase (after `gate-check` passes) |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |

**Purpose**: Execute hidden verification criteria.

**Inputs**:
- Task ID
- Hidden verification criteria

**Actions**:
1. Load hidden criteria for task
2. Execute each criterion:
   - File existence checks
   - Content validation checks
   - Structural checks
   - Behavioral checks
   - Custom checks
3. Record results

**Outputs**:
- Verification results (pass/fail per criterion)
- `.orchestra/artifacts/task-{id}/verification.yaml`

**Criteria Types**:

| Type | Description |
|------|-------------|
| `file_exists` | File exists at path |
| `file_not_exists` | File should not exist |
| `content_contains` | File contains text |
| `content_matches` | File matches regex |
| `export_exists` | Module exports symbol |
| `function_signature` | Function has signature |
| `test_exists` | Test file exists for source |
| `test_covers` | Test covers functionality |
| `no_forbidden_patterns` | No forbidden code patterns |
| `custom` | Custom verification script |

---

### accept-signal-check

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | VERIFY → COMPLETE transition |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |

**Purpose**: Final acceptance check before marking task complete.

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
- Updated `progress.yaml`
- `.orchestra/artifacts/task-{id}/summary.md`
- Task marked complete

---

## Failure Handling Scripts

### generate-feedback

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | On GATE CHECK or VERIFY failure |
| **Mandatory** | YES - On failure path |
| **Actor** | Orchestrator |

**Purpose**: Create feedback for implementor after failure.

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

**Critical Constraint**: Feedback must tell implementor **what went wrong** without revealing **how it was detected**.

**Examples**:
- ✅ "The configuration loader does not handle missing files correctly"
- ❌ "The test `config.test.ts:45` which checks missing file handling failed"

---

### escalate-failure

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | After max retries exceeded |
| **Mandatory** | YES - On persistent failure |
| **Actor** | Orchestrator |

**Purpose**: Escalate persistent failures to human supervisor.

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
- `.orchestra/artifacts/task-{id}/escalation-report.md`
- Updated `progress.yaml` (status: `escalated`)

**Escalation Triggers**:
- Max attempts exceeded (default: 3)
- Same error twice consecutively
- Implementor requests help
- Orchestrator cannot proceed

---

## Utility Scripts

### task-closeout-check

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | COMPLETE → next task PREPARE transition |
| **Mandatory** | YES - Blocking |
| **Actor** | Orchestrator |

**Purpose**: Verify clean state before moving to next task.

**Inputs**: Previous task ID (optional)

**Actions**:
1. Verify no uncommitted changes
2. Verify no pending signals
3. Verify previous task properly closed
4. Verify progress state is consistent

**Outputs**: Closeout result (pass/fail) with issues list

**Success Criteria**:
- Git working directory clean
- No orphaned signals
- Progress state consistent
- Ready for next task

---

### environment-check

| Attribute | Value |
|-----------|-------|
| **Lifecycle Position** | Sprint initialization (recommended) |
| **Mandatory** | NO - Recommended |
| **Actor** | Human / Orchestrator |

**Purpose**: Verify development environment is correctly configured.

**Actions**:
1. Verify required tools installed
2. Verify correct versions
3. Verify project builds
4. Verify tests can run

**Outputs**: Environment check results with missing/incorrect items list

---

## Script Design Principles

### 1. All Hard Failures

No soft warnings. Every check is either PASS or FAIL, and FAIL means exit code 1.

```
# BAD: Warning that can be ignored
Write-Warning "Task might not be complete"

# GOOD: Hard failure
Write-Error "Task is not complete: missing screenshot"
exit 1
```

### 2. Artifacts Prove Execution

Claims require proof. Scripts create artifacts, orchestrator verifies artifacts exist.

### 3. Descriptive Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| `0` | Success |
| `1` | Check failed (actionable) |
| `2` | Configuration error |
| `3` | Verification failed |
| `4` | Git error |

### 4. Environment Dependency

All scripts require environment setup first.

---

## What Happens If a Script Is Skipped?

| Skipped Script | Consequence |
|----------------|-------------|
| `sprint-init` | No manifest, nothing can run |
| `prepare-handover` | Implementor has no instructions |
| `validate-handover` | Verification criteria may leak |
| `validate-verification-paths` | Verification fails with wrong paths, implementor wastes time fixing "correct" code |
| `signal-complete` | Task stuck in IMPLEMENT forever |
| `gate-check` | Broken code may reach verification |
| `verification-audit` | Implementation theater passes undetected |
| `accept-signal-check` | Incomplete tasks marked complete |
| `task-closeout-check` | Dirty state pollutes next task |
| `generate-feedback` | Implementor has no guidance for retry |
| `escalate-failure` | Failed task blocks sprint silently |

````
