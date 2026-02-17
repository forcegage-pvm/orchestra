# TDD Red-Phase Test Location Enforcement Audit

**TL;DR**: This is a **multi-layered problem** — partly instructional/prompting gaps, partly a critical code-level enforcement gap, and partly stale documentation. The core issue: there's no hard enforcement preventing an implementor from writing tests outside `test/red/` during a red-phase task, and `prepare_task` indiscriminately moves ALL files out of `test/red/` at cleanup time. The fix requires changes across 5 instruction files, 2 code modules, and 1 template.

## Findings by Category

### A. Instructional/Prompting Gaps (primary concern)

| # | Gap | Severity | File |
|---|-----|----------|------|
| G1 | `implement.hbs` has **zero TDD/red-phase instructions**. The implementor's system prompt gives no guidance — TDD info only arrives dynamically via `get_current_task` response. If the agent doesn't call it (or skims it), there's no guardrail. | HIGH | `extension/templates/prompts/implement.hbs` |
| G2 | No **negative instruction** anywhere says "DO NOT create test files outside `test/red/` for a red-phase task". Instructions say where to put them but never explicitly warn against the wrong location. | HIGH | `extension/agents/orchestra.implementor.agent.md` |
| G3 | `verify.hbs` uses stale `--tags tdd-red` command in the compilation check template — this is the old Dart tag-based approach, not the current `test/red/` directory approach | MEDIUM | `extension/templates/prompts/verify.hbs` (line 68) |
| G4 | `test-tier-migration-guide.md` contains stale `[tdd-red]` tag examples and `@Tags(['tdd-red'])` Dart examples — violates spec FR-032/SC-003 which says these must be removed | MEDIUM | `extension/templates/prompts/_docs/test-tier-migration-guide.md` (lines 940-1010) |
| G5 | `prepare.hbs` has no TDD-specific guidance for the orchestrator when preparing red-phase tasks — only generic "Include test requirements" | LOW | `extension/templates/prompts/prepare.hbs` (line 33) |

### B. Code-Level Enforcement Gaps

| # | Gap | Severity | File |
|---|-----|----------|------|
| G6 | **`prepare_task` cleanup is indiscriminate**: `cleanupTddRedMarkers()` moves ALL files from `test/red/` on every `prepare_task` call — no task-ID filtering, no status check, no registry validation. If the orchestrator prepares Task 3 while Task 1's red-phase tests are still in `test/red/`, they get silently promoted without green-phase verification. | **CRITICAL** | `src/mcp-server/handlers/prepare-task.ts` (line 139), `src/core/tdd-cleanup.ts` (line 68) |
| G7 | **Red-phase `signal_completion` does NOT check non-red tests**: When `tddRedPhase=true`, the pre-signal executor only runs the red tier (inverted) — it does NOT verify that non-red tests still pass. A red-phase implementor could break existing tests and still signal successfully. The non-red check only runs during VERIFY phase (too late). | HIGH | `src/core/pre-signal-executor.ts` (lines 245-252) — the `else if (config.tddRedPhase)` branch skips `runNormalTestsViaTiers()` |
| G8 | **Dart `check-templates.ts` still uses tag-based commands**: `--tags tdd-red` and `--exclude-tags tdd-red` in the Dart verification checks, while the system has migrated to directory-based isolation | MEDIUM | `src/core/check-templates.ts` (lines 62-80) |

### C. Staleness / Contradictions

| # | Issue | File |
|---|-------|------|
| C1 | `vsix-contents/` copy of `orchestra.orchestrator.agent.md` is stale — still references `@Tags(['tdd-red'])`, `[tdd-red]` tags, tag-based scanning | `extension/vsix-contents/extension/agents/orchestra.orchestrator.agent.md` (lines 524-549) |
| C2 | `tdd-red-green-workflow.md` references old `test/tdd-red/` directory name alongside current `test/red/` | `docs/workflow/tdd-red-green-workflow.md` |

---

## Steps

### Phase 1: Instructional Fixes (Prompting)

#### Step 1 — Add TDD red-phase block to `implement.hbs`

**File**: `extension/templates/prompts/implement.hbs`

Add a conditional `{{#if task.tdd_red_phase}}` section that explicitly tells the implementor:
- Place tests in `test/red/{tier}/`
- Add `// @orchestra-task: N` annotation
- DO NOT create tests outside `test/red/`
- DO NOT promote files during red phase

#### Step 2 — Add negative instruction to `orchestra.implementor.agent.md`

**File**: `extension/agents/orchestra.implementor.agent.md` (~line 426)

Add an explicit warning:
> ⛔ NEVER create test files outside `test/red/{tier}/` for a red-phase task. Tests placed directly in `test/{tier}/` will fail verification.

#### Step 3 — Fix stale `--tags tdd-red` in `verify.hbs`

**File**: `extension/templates/prompts/verify.hbs` (line 68)

Replace `[test_command] --tags tdd-red` with `run_tests({ scope: "red" })` — the directory-based approach.

#### Step 4 — Clean stale `[tdd-red]` examples in `test-tier-migration-guide.md`

**File**: `extension/templates/prompts/_docs/test-tier-migration-guide.md` (lines 940-1010)

- Replace the TypeScript `describe("[tdd-red] ...")` example with current directory-based approach
- Replace Dart `@Tags(['tdd-red'])` example with directory-based approach
- Remove `dart test --tags tdd-red` command

#### Step 5 — Add TDD context to `prepare.hbs`

**File**: `extension/templates/prompts/prepare.hbs`

Add conditional `{{#if task.tdd_red_phase}}` block reminding the orchestrator to include red-phase location instructions in the handover.

### Phase 2: Code-Level Fixes

#### Step 6 — Make `cleanupTddRedMarkers()` task-aware

**Files**: `src/core/tdd-cleanup.ts`, `src/mcp-server/handlers/prepare-task.ts`

Before promoting, check the `tdd_red_registry` for files that belong to tasks still in active TDD relationships (no `completed_at`). Skip those files. Pass `prepare_task`'s target task ID to scope the cleanup — only promote files from completed red tasks.

#### Step 7 — Add non-red test check to red-phase `signal_completion`

**File**: `src/core/pre-signal-executor.ts` (lines 245-252)

After `runTddRedPhaseTests()`, also call `runNormalTestsViaTiers()` to verify no regressions. Return combined result. This makes the pre-signal gate match the verification-phase check.

#### Step 8 — Update Dart `check-templates.ts` verification checks

**File**: `src/core/check-templates.ts` (lines 62-80)

Replace `--tags tdd-red` / `--exclude-tags tdd-red` with directory-based equivalents (e.g., `flutter test test/red/` and `flutter test --exclude test/red/`).

### Phase 3: Staleness Cleanup

#### Step 9 — Rebuild vsix-contents

The `vsix-contents/` copy is stale — needs to be regenerated from the updated source after all changes.

#### Step 10 — Update `tdd-red-green-workflow.md`

**File**: `docs/workflow/tdd-red-green-workflow.md`

Replace `test/tdd-red/` references with `test/red/`.

---

## Verification

- **Instructional**: Grep all `.hbs`, `.agent.md`, and `_docs/` files for `[tdd-red]`, `@Tags.*tdd`, `--tags tdd-red` — should find zero matches (per spec FR-032/SC-003)
- **Code (G6)**: Write a test: 2 files in `test/red/` belonging to task 1 and task 2. Call cleanup scoped to task 1 only. Assert task 2's file remains in `test/red/`
- **Code (G7)**: Write a test: red-phase signal with a broken non-red test. Assert signal is blocked
- **Manual**: Run a test-tools-sprint TDD workflow end-to-end. Verify the implementor agent creates tests in `test/red/`, not outside it

## Design Decisions

- **G6 (cleanup scoping)**: Chose task-aware filtering over removing cleanup entirely — cleanup is still useful for stale files from completed tasks, just needs to respect active relationships
- **G7 (non-red test gate)**: Chose to add the check at `signal_completion` time (pre-signal) rather than relying on the later VERIFY phase — fail-fast is critical here since failing tests outside `/red` folders must block immediately
