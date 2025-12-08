# Verification Protocol

> **Navigation**: [Index](../readme.md) | **Prev**: [Task Lifecycle](task-lifecycle.md) | **Next**: [Visual Verification](visual-verification.md)
>
> Aligned with Orchestra Bible v0.7.0 - Section 7 (Task Lifecycle) and Section 9 (Verification Criteria)

---

## Overview

Verification is the critical process where the Orchestrator validates the Implementor's work against defined criteria. This document describes the complete verification procedure including script execution, check types, and result handling.

## Principles

### 1. Hidden Criteria

Verification criteria are defined BEFORE implementation and stored in Orchestrator-only areas. This prevents:
- Gaming metrics (Goodhart's Law)
- Optimizing for checks rather than correctness
- Shallow implementations that pass obvious tests

### 2. Immutable Severity

Severity levels are set when criteria are created, NOT during verification. The Orchestrator cannot rationalize failures as "minor" to avoid rework.

### 3. Evidence-Based

Every check must produce evidence. "I ran the tests" is not enough; test output must be captured and reviewed.

### 4. Systematic Execution

All checks must be executed in order. Skipping checks is a process violation, even if the task "looks complete."

### 5. Schema-Enforced Criteria

Verification YAML must conform to a strict schema. This is enforced during `orchestra prepare --finalize`:

**Valid Check Types**:
- `file_exists` - Verify file exists at path
- `dir_exists` - Verify directory exists
- `pattern_match` - Verify pattern exists in file
- `command` - Run command and check exit code
- `screenshot_exists` - Verify screenshot file exists
- `json_valid` - Verify JSON file is valid
- `yaml_valid` - Verify YAML file is valid
- `export_exists` - Verify export exists in module

**Valid Severities**:
- `critical` - Task fails if check fails
- `warning` - Task passes with warning
- `info` - Informational only

> **Schema Validation**: Invalid types (e.g., `structural`) or severities (e.g., `BLOCKING`) are rejected during finalize.
> This prevents implementation theater where verification criteria are defined but cannot be executed.

---

## Verification Workflow

### Phase 1: GATE_CHECK (Automated)

This phase runs immediately after the Implementor signals completion.

#### Step 1: Accept Signal Check

Before any verification, confirm the Implementor ran their pre-signal check.

```powershell
.orchestra/orchestrator/scripts/accept-signal-check.ps1
```

**What it checks**:
- Signal file exists: `.orchestra/implementor/signals/task-{id}-complete.signal`
- Pre-signal artifact exists and shows "PASSED"
- Artifact timestamp is from current task attempt

**If check fails**: STOP. Task cannot be verified. Implementor skipped required validation.

#### Step 2: Gate Check Execution

```powershell
.orchestra/orchestrator/scripts/gate-check.ps1
```

**What it runs**:
- Static analysis (`flutter analyze`)
- Unit tests (`flutter test`)
- Schema validation (if applicable)
- Custom automated checks per task

**Outputs**:
- `PASS`: Proceed to VERIFY phase
- `FAIL` (recoverable): Generate feedback, status → RETRY
- `FAIL` (unrecoverable): Status → ESCALATED

---

### Phase 2: VERIFY (Orchestrator Review)

This phase involves Orchestrator and/or Human review.

#### Step 3: Verification Audit

```powershell
.orchestra/orchestrator/scripts/verification-audit.ps1
```

**What it does**:
- Compiles comprehensive verification report
- Documents all automated check results
- Prepares for human review (if configured)

#### Step 4: Execute Structural Checks

Verify files exist, exports are added, existing files modified.

| Check Type | Verification Method |
|------------|---------------------|
| File exists | `Test-Path <path>` |
| File modified | `git diff --name-only` includes file |
| Export present | `Select-String -Path <barrel> -Pattern <export>` |
| Import present | `Select-String -Path <file> -Pattern <import>` |

**Document each check**:
```
CHECK: files_created (BLOCKING)
  - lib/src/models/config.dart: PASS (exists)
  - test/unit/config_test.dart: PASS (exists)
```

#### Step 5: Execute Functional Checks

Verify tests pass, analysis clean, minimum coverage met.

| Check Type | Verification Method |
|------------|---------------------|
| Tests pass | `flutter test <path>` |
| Analysis clean | `flutter analyze <path>` |
| Minimum tests | Count `test(` occurrences |
| Specific behavior | Run test, check output |

**Capture test output**:
```powershell
flutter test test/unit/multi_axis/ 2>&1 | Tee-Object -Variable testOutput
# Analyze $testOutput for pass/fail
```

#### Step 6: Execute Adversarial Checks

For critical tasks, verify implementation is genuine.

| Check Type | Verification Method |
|------------|---------------------|
| Real integration | `Select-String` for function calls |
| Not fake import | Comment out import, rebuild fails |
| Actually called | Grep for invocation, not just definition |

**Example adversarial check**:
```powershell
# Verify MultiAxisNormalizer is CALLED, not just imported
$usages = Select-String -Path "lib/src/widgets/chart.dart" -Pattern "MultiAxisNormalizer\."
if ($usages.Count -eq 0) {
    # FAIL: Imported but never called = fake integration
}
```

#### Step 7: Execute Visual Verification

For INTEGRATION and VISUAL tasks, verify screenshot content.

See [Visual Verification](visual-verification.md) for detailed procedures.

**Summary workflow**:
```
# Open screenshot in browser via Chrome DevTools MCP
mcp_chrome-devtoo_new_page(url: "file:///full/path/to/screenshot.png")

# Capture what's displayed (returns image to agent)
mcp_chrome-devtoo_take_screenshot()

# Agent analyzes image against each verification criterion
# Document findings: PASS or FAIL with observation

# Close browser page
mcp_chrome-devtoo_close_page(pageIdx: 1)
```

---

### Phase 3: Result Determination

#### Step 8: Apply Severity Rules

```
For each check:
  IF severity == BLOCKING and status == FAIL:
    Task FAILS
  IF severity == MAJOR and status == FAIL:
    Task FAILS
  IF severity == MINOR and status == FAIL:
    Task PASSES with note
  IF severity == INFO and status == FAIL:
    Task PASSES
```

**Task PASSES if**: All BLOCKING and MAJOR checks pass.

**Task FAILS if**: ANY BLOCKING or MAJOR check fails.

#### Step 9: Document Results

Create verification results document:

```markdown
# Verification Results: Task N

**Date**: YYYY-MM-DD
**Attempt**: N
**Result**: [PASSED | FAILED]

## Structural Checks
| ID | Description | Severity | Status | Evidence |
|----|-------------|----------|--------|----------|
| files_created | Files exist | BLOCKING | PASS | Test-Path confirmed |

## Functional Checks
| ID | Description | Severity | Status | Evidence |
|----|-------------|----------|--------|----------|
| tests_pass | Tests pass | BLOCKING | PASS | 25/25 tests passed |

## Adversarial Checks
| ID | Description | Severity | Status | Evidence |
|----|-------------|----------|--------|----------|
| real_integration | Code is called | BLOCKING | PASS | 7 usages found |

## Visual Verification
| Criterion | Status | Observation |
|-----------|--------|-------------|
| Multiple axes visible | PASS | Left and right axes present |
| Series span full height | FAIL | Volume series compressed |

## Decision
**FAILED**: Visual criterion "Series span full height" not met (MAJOR).

## Feedback for Retry
[Specific instructions for implementor to fix the issue]
```

---

### Phase 4: Result Handling

#### If PASSED (→ COMPLETE)

1. Run task closeout check:
   ```powershell
   .orchestra/orchestrator/scripts/task-closeout-check.ps1
   ```
2. Archive task artifacts to `.orchestra/artifacts/`
3. Update manifest: status → COMPLETE
4. Clear handover for next task
5. Proceed to next PENDING task

#### If FAILED (→ RETRY or ESCALATED)

1. Check retry count against max_retries (default: 3)
2. If count < max:
   - Generate feedback:
     ```powershell
     .orchestra/orchestrator/scripts/generate-feedback.ps1
     ```
   - Update manifest: status → RETRY, increment retry_count
   - Implementor addresses feedback and re-signals
3. If count >= max:
   - Escalate:
     ```powershell
     .orchestra/orchestrator/scripts/escalate-failure.ps1
     ```
   - Update manifest: status → ESCALATED
   - Human intervention required

---

## Severity Levels

| Level | When to Use | On Failure |
|-------|-------------|------------|
| BLOCKING | Fundamental requirement that makes feature non-functional | Task FAILS immediately |
| MAJOR | Significant quality issue that should not ship | Task FAILS |
| MINOR | Small issue that can be fixed later | Task PASSES, logged for follow-up |
| INFO | Observation or style preference | Task PASSES |

### Severity Examples

| Check | Severity | Rationale |
|-------|----------|-----------|
| File doesn't exist | BLOCKING | Can't function without it |
| Tests fail | BLOCKING | Code is broken |
| Static analysis errors | BLOCKING | Won't compile in strict mode |
| Minimum tests not met | MAJOR | Quality below standard |
| Duplicate logic instead of using utility | MAJOR | Technical debt |
| Missing doc comment | MINOR | Can add later |
| Verbose implementation | INFO | Style preference |

---

## Script Execution Matrix

| Script | Phase | Required | Purpose |
|--------|-------|----------|---------|
| `accept-signal-check.ps1` | GATE_CHECK | ✅ | Validate signal file exists |
| `gate-check.ps1` | GATE_CHECK | ✅ | Run automated verification |
| `verification-audit.ps1` | VERIFY | ✅ | Compile verification report |
| `generate-feedback.ps1` | On Failure | ✅ | Create feedback for retry |
| `escalate-failure.ps1` | On Escalation | ✅ | Flag for human intervention |
| `task-closeout-check.ps1` | COMPLETE | ✅ | Verify ready for archive |

---

## Anti-Patterns to Avoid

### 1. Verifying from Memory

**Wrong**: "I remember the criteria, let me check..."
**Right**: Read verification criteria from file before every verification

### 2. Downgrading Severity

**Wrong**: "This MAJOR failure is really just a MINOR issue..."
**Right**: Severity is immutable. MAJOR = task fails.

### 3. Skipping Visual Verification

**Wrong**: "Screenshot exists, good enough"
**Right**: View screenshot via Chrome DevTools MCP, check each criterion

### 4. Partial Check Execution

**Wrong**: "Tests pass, I'll skip the adversarial checks"
**Right**: Execute ALL checks defined for the task

### 5. No Evidence

**Wrong**: "Tests passed" (no output)
**Right**: Captured output showing "25/25 tests passed"

---

## Verification Checklist

Before marking task as PASSED:

- [ ] Accept-signal-check passed (signal file exists)
- [ ] Gate-check passed (automated tests/analysis)
- [ ] Verification-audit completed (report generated)
- [ ] All structural checks executed with evidence
- [ ] All functional checks executed with evidence
- [ ] All adversarial checks executed with evidence
- [ ] Visual verification completed (if required)
  - [ ] Screenshot viewed via Chrome DevTools MCP
  - [ ] Each criterion checked and documented
  - [ ] Observations recorded
- [ ] Verification results document created
- [ ] No BLOCKING or MAJOR failures
- [ ] Task-closeout-check passed

---

*Verification is the quality gate that prevents "implementation theater." Follow this protocol rigorously to ensure genuine functionality.*
