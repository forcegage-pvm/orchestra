# Tool Contract: get_test_results

**Version**: 1.0.0 | **Category**: testing | **Roles**: implementor, orchestrator, controller

## Tool Registration

```typescript
{
  name: "get_test_results",
  description: "Retrieve and re-format results from the most recent test run "
    + "without re-executing tests. Supports multiple output formats "
    + "(summary, failures, full, structured) and filtering by status or name pattern.",
  tags: ["testing", "results"],
}
```

## Input Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "format": {
      "type": "string",
      "description": "Output format: 'summary' (one-line), 'failures' (summary + failure details), 'full' (all tests), 'structured' (JSON data). Default: 'summary'.",
      "enum": ["summary", "failures", "full", "structured"],
      "default": "summary"
    },
    "status": {
      "type": "string",
      "description": "Filter to tests with this status only.",
      "enum": ["passed", "failed", "skipped"]
    },
    "name_filter": {
      "type": "string",
      "description": "Regex to filter test names. Only matching tests are included."
    },
    "run_id": {
      "type": "string",
      "description": "Specific run ID to retrieve. Defaults to the most recent run."
    }
  },
  "required": []
}
```

## Output Format

### Success — Summary Format

```
✓ get_test_results [format=summary]

Last run (2026-02-09T14:30:00Z): PASS | 45 passed, 0 failed, 1 skipped | 4.8s
Scope: suite/unit | Fingerprint: b2e9d1...f4a8
```

### Success — Failures Format

```
✓ get_test_results [format=failures]

Last run (2026-02-09T14:30:00Z): FAIL | 45 passed, 3 failed, 1 skipped | 4.8s

Failures:
  ✗ core/yaml > readYaml > should validate schema
    test/unit/core/yaml.test.ts:42
    Expected: { valid: true }
    Actual:   { valid: false, errors: ["missing field"] }

  ✗ core/templates > renderTemplate > should handle missing vars
    test/unit/core/templates.test.ts:88
    Error: Template variable 'name' not found

  ✗ db/migrations > v17 > should add amendments table
    test/unit/db/migrations.test.ts:201
    Error: table amendments already exists
```

### Success — Full Format (with name filter)

```
✓ get_test_results [format=full, name_filter=yaml]

Filtered 8 of 49 tests matching "yaml":
  ✓ core/yaml > readYaml > should read valid yaml         (12ms)
  ✓ core/yaml > readYaml > should validate schema         (8ms)
  ✓ core/yaml > readYaml > should handle missing file     (3ms)
  ✓ core/yaml > writeYaml > should write valid yaml       (5ms)
  ✓ core/yaml > writeYaml > should create directory       (7ms)
  ✗ core/yaml > parseYaml > should reject invalid         (2ms)
  ○ core/yaml > parseYaml > should handle large files     (skipped)
  ✓ config > loadConfig > should use yaml parser          (15ms)
```

### Success — Structured Format

```
✓ get_test_results [format=structured]

{
  "runId": "run-a3f8c2",
  "scope": "suite",
  "target": "unit",
  "timestamp": "2026-02-09T14:30:00Z",
  "cached": false,
  "total": 49, "passed": 45, "failed": 3, "skipped": 1,
  "duration": 4800,
  "tests": [
    { "name": "core/yaml > readYaml > should validate schema", "file": "test/unit/core/yaml.test.ts", "line": 42, "status": "failed", "duration": 8, "failure": { "message": "expected { valid: true }", "expected": "{ valid: true }", "actual": "{ valid: false }", "stack": ["yaml.ts:55"] } },
    ...
  ]
}
```

### Error — No Results Available

```
✗ get_test_results: NO_OUTPUT
  No test results available. Run tests first using the run_tests tool.
```

### Error — Run ID Not Found

```
✗ get_test_results: INVALID_INPUT
  Run ID "run-xyz123" not found. Use without run_id to get the most recent results.
```

## Validation Rules

1. No required parameters (all optional with defaults)
2. `format` defaults to "summary"
3. `name_filter` must be a valid JavaScript regex if provided
4. `run_id` must match an existing run in the `TestResultStore`

## Side Effects

- None (read-only access to `TestResultStore`)
