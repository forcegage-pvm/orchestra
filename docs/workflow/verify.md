# Verify Task

> **Phase**: VERIFY  
> **CLI Command**: `orchestra verify`  
> **Source**: [src/commands/verify.ts](../../src/commands/verify.ts)

---

## Index

- [Overview](#overview)
- [Purpose](#purpose)
- [Philosophy](#philosophy)
- [Actions](#actions)
- [Execution Sequence](#execution-sequence)
- [Agent Process](#agent-process)
- [CLI Command](#cli-command)
- [Input](#input)
- [File Impact](#file-impact)
- [Verification Check Types](#verification-check-types)
- [Severity Levels](#severity-levels)
- [Visual Verification](#visual-verification)
- [Git Actions](#git-actions)
- [Outcome](#outcome)
- [Next Step](#next-step)
- [Evidence Produced](#evidence-produced)
- [Implementation Reference](#implementation-reference)
- [Troubleshooting](#troubleshooting)
- [Version History](#version-history)

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Phase** | VERIFY |
| **Role** | Orchestrator Agent |
| **Trigger** | After `orchestra accept-signal` passes |
| **Preconditions** | Signal accepted; verification criteria exist |

---

## Purpose

Execute verification checks against the implementor's work using hidden criteria. This is **Steps 2-4** of Task Verification.

This step:

1. **Loads verification criteria** - Read hidden checks from orchestrator-only area
2. **Executes all checks** - File exists, pattern match, commands, etc.
3. **Aggregates results** - By severity level (BLOCKING/MAJOR/MINOR/INFO)
4. **Produces report** - Detailed verification results with evidence
5. **Determines outcome** - PASS or FAIL based on severity rules

The orchestrator **now reads the hidden criteria** that were defined before implementation.

---

## Philosophy

Verify is the **accountability phase** - objectively testing implementation against predefined criteria.

### Why This Matters

Verification criteria were written BEFORE the implementor saw the task. This means:
- Criteria cannot be gamed
- Severity cannot be rationalized
- Checks are systematic, not subjective

### Hidden Criteria Principle

| What Happens | When |
|--------------|------|
| Criteria defined | During `orchestra prepare` (Step 4) |
| Criteria visible to | Orchestrator only (never implementor) |
| Criteria read | NOW - during verification |
| Criteria changed | NEVER - immutable once created |

### Evidence-Based Verification

Every check must produce evidence:

| Anti-Pattern | Correct Approach |
|--------------|------------------|
| "I ran the tests" | Captured output: "25/25 tests passed" |
| "File exists" | `Test-Path confirmed: path/to/file.ts` |
| "Looks correct" | Pattern match evidence: "class YAxisConfig found" |

### Immutable Severity

**CRITICAL**: Severity levels are set when criteria are created, NOT during verification.

The orchestrator **cannot**:
- Downgrade MAJOR to MINOR to avoid rework
- Skip checks because "it looks complete"
- Rationalize failures as "edge cases"

### Anti-Patterns This Prevents

| Anti-Pattern | How Verify Prevents It |
|--------------|------------------------|
| Verifying from memory | Criteria loaded from file every time |
| Downgrading severity | Severity is immutable - set at creation, not verification |
| Skipping visual verification | Visual tasks require Chrome DevTools MCP review |
| Partial check execution | All checks must execute (unless `--continue-on-error`) |
| No evidence | Check results include captured output and details |

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|---------|
| A-VER-01 | Run verification | `orchestra verify` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-VER-02 | Orchestrator | Review verification report |
| A-VER-03 | Orchestrator | Document observations |
| A-VER-04 | Orchestrator | Visual verification (if required) |
| A-VER-05 | Orchestrator | Determine task outcome |

### Conditional Actions

| ID | Condition | Action |
|----|-----------|--------|
| A-VER-06 | All checks PASS | Proceed to `orchestra complete` |
| A-VER-07 | BLOCKING/MAJOR FAIL | Proceed to `orchestra feedback` |
| A-VER-08 | Visual task | Perform visual verification (A-VER-04) |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-VER-01 | CLI | `orchestra verify` |
| 2 | A-VER-02 | Agent | Review verification report |
| 3 | A-VER-08 | Conditional | Visual verification (if VISUAL/INTEGRATION task) |
| 4 | A-VER-03 | Agent | Document observations |
| 5 | A-VER-05 | Agent | Determine task outcome |
| 6a | A-VER-06 | Flow | If PASS → `orchestra complete` |
| 6b | A-VER-07 | Flow | If FAIL → `orchestra feedback` |

---

## Agent Process

The orchestrator agent executes verification checks against hidden criteria.

### A-VER-01: Run Verification Command

After accept-signal passes, run verification:

```bash
orchestra verify
```

Expected output (success):

```
Verification Report
────────────────────────────────────────────────────────────────
Task: 3 - Create YAxisConfig Model
Timestamp: 2025-12-01T14:30:00Z
Duration: 2500ms

Accept-Signal:
  ✓ Accepted

Checks Summary:
  Total:   6
  Passed:  6
  Failed:  0

Check Results:
  ✓ [V3.1] [CRITICAL] File exists
  ✓ [V3.2] [CRITICAL] Class defined
  ✓ [V3.3] [WARNING] Tests exist
  ✓ [V3.4] [CRITICAL] Tests pass
  ✓ [V3.5] [WARNING] Analyzer clean
  ✓ [V3.6] [INFO] Documentation

────────────────────────────────────────────────────────────────
✓ All verification checks passed!
Next: Run 'orchestra complete' to complete the task
```

### A-VER-02: Review Verification Report

Examine each check result:

1. **Verify all checks ran** - No skipped checks
2. **Review failed checks** - Understand what failed and why
3. **Check evidence** - Command output, file paths, patterns matched

For verbose output showing full details:

```bash
orchestra verify --verbose
```

### A-VER-04: Visual Verification (VISUAL/INTEGRATION Tasks)

For tasks with `category: VISUAL` or `category: INTEGRATION`, additional manual verification is required.

**Why visual verification exists**:
> **Discovered 2025-12-01**: Orchestrator verified screenshot EXISTS but not CONTENT. Human caught visual bug that would have slipped through.

#### Step 1: Check Screenshot Exists

```bash
# Verify screenshot was created
Test-Path ".orchestra/orchestrator/results/screenshots/task-003-*.png"
```

#### Step 2: View Screenshot Content

Use Chrome DevTools MCP to actually SEE the screenshot:

```
mcp_chrome-devtoo_new_page(url: "file:///E:/path/to/screenshot.png")
mcp_chrome-devtoo_take_screenshot()
```

The returned image is now in your context - analyze it!

#### Step 3: Check Each Visual Criterion

Read the verification YAML for visual criteria:

```yaml
# From verification/task-003.yaml
screenshot:
  verify:
    - "Chart displays with multiple Y-axes (left and right)"
    - "Each axis has distinct color matching its series"
    - "All series use full vertical space despite different ranges"
    - "Axis labels show original values (not normalized 0-1)"
```

For each criterion, document:

| Criterion | Status | Observation |
|-----------|--------|-------------|
| Multiple Y-axes visible | ✅ PASS | Left and right axes clearly visible |
| Distinct colors | ✅ PASS | Left=blue, Right=red |
| Full vertical space | ❌ FAIL | Stock series compressed to top 20% |
| Original values | ✅ PASS | Labels show 100, 150, 200 (not 0-1) |

#### Step 4: Close Browser

```
mcp_chrome-devtoo_close_page(pageIdx: 1)
```

### A-VER-05: Determine Task Outcome

Apply severity rules to determine outcome:

| Condition | Result |
|-----------|--------|
| All BLOCKING and MAJOR pass | **PASSED** |
| ANY BLOCKING fails | **FAILED** |
| ANY MAJOR fails | **FAILED** |
| Only MINOR fails | **PASSED** with notes |
| Only INFO fails | **PASSED** |

### A-VER-06: Task PASSED - Proceed to Complete

If all checks pass:

```bash
orchestra complete
```

See [complete.md](complete.md) for next steps.

### A-VER-07: Task FAILED - Generate Feedback

If any BLOCKING or MAJOR checks fail:

```bash
orchestra feedback
```

See [feedback.md](feedback.md) for next steps.

---

## CLI Command

### `orchestra verify`

Run verification checks for a task.

```bash
orchestra verify [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-t, --task <id>` | INT | current | Task ID to verify |
| `-c, --check <ids...>` | STR[] | all | Specific check IDs to run |
| `--severity <level>` | STR | all | Filter by severity (critical/warning/info/all) |
| `--continue-on-error` | FLAG | false | Continue after check failure |
| `--skip-accept` | FLAG | false | Skip accept-signal check (not recommended) |
| `--dry-run` | FLAG | false | Validate paths without running checks |
| `--json` | FLAG | false | Output JSON format |
| `-v, --verbose` | FLAG | false | Show detailed check output |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | One or more checks failed |
| 2 | No task in progress |
| 3 | Verification criteria not found |
| 4 | Check execution error |

### Examples

```bash
# Verify current task
orchestra verify

# Verify specific task
orchestra verify --task 3

# Run only CRITICAL checks
orchestra verify --severity critical

# Run specific check
orchestra verify --check V3.4

# Continue after failures (run all checks)
orchestra verify --continue-on-error

# Verbose output (show command output)
orchestra verify --verbose

# Validate paths without running (dry-run)
orchestra verify --dry-run

# JSON output for scripting
orchestra verify --json

# Pipeline from accept-signal
orchestra accept-signal && orchestra verify
```

---

## Input

### Required Files

| File | Purpose | Created By |
|------|---------|------------|
| `.orchestra/handover/verification/task-{id}.yaml` | Verification criteria | `orchestra prepare` |
| `.orchestra/manifest.yaml` | Get current task/sprint | `orchestra init` |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Current task state | `orchestra prepare` |

### Verification YAML Format

```yaml
# .orchestra/handover/verification/task-003.yaml
task_id: 3
task_title: "Create YAxisConfig Model"
created_at: "2025-12-01T10:00:00Z"

checks:
  - id: "V3.1"
    type: "file_exists"
    description: "Model file exists"
    severity: "critical"
    path: "lib/src/models/y_axis_config.dart"
    
  - id: "V3.2"
    type: "pattern_match"
    description: "Class is defined"
    severity: "critical"
    file: "lib/src/models/y_axis_config.dart"
    pattern: "class YAxisConfig"
    
  - id: "V3.3"
    type: "file_exists"
    description: "Test file exists"
    severity: "warning"
    path: "test/unit/y_axis_config_test.dart"
    
  - id: "V3.4"
    type: "command"
    description: "Tests pass"
    severity: "critical"
    command: "flutter test test/unit/y_axis_config_test.dart"
    expected_exit_code: 0
    
  - id: "V3.5"
    type: "command"
    description: "Analyzer clean"
    severity: "warning"
    command: "flutter analyze lib/src/models/y_axis_config.dart"
    expected_exit_code: 0
    
  - id: "V3.6"
    type: "pattern_match"
    description: "Has documentation"
    severity: "info"
    file: "lib/src/models/y_axis_config.dart"
    pattern: "^/// "
```

### Context Required

| Input | Source | Required |
|-------|--------|----------|
| Task ID | Progress log or `--task` option | Yes |
| Verification criteria | `.orchestra/handover/verification/task-{id}.yaml` | Yes |
| Accept-signal result | From `orchestra accept-signal` | Yes (unless `--skip-accept`) |

---

## File Impact

### Read

| File | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Get current sprint ID |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Determine current task |
| `.orchestra/handover/verification/task-{id}.yaml` | Load verification criteria |
| `.orchestra/handover/verification/pre-signal.yaml` | For accept-signal check |
| Target files | Files being verified (checked for existence, patterns) |

### Written

| File | Purpose |
|------|---------|
| `.orchestra/orchestrator/results/task-{id}-verification.yaml` | Verification report |

### Created

| File | When |
|------|------|
| `.orchestra/orchestrator/results/task-{id}-verification.yaml` | On every verification run |

### Deleted

None.

---

## Verification Check Types

The verify command supports 8 check types:

| Type | Description | Required Parameters |
|------|-------------|---------------------|
| `file_exists` | Check file exists | `path` |
| `dir_exists` | Check directory exists | `path` |
| `pattern_match` | Regex search in file | `file`, `pattern` |
| `command` | Run shell command | `command`, `expected_exit_code` |
| `screenshot_exists` | Check screenshot file | `path` |
| `json_valid` | Validate JSON file | `path` |
| `yaml_valid` | Validate YAML file | `path` |
| `export_exists` | Check export in barrel file | `module`, `exports` |

### Check Type Details

#### `file_exists`

```yaml
- id: "V1"
  type: "file_exists"
  description: "Model file exists"
  severity: "critical"
  path: "lib/src/models/config.dart"
```

Checks that file exists at specified path (relative to orchestra root).

#### `dir_exists`

```yaml
- id: "V2"
  type: "dir_exists"
  description: "Test directory exists"
  severity: "warning"
  path: "test/unit/models/"
```

Checks that directory exists.

#### `pattern_match`

```yaml
- id: "V3"
  type: "pattern_match"
  description: "Class is defined"
  severity: "critical"
  file: "lib/src/models/config.dart"
  pattern: "class\\s+ConfigModel"
```

Searches for regex pattern in file content.

#### `command`

```yaml
- id: "V4"
  type: "command"
  description: "Tests pass"
  severity: "critical"
  command: "npm test -- --testPathPattern=config"
  expected_exit_code: 0
```

Runs command and checks exit code. Timeout: 120 seconds.

#### `screenshot_exists`

```yaml
- id: "V5"
  type: "screenshot_exists"
  description: "Verification screenshot exists"
  severity: "warning"
  path: "screenshots/task-003-verification.png"
```

Checks screenshot file exists and is not empty (> 1KB).

#### `json_valid`

```yaml
- id: "V6"
  type: "json_valid"
  description: "Config is valid JSON"
  severity: "critical"
  path: "config/settings.json"
```

Parses file as JSON, fails if invalid.

#### `yaml_valid`

```yaml
- id: "V7"
  type: "yaml_valid"
  description: "Manifest is valid YAML"
  severity: "critical"
  path: ".orchestra/manifest.yaml"
```

Parses file as YAML, fails if invalid.

#### `export_exists`

```yaml
- id: "V8"
  type: "export_exists"
  description: "Model is exported from barrel"
  severity: "warning"
  module: "src/core/index.ts"
  exports:
    - "ConfigModel"
    - "loadConfig"
```

Checks that named exports exist in barrel file.

---

## Severity Levels

| Level | Mapping | On Failure |
|-------|---------|------------|
| `critical` | BLOCKING | Task FAILS immediately |
| `warning` | MAJOR | Task FAILS |
| `info` | MINOR/INFO | Task PASSES, logged for follow-up |

### Severity Decision Rules

```
For each check:
  IF severity == critical AND status == FAIL:
    Task FAILS (BLOCKING)
  IF severity == warning AND status == FAIL:
    Task FAILS (MAJOR quality issue)
  IF severity == info AND status == FAIL:
    Task PASSES (observation only)
```

### Severity Examples

| Check | Severity | Rationale |
|-------|----------|-----------|
| File doesn't exist | critical | Can't function without it |
| Tests fail | critical | Code is broken |
| Static analysis errors | critical | Won't compile in strict mode |
| Minimum tests not met | warning | Quality below standard |
| Duplicate logic | warning | Technical debt |
| Missing doc comment | info | Can add later |
| Verbose implementation | info | Style preference |

---

## Visual Verification

### When Required

| Task Category | Visual Verification |
|---------------|---------------------|
| INFRASTRUCTURE | ❌ No (nothing to see) |
| INTEGRATION | ✅ Required |
| VISUAL | ✅ Required |

### Why Visual Verification Matters

**Discovered 2025-12-01**: Orchestrator verified screenshot EXISTS but not CONTENT. Human caught visual bug that would have slipped through.

```
What was checked:    ✅ File exists + ✅ File not empty
What was MISSED:     ❌ Content matches verification criteria
```

### Visual Check Workflow

1. **Screenshot exists** - Automated check via `screenshot_exists`
2. **Screenshot content** - Manual review via Chrome DevTools MCP
3. **Each criterion verified** - Document PASS/FAIL with observation
4. **Close browser** - Clean up

### What to Check

| Aspect | What to Look For |
|--------|------------------|
| Elements present | Are expected visual elements visible? |
| Colors correct | Do colors match specification? |
| Layout correct | Are elements positioned as expected? |
| Not placeholder | Is this a real screenshot (not blank/fake)? |
| Feature demonstrated | Does it show the feature being verified? |

---

## Git Actions

No git actions are required for verify. This is a read-and-report step.

Git actions happen in the NEXT step:
- If PASSED: `orchestra complete` handles git commit
- If FAILED: No git actions until fixed

---

## Outcome

### Success Path

```
✓ All checks PASSED
  → All BLOCKING checks passed
  → All MAJOR checks passed  
  → MINOR/INFO failures logged only
  → Ready to complete task
```

**Next**: Run `orchestra complete` (Step 9)

### Failure Paths

#### Failure: BLOCKING Check Failed

```
✗ Verification FAILED
  → Critical check failed
  → Cannot proceed without fix
  → Generate feedback for implementor
```

**Next**: Run `orchestra feedback` (Step 8)

#### Failure: MAJOR Check Failed

```
✗ Verification FAILED
  → Warning-level check failed
  → Quality below standard
  → Generate feedback for implementor
```

**Next**: Run `orchestra feedback` (Step 8)

#### Failure: Verification Criteria Not Found

```
✗ Error: Verification criteria not found
  → task-XXX.yaml missing
  → Orchestrator must create criteria first
```

**Action**: Run `orchestra prepare` to generate verification criteria

#### Failure: Visual Verification Failed

```
✗ Visual Verification FAILED
  → Screenshot exists but content wrong
  → Visual criteria not met
  → Document specific observation
```

**Next**: Run `orchestra feedback` with visual failure details

---

## Next Step

| Condition | Next Document | Command |
|-----------|---------------|---------|
| All checks PASS | [complete.md](complete.md) | `orchestra complete` |
| BLOCKING/MAJOR FAIL | [feedback.md](feedback.md) | `orchestra feedback` |
| Retry limit reached | [escalate.md](escalate.md) | `orchestra escalate` |

---

## Evidence Produced

| Evidence | Location | Purpose |
|----------|----------|---------|
| Verification report | `.orchestra/orchestrator/results/task-{id}-verification.yaml` | Complete record |
| Check results | Terminal output / `--json` | Immediate feedback |
| Command outputs | In report details | Proof of execution |
| Visual observations | Documented manually | Screenshot analysis |

### Evidence Verification

```powershell
# Check verification report was created
Test-Path ".orchestra/orchestrator/results/task-003-verification.yaml"

# View report content
Get-Content ".orchestra/orchestrator/results/task-003-verification.yaml"

# Get JSON output for audit
orchestra verify --json > verification-result.json
```

### Report Format

```yaml
# .orchestra/orchestrator/results/task-003-verification.yaml
task_id: 3
task_title: "Create YAxisConfig Model"
timestamp: "2025-12-01T14:30:00Z"
duration: 2500

accept_signal:
  passed: true
  skipped: false

checks:
  total: 6
  passed: 6
  failed: 0
  skipped: 0

results:
  - check_id: "V3.1"
    type: "file_exists"
    description: "Model file exists"
    severity: "critical"
    passed: true
    message: "File found: lib/src/models/y_axis_config.dart"
    duration: 5
    
  - check_id: "V3.4"
    type: "command"
    description: "Tests pass"
    severity: "critical"
    passed: true
    message: "Command exited with code 0"
    details:
      command: "flutter test test/unit/y_axis_config_test.dart"
      exit_code: 0
      stdout: "15 tests passed in 2.3s"
    duration: 2300

overall_passed: true
```

---

## Implementation Reference

| Component | File | Purpose |
|-----------|------|---------|
| Command | [src/commands/verify.ts](../../src/commands/verify.ts) | CLI command definition |
| Core logic | [src/core/verification.ts](../../src/core/verification.ts) | `runVerification()` function |
| Tests | [test/commands/verify.test.ts](../../test/commands/verify.test.ts) | Unit tests |
| Spec | [spec/implementation/phase-1-cli/commands/verify.md](../../spec/implementation/phase-1-cli/commands/verify.md) | Full specification |
| Protocol | [spec/04-processes/verification-protocol.md](../../spec/04-processes/verification-protocol.md) | Verification principles |

### Core Function

```typescript
// src/core/verification.ts
export async function runVerification(
  options: VerificationOptions
): Promise<VerifyResult> {
  // 1. Resolve task ID
  const taskId = await determineCurrentTask(options.taskId);
  
  // 2. Load verification YAML
  const verificationPath = path.join(
    orchestraRoot,
    ".orchestra/handover/verification",
    `task-${String(taskId).padStart(3, "0")}.yaml`
  );
  const verificationYaml = readYaml(verificationPath);
  
  // 3. Run accept-signal check (unless skipped)
  if (!options.skipAccept) {
    const signalReport = await runAcceptSignal({ task: String(taskId) });
    if (!signalReport.canVerify) {
      return { report: {...}, exitCode: 1 };
    }
  }
  
  // 4. Filter and execute checks
  for (const check of checksToRun) {
    const result = await executeCheck(check, orchestraRoot);
    results.push(result);
  }
  
  // 5. Aggregate results
  const overallPassed = failedCount === 0;
  
  // 6. Save report
  await saveVerificationReport(report, orchestraRoot);
  
  return { report, exitCode: overallPassed ? 0 : 1 };
}
```

---

## Troubleshooting

### Issue: "No task in progress"

**Cause**: No task currently has status `in_progress` in progress log.

**Solution**:
```bash
# Check current status
orchestra status

# If needed, specify task explicitly
orchestra verify --task 3
```

### Issue: "Verification criteria not found"

**Cause**: `task-XXX.yaml` doesn't exist in verification folder.

**Solution**:
```bash
# Check if file exists
Test-Path ".orchestra/handover/verification/task-003.yaml"

# If missing, orchestrator must create it
orchestra prepare --task 3
```

### Issue: "Accept signal check failed"

**Cause**: Implementor hasn't properly signaled completion.

**Solution**:
```bash
# Check accept-signal details
orchestra accept-signal --verbose

# Option: Skip accept (not recommended)
orchestra verify --skip-accept
```

### Issue: Command check times out

**Cause**: Command takes longer than 120 seconds.

**Solution**:
```bash
# Run command manually to diagnose
flutter test test/unit/

# Check for infinite loops, hanging tests
# Update verification YAML with shorter command if needed
```

### Issue: Pattern match fails unexpectedly

**Cause**: Regex pattern doesn't match actual file content.

**Solution**:
```bash
# Verify file content
Get-Content lib/src/models/config.dart

# Test regex pattern
Select-String -Path lib/src/models/config.dart -Pattern "class\s+ConfigModel"

# Update pattern in verification YAML if needed
```

### Issue: Visual verification criteria missing

**Cause**: Verification YAML doesn't include `screenshot.verify` section.

**Solution**:
1. Add visual criteria to verification YAML during prepare phase
2. Re-run prepare with `--finalize` if needed
3. Document criteria in task handover

### Issue: All checks pass but implementation is wrong

**Cause**: Verification criteria may be insufficient (adversarial checks missing).

**Solution**:
1. Add adversarial checks to verification YAML:
   - Check function is CALLED, not just imported
   - Check integration, not just file existence
   - Check behavior, not just structure
2. Re-run verification with enhanced criteria

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial creation |

---

*This is the authoritative documentation for the verify workflow step.*
