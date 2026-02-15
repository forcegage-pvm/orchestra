# TD-038: Sprint Task Decomposition & Verification Failure — Sprint 014 Forensic Analysis

## Summary

Sprint 014 ("Pre-Signal Test Migration") was designed to **unify** two parallel test execution pipelines into a single shared module. The spec, research doc, quickstart, and plan all explicitly chose "Shared core module" as the architecture. What was actually built was a **ground-up reimplementation** — the exact alternative the spec rejected. Both the implementor verification and an independent conformance report (35/35 FRs, 12/12 SCs) marked the sprint as fully complete without catching this fundamental architectural deviation.

This TD documents the full failure chain and proposes concrete process changes to prevent recurrence.

## Severity: **CRITICAL**

This represents a systemic process failure across multiple Orchestra roles (orchestrator, implementor, controller/verifier). The sprint's primary architectural goal was not achieved despite passing all verification gates. The resulting bug (`signal_completion` always failing with "Tests failed") is a direct consequence of the duplicated code path.

## Discovery Context

- **Discovered**: 2026-02-14
- **Sprint**: 014-pre-signal-test-migration
- **Branch**: `014-pre-signal-test-migration`
- **Discovered by**: Human supervisor, during manual testing of `signal_completion`
- **Symptom**: `signal_completion` reports "Tests failed" even when `run_tests scope=all` passes all 3623 tests
- **Root technical cause**: `test-runner-core.ts` passes a quoted glob (`"test/smoke/**/*.test.ts"`) to vitest CLI → vitest can't match it against its include patterns → "No test files found" → exit code 1 → every tier "fails"

## The Two Parallel Pipelines (The Problem Sprint 014 Was Supposed to Solve)

### Path A: Extension `run_tests` tool (works correctly)

```
run_tests tool invocation
  → TestConfigLoader.load()       — Zod-validated config
  → ScopeResolver.resolve()       — tier/file/pattern/related/red/failed/all
  → FingerprintComputer.compute() — cache check
  → VitestRunner.execute()        — spawn with --outputFile, --pool=forks
  → ResultFormatter.format()      — structured, token-efficient output
  → TestResultStore               — caching, failure tracking
```

Location: `extension/src/agents/tools/testing/` (~16 files, ~2500 lines)

### Path B: MCP `signal_completion` pre-signal checks (broken)

```
signal_completion handler
  → runPreSignalChecks()                    [src/core/pre-signal-executor.ts]
    → runNormalTestsViaTiers()
      → runAllNonInvertedTiers()            [src/core/test-runner-core.ts]
        → runTestsCore() per tier
          → executeCommand("npx vitest run --reporter=json \"<tier-glob>\"")
            → child_process.exec            [src/core/command-executor.ts]
              → Parse JSON from stdout      [parseVitestJsonCounts — custom, fragile]
```

Location: `src/core/test-runner-core.ts` (~309 lines, reimplemented from scratch)

### Feature Comparison

| Feature                   | Path A (extension)                        | Path B (MCP, reimplemented)             |
| ------------------------- | ----------------------------------------- | --------------------------------------- |
| Config loading            | Zod-validated `TestConfigLoader`          | Raw `JSON.parse(fs.readFileSync(...))`  |
| Command execution         | `spawn` with `--outputFile=<tempfile>`    | `exec` with stdout parsing (fragile)    |
| Glob handling             | Extracts directory from glob              | Passes raw glob **in quotes** → **BUG** |
| Caching                   | Fingerprint-based with invalidation       | None                                    |
| Concurrent run protection | `ExecutionLock`                           | None                                    |
| Windows path handling     | `normalizeWindowsPath()`                  | Not handled                             |
| Pool strategy             | `--pool=forks --singleFork` (conditional) | Default                                 |
| Scope resolution          | Full `ScopeResolver` with 7 scopes        | Hardcoded tier loop only                |
| Result formatting         | Token-efficient `ResultFormatter`         | Raw count extraction                    |

---

## Forensic Analysis: The Full Failure Chain

### 1. The Spec Was Clear

Five interlocking spec documents all converge on the same architectural decision:

| Document                                                     | Key Statement                                                                                                                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/014-pre-signal-test-migration/research.md`            | **"Decision: Extract core pipeline for shared use by extension tools and pre-signal-executor"** — explicitly labeled as "Alternative 3 (CHOSEN): Shared core module — Single source of truth" |
| `specs/014-pre-signal-test-migration/research.md`            | **Rejected** "Duplicate logic in MCP" (Alternative 2) citing "Maintenance burden, drift risk"                                                                                                 |
| `specs/014-pre-signal-test-migration/quickstart.md` (Step 2) | "Extract Shared Test Runner Core" — includes code sample showing imports from `TestConfigLoader`, `ScopeResolver`, `VitestRunner`, `ResultFormatter`                                          |
| `specs/014-pre-signal-test-migration/plan.md`                | "Test runner integration: Extract core pipeline for shared use — Single source of truth for extension tools and MCP"                                                                          |
| `specs/014-pre-signal-test-migration/spec.md` (Assumption 5) | "Extension test runner tools are stable and can be called from pre-signal via shared code"                                                                                                    |

Relevant functional requirements from spec.md:

| FR     | Text                                                                                                     | Intent                      |
| ------ | -------------------------------------------------------------------------------------------------------- | --------------------------- |
| FR-001 | "Pre-signal executor MUST use `run_tests scope=all` for normal test verification"                        | Use the same pipeline       |
| FR-037 | "Verification executor MUST call `run_tests` tool internally when processing `test_verification` blocks" | Delegate, don't reimplement |
| FR-038 | "Verification executor MUST NOT execute shell commands for test verification"                            | No direct command execution |
| SC-010 | "`verify_task` calls `run_tests` internally, never shells out for test execution"                        | Architectural constraint    |

### 2. FAILURE POINT #1: Task Decomposition (Orchestrator)

The `tasks.md` defines 41 tasks across 9 phases. **The most critical architectural task was never created.**

The quickstart's Step 2 — "Extract Shared Test Runner Core" — was the foundational enabling step. It required:

1. Moving `VitestRunner`, `TestConfigLoader`, `ScopeResolver`, `ResultFormatter` to `src/core/testing/`
2. Decoupling them from extension-specific imports
3. Updating both consumers (extension tool and MCP server) to import from the shared location

**No task in `tasks.md` corresponds to this step.** Instead:

| Task | What It Says                                                 | What's Missing                                                              |
| ---- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| T011 | "Update pre-signal-executor.ts to use `run_tests scope=all`" | Assumes shared module exists, but no task creates it                        |
| T012 | "Replace `getTddCommands()` with `runTestsCore()` call"      | References `runTestsCore()` without specifying it must reuse extension code |
| T009 | "Update verify-task.ts to call `run_tests` internally"       | Vague on implementation path                                                |

The orchestrator decomposed **behavioral requirements** (what the system should do) but missed the **architectural prerequisite** (how the infrastructure gets there). This is the originating failure — everything that follows cascades from this.

### 3. FAILURE POINT #2: Implementation (Implementor)

With no explicit extraction task, the implementor encountered T011/T012 ("use `runTestsCore()`") and:

1. Looked for `runTestsCore()` — didn't find it
2. Needed to create it
3. Faced the hard problem: extracting from `extension/src/agents/tools/testing/` requires decoupling VS Code imports, creating shared packages, updating both builds
4. Took the path of least resistance: wrote `src/core/test-runner-core.ts` from scratch (~309 lines)

The sprint memory shows tasks 531-535 completed in a batch with **9 attempts**, suggesting difficulty. The cross-boundary import problem (extension → src) was the hard engineering work that no task prepared the implementor for.

The implementor is least culpable here — they fulfilled the literal task requirements. No task said "extract from extension pipeline" or "reuse VitestRunner."

### 4. FAILURE POINT #3: Verification Criteria (Orchestrator)

The `sprint-config.json` verification criteria for the relevant tasks use **regex pattern matching**:

```json
{
  "description": "pre-signal-executor.ts uses runTestsCore or equivalent",
  "pattern": "runTestsCore|runTests|run_tests",
  "severity": "BLOCKING"
}
```

This checks for the **name** of a function, not its **implementation quality**. A reimplementation named `runTestsCore` satisfies this check identically to a proper wrapper around the extension pipeline.

**Missing verification types that would have caught this:**

| Type                     | Example                                                                        | What It Would Catch                 |
| ------------------------ | ------------------------------------------------------------------------------ | ----------------------------------- |
| **Import check**         | `pattern: "import.*from.*testing/VitestRunner"` in `test-runner-core.ts`       | Ensures reuse, not reimplementation |
| **Negative check**       | `pattern: "executeCommand"` with `mustNotMatch: true` in `test-runner-core.ts` | Blocks direct shell execution       |
| **Negative check**       | `pattern: "npx vitest"` with `mustNotMatch: true` in `test-runner-core.ts`     | Blocks command string construction  |
| **File existence**       | `src/core/testing/VitestRunner.ts` must exist                                  | Ensures extraction happened         |
| **File absence/wrapper** | `test-runner-core.ts` must be <50 lines (thin wrapper)                         | Prevents full reimplementation      |

SC-010 ("never shells out for test execution") was defined in the spec but the sprint-config verification patterns **only test the positive half** ("calls run_tests") and **ignore the negative half** ("never shells out").

### 5. FAILURE POINT #4: Conformance Report (Verifier)

The conformance report declared **35/35 FRs implemented, 12/12 SCs verified**. This means:

- **FR-001** ("Pre-signal executor MUST use `run_tests scope=all`"): Marked as implemented because `runAllNonInvertedTiers()` runs all non-inverted tiers — behaviorally similar to `scope=all`, but architecturally different
- **FR-038** ("MUST NOT execute shell commands for test verification"): Marked as implemented despite `test-runner-core.ts` containing `executeCommand("npx vitest run ...")` on line 186
- **SC-010** ("never shells out for test execution"): Marked as verified despite `executeCommand()` calls throughout `test-runner-core.ts`

The conformance verification evaluated **behavioral outcomes** ("tests run, tiers are respected, results are returned") rather than **architectural constraints** ("uses shared pipeline, no shell commands").

### 6. FAILURE POINT #5: Controller Review Gate

The controller agent reviews sprint configs and handovers for spec alignment. However:

- Controller reviews **handover content** (task descriptions, clarity, completeness) not **implementation architecture**
- No check exists for "do the sprint tasks cover all quickstart steps?"
- No check exists for "do the sprint tasks cover all architecture decisions from research.md?"
- The controller couldn't catch the missing extraction task because it has no mechanism to cross-reference quickstart steps with task lists

---

## Impact Assessment

### Direct Bug

`signal_completion` always fails with "Tests failed" because `test-runner-core.ts` passes quoted globs to vitest CLI, causing "No test files found" for every tier. This blocks the entire signal → verify → complete workflow.

### Architectural Debt

The codebase now has **two parallel test execution engines** — exactly the problem Sprint 014 was supposed to solve. Any fix to one (e.g., the `--run` flag for `vitest related`, the `--singleFork` optimization, cross-project file filtering) must be duplicated in the other, or one pathway silently diverges.

### Verification Trust

The conformance report (35/35, 12/12) cannot be trusted. If a sprint's **primary architectural goal** can be entirely missed while passing all verification gates, the verification system provides false confidence.

### Process Integrity

Multiple Orchestra roles (orchestrator, implementor, verifier) all operated within their defined processes and produced passing results. The failure is systemic, not individual.

---

## Root Cause Classification

| #   | Cause                                                                                              | Type                          | Responsibility                       |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------ |
| 1   | Quickstart Step 2 ("Extract Shared Core") has no corresponding task                                | **Planning gap**              | Orchestrator                         |
| 2   | Task descriptions say "use runTestsCore" without specifying it must reuse extension code           | **Ambiguous specification**   | Orchestrator                         |
| 3   | Verification criteria use positive name-matching only, no negative/architectural checks            | **Insufficient verification** | Orchestrator                         |
| 4   | FR wording conflates tool name ("run_tests") with architectural implementation ("shared pipeline") | **Spec ambiguity**            | Speckit / Orchestrator               |
| 5   | Conformance report marks FR-038/SC-010 as passing despite shell commands in test-runner-core.ts    | **Verification failure**      | Verifier                             |
| 6   | Controller review has no quickstart ↔ task cross-reference mechanism                               | **Process gap**               | Controller prompt / Orchestra design |
| 7   | Cross-boundary import difficulty (extension/ → src/) not anticipated in task estimates             | **Risk not identified**       | Orchestrator                         |

---

## Proposed Fix: Process Strengthening

### Fix 1: Mandatory Quickstart ↔ Task Traceability (Orchestrator)

**Rule**: Every numbered step in `quickstart.md` must map to at least one task in `tasks.md`. The orchestrator must include a traceability matrix in the sprint config.

**Verification**: Controller review gate checks for unmapped quickstart steps before approving the sprint.

**Example**:

```yaml
quickstart_traceability:
  - step: "Step 1: Update Zod Schemas"
    tasks: [T001, T002, T003]
  - step: "Step 2: Extract Shared Test Runner Core" # ← Would have caught the gap
    tasks: [] # ← Controller REJECTS: unmapped step
  - step: "Step 3: Migrate Pre-Signal Executor"
    tasks: [T011, T012, T013, T014]
```

### Fix 2: Architecture Decision ↔ Task Traceability (Orchestrator)

**Rule**: Every architecture decision in `research.md` that selects an implementation approach must have a corresponding task that **creates the infrastructure** for that approach.

**Example**: When research.md says "CHOSEN: Shared core module (extract from extension)", the task breakdown must include an extraction task — not just consumer tasks.

### Fix 3: Negative Verification Criteria (Orchestrator)

**Rule**: For any task involving code migration, unification, or replacement, verification criteria must include:

1. **Negative checks**: "New module MUST NOT contain [old pattern]"
2. **Import checks**: "New module MUST import from [shared location]"
3. **Size/complexity bounds**: "Wrapper module MUST be <N lines" (prevents reimplementation)

**Example for Sprint 014**:

```json
{
  "structural_checks": [
    {
      "description": "test-runner-core.ts uses VitestRunner from shared module",
      "file": "src/core/test-runner-core.ts",
      "pattern": "import.*VitestRunner",
      "severity": "BLOCKING"
    },
    {
      "description": "test-runner-core.ts does NOT shell out directly",
      "file": "src/core/test-runner-core.ts",
      "pattern": "executeCommand|npx vitest|child_process",
      "mustNotMatch": true,
      "severity": "BLOCKING"
    },
    {
      "description": "Shared test runner module exists",
      "file": "src/core/testing/VitestRunner.ts",
      "mustExist": true,
      "severity": "BLOCKING"
    }
  ]
}
```

**Implementation note**: Orchestra's current verification system only supports positive `pattern` matching. This fix requires adding `mustNotMatch` and `mustExist` check types to the verification infrastructure.

### Fix 4: Controller Prompt Enhancement (Controller)

Update `extension/agents/orchestra.controller.agent.md` to add to the sprint review checklist:

1. "Every numbered step in quickstart.md has at least one corresponding task"
2. "Every architecture decision in research.md (marked CHOSEN) has an enabling/infrastructure task"
3. "Verification criteria include negative checks for migration/unification tasks"
4. "Rejected alternatives from research.md are not accidentally implemented"

### Fix 5: Conformance Report Must Verify Negative Constraints (Verifier)

**Rule**: When verifying SCs that contain negative constraints ("MUST NOT", "never"), the verifier must provide **evidence of absence** — not just evidence of presence of the positive counterpart.

**Example**: SC-010 says "never shells out." Verification must grep for shell execution patterns and confirm zero matches, not just confirm that `runTestsCore` exists.

### Fix 6: Speckit Enhancement — Auto-generate Infrastructure Tasks

When speckit generates a spec with an architecture decision that involves code extraction/sharing/migration:

1. Auto-generate a "Foundation" phase task: "Extract [components] from [source] to [shared location]"
2. Flag this as a prerequisite for all consumer tasks
3. Include architectural verification criteria (import checks, negative checks)

---

## Effort Estimate for Process Fixes

| Fix                                       | Effort | Type                                                                    |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Fix 1: Quickstart traceability            | Low    | Process/documentation — orchestrator prompt update                      |
| Fix 2: Architecture decision traceability | Low    | Process/documentation — orchestrator prompt update                      |
| Fix 3: Negative verification criteria     | Medium | Code change — add `mustNotMatch` and `mustExist` to verification engine |
| Fix 4: Controller prompt enhancement      | Low    | Prompt update to controller agent markdown                              |
| Fix 5: Conformance negative verification  | Low    | Process/documentation — verifier instructions                           |
| Fix 6: Speckit infrastructure tasks       | Medium | Speckit enhancement                                                     |

---

## Effort Estimate for the Actual Unification (Separate Sprint/TD)

The proper fix — extracting the extension pipeline to a shared location and replacing `test-runner-core.ts` — is estimated at:

| Phase                                                                  | Work                                                                  | Effort     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------- |
| Extract TestConfigLoader, ScopeResolver, VitestRunner, ResultFormatter | Decouple from extension-specific imports, move to `src/core/testing/` | 4-6h       |
| Replace test-runner-core.ts                                            | Thin wrapper calling shared VitestRunner                              | 2h         |
| Update pre-signal-executor.ts                                          | Use shared pipeline instead of test-runner-core.ts                    | 2h         |
| Update extension run_tests tool                                        | Import from shared location                                           | 2h         |
| Update build pipelines                                                 | tsup (MCP) and esbuild (extension) both bundle shared code            | 2-3h       |
| Test all paths                                                         | signal_completion, run_tests, verify_task all use same pipeline       | 2h         |
| **Total**                                                              |                                                                       | **14-17h** |

---

## Related Items

- **TD-030**: Specification Traceability Gap in Code Reviews (related — controller can't reference specs during review)
- **Sprint 014 spec**: `specs/014-pre-signal-test-migration/` (the spec that was correctly written but incorrectly decomposed)
- **Direct bug**: `signal_completion` always fails — interim fix is to patch the quoted-glob bug in `test-runner-core.ts`

## Status

- **Created**: 2026-02-14
- **Priority**: P0 (process failure with systemic implications)
- **Assigned**: Unassigned (process fixes) + future sprint (code unification)
