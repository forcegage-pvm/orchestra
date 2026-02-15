# Tool Contract: list_test_suites

**Version**: 1.0.0 | **Category**: testing | **Roles**: implementor, orchestrator, controller

## Tool Registration

```typescript
{
  name: "list_test_suites",
  description: "Discover test suites, files, and individual tests in the workspace. "
    + "Drill down from tier summary → file listing → individual test names. "
    + "Helps agents make informed scoping decisions before running tests.",
  tags: ["testing", "discovery"],
}
```

## Input Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "detail": {
      "type": "string",
      "description": "Detail level: 'suites' (tier overview), 'files' (file listing in a tier), 'tests' (test names in a file). Default: 'suites'.",
      "enum": ["suites", "files", "tests"],
      "default": "suites"
    },
    "tier": {
      "type": "string",
      "description": "Tier name to drill into. Required for 'files' and 'tests' detail levels."
    },
    "file": {
      "type": "string",
      "description": "File path to drill into. Required for 'tests' detail level."
    }
  },
  "required": []
}
```

## Output Format

### Success — Suites Overview

```
✓ list_test_suites [detail=suites]

Test Suites:
  red          2 files   ~8 tests    (inverted assertions)
  unit        92 files  ~1,200 tests
  integration 43 files   ~600 tests  (timeout: 60s)

Total: 137 files, ~1,808 tests across 3 configured tiers
```

### Success — File Listing

```
✓ list_test_suites [detail=files, tier=unit]

Files in "unit" tier (92 files):
  test/unit/core/yaml.test.ts           12 tests
  test/unit/core/templates.test.ts      18 tests
  test/unit/core/config.test.ts          8 tests
  test/unit/db/migrations.test.ts       25 tests
  test/unit/db/queries.test.ts          14 tests
  ... (87 more)

Total: 92 files, ~1,200 tests
```

### Success — Test Names

```
✓ list_test_suites [detail=tests, file=test/unit/core/yaml.test.ts]

Tests in test/unit/core/yaml.test.ts (12 tests):
  L5   describe "readYaml"
  L12    it "should read valid yaml"
  L20    it "should validate schema"
  L35    it "should handle missing file"
  L48    it "should handle parse errors"
  L60  describe "writeYaml"
  L65    it "should write valid yaml"
  L78    it "should create directory"
  L90    it "should preserve comments"
  L102 describe "parseYaml"
  L105   it "should parse basic types"
  L115   it "should reject invalid"
  L125   it "should handle large files" (skipped)
```

### Error — Tier Not Configured

```
✗ list_test_suites: TIER_NOT_CONFIGURED
  Tier "e2e" is not declared in .agent-test-config.json.
  Available tiers: red, unit, integration.
```

### Error — File Not Found

```
✗ list_test_suites: FILE_NOT_FOUND
  File "test/unit/core/missing.test.ts" not found.
```

### Error — Config Missing

```
✗ list_test_suites: CONFIG_NOT_FOUND
  No .agent-test-config.json found in workspace root.
  Create one to declare your test tiers. See migration guide for setup instructions.
```

## Validation Rules

1. `detail` defaults to "suites"
2. `detail = "files"` requires `tier` to be specified and declared in config
3. `detail = "tests"` requires both `tier` and `file` to be specified
4. `file` must exist as a test file within the declared tier

## Side Effects

- Reads filesystem to discover test files (glob matching)
- For "tests" detail: parses test file AST to extract test names and line numbers
- No state mutations
