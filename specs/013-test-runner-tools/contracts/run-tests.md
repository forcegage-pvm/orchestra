# Tool Contract: run_tests

**Version**: 1.0.0 | **Category**: testing | **Roles**: implementor, orchestrator, controller

## Tool Registration

```typescript
{
  name: "run_tests",
  description: "Execute tests with intelligent scoping, caching, and compressed output. "
    + "Supports scoped execution (file, pattern, suite, related, red, failed, all), "
    + "fingerprint-based result caching, and TDD red-phase isolation with inverted assertions.",
  tags: ["testing", "tdd", "execution"],
}
```

## Input Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "description": "Scope of test execution: 'file' (single file), 'pattern' (name regex), 'suite' (tier name), 'related' (changed-file deps), 'red' (TDD failing), 'failed' (re-run failures), 'all' (full suite excluding red)",
      "enum": ["file", "pattern", "suite", "related", "red", "failed", "all"]
    },
    "target": {
      "type": "string",
      "description": "Scope-dependent target: file path for 'file', regex for 'pattern', tier name for 'suite'. Ignored for 'related', 'red', 'failed', 'all'."
    },
    "change_source": {
      "type": "string",
      "description": "Change detection source for 'related' scope: 'working-tree' (git diff), 'commit-range', 'file-list'.",
      "enum": ["working-tree", "commit-range", "file-list"]
    },
    "commit_range": {
      "type": "string",
      "description": "Git commit range for 'commit-range' change source, e.g., 'abc123..def456'."
    },
    "file_list": {
      "type": "string",
      "description": "Comma-separated file paths for 'file-list' change source."
    },
    "working_dir": {
      "type": "string",
      "description": "Working directory override (relative to workspace root). Defaults to config or workspace root."
    },
    "force": {
      "type": "boolean",
      "description": "Bypass fingerprint cache and force re-execution. Default: false."
    },
    "timeout": {
      "type": "number",
      "description": "Timeout override in milliseconds for this run."
    },
    "max_failure_lines": {
      "type": "number",
      "description": "Maximum failure detail lines per test. Default: 20."
    }
  },
  "required": ["scope"]
}
```

## Output Format

### Success — Tests Passed (scope: "file")

```
✓ run_tests [scope=file, target=test/unit/core/yaml.test.ts]

PASS | 12 passed, 0 failed, 0 skipped | 1.2s
Fingerprint: a3f8c2...e7d1 (15 files)
```

### Success — Tests Failed (scope: "suite")

```
✓ run_tests [scope=suite, target=unit]

FAIL | 45 passed, 3 failed, 1 skipped | 4.8s

Failures:
  ✗ core/yaml > readYaml > should validate schema
    test/unit/core/yaml.test.ts:42
    Expected: { valid: true }
    Actual:   { valid: false, errors: ["missing field"] }

  ✗ core/templates > renderTemplate > should handle missing vars
    test/unit/core/templates.test.ts:88
    Error: Template variable 'name' not found
    Stack: templates.ts:120 → renderTemplate

  ✗ db/migrations > v17 > should add amendments table
    test/unit/db/migrations.test.ts:201
    Error: table amendments already exists

Fingerprint: b2e9d1...f4a8 (92 files)
```

### Success — Cached Result

```
✓ run_tests [scope=file, target=test/unit/core/yaml.test.ts] (cached)

PASS | 12 passed, 0 failed, 0 skipped | 0ms (cached at 2026-02-09T14:30:00Z)
Fingerprint: a3f8c2...e7d1 (15 files) — unchanged
```

### Success — Related Scope with Selection Metadata

```
✓ run_tests [scope=related, change_source=working-tree]

PASS | 28 passed, 0 failed, 0 skipped | 3.1s

Selected 5 test files from 2 changed source files:
  src/core/yaml.ts →
    test/unit/core/yaml.test.ts (direct, depth=0)
    test/unit/core/config.test.ts (transitive, depth=1)
    test/integration/config-loading.test.ts (transitive, depth=2)
  src/core/templates.ts →
    test/unit/core/templates.test.ts (direct, depth=0)
    test/unit/core/handover.test.ts (transitive, depth=1)

Fingerprint: c1d4e5...a9b2 (28 files)
```

### Success — Red-Phase (TDD)

```
✓ run_tests [scope=red]

RED PHASE | 3 correctly failing, 1 unexpectedly passing | 0.8s

Correctly failing (expected):
  ✓ red/unit/new-feature.test.ts — 2 tests failing as expected
  ✓ red/integration/api-endpoint.test.ts — 1 test failing as expected

Unexpectedly passing (problem):
  ✗ red/unit/trivial-check.test.ts — 1 test passes (test may not be specific enough)

Promotion: NOT READY — 1 test unexpectedly passing
```

### Error — Concurrent Run Rejected

```
✗ run_tests: TEST_RUN_IN_PROGRESS
  A test run is already executing (scope=suite, target=unit).
  Wait for it to complete before starting another.
```

### Error — Tier Not Configured

```
✗ run_tests: TIER_NOT_CONFIGURED
  Tier "e2e" is not declared in .agent-test-config.json.
  Available tiers: red, unit, integration.
  Add it to .agent-test-config.json to enable.
```

### Error — No Changes Detected (Related Scope)

```
✗ run_tests: NO_CHANGES_DETECTED
  No changes found in working tree. No tests to run.
  Suggestion: Use scope "suite" or "all" to run tests regardless of changes,
  or use change_source "file-list" with explicit files.
```

## Validation Rules

1. `scope` is required
2. `scope = "file"` requires `target` (file path)
3. `scope = "pattern"` requires `target` (regex string)
4. `scope = "suite"` requires `target` (tier name, must be declared in config)
5. `scope = "related"` requires `change_source` (defaults to "working-tree")
6. `scope = "related"` + `change_source = "commit-range"` requires `commit_range`
7. `scope = "related"` + `change_source = "file-list"` requires `file_list`
8. `timeout` must be positive integer if provided
9. `max_failure_lines` must be positive integer if provided

## Side Effects

- Spawns `vitest run` child process (synchronous, blocks until complete)
- Reads file contents for fingerprint computation
- Stores results in in-memory `TestResultStore`
- Records failed test names for potential "failed" scope re-runs
