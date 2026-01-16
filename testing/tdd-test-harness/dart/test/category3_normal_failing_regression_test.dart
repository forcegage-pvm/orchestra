// =============================================================================
// CATEGORY 3: NORMAL TESTS THAT FAIL (NEGATIVE - REGRESSION)
// =============================================================================
// These are normal (non-TDD-red) tests that are FAILING.
// This indicates a regression - previously working code is now broken.
//
// Expected behavior:
// - `dart test --exclude-tags tdd-red` → runs these, exit code 1 (PROBLEM!)
// - This is a regression that must be fixed
// - No task ID needed - these are regular tests
// =============================================================================

import 'package:test/test.dart';

void main() {
  group('Math utilities', () {
    test('should add two numbers correctly', () {
      // This test FAILS - regression in add function!
      expect(add(2, 3), equals(5));
    });

    test('should handle negative numbers', () {
      // This also FAILS - regression
      expect(add(-1, 1), equals(0));
    });
  });
}

// BUG: Regression - someone broke the add function
int add(int a, int b) => a * b; // Wrong! Should be a + b
