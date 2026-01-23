// =============================================================================
// CATEGORY 4: NORMAL TESTS THAT PASS (EXPECTED STATE)
// =============================================================================
// These are normal (non-TDD-red) tests that PASS.
// This is the expected healthy state for the majority of tests.
//
// Expected behavior:
// - `dart test --exclude-tags tdd-red` → runs these, exit code 0 (GOOD!)
// - No task ID needed - these are regular tests
// =============================================================================

import 'package:test/test.dart';

void main() {
  group('String utilities', () {
    test('should capitalize first letter', () {
      expect(capitalize('hello'), equals('Hello'));
    });

    test('should handle empty string', () {
      expect(capitalize(''), equals(''));
    });

    test('should handle already capitalized', () {
      expect(capitalize('Hello'), equals('Hello'));
    });
  });

  group('List utilities', () {
    test('should find max value', () {
      expect(findMax([1, 5, 3, 9, 2]), equals(9));
    });

    test('should handle single element', () {
      expect(findMax([42]), equals(42));
    });
  });
}

// Correctly implemented utilities
String capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
int findMax(List<int> nums) => nums.reduce((a, b) => a > b ? a : b);
