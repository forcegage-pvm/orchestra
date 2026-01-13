# Sprint 002: Technical Debt & Testing Infrastructure

**Created**: 2025-12-11  
**Status**: DRAFT - Awaiting Human Review  
**Origin**: Sprint 001 Extension Foundation post-mortem  

---

## Executive Summary

Sprint 001 (Extension Foundation) delivered 24/25 tasks but revealed critical gaps in Orchestra's architecture:

1. **Zero tests written** - No enforcement mechanism for TDD
2. **Audit logging incomplete** - Only 2/20+ handlers log to database
3. **Verification judgment bug** - Checks all historical results, not current attempt
4. **Platform compatibility** - Windows/Unix issues in verification checks

This sprint addresses these gaps before proceeding with new features.

---

## Sprint Goals

| Goal | Success Criteria |
|------|------------------|
| TDD Enforcement | 100% of INFRASTRUCTURE/INTEGRATION tasks require tests by default |
| Observability | All MCP handlers log to `tool_executions` table |
| Verification Accuracy | Judgment validation uses current attempt only |
| Cross-Platform | Verification checks work on Windows and Unix |

---

## Task Register

### Phase 1: Core Infrastructure (P0 - Critical)

#### Task 1: Verification Judgment Scoping Fix
**Priority**: P0 - BLOCKING  
**Category**: INFRASTRUCTURE  
**Estimated**: 2 hours  
**Dependencies**: None

**Problem**: `submit_verification_judgment` validation (JVC-2) checks ALL historical verification results for a task, not just the current run. When a task fails and is retried, old failures cause false rejections.

**Evidence**:
```
"JVC-2": "PASS judgment not allowed with BLOCKING failures"
"Found 20 verification result(s)"  // Should only be 5 from latest run
```

**Root Cause**: Query fetches all results for task_id without filtering by current attempt.

**Solution**:
```sql
-- Current (wrong)
SELECT * FROM verification_results WHERE task_id = ?

-- Fixed
SELECT * FROM verification_results 
WHERE task_id = ? AND attempt = (SELECT MAX(attempt) FROM verification_results WHERE task_id = ?)
```

**Files to Modify**:
- `src/mcp-server/handlers/submit-verification-judgment.ts`

**Verification Criteria**:
- [ ] Structural: Handler uses attempt-scoped query
- [ ] Behavioral: PASS judgment succeeds after retry with fixed code
- [ ] Test: Unit test for multi-attempt scenario

---

#### Task 2: Complete MCP Audit Logging
**Priority**: P0 - CRITICAL  
**Category**: INFRASTRUCTURE  
**Estimated**: 4 hours  
**Dependencies**: None

**Problem**: Only `escalate-task.ts` and `signal-completion.ts` log to database. 20+ handlers have no audit trail.

**Current State**:
- ✅ `src/mcp-server/handlers/audit-logging.ts` - Core infrastructure exists
- ✅ `withAuditLogging()` wrapper implemented
- ❌ 20+ handlers not wrapped

**Solution**: Apply `withAuditLogging()` wrapper to all remaining handlers:

| Handler | Role | Priority |
|---------|------|----------|
| `configure-sprint.ts` | orchestrator | HIGH |
| `prepare-task.ts` | orchestrator | HIGH |
| `run-verification-checks.ts` | orchestrator | HIGH |
| `submit-verification-judgment.ts` | orchestrator | HIGH |
| `complete-task.ts` | orchestrator | HIGH |
| `get-task.ts` | orchestrator | MEDIUM |
| `get-tasks.ts` | orchestrator | MEDIUM |
| `get-sprint-status.ts` | orchestrator | MEDIUM |
| `get-progress.ts` | orchestrator | MEDIUM |
| `get-signal.ts` | orchestrator | MEDIUM |
| `get-verification-results.ts` | orchestrator | MEDIUM |
| `update-verification.ts` | orchestrator | MEDIUM |
| `update-handover.ts` | orchestrator | MEDIUM |
| `add-phase.ts` | orchestrator | LOW |
| `add-task.ts` | orchestrator | LOW |
| `remove-task.ts` | orchestrator | LOW |
| `set-config.ts` | orchestrator | LOW |
| `get-feedback.ts` | worker | MEDIUM |
| `signal-completion.ts` | worker | ALREADY DONE |
| `escalate-task.ts` | worker | ALREADY DONE |

**Files to Modify**:
- All files in `src/mcp-server/handlers/` (except signal-completion and escalate-task)

**Verification Criteria**:
- [ ] Structural: All handlers import and use `withAuditLogging`
- [ ] Behavioral: `tool_executions` table populated after tool calls
- [ ] Quality: Log entries include input params, output, duration

---

### Phase 2: TDD Enforcement (P1 - High)

#### Task 3: Sprint Settings Default Config
**Priority**: P1  
**Category**: INFRASTRUCTURE  
**Estimated**: 1 hour  
**Dependencies**: None

**Problem**: No config keys for TDD enforcement exist by default.

**Solution**: Add default config values on sprint initialization:

| Key | Default | Description |
|-----|---------|-------------|
| `require_tests` | `true` | Enable TDD enforcement |
| `require_tests_categories` | `INFRASTRUCTURE,INTEGRATION` | Categories that require tests |
| `test_file_pattern` | `test/**/*.test.ts` | Glob pattern for test files |
| `test_pattern` | `describe\|test\|it` | Regex to validate test content |

**Files to Modify**:
- `src/mcp-server/handlers/configure-sprint.ts` - Insert defaults on sprint creation

**Verification Criteria**:
- [ ] Structural: Configure-sprint inserts default config values
- [ ] Behavioral: New sprint has TDD config in `config` table

---

#### Task 4: prepare_task Test Criteria Auto-Injection
**Priority**: P1  
**Category**: INFRASTRUCTURE  
**Estimated**: 3 hours  
**Dependencies**: Task 3

**Problem**: `prepare_task` doesn't inject test verification criteria even when TDD is enabled.

**Solution**:
```typescript
// In src/mcp-server/handlers/prepare-task.ts

async function injectTestVerificationIfRequired(
  db: Database,
  task: Task,
  verification: VerificationCriteria
): Promise<VerificationCriteria> {
  // Read config from database
  const requireTests = await getConfigValue(db, "require_tests", "true") === "true";
  const categories = (await getConfigValue(db, "require_tests_categories", "INFRASTRUCTURE,INTEGRATION")).split(",");
  const testPattern = await getConfigValue(db, "test_file_pattern", "test/**/*.test.ts");
  const contentPattern = await getConfigValue(db, "test_pattern", "describe|test|it");

  if (!requireTests || !categories.includes(task.category)) {
    return verification;
  }

  // Auto-inject test file check
  const testFileCheck: StructuralCheck = {
    description: `Test file exists for ${task.title}`,
    severity: "BLOCKING",
    path: testPattern,
    pattern: contentPattern,
    min_matches: 1
  };

  return {
    ...verification,
    structural_checks: [...(verification.structural_checks || []), testFileCheck]
  };
}
```

**Files to Modify**:
- `src/mcp-server/handlers/prepare-task.ts`

**Verification Criteria**:
- [ ] Structural: Function `injectTestVerificationIfRequired` exists
- [ ] Behavioral: Prepared task has test check when TDD enabled
- [ ] Behavioral: No test check when TDD disabled or category excluded

---

#### Task 5: Sprint Settings Extension Panel
**Priority**: P1  
**Category**: VISUAL  
**Estimated**: 4 hours  
**Dependencies**: Task 3

**Problem**: Human supervisor cannot configure TDD/pre-signal settings via UI.

**Solution**: Create Sprint Settings webview panel in extension:

```
┌─ Sprint Settings ─────────────────────────────────────────┐
│                                                           │
│  Testing Requirements                                     │
│  ─────────────────────────────────────────────────────   │
│  ☑ Require tests for new code                            │
│                                                           │
│  Apply to categories:                                     │
│  ☑ INFRASTRUCTURE    ☑ INTEGRATION                       │
│  ☐ VISUAL            ☐ REFACTOR                          │
│                                                           │
│  Test file pattern: test/**/*.test.ts                    │
│                                                           │
│  Pre-Signal Commands                                      │
│  ─────────────────────────────────────────────────────   │
│  Build command:  [npm run build            ]             │
│  Test command:   [npm test                 ]             │
│  Lint command:   [                         ] (optional)  │
│                                                           │
│  [Save Settings]                    [Reset to Defaults]   │
└───────────────────────────────────────────────────────────┘
```

**Implementation Notes**:
- Extension has direct database access (human supervisor privilege)
- Use `UPDATE config SET value = ? WHERE key = ?` for changes
- Load values from `config` table on panel open

**Files to Create/Modify**:
- `extension/src/views/settings/SprintSettingsPanel.ts` - New webview panel
- `extension/src/views/settings/settings.html` - HTML/CSS/JS for panel
- `extension/package.json` - Add command `orchestra.openSprintSettings`
- `extension/src/extension.ts` - Register command

**Verification Criteria**:
- [ ] Structural: SprintSettingsPanel.ts exists with webview
- [ ] Behavioral: Command opens settings panel
- [ ] Behavioral: Changes persist to `config` table in database

---

### Phase 3: Cross-Platform Fixes (P2 - Medium)

#### Task 6: Windows-Compatible Verification Checks
**Priority**: P2  
**Category**: INFRASTRUCTURE  
**Estimated**: 2 hours  
**Dependencies**: None

**Problem**: Verification checks using Unix commands (`grep`) fail on Windows.

**Evidence**:
```
"qual-0": "Error states have retry mechanisms"
"passed": false
"output": "'grep' is not recognized as an internal or external command"
```

**Solution**: 
1. Use path-based pattern matching (structural checks) instead of shell commands where possible
2. For behavioral checks requiring shell, detect platform and use alternatives:

```typescript
// In src/core/check-executor.ts
function searchInFile(filePath: string, pattern: string): boolean {
  const content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(pattern, "gm");
  return regex.test(content);
}
```

**Files to Modify**:
- `src/core/check-executor.ts` - Add cross-platform search fallback

**Verification Criteria**:
- [ ] Behavioral: Verification checks pass on Windows
- [ ] Behavioral: Verification checks pass on Unix/Mac

---

#### Task 7: Multi-Line Regex Support in Structural Checks
**Priority**: P2  
**Category**: INFRASTRUCTURE  
**Estimated**: 2 hours  
**Dependencies**: None

**Problem**: Patterns like `try.*catch` don't match multi-line code (standard TypeScript formatting).

**Evidence**:
```
Pattern: "try.*catch|error.*handling"
Expected: Match try-catch blocks
Actual: No match (try and catch on different lines)
```

**Solution**: Add dotall flag support and document best practices:

```typescript
// Option A: Enable dotall matching (s flag)
const regex = new RegExp(pattern, "gms"); // s = dotall flag

// Option B: Recommend single-line patterns in documentation
// Pattern: "catch \\(error\\)|error instanceof Error"
```

**Files to Modify**:
- `src/core/check-executor.ts` - Add dotall flag option for structural checks
- Create `docs/verification-patterns.md` - Pattern authoring guide

**Verification Criteria**:
- [ ] Behavioral: Multi-line patterns work with dotall flag
- [ ] Quality: Documentation includes pattern examples

---

### Phase 4: Documentation & Testing (P2 - Medium)

#### Task 8: Extension README & Marketplace Assets
**Priority**: P2  
**Category**: INFRASTRUCTURE  
**Estimated**: 3 hours  
**Dependencies**: All previous tasks

**Problem**: Extension lacks user documentation and marketplace assets.

**Deliverables**:
- `extension/README.md` - User guide with installation, features, usage
- `extension/CHANGELOG.md` - Release notes for v1.0.0
- `extension/images/` - Screenshots for marketplace

**Contents for README.md**:
1. Overview - What Orchestra does
2. Installation - From VSIX or marketplace
3. Features - Dashboard, TreeView, Status Bar
4. Quick Start - Initialize sprint, view tasks
5. Commands - Full command reference
6. Configuration - Settings and config
7. Troubleshooting - Common issues

**Verification Criteria**:
- [ ] Structural: README.md has "Installation" section
- [ ] Structural: CHANGELOG.md exists
- [ ] Quality: At least 2 screenshots in images/

---

#### Task 9: Integration Tests for Extension
**Priority**: P2  
**Category**: INFRASTRUCTURE  
**Estimated**: 4 hours  
**Dependencies**: Extension complete

**Problem**: No automated tests for extension functionality.

**Test Scenarios**:
1. Extension activates without error
2. Database connection succeeds
3. Dashboard panel opens and displays data
4. TreeView renders sprint/phases/tasks
5. Status bar shows current task
6. Commands execute without error

**Files to Create**:
- `extension/test/suite/extension.test.ts` - Activation tests
- `extension/test/suite/database.test.ts` - Query tests
- `extension/test/suite/views.test.ts` - UI tests

**Verification Criteria**:
- [ ] Structural: Test files exist in extension/test/
- [ ] Behavioral: `npm test` in extension/ passes

---

## Deferred Items (Not in Sprint 002)

| Item | Reason | Future Sprint |
|------|--------|---------------|
| TD-012: ESM Migration | Low risk, stable schema | Sprint 003+ |
| TD-013: Tech Debt DB Table | Nice-to-have, markdown works | Sprint 003+ |
| TD-011: Feedback Workflow | Already implemented in MCP | N/A - RESOLVED |

---

## Already Resolved (MCP Implementation)

The following items from TD-011 (Feedback Workflow) are **already implemented** in the database-driven MCP system and do NOT need any work:

| Feature | Implementation |
|---------|----------------|
| Feedback storage | `feedback` table in database (see `src/db/schema.ts` line 220) |
| Feedback creation on FAIL | `submit_verification_judgment` inserts to `feedback` table (line 199) |
| Implementor retrieves feedback | `get_feedback` tool reads from database |
| Orchestrator enhances feedback | `enhance_feedback` tool adds guidance |

**Conclusion**: TD-011 is obsolete - it was written for the CLI/file-based system. The MCP system already has complete feedback functionality via database.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| prepare_task changes break existing workflow | Medium | High | Test with existing sprint first |
| Extension panel complexity | Low | Medium | Use existing webview patterns |
| Cross-platform testing coverage | Medium | Medium | Test on Windows before merge |

---

## Dependencies Graph

```
Task 1 (Verification Scoping) ──────────────────────────────────────┐
                                                                     │
Task 2 (Audit Logging) ─────────────────────────────────────────────┤
                                                                     │
Task 3 (Config Schema) ───► Task 4 (Auto-Inject) ───► Task 5 (UI) ──┼──► Task 8 (Docs)
                                                                     │         │
Task 6 (Windows Fix) ───────────────────────────────────────────────┤         ▼
                                                                     │    Task 9 (Tests)
Task 7 (Multi-Line Regex) ──────────────────────────────────────────┘
```

---

## Estimated Effort

| Phase | Tasks | Hours |
|-------|-------|-------|
| Phase 1: Core | 1-2 | 6h |
| Phase 2: TDD | 3-5 | 8h |
| Phase 3: Platform | 6-7 | 4h |
| Phase 4: Docs/Tests | 8-9 | 7h |
| **Total** | 9 tasks | **25h** |

---

## Acceptance Criteria (Sprint Level)

- [ ] All 9 tasks completed and verified
- [ ] Zero BLOCKING verification failures due to platform issues
- [ ] New sprint created with TDD defaults
- [ ] At least one task prepared with auto-injected test criteria
- [ ] Extension tests pass
- [ ] Extension README complete

---

## Notes for Human Supervisor

1. **Task 5 (Sprint Settings UI)** is the most complex - may want to split or defer
2. **Task 9 (Integration Tests)** depends on VS Code test runner setup which can be tricky
3. Consider running Sprint 002 on the Orchestra repo itself to dogfood TDD enforcement

---

## References

- [TD-012: Sprint Settings & TDD](../technical-debt/TD-012-sprint-settings-tdd-enforcement.md)
- [TD-012: MCP Audit Logging](../technical-debt/TD-012-mcp-audit-logging.md)
- [TD-014: Verification Judgment](../technical-debt/TD-014-verification-judgment-validation.md)
- [Orchestra Bible v0.7.0](../docs/orchestra-bible.md)
