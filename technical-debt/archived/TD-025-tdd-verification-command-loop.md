# TD-025: TDD Verification Command Loop (Escalation Recurrence)

## Date

2026-01-21

## Context

Sprint: sprint-006-code-review-fix (Code Review Workflow Refactor).
Task: Tests for ID resolution utility (Red) (Task 1).

## Environment Configuration Used

- Sprint environment is expected to supply:
  - test_command
  - test_file_pattern
  - source_base_dir
- For this case, the effective test runner was Vitest via npm test.

## Case Example (Observed Commands)

These were the exact behavioral commands that failed during verification:

- npm test -- --testPathPattern=id-resolution
- npm test --exclude test/core/id-resolution.test.ts

Observed runtime errors:

- Vitest: Unknown option --testPathPattern
- npm: Unknown cli config --exclude

## Problem Statement

Repeated escalations occurred because TDD red-phase verification commands were invalid for this workspace’s test runner. Verification failed for reasons unrelated to implementation quality, causing an escalation loop.

## Triggering Symptoms

- Verification structural check pointed at the wrong path (src/core/id-resolution.test.ts) while tests are in test/core/id-resolution.test.ts.
- Behavioral checks used unsupported or invalid commands/flags:
  - Vitest error: Unknown option --testPathPattern.
  - npm warning: Unknown cli config --exclude (injected by exclusion resolver).
- Result: verification failed even when tests were correctly written and intentionally failing for red phase.

## Root Cause Analysis

The criteria were auto-generated and then modified using runtime substitutions and exclusion logic:

1. TDD red checks are generated via templates in src/core/check-templates.ts.
2. prepare_task uses sprint environment values (test_command, test_file_pattern, source_base_dir) and injects them into the template in src/mcp-server/handlers/prepare-task.ts.
3. Any flags embedded in test_command are passed through verbatim, regardless of runner compatibility.
4. The exclusion resolver appends runner-specific flags (e.g., --exclude) for non‑red checks based on file operations and registry entries in src/core/tdd-exclusion-resolver.ts.

Net effect: incompatible flags entered the behavioral commands, and verification failed systematically.

## Source Code Flow (Concrete)

1. prepare_task handler entry:
   - src/mcp-server/handlers/prepare-task.ts
2. generateTddRedPhaseChecks pulls sprint env:
   - test_command, test_file_pattern, source_base_dir
3. Language selection:
   - detectLanguageFromEnv(test_command, test_file_pattern)
4. Template generation:
   - getTddRedChecks(language, { cdPrefix, testFilePattern, taskId, taskTitle, testCommand })
   - TypeScript templates use {{TEST_COMMAND}} verbatim (no flag normalization)
5. Exclusion injection:
   - resolveExclusions(...) → mapToRunnerFlags(...)
   - Non-red behavioral check command is appended with exclusion flags (e.g., --exclude)

## Timeline Summary

- Task prepared with tdd_red_phase: true.
- Implementor wrote red tests successfully.
- Verification failed due to invalid check commands and incorrect test path.
- Escalation required to amend verification criteria.

## Findings (Concrete)

- The TypeScript TDD template does not hardcode flags. It uses {{TEST_COMMAND}}.
- The invalid --testPathPattern came from sprint environment test_command.
- The invalid --exclude was added by exclusion resolver for Vitest.
- Structural test path mismatch (src/… vs test/…) was incorrect in the verification criteria.

## Tool/Workflow Trace (Orchestrator)

- prepare_task executed with tdd_red_phase: true, which auto-injected TDD red checks.
- run_verification_checks failed on behavioral checks due to invalid flags.
- Escalation required to update verification criteria.

## Recommendations (Systemic Fix)

1. **Make sprint environment mandatory and enforced**
   - Require test_command/test_file_pattern/source_base_dir for every sprint.
   - Reject missing or ambiguous environment at configure_sprint.

2. **Runner‑specific validation of test_command**
   - At prepare_task/update_verification, block incompatible flags for detected runner.
   - Example: forbid --testPathPattern for Vitest; forbid npm --exclude.

3. **Runner‑specific exclusion handling**
   - Only append exclusion flags when the runner supports them.
   - For Vitest, avoid --exclude and rely on name/tag filtering instead.

4. **Normalize TypeScript red checks to runner‑supported filtering**
   - Use vitest -t with regex for red/non‑red checks.

5. **Pre-flight verification command tests**
   - Validate behavioral commands against the workspace’s runner before task enters IMPLEMENT.

## Impact

- Prevents escalation loops caused by verification configuration drift.
- Stabilizes TDD red-phase verification across different languages/runners.
- Preserves trust boundary while improving operational reliability.

## Related Files

- src/core/check-templates.ts
- src/mcp-server/handlers/prepare-task.ts
- src/core/tdd-exclusion-resolver.ts
- docs/workflow/tdd-red-green-workflow.md
- technical-debt/TD-023-environment-driven-tdd-commands.md

## Status

Open
