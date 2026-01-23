# TD-019: TDD Language Detection

**Status**: ✅ RESOLVED  
**Created**: 2026-01-12  
**Resolved**: 2026-01-12  
**Branch**: `tdd-requirements`

## Problem

Non-TypeScript projects (Dart, Python, Go, Rust, etc.) were receiving erroneous TDD verification checks that looked for TypeScript test files (`*.test.ts`), causing false failures during verification.

### Example Error

In a Dart project with correct test files (`*_test.dart`), verification would fail with:

```
❌ FAIL: [TDD] Test file required (INFRASTRUCTURE)
   Pattern: test/**/*.test.ts
   Expected: describe|test|it
```

## Root Cause

The `injectTestVerificationIfRequired()` function in `src/mcp-server/handlers/prepare-task.ts` was hardcoded to use TypeScript test patterns:

- Default test file pattern: `test/**/*.test.ts`
- Default content pattern: `describe|test|it`

These defaults were applied regardless of the project's actual language.

## Solution

Added language detection based on file extensions in `file_operations`:

### 1. New `detectTestPatterns()` Function

Detects project language from file operations and returns appropriate patterns:

| Language | File Pattern | Content Pattern |
|----------|-------------|----------------|
| Dart | `test/**/*_test.dart` | `test\(|testWidgets\(|group\(` |
| Python | `test/**/test_*.py` | `def test_|class Test` |
| Rust | `tests/**/*.rs` | `#\[test\]|#\[cfg\(test\)\]` |
| Go | `**/*_test.go` | `func Test` |
| C/C++ | `test/**/*_test.{c,cpp}` | `TEST\(|TEST_F\(|ASSERT_|EXPECT_` |
| Java | `src/test/**/*Test.java` | `@Test|@RunWith` |
| C# | `**/*.Tests/**/*Tests.cs` | `\[Test\]|\[Fact\]|\[Theory\]` |
| Ruby | `test/**/*_test.rb` | `describe |it |test |RSpec` |
| PHP | `tests/**/*Test.php` | `public function test|@test` |
| TypeScript/JavaScript | `test/**/*.test.ts` | `describe|test|it` |

### 2. Configuration Override Support

The detection is used as a fallback. Orchestrators can still override via:

- `tdd.test_file_pattern` config setting
- `test_file` parameter in `prepare_task`

Priority:
1. Explicit `test_file` parameter (highest)
2. Config setting `tdd.test_file_pattern`
3. Auto-detected pattern (fallback)

### 3. Updated UI Help Text

Sprint Settings panel now shows:

```
Test file pattern (auto-detected if empty)
  Help: If empty, Orchestra auto-detects based on project language
        (Dart, Python, Go, Rust, etc.)

Test content pattern (auto-detected if empty)
  Help: If empty, Orchestra auto-detects based on project language
```

## Changes Made

### Files Modified

1. **src/mcp-server/handlers/prepare-task.ts**
   - Added `detectTestPatterns()` function
   - Updated `injectTestVerificationIfRequired()` to use detection
   - Updated test requirements generation to use detected patterns

2. **extension/src/views/settings/SprintSettingsPanel.ts**
   - Updated help text to indicate auto-detection
   - Clarified that empty values trigger detection

## Testing

### Verification

To verify the fix works for different languages:

1. **Dart Project**
   ```typescript
   const fileOps = [
     { operation: "CREATE", path: "lib/widget.dart", description: "Widget" },
     { operation: "CREATE", path: "test/widget_test.dart", description: "Tests" }
   ];
   const patterns = detectTestPatterns(fileOps);
   // Expected: { testFilePattern: "test/**/*_test.dart", testContentPattern: "test\\(|testWidgets\\(|group\\(" }
   ```

2. **Python Project**
   ```typescript
   const fileOps = [
     { operation: "CREATE", path: "src/module.py", description: "Module" },
     { operation: "CREATE", path: "test/test_module.py", description: "Tests" }
   ];
   const patterns = detectTestPatterns(fileOps);
   // Expected: { testFilePattern: "test/**/test_*.py", testContentPattern: "def test_|class Test" }
   ```

3. **Mixed Project** (TypeScript fallback)
   ```typescript
   const fileOps = [
     { operation: "CREATE", path: "README.md", description: "Docs" }
   ];
   const patterns = detectTestPatterns(fileOps);
   // Expected: { testFilePattern: "test/**/*.test.ts", testContentPattern: "describe|test|it" }
   ```

## Impact

- ✅ **Dart projects**: No more false test failures
- ✅ **Python projects**: Correct test patterns detected
- ✅ **Rust/Go/C++/Java/C#/Ruby/PHP**: All supported
- ✅ **TypeScript/JavaScript**: Still works as before
- ✅ **Manual override**: Config settings still respected

## Future Improvements

Consider:

1. **Multi-language projects**: Detect multiple languages and provide multiple patterns
2. **Custom test frameworks**: Allow framework-specific overrides (Jest vs Mocha, unittest vs pytest)
3. **Test file inference**: Suggest specific test file names based on implementation files
4. **Configuration validation**: Warn if manual pattern doesn't match detected language

## Related Issues

- Similar issue might exist in `src/core/pre-signal-check.ts` line 289 (TypeScript assumption)
- Consider auditing other hardcoded file extensions across the codebase
