# TD-023: Environment-Driven TDD Commands + Behavioral Pre-Validation

## Problem

TDD red-phase behavioral checks continue to fail due to command/path mismatches. The most common failure mode is auto-generated checks running in the wrong directory (for example, `cd extension/src; npm test`) even when the sprint explicitly declared a test command for the correct root. These failures force escalation even though the implementation is correct.

Separately, behavioral commands are not validated for existence before implementation begins. Errors like missing executables, incorrect prefixes, or invalid working directories are only discovered during VERIFY, which is too late and causes rework/escalation.

## Root Cause

1. TDD check templates hardcode commands (for example, `npm test`) and ignore sprint `environment.test_command`.
2. `prepare_task` and `configure_sprint` do not pre-validate behavioral command executability or working directory viability.
3. Non-red TDD checks assume test-name filtering is sufficient; in practice, red-phase files can fail at import/load time and must be excluded by file path.
4. Behavioral commands can reference missing npm scripts or incompatible runner flags (for example, Vitest vs Jest), which are only discovered at VERIFY time.

## Solution

### 1) Environment-driven TDD check generation

Use sprint environment settings as the single source of truth for TDD behavioral commands:

- Pass `environment.test_command` into TDD check template expansion.
- Replace hardcoded `npm test` / `flutter test` / `pytest` in templates with `{{TEST_COMMAND}}`.
- Preserve `source_base_dir` via `cd` prefix only when `test_command` does not already encode a working directory (for example, `--prefix`).
- Keep `test_file_pattern` as the source for structural checks.

Primary implementation points:

- [src/core/check-templates.ts](src/core/check-templates.ts) (add `testCommand` placeholder + substitution)
- [src/mcp-server/handlers/prepare-task.ts](src/mcp-server/handlers/prepare-task.ts#L820-L910) (pass `test_command` to templates)
- [src/mcp-server/handlers/configure-sprint.ts](src/mcp-server/handlers/configure-sprint.ts#L300-L400) (require environment when `tdd_red_phase=true`)

### 2) Pre-validate behavioral commands before IMPLEMENT

Add a pre-validation step that runs during `prepare_task` (and `update_verification`) to catch command/path issues before the task enters implementation flow.

Validation rules:

- Command is non-empty and parseable (simple tokenization; no shell execution).
- The base executable exists on PATH (use `where.exe` on Windows, `which` on POSIX, or Node resolution fallback).
- If `cd <dir>;` prefix is present, ensure the directory exists.
- If `npm --prefix <dir>` is used, ensure `<dir>` exists.
- If the command includes a workspace-relative path segment, ensure that path exists.
- For `npm run <script>` / `pnpm run <script>` / `yarn <script>`, validate the script exists in the resolved package.json.
- Detect runner type (vitest/jest/flutter/pytest) and reject known incompatible flags (for example, `--testPathIgnorePatterns` for vitest).

Behavior:

- Validation errors should block task preparation (BLOCKING) with actionable messages.
- Validation warnings (for example, unknown executable due to PATH limits in tests) should be returned in the response but not block, unless strict mode is enabled.

### 3) Non-red TDD checks must exclude red-phase files

Ensure the non-red command excludes red-phase test files when the runner loads files before applying name filters.

Sources of exclusion candidates:

- `tdd_red_registry` entries (if present)
- Red-phase file paths in `file_operations` (CREATE of test files)
- A fallback directory convention (for example, `test/tdd-red/**`) when used

Runner-specific behavior:

- Vitest: use `--exclude` with explicit file paths/globs.
- Jest: use `--testPathIgnorePatterns`.
- Flutter/Pytest: use `--exclude-tags` / `-m "not tdd_red"` (already supported).

Primary implementation points:

- [src/mcp-server/handlers/prepare-task.ts](src/mcp-server/handlers/prepare-task.ts) (behavioral check validation before insert)
- [src/mcp-server/handlers/update-verification.ts](src/mcp-server/handlers/update-verification.ts) (same validation when amending)
- [src/core/command-executor.ts](src/core/command-executor.ts) or a new `src/core/command-validation.ts` for reusable path/executable checks

## Current State

- TDD red-phase checks are generated via templates with hardcoded commands.
- Sprint environment settings are stored but not consistently used in TDD command generation.
- Behavioral commands are only validated at VERIFY time, leading to escalation loops.
- Non-red tests can fail due to red-phase file import errors before name filtering is applied.

## Scope

In scope:

- Use `environment.test_command` as the base for TDD behavioral checks.
- Enforce environment presence for TDD red-phase tasks at `configure_sprint`.
- Behavioral command pre-validation during `prepare_task` and `update_verification`.
- Runner-appropriate non-red exclusions for red-phase test files.
- Tests for command generation and validation outcomes.

Out of scope:

- Rewriting the entire pre-signal executor.
- Changing verification schema structures.
- Adding new test runners beyond current detection heuristics.

## Design Details

### A) Template Context Expansion

Add `testCommand` to template context and replace `{{TEST_COMMAND}}` placeholders during template expansion.

Context construction rules:

- Prefer sprint `environment.test_command`.
- Keep `cd` prefix only when `test_command` is not already scoped (for example, no `--prefix` or `-C`).
- Always use `environment.test_file_pattern` for structural checks.

### B) Behavioral Command Pre-Validation

Introduce a validation helper (new core module or extend `command-executor`) that analyzes commands without executing them.

Validation output shape:

- `errors`: blocking issues (missing executable, missing script, invalid directory)
- `warnings`: non-blocking issues (unknown executable on PATH in test env)

Error taxonomy (examples):

- `COMMAND_EMPTY`
- `EXECUTABLE_NOT_FOUND`
- `SCRIPT_NOT_FOUND`
- `WORKDIR_NOT_FOUND`
- `RUNNER_FLAG_INCOMPATIBLE`

### C) Non-Red Exclusions for Red-Phase Files

Create a resolver that composes exclusions from:

- `tdd_red_registry` entries
- `file_operations` test file CREATE paths
- Default convention fallback (test/tdd-red/\*\*) if no explicit inputs exist

Then map exclusions to runner-specific flags:

- Vitest: `--exclude` + glob list
- Jest: `--testPathIgnorePatterns`
- Flutter/Pytest: existing tag-based mechanisms

## Test Plan

Unit tests:

- Template expansion uses `environment.test_command`.
- `configure_sprint` rejects missing environment fields for TDD tasks.
- Command validator catches missing executables and npm scripts.
- Runner flag validation rejects incompatible flag combinations.
- Exclusion builder produces correct flags for Vitest vs Jest.

Integration tests:

- `prepare_task` injects correct behavioral checks using sprint settings.
- `update_verification` rejects invalid behavioral commands.

## Rollout Plan

1. Ship validation in warn-only mode behind config toggle (optional).
2. Enable strict mode after baseline validation is stable.
3. Update documentation to require `environment` when TDD tasks exist.

## Sprint Task List (Draft)

### Phase 1: Core Command Generation

1. Add template placeholder support for `{{TEST_COMMAND}}`.
2. Update TDD templates to use `{{TEST_COMMAND}}`.
3. Pass `environment.test_command` into TDD template expansion.

### Phase 2: Validation Engine

4. Implement behavioral command validator (executable, workdir, script, flags).
5. Add runner detection and incompatible flag rules.
6. Add non-red exclusion resolver using registry and file operations.

### Phase 3: MCP Integration

7. Enforce environment presence in `configure_sprint` for TDD tasks.
8. Validate behavioral checks during `prepare_task`.
9. Validate behavioral checks during `update_verification`.

### Phase 4: Tests + Docs

10. Unit tests for template expansion and validation outcomes.
11. Integration tests for prepare/update verification flows.
12. Documentation updates for environment requirements and validation behavior.

## Acceptance Criteria

- [ ] TDD red-phase behavioral checks use `environment.test_command` for all languages.
- [ ] `configure_sprint` rejects `tdd_red_phase=true` when `environment.test_command` or `environment.test_file_pattern` is missing.
- [ ] `prepare_task` validates behavioral commands and blocks on invalid executable or invalid working directory.
- [ ] `update_verification` performs the same validation for behavioral checks.
- [ ] Behavioral command validation rejects missing npm scripts and incompatible runner flags.
- [ ] Non-red TDD checks exclude red-phase files using runner-appropriate flags to avoid import/load failures.
- [ ] Unit tests cover command generation using sprint environment and validation failures.

## Impact

- **High**: Removes the most common escalation trigger for valid implementations.
- **Medium**: Earlier detection of command/path issues reduces churn and failed verification cycles.

## References

- [src/mcp-server/handlers/prepare-task.ts](src/mcp-server/handlers/prepare-task.ts)
- [src/core/check-templates.ts](src/core/check-templates.ts)
- [TD-022-verification-pattern-prevalidation.md](TD-022-verification-pattern-prevalidation.md)
