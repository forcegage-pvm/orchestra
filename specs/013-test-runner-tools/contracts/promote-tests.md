# Tool Contract: promote_tests

**Version**: 1.0.0 | **Category**: testing | **Roles**: implementor, orchestrator

## Tool Registration

```typescript
{
  name: "promote_tests",
  description: "Promote passing TDD red-phase tests into standard test tier directories. "
    + "Dry-run by default — shows what would be moved without making changes. "
    + "Uses 'git mv' to preserve version control history. "
    + "Blocks promotion of tests that are still failing.",
  tags: ["testing", "tdd", "promotion"],
}
```

## Input Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "files": {
      "type": "array",
      "items": { "type": "string" },
      "description": "File paths within the red-phase directory to promote. Paths must be workspace-relative.",
      "minItems": 1
    },
    "dry_run": {
      "type": "boolean",
      "description": "Preview mode — show what would happen without making changes. Default: true (from config)."
    }
  },
  "required": ["files"]
}
```

## Output Format

### Success — Dry Run

```
✓ promote_tests [dry_run=true]

DRY RUN — No files moved.

Would promote 2 of 3 files:
  ✓ test/red/unit/new-feature.test.ts → test/unit/new-feature.test.ts
    (2 tests, all passing)
  ✓ test/red/integration/api-endpoint.test.ts → test/integration/api-endpoint.test.ts
    (1 test, all passing)

Blocked (1 file):
  ✗ test/red/unit/edge-case.test.ts — 1 of 2 tests still failing
    Cannot promote until all tests pass.

Run again with dry_run=false to execute the promotion.
```

### Success — Actual Promotion

```
✓ promote_tests [dry_run=false]

Promoted 2 files:
  ✓ test/red/unit/new-feature.test.ts → test/unit/new-feature.test.ts
    (2 tests, git mv preserved history)
  ✓ test/red/integration/api-endpoint.test.ts → test/integration/api-endpoint.test.ts
    (1 test, git mv preserved history)

Blocked (1 file):
  ✗ test/red/unit/edge-case.test.ts — 1 of 2 tests still failing

Summary: 2 promoted, 1 blocked. Run red-phase tests again after fixing edge-case.test.ts.
```

### Error — All Tests Still Failing

```
✗ promote_tests: PROMOTION_BLOCKED
  All specified files have failing tests and cannot be promoted.
  Run tests with scope "red" to see current failure status.
```

### Error — Destination Conflict

```
✗ promote_tests: FILE_EXISTS
  Destination file already exists:
    test/unit/new-feature.test.ts
  Resolve the conflict manually before promoting.
```

### Error — File Not in Red Directory

```
✗ promote_tests: INVALID_INPUT
  File "test/unit/existing.test.ts" is not in the red-phase directory.
  Only files in the configured red tier path can be promoted.
```

### Error — File Missing

```
✗ promote_tests: FILE_NOT_FOUND
  File "test/red/unit/deleted.test.ts" not found.
  It may have been deleted or renamed since the last red-phase run.
```

## Destination Inference

The destination tier and path are inferred from the subdirectory structure within the red directory:

```
Red directory:    test/red/
File location:    test/red/unit/feature.test.ts
                         ^^^^
Inferred tier:    unit
Destination:      test/unit/feature.test.ts
```

For nested subdirectories:

```
Red directory:    test/red/
File location:    test/red/integration/api/users.test.ts
                         ^^^^^^^^^^^
Inferred tier:    integration
Destination:      test/integration/api/users.test.ts
```

The inferred tier must match a declared tier in `.agent-test-config.json`. If no matching tier is found, the promotion is blocked with an explanation.

## Validation Rules

1. `files` is required and must contain at least one path
2. All files must be within the red-phase directory
3. All files must exist on disk
4. All tests in a file must be passing before promotion (verified against last red-phase run)
5. Destination path must not already exist
6. Inferred tier must be declared in config
7. `dry_run` defaults to the config value (true by default)

## Side Effects

- **Dry run (default)**: None — read-only analysis
- **Actual promotion**: Executes `git mv` for each file, modifying the working tree and git index
- Invalidates affected cache entries in `TestResultStore`
