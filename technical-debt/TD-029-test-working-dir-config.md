# TD-029: Separate Test Working Directory from Source Base Directory

## Problem

The TDD auto-generation logic incorrectly uses `source_base_dir` as the working directory for test commands. This produces invalid commands for projects where:

- Source code lives in one directory (e.g., `lib/` for Flutter/Dart)
- Tests must run from a different directory (typically repository root)

**Example failure (Flutter project):**

```
Sprint environment config:
  source_base_dir: lib
  test_command: flutter test

Auto-generated TDD check:
  command: cd lib; flutter test   ❌ WRONG

Correct command:
  command: flutter test           ✅ (runs from repo root)
```

The implementor sees verification failures for correctly-implemented tests because the auto-generated command runs from the wrong directory.

## Root Cause

The TDD behavioral check generator in `prepare-task.ts` constructs commands as:

```
cd {source_base_dir}; {test_command}
```

This conflates two distinct concepts:

1. **Source base directory**: Where source files are located (for structural checks, quality checks)
2. **Test working directory**: Where test commands should execute from

For many project types these differ:

| Project Type | Source Dir         | Test Working Dir |
| ------------ | ------------------ | ---------------- |
| Flutter/Dart | `lib/`             | `.` (repo root)  |
| Monorepo     | `packages/app/src` | `packages/app`   |
| Python       | `src/`             | `.` (repo root)  |
| TypeScript   | `src/`             | `.` (repo root)  |

## Solution

### 1) Add `test_working_dir` to Sprint Environment Config

Extend the `environment` schema in `configure_sprint` to include an optional `test_working_dir`:

```typescript
environment: {
  test_command: string;        // REQUIRED - e.g., "flutter test", "npm test"
  test_file_pattern: string;   // REQUIRED - e.g., "test/**/*_test.dart"
  source_base_dir: string;     // REQUIRED - where source files live
  test_working_dir?: string;   // OPTIONAL - where to run tests from (defaults to ".")
}
```

### 2) Update TDD Check Generation

In `prepare-task.ts`, use `test_working_dir` (not `source_base_dir`) when constructing the `cd` prefix:

```typescript
// Before
const command = `cd ${source_base_dir}; ${test_command}`;

// After
const workingDir = environment.test_working_dir ?? ".";
const command =
  workingDir === "." ? test_command : `cd ${workingDir}; ${test_command}`;
```

### 3) Backward Compatibility

- If `test_working_dir` is not specified, default to `"."` (repository root)
- This maintains current behavior for TypeScript projects that already work correctly
- Existing sprints without `test_working_dir` continue to function

### 4) Documentation

Update the Orchestrator agent prompt to document the new config:

| Field              | Required | Description                         | Examples                         |
| ------------------ | -------- | ----------------------------------- | -------------------------------- |
| `test_working_dir` | No       | Working directory for test commands | `.`, `packages/app`, `extension` |

## Affected Files

- `src/mcp-server/handlers/configure-sprint.ts` - Add `test_working_dir` to environment schema
- `src/mcp-server/handlers/prepare-task.ts` - Use `test_working_dir` in TDD check generation
- `extension/agents/orchestra.orchestrator.agent.md` - Document new config option
- `src/db/migrations/` - Add column to `sprint_settings` if stored there

## Workaround (Current)

Set `source_base_dir: "."` in sprint config. This fixes test commands but may break structural/quality checks that need to find source files.

Alternatively, manually amend verification checks after `prepare_task` to remove the incorrect `cd` prefix.

## Priority

**Medium** - Causes friction for non-TypeScript projects (Flutter, Python, monorepos) but has workarounds.

## Related

- TD-023: Environment-Driven TDD Commands (partially addresses this but doesn't separate the concepts)
- TD-019: TDD Language Detection (auto-detection heuristics)

## Discovered

2026-01-23 - Reported from Flutter/Dart workspace where `cd lib; flutter test` was auto-generated incorrectly.
