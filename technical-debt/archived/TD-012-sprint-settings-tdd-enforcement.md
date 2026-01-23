# TD-012: Sprint Settings & TDD Enforcement

**Created**: 2025-12-11
**Priority**: HIGH
**Category**: Architecture Gap
**Discovered During**: Sprint 001 Extension Foundation

## Problem Statement

During the extension sprint (25 tasks), **zero tests were written** because:

1. Testing was deferred to Task 22 ("Integration Testing") as an afterthought
2. No task verification criteria required test files
3. Orchestra enforces verification criteria, not spec text
4. Spec mentioned nothing about TDD, orchestrator derived nothing

This violates fundamental software engineering practices and reveals a gap in Orchestra's architecture: **there's no mechanism to enforce cross-cutting concerns like testing**.

## Root Cause Analysis

```
Spec (silent on TDD) 
    → Orchestrator (no TDD instruction)
    → Tasks (no test criteria)
    → Implementor (passes verification without tests)
    → 25 tasks completed, 0 tests
```

The orchestrator optimizes for verification criteria. If tests aren't in criteria, tests don't get written. This is Orchestra working as designed - but the design has a gap.

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Extension UI                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Sprint Settings Panel                      │    │
│  │  - Testing requirements                              │    │
│  │  - Pre-signal commands                               │    │
│  │  - Verification options                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│                    Config Table (DB)                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              prepare_task handler                    │    │
│  │  - Reads config                                      │    │
│  │  - If require_tests=true && category matches:        │    │
│  │    → Auto-inject test verification criteria          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Config Schema

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `require_tests` | boolean | `true` | Enable TDD enforcement |
| `require_tests_categories` | string (CSV) | `INFRASTRUCTURE,INTEGRATION` | Categories that require tests |
| `test_file_pattern` | string | `test/**/*.test.ts` | Glob pattern for test files |
| `test_pattern` | string | `describe\|test\|it` | Regex to validate test content |

### Extension UI: Sprint Settings Panel

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
│  Build command:  [flutter analyze          ]             │
│  Test command:   [flutter test             ]             │
│  Lint command:   [                         ] (optional)  │
│                                                           │
│  Verification Settings                                    │
│  ─────────────────────────────────────────────────────   │
│  Max retries per task: [3]                               │
│  Auto-escalate after:  [3] failed attempts               │
│                                                           │
│  [Save Settings]                    [Reset to Defaults]   │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### prepare_task Enhancement

```typescript
// In src/mcp-server/handlers/prepare-task.ts

async function injectTestVerificationIfRequired(
  task: Task,
  verification: VerificationCriteria
): Promise<VerificationCriteria> {
  const requireTests = await getConfigValue("require_tests", "true") === "true";
  const categories = (await getConfigValue("require_tests_categories", "INFRASTRUCTURE,INTEGRATION")).split(",");
  const testPattern = await getConfigValue("test_file_pattern", "test/**/*.test.ts");
  const contentPattern = await getConfigValue("test_pattern", "describe|test|it");

  if (!requireTests || !categories.includes(task.category)) {
    return verification;
  }

  // Derive test file name from task deliverables or title
  const testFileCheck: StructuralCheck = {
    description: `Test file exists for ${task.title}`,
    severity: "BLOCKING",
    path: testPattern,
    pattern: contentPattern,
    min_matches: 1
  };

  return {
    ...verification,
    structural_checks: [...verification.structural_checks, testFileCheck]
  };
}
```

## Implementation Plan

### Phase 1: Config Infrastructure
1. Define config keys in schema
2. Add default values on `orchestra init`
3. Ensure `set_config` / `get_config` work for all keys

### Phase 2: Extension UI
1. Create Sprint Settings webview panel
2. Load current config values from DB
3. Save changes via direct DB write (human supervisor privilege)
4. Add "Sprint Settings" command to Command Palette

### Phase 3: prepare_task Enhancement
1. Read testing config in prepare_task handler
2. Auto-inject test verification criteria based on config
3. Log when test criteria are injected (audit trail)

### Phase 4: Documentation
1. Update orchestrator agent instructions
2. Document config options in README
3. Add to Orchestra Bible

## Acceptance Criteria

- [ ] Sprint Settings panel accessible from extension
- [ ] TDD enabled by default for new sprints
- [ ] Categories configurable (INFRASTRUCTURE, INTEGRATION default to required)
- [ ] `prepare_task` auto-injects test criteria when enabled
- [ ] User can disable TDD per-sprint via UI
- [ ] Pre-signal commands configurable via UI (replaces manual `set_config`)
- [ ] Changes take effect immediately (no restart required)

## Dependencies

- Extension webview infrastructure (Task 10-13 in current sprint)
- Existing `config` table in database schema
- `set_config` MCP tool (already implemented)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Test pattern too generic, matches wrong files | Allow custom pattern per project |
| Some categories shouldn't require tests | Configurable category list |
| Existing sprints have no config | Default to TDD-on, warn on first use |
| Config changes mid-sprint confusion | Show warning, allow override |

## Success Metrics

- 100% of INFRASTRUCTURE/INTEGRATION tasks have test verification criteria by default
- Zero "forgot to write tests" incidents in future sprints
- Config UI used on every new sprint setup

## Related

- [TD-011: Feedback Workflow](./TD-011-feedback-workflow.md)
- Orchestra Bible Section 9: Verification Model
- Sprint 001 post-mortem (no tests written)
