# System Prompt Template Fix - Root Cause Analysis

## Problem Reported

Implementor agent created manual verification script (`verify-string-utils.js`) instead of using test tools, despite:

- Test tools being registered for all roles
- System prompt template emphasizing TEST EXECUTION POLICY
- Anti-patterns section explicitly forbidding temp scripts

## Root Cause: Two Issues

### Issue #1: Templates Not Deployed (CRITICAL)

**Symptom:** System prompt templates (`.hbs` files) created but not copied to `dist/` during build.

**Impact:**

- Templates failed to load at runtime
- Fell back to original 852-line `.agent.md` files with VS Code Chat frontmatter
- TEST EXECUTION POLICY buried at line 138 (attention dilution)
- Tool names showed as `execute/runTests` instead of `run_tests` (frontmatter confusion)

**Fix:**

1. Created `extension/scripts/copy-templates.js` to copy templates during build
2. Updated `extension/package.json` postbuild script:
   ```json
   "postbuild": "... && node scripts/copy-templates.js"
   ```
3. Rebuilt extension — templates now in `dist/templates/prompts/`

### Issue #2: No Tests Exist Yet (Workflow Gap)

**Symptom:** Agent on Task T001 (Implement string utilities) with verification criteria but NO test files yet.

**Scenario:**

- T001: Implement 4 functions (no tests exist)
- T002: Create smoke tests (TDD red)
- T003: Verify tests pass (TDD green)

**Agent's Dilemma:**

- ❌ No test files to run with `run_tests`
- ❌ Policy forbids temp scripts
- ❌ Policy forbids `run_command` for testing
- ✓ Wants to verify before signaling
- **Result:** Violated policy to create `verify-string-utils.js`

**Fix:** Updated `system-implementor.hbs` template (lines 148-165):

```handlebars
**IF test files exist for your code:** - Run appropriate test scope using
run_tests - Verify all acceptance criteria met **IF no test files exist yet:** -
DO NOT create temporary verification scripts - Signal completion based on
acceptance criteria - Trust orchestrator's hidden verification - Later tasks
will create proper tests **NEVER do manual ad-hoc verification**
```

Also enhanced anti-patterns section (lines 207-235) with explicit examples of forbidden verification scripts.

## Solution Verification

### Templates Now Working

- ✅ `system-implementor.hbs` — 361 lines, TEST EXECUTION POLICY at top
- ✅ `system-orchestrator.hbs` — Focused on verification/spec review
- ✅ `system-controller.hbs` — Spec auditor protocol
- ✅ All copied to `dist/templates/prompts/` during build
- ✅ PromptBuilder.renderSystemPrompt() loads templates at runtime
- ✅ Falls back to `.agent.md` if template missing (backward compat)

### Workflow Guidance Added

- ✅ "No tests exist yet" scenario explicitly addressed
- ✅ Anti-patterns show exact forbidden script names (`verify-string-utils.js`)
- ✅ Clear policy: Use `run_tests` OR signal without verification (no middle ground)

## Expected Behavior Now

When implementor agent launches on T001:

1. **System prompt renders from template** (not .agent.md)
2. **TEST EXECUTION POLICY prominent** (lines 8-65)
3. **Sees guidance**: "If no tests exist, signal without manual verification"
4. **Anti-patterns show**: Creating `verify-*.js` scripts is forbidden
5. **Should signal completion** without creating temp scripts
6. **Tests added in T002/T003** will verify implementation

## Files Changed

### New Files

- `extension/scripts/copy-templates.js` — Template copy script

### Modified Files

- `extension/package.json` — Added copy-templates to postbuild
- `extension/templates/prompts/system-implementor.hbs` — Added "no tests" guidance
- `extension/src/prompts/promptTypes.ts` — Added SystemPromptContext interface
- `extension/src/prompts/PromptBuilder.ts` — Added renderSystemPrompt() method
- `extension/src/commands/PlayTaskHandler.ts` — Updated readAgentInstructions() to use templates

### Build Verification

```
cd extension
npm run build
# Output shows:
# ✅ Templates copied successfully!
# 📦 dist/templates/prompts/system-implementor.hbs
```

## Next Steps

1. **Manual test**: Launch implementor on test-tools-001 T001
2. **Verify**: SystemPromptCard shows rendered template (not YAML frontmatter)
3. **Observe**: Agent signals completion without creating verification scripts
4. **Confirm**: T002/T003 use `run_tests` to verify implementation

## Commits Needed

1. System prompt template infrastructure + template copy script
2. Template guidance for "no tests exist yet" scenario

## Related Issues

- User reported in screenshot: Agent created `verify-string-utils.js` despite policies
- Sprint: test-tools-001 (branch: 013-test-runner-tools)
- Task context: T001 - Implement string utility functions
