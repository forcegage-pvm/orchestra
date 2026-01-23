// =============================================================================
// CATEGORY 2: TDD-RED TESTS THAT PASS (NEGATIVE - VIOLATION)
// =============================================================================
// These are INCORRECTLY configured - tests pass but still have tdd-red tag.
// This indicates either:
// - The green phase is complete and tags should be removed
// - The test was written incorrectly (doesn't actually test the feature)
//
// Expected behavior:
// - `dart test --tags tdd-red` → runs these, exit code 0 (PROBLEM!)
// - Scanner should flag: "TDD-red test passes - remove tag or fix test"
// - Task ID: 5
// =============================================================================

// @orchestra-task: 5
@Tags(['tdd-red'])
library;

import 'package:test/test.dart';

void main() {
  group('[task-5] Data validation', () {
    test('should validate email format', () {
      // This test PASSES - but it still has tdd-red tag!
      // Either the feature was implemented (remove tag) or test is wrong
      final email = 'user@example.com';
      final isValid = isValidEmail(email);

      expect(isValid, isTrue);
    });

    test('should reject empty email', () {
      // This also PASSES - tag should be removed
      final email = '';
      final isValid = isValidEmail(email);

      expect(isValid, isFalse);
    });
  });
}

// Implementation exists - feature is complete!
bool isValidEmail(String email) {
  if (email.isEmpty) return false;
  return email.contains('@') && email.contains('.');
}
