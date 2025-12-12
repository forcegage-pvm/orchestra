# TD-017: Verification Check Pattern Matching Issues

**Created**: 2025-12-12
**Priority**: MEDIUM
**Category**: Verification Infrastructure
**Discovered During**: Sprint 002 - Task 4 verification

## Problem Statement

Quality check for Task 4 failed with:
```
"message": "File not found: test/**/*.test.ts"
```

But the test file `test/mcp-server/prepare-task-tdd.test.ts` existed and 239 tests were passing.

## Root Cause Analysis

### Issue 1: Vague Verification Criteria

The quality check was defined as:
```json
{
  "description": "Test exists for auto-injection",
  "severity": "MAJOR",
  "path": "test/**/*.test.ts",
  "pattern": "describe|test|it"
}
```

This is too generic. It doesn't specify:
- Which specific test file should exist
- What content pattern proves the feature is tested
- How to match the test to the feature being verified

### Issue 2: Glob Pattern Resolution

The check executor reported "File not found" for a glob pattern that should match 50+ files. Possible causes:

1. **Literal interpretation**: Check may have looked for a file literally named `test/**/*.test.ts`
2. **Path resolution**: Windows path separators may have caused issues
3. **Working directory**: Glob may have resolved from wrong cwd
4. **Check executor bug**: `executeCheck` function may not handle globs properly

### Issue 3: No Feedback on Partial Matches

When a glob matches multiple files but pattern matching fails, the check should report:
- How many files matched the glob
- Which files were checked
- Why pattern matching failed

Currently it just says "File not found" which is misleading.

## Current Behavior

```typescript
// In src/core/check-executor.ts (approximate)
if (!fs.existsSync(checkConfig.path)) {
  return { passed: false, message: `File not found: ${checkConfig.path}` };
}
```

This doesn't handle globs - it treats the path as a literal file path.

## Expected Behavior

1. Glob patterns should expand to matching files
2. Pattern should be checked against each matching file
3. Clear reporting on what was checked and what failed
4. Specific file paths in verification criteria, not generic globs

## Recommendations

### Short Term: Better Verification Criteria Authoring

When defining quality checks, be specific:

```json
// ❌ BAD - too generic
{
  "path": "test/**/*.test.ts",
  "pattern": "describe|test|it"
}

// ✅ GOOD - specific file and feature pattern
{
  "path": "test/mcp-server/prepare-task-tdd.test.ts",
  "pattern": "injectTestVerification|TDD.*auto.*inject"
}
```

### Medium Term: Fix Check Executor

Update `executeCheck` to:
1. Detect glob patterns (contains `*` or `?`)
2. Use `glob` or `fast-glob` to expand patterns
3. Report how many files matched
4. Check pattern against all matching files

```typescript
import { glob } from 'fast-glob';

async function executeStructuralCheck(config: CheckConfig): Promise<CheckResult> {
  const isGlob = config.path.includes('*') || config.path.includes('?');
  
  if (isGlob) {
    const files = await glob(config.path, { cwd: process.cwd() });
    if (files.length === 0) {
      return { passed: false, message: `No files match pattern: ${config.path}` };
    }
    
    // Check pattern against all matching files
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (new RegExp(config.pattern).test(content)) {
        return { passed: true, message: `Pattern found in ${file} (${files.length} files matched)` };
      }
    }
    
    return { 
      passed: false, 
      message: `Pattern not found in ${files.length} files matching ${config.path}` 
    };
  }
  
  // Existing literal path logic
  // ...
}
```

### Long Term: Verification Criteria Validation

Add validation when creating verification checks:
- Warn if glob pattern is used without specific feature pattern
- Suggest more specific paths based on task context
- Validate patterns are syntactically correct regex

## Files Affected

- `src/core/check-executor.ts` - Main fix location
- `src/schemas/verification.ts` - Add validation
- Sprint configuration tooling - Better defaults/examples

## Test Cases Needed

1. Glob pattern expands correctly on Windows/Linux/Mac
2. Pattern matching works across multiple files
3. Clear error messages when no files match
4. Clear error messages when files match but pattern doesn't

## Workaround (Current)

Orchestrator can submit PASS judgment with manual review evidence when automated check has false negative. This was done for Task 4.

## Related

- Task 4: prepare_task Test Criteria Auto-Injection (where issue was discovered)
- `src/core/check-executor.ts` - Check execution logic
- Sprint 002 verification criteria definitions
