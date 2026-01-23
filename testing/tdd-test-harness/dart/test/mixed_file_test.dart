// =============================================================================
// MIXED FILE: Multiple test categories in one file
// =============================================================================
// Real-world scenario: a single test file with both TDD-red and normal tests.
// This tests that inline tags work correctly for filtering.
//
// Contains:
// - TDD-red tests for task-7 (failing - red phase)
// - Normal tests (passing)
//
// NOTE: File-level @orchestra-task annotation covers ALL tdd-red tests in file.
// In practice, avoid mixing - create separate test files per task.
// =============================================================================

// @orchestra-task: 7
import 'package:test/test.dart';

void main() {
  // ----- NORMAL TESTS (no tags) -----
  group('Calculator basics', () {
    test('should multiply correctly', () {
      expect(multiply(3, 4), equals(12));
    });

    test('should divide correctly', () {
      expect(divide(10, 2), equals(5));
    });
  });

  // ----- TDD-RED TESTS for task-7 (inline tags) -----
  group('[task-7] Calculator advanced', () {
    test('should handle division by zero', () {
      // FAILS - not implemented yet
      expect(() => divide(10, 0), throwsArgumentError);
    }, tags: ['tdd-red']);

    test('should support decimal precision', () {
      // FAILS - not implemented yet
      expect(divideWithPrecision(1, 3, decimals: 2), equals(0.33));
    }, tags: ['tdd-red']);
  });

  // ----- MORE NORMAL TESTS -----
  group('Calculator edge cases', () {
    test('should handle zero multiplication', () {
      expect(multiply(0, 100), equals(0));
    });
  });
}

// Implemented functions
int multiply(int a, int b) => a * b;
int divide(int a, int b) => a ~/ b; // BUG: doesn't handle division by zero

// Not implemented
double divideWithPrecision(int a, int b, {required int decimals}) {
  return 0.0; // Stub - not implemented
}
