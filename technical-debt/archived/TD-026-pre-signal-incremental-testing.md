# TD-026: Pre-Signal Incremental Testing

## Status: OPEN

## Priority: HIGH

## Created: 2026-01-21

## Sprint: sprint-006-code-review-fix (discovered)

## Problem Statement

As the test suite grows (currently 1000+ tests), the pre-signal executor runs the full test suite multiple times per task lifecycle, causing extreme slowdown:

- Pre-signal runs on every `signal_completion` call
- Verification checks may run tests again
- Full suite takes ~120 seconds
- Tests run at least 10 times per task lifecycle = 20+ minutes of test execution alone

This is unsustainable and will only worsen as the codebase grows.

## Current State

The pre-signal executor ([src/core/pre-signal-executor.ts](../src/core/pre-signal-executor.ts)) has:

- Hard-coded default commands per language (lines 86-87, 117-158)
- Config override via `pre_signal_test_command` key in `config` or `sprint_settings` tables
- No built-in incremental testing logic

### Current Default Commands by Language

| Language        | Default Test Command                                   | Incremental Support |
| --------------- | ------------------------------------------------------ | ------------------- |
| Node/TypeScript | `npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"` | ❌ None             |
| Flutter/Dart    | `flutter test --exclude-tags=tdd-red`                  | ❌ None             |
| Python          | `pytest`                                               | ❌ None             |
| Rust            | `cargo test`                                           | ❌ None             |
| Go              | `go test ./...`                                        | ❌ None             |

## Proposed Solution

### Phase 1: Immediate Mitigation (DONE)

- Set `pre_signal_test_command` config to use `--changed` flag
- Applied via `set_config` tool for current sprint

### Phase 2: Systematic Solution

#### 2.1 Update Default Commands with Incremental Flags

Each language ecosystem has incremental testing capabilities:

| Language    | Incremental Command                             | Notes                            |
| ----------- | ----------------------------------------------- | -------------------------------- |
| **Vitest**  | `npm test -- --changed`                         | Uses git to detect changed files |
| **Jest**    | `npm test -- --onlyChanged`                     | Similar git-based detection      |
| **Flutter** | `flutter test --changed`                        | Requires flutter 3.10+           |
| **pytest**  | `pytest --lf` (last failed) or `pytest-testmon` | Plugin for change detection      |
| **Rust**    | `cargo test --changed`                          | Via cargo-nextest                |
| **Go**      | Use `go test ./...` with package filtering      | Manual or via gotestsum          |

#### 2.2 Tiered Verification Strategy

Implement different test scopes for different phases:

| Phase                     | Test Scope               | Rationale                               |
| ------------------------- | ------------------------ | --------------------------------------- |
| `signal_completion`       | Changed files only       | Fast feedback, catch obvious breaks     |
| `run_verification_checks` | Task-relevant tests only | Focused on task requirements            |
| `complete_task`           | Full test suite          | Ensure no regressions before completion |

#### 2.3 Configuration Schema Updates

Extend `sprint_settings` / environment configuration:

```typescript
interface TestConfiguration {
  // Current
  test_command: string; // Full test command
  test_file_pattern: string; // Glob for test files

  // New - incremental testing
  test_command_incremental?: string; // Changed-only command
  test_command_focused?: string; // Single file/pattern command template
  incremental_strategy?: "changed" | "affected" | "failed" | "none";
}
```

#### 2.4 Smart Test Selection

Add logic to pre-signal executor:

1. Detect which files changed (git diff)
2. Map changed source files to their test files
3. Run only those tests for pre-signal
4. Cache test results to avoid re-running unchanged tests

## Implementation Tasks

1. [ ] Update `DEFAULT_TEST_COMMAND` constants with incremental flags
2. [ ] Add `test_command_incremental` to sprint environment schema
3. [ ] Modify `getPreSignalConfig()` to prefer incremental command
4. [ ] Add `incremental_strategy` configuration option
5. [ ] Implement tiered verification (different scopes per phase)
6. [ ] Add test result caching (optional, Phase 3)
7. [ ] Update documentation for all supported languages

## Files to Modify

- `src/core/pre-signal-executor.ts` - Default commands and logic
- `src/db/schema.ts` - Add new config fields if needed
- `src/mcp-server/handlers/configure-sprint.ts` - Environment schema
- `docs/mcp-server-config.md` - Documentation
- Agent prompts - Update environment configuration guidance

## Acceptance Criteria

- [ ] Pre-signal checks complete in <30 seconds for typical changes
- [ ] Full test suite only runs on `complete_task` or explicit request
- [ ] Configuration works for all supported languages (Node, Dart, Python, Rust, Go)
- [ ] Backwards compatible - existing sprints continue working
- [ ] Clear documentation for configuring incremental testing

## Risk Assessment

| Risk                               | Mitigation                                     |
| ---------------------------------- | ---------------------------------------------- |
| Incremental tests miss regressions | Full suite on complete_task acts as safety net |
| Language-specific edge cases       | Allow override via config                      |
| Git state issues (untracked files) | Fall back to full suite if git detection fails |

## References

- Vitest `--changed` flag: https://vitest.dev/guide/cli.html
- Jest `--onlyChanged`: https://jestjs.io/docs/cli#--onlychanged
- pytest-testmon: https://github.com/tarpas/pytest-testmon
- cargo-nextest: https://nexte.st/
