// =============================================================================
// CATEGORY 1: TDD-RED TESTS THAT FAIL
// =============================================================================
// These are CORRECTLY configured TDD red-phase tests.
// - Tagged with 'tdd-red' for test runner filtering
// - Task ID embedded for scanner extraction
// - Tests intentionally FAIL (feature not implemented yet)
//
// Expected behavior:
// - `dart test --tags tdd-red` → runs these, exit code 1 (failures)
// - `dart test --exclude-tags tdd-red` → skips these
// - Scanner extracts task ID: 3
// =============================================================================

// @orchestra-task: 3
@Tags(['tdd-red'])
library;

import 'package:test/test.dart';

void main() {
  group('[task-3] User authentication', () {
    test('should reject expired JWT tokens', () {
      // This test FAILS because we haven't implemented expiration checking
      final token = 'expired-token';
      final isValid = validateToken(token); // Returns true (not implemented)

      expect(isValid, isFalse, reason: 'Expired tokens should be rejected');
    });

    test('should require refresh for tokens older than 24h', () {
      // This test FAILS because refresh logic not implemented
      final oldToken = createTokenWithAge(hours: 25);

      expect(needsRefresh(oldToken), isTrue);
    });
  });
}

// Stub implementations - feature NOT YET implemented
bool validateToken(String token) => true; // BUG: doesn't check expiration
bool needsRefresh(String token) => false; // BUG: always returns false
String createTokenWithAge({required int hours}) => 'token-$hours';
