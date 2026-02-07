# Extension Test Failures Analysis and Recommendations

## Current Status

### Main Project Tests: ✅ ALL PASSING (86 passed, 4 skipped)
All main project tests have been fixed and are now passing. See fixes:
- `test/core/command-validation.test.ts` - Updated Flutter/Pytest tests to handle EXECUTABLE_NOT_FOUND when tools aren't installed
- `test/integration/check-templates-execution.test.ts` - Added missing testCommand parameter
- `test/mcp-server/prepare-task-tdd-red.test.ts` - Added flutter availability check

### Extension Tests: ❌ 292 FAILURES across 26 files

## Root Cause Analysis

The extension tests have systematic infrastructure issues:

### 1. Database Connection Errors (Most Common - ~70% of failures)
**Problem**: Tests try to access `/test/workspace/.orchestra/orchestra.db` which doesn't exist.
**Affected Files**:
- `test/agents/AgentRunner.test.ts`
- `test/agents/AgentRunner.integration.test.ts`
- `test/agents/sessions/eventRepository.test.ts`
- `test/commands/PlayTaskHandler.test.ts`
- `test/commands/deEscalation.test.ts`
- `test/commands/resumeAgent.test.ts`
- `test/integration/*.test.ts`
- `test/views/**/*.test.ts`

**Root Cause**: 
- Tests instantiate AgentRunner or other classes that call `OrchestraDB.getDrizzleInstance(workspaceRoot)`
- The database client tries to open a real SQLite file with `fileMustExist: true`
- Since `/test/workspace/.orchestra/orchestra.db` doesn't exist, it throws an error

**Recommended Fix**:
1. Create mock database module in `test/__mocks__/database.ts` (DONE - see file)
2. Update affected tests to mock OrchestraDB before importing modules that use it
3. Or create test database setup utility similar to main project's `setupTestDb`

### 2. Filesystem/Path Validation Errors (~20% of failures)
**Problem**: Tests expect COMMAND_FAILED but get PATH_TRAVERSAL errors.
**Affected Files**:
- `test/agents/tools/coding/validateEdit.test.ts`
- `test/agents/tools/coding/editLines.test.ts`

**Root Cause**:
- `validatePath` uses `fs.realpath()` to validate paths
- Tests use mock workspaceRoot `/workspace` which doesn't exist
- `fs.realpath()` fails, causing `isWithinWorkspace()` to return false
- This triggers PATH_TRAVERSAL error before reaching mocked vscode operations

**Recommended Fix**:
1. Mock `fs.promises.realpath` in affected tests to return paths as-is
2. Create filesystem mock utility (DONE - see `test/__mocks__/filesystem.ts`)
3. Update tests to use the mock before importing path validation logic

### 3. VSCode API Mocking Issues (~10% of failures)
**Problem**: Various mock configuration problems with vscode APIs.
**Affected Files**:
- `test/views/statusbar/*.test.ts`
- `test/webviews/agent-panel/**/*.test.ts`

**Root Cause**: Incomplete or incorrect mocking of vscode APIs and Solid.js components.

**Recommended Fix**: 
- Review and update vscode mocks in `test/__mocks__/vscode.ts`
- Add proper Solid.js test utilities

## Recommended Action Plan

### Option 1: Fix All Tests (Comprehensive)
**Effort**: 2-3 days
**Steps**:
1. Create proper test infrastructure:
   - Database mocking utility (✅ Done)
   - Filesystem mocking utility (✅ Done)
   - Enhanced vscode mocks
   - Test database setup helper
2. Systematically fix each test file category:
   - Agent tests (database + mocking)
   - Tool tests (filesystem + path validation)
   - View tests (vscode API + component mocking)
   - Integration tests (full stack mocking)
3. Verify all tests pass

### Option 2: Fix Critical Path Only (Pragmatic) ⭐ RECOMMENDED
**Effort**: 4-6 hours
**Steps**:
1. Identify truly critical tests (agent lifecycle, core tools)
2. Skip or remove tests for:
   - Features under active development
   - UI components with complex mocking needs
   - Integration tests requiring full environment
3. Fix only the critical path tests with proper mocking
4. Document remaining skipped tests for future work

### Option 3: Start Fresh (Nuclear)
**Effort**: 1-2 weeks
**Steps**:
1. Remove all current extension tests
2. Set up proper test infrastructure from scratch using modern best practices
3. Write new focused tests for critical functionality
4. Add integration tests gradually

## Immediate Next Steps

Given the problem statement ("remove redundant tests or fix tests to test the current code"), **Option 2 is recommended**:

1. **Critical Tests to Fix** (must work):
   - `test/agents/AgentRunner.test.ts` - Core agent lifecycle
   - `test/agents/tools/coding/validateEdit.test.ts` - Critical coding tool
   - `test/chat/SessionManager.test.ts` - Already passing

2. **Tests to Skip** (mark with .skip() or TODO comments):
   - Integration tests requiring full environment setup
   - UI component tests with complex Solid.js mocking
   - Tests for experimental features

3. **Tests to Remove** (if clearly redundant):
   - Duplicate test coverage
   - Tests for removed features
   - Tests that test implementation details rather than behavior

## Files Created

- ✅ `/extension/test/__mocks__/database.ts` - Database mocking utilities
- ✅ `/extension/test/__mocks__/filesystem.ts` - Filesystem mocking utilities
- ✅ This analysis document

## Conclusion

The extension tests require a systematic infrastructure overhaul. The main project tests are now fully passing. For the extension, we recommend focusing on critical path tests and skipping/removing the rest until proper test infrastructure can be built.
