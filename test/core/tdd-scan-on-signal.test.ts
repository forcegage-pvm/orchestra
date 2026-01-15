/**
 * Tests for TDD Scan-on-Signal
 *
 * Single-token format: tdd-red-task-N
 * - Dart: @Tags(['tdd-red-task-N']) or tags: ['tdd-red-task-N']
 * - TypeScript: [tdd-red-task-N] in test/describe name
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanForTddMarkers } from "../../src/core/tdd-scan-on-signal.js";

describe("TDD Scan-on-Signal", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tdd-scan-"));
    // Create test directory
    await fs.mkdir(path.join(tempDir, "test"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("scanForTddMarkers", () => {
    it("should return empty results when no test files exist", async () => {
      const result = await scanForTddMarkers(3, tempDir);

      expect(result.tests).toHaveLength(0);
    });

    it("should return empty results when no markers match task ID", async () => {
      const content = `
describe('Feature', () => {
  it('normal test', () => {
    expect(true).toBe(true);
  });
});
`;
      await fs.writeFile(
        path.join(tempDir, "test", "feature.test.ts"),
        content
      );

      const result = await scanForTddMarkers(3, tempDir);

      expect(result.tests).toHaveLength(0);
    });

    describe("TypeScript markers - single token format", () => {
      it("should detect [tdd-red-task-N] in test name", async () => {
        const content = `
describe('Widget', () => {
  it('[tdd-red-task-3] should initialize with defaults', () => {
    expect(widget.value).toBe(0);
  });
});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "widget.test.ts"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_identifier).toContain(
          "[tdd-red-task-3] should initialize with defaults"
        );
        expect(result.tests[0].test_file).toBe("test/widget.test.ts");
        expect(result.tests[0].marker_type).toBe("[tdd-red-task-3]");
      });

      it("should detect [tdd-red-task-N] in describe name", async () => {
        const content = `
describe('[tdd-red-task-5] Widget initialization', () => {
  it('should have default values', () => {
    expect(widget.x).toBe(0);
  });
});
`;
        await fs.writeFile(path.join(tempDir, "test", "init.test.ts"), content);

        const result = await scanForTddMarkers(5, tempDir);

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_identifier).toContain(
          "[tdd-red-task-5] Widget initialization"
        );
        expect(result.tests[0].marker_type).toBe("[tdd-red-task-5]");
      });

      it("should filter out tests with different task IDs", async () => {
        const content = `
describe('Features', () => {
  it('[tdd-red-task-3] task 3 test', () => {});
  it('[tdd-red-task-5] task 5 test', () => {});
  it('[tdd-red-task-3] another task 3 test', () => {});
});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "mixed.test.ts"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        expect(result.tests).toHaveLength(2);
        expect(result.tests[0].test_identifier).toContain("task 3 test");
        expect(result.tests[1].test_identifier).toContain(
          "another task 3 test"
        );
      });

      it("should detect [tdd-red-task-N] with .skip variant", async () => {
        const content = `
it.skip('[tdd-red-task-7] skipped red test', () => {
  throw new Error('not implemented');
});
`;
        await fs.writeFile(path.join(tempDir, "test", "todo.test.ts"), content);

        const result = await scanForTddMarkers(7, tempDir);

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].marker_type).toBe("[tdd-red-task-7]");
      });
    });

    describe("Dart markers - single token format", () => {
      it("should detect tags: ['tdd-red-task-N'] inline parameter", async () => {
        const content = `
void main() {
  test('should construct with defaults', () {
    expect(widget.value, equals(0));
  }, tags: ['tdd-red-task-3']);
}
`;
        await fs.writeFile(
          path.join(tempDir, "test", "widget_test.dart"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_identifier).toContain(
          "should construct with defaults"
        );
        expect(result.tests[0].test_file).toBe("test/widget_test.dart");
        expect(result.tests[0].marker_type).toBe("tags:['tdd-red-task-3']");
      });

      it("should detect file-level @Tags(['tdd-red-task-N'])", async () => {
        const content = `@Tags(['tdd-red-task-5'])
library;

import 'package:test/test.dart';

void main() {
  test('first test', () {
    expect(true, isTrue);
  });
  
  test('second test', () {
    expect(false, isFalse);
  });
}
`;
        await fs.writeFile(
          path.join(tempDir, "test", "file_tags_test.dart"),
          content
        );

        const result = await scanForTddMarkers(5, tempDir);

        // File-level tags apply to all tests
        expect(result.tests).toHaveLength(2);
        expect(result.tests[0].test_identifier).toContain("first test");
        expect(result.tests[1].test_identifier).toContain("second test");
        expect(result.tests[0].marker_type).toBe(
          "file-level-@Tags(['tdd-red-task-5'])"
        );
      });

      it("should filter Dart tests by task ID", async () => {
        const content = `
void main() {
  test('task 3 test', () {
  }, tags: ['tdd-red-task-3']);
  test('task 5 test', () {
  }, tags: ['tdd-red-task-5']);
}
`;
        await fs.writeFile(
          path.join(tempDir, "test", "mixed_test.dart"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_identifier).toContain("task 3 test");
      });
    });

    describe("Multiple files", () => {
      it("should scan multiple test files", async () => {
        const file1 = `
it('[tdd-red-task-3] test in file 1', () => {});
`;
        const file2 = `
it('[tdd-red-task-3] test in file 2', () => {});
`;
        const file3 = `
it('[tdd-red-task-5] wrong task', () => {});
`;

        await fs.writeFile(path.join(tempDir, "test", "file1.test.ts"), file1);
        await fs.writeFile(path.join(tempDir, "test", "file2.test.ts"), file2);
        await fs.writeFile(path.join(tempDir, "test", "file3.test.ts"), file3);

        const result = await scanForTddMarkers(3, tempDir);

        expect(result.tests).toHaveLength(2);
        // Sort by file path for consistent assertions
        const sortedTests = result.tests.sort((a, b) =>
          a.test_file.localeCompare(b.test_file)
        );
        expect(sortedTests[0].test_file).toBe("test/file1.test.ts");
        expect(sortedTests[1].test_file).toBe("test/file2.test.ts");
      });

      it("should handle nested test directories", async () => {
        const nestedDir = path.join(tempDir, "test", "unit", "features");
        await fs.mkdir(nestedDir, { recursive: true });

        const content = `
test('[tdd-red-task-3] nested test', () => {});
`;
        await fs.writeFile(path.join(nestedDir, "feature.test.ts"), content);

        const result = await scanForTddMarkers(3, tempDir);

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_file).toBe(
          "test/unit/features/feature.test.ts"
        );
      });
    });

    describe("Edge cases", () => {
      it("should handle malformed markers gracefully", async () => {
        const content = `
it('[tdd-red-task-] invalid task id', () => {});
it('[tdd-red:not-a-number] also invalid', () => {});
it('[tdd-red-task-3] valid test', () => {});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "malformed.test.ts"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        // Only the valid one should match
        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_identifier).toContain("valid test");
      });

      it("should skip files that cannot be read", async () => {
        // Create a valid test file
        const validContent = `
it('[tdd-red-task-3] valid test', () => {});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "valid.test.ts"),
          validContent
        );

        // Create a file in test directory that's not a test file
        await fs.writeFile(path.join(tempDir, "test", "README.md"), "# Tests");

        const result = await scanForTddMarkers(3, tempDir);

        // Should only find the valid test, not crash on README
        expect(result.tests).toHaveLength(1);
      });

      it("should handle tests without proper task ID format", async () => {
        const content = `
it('[tdd-red] test without task id', () => {});
it('[tdd-red-task-3] test with task id', () => {});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "mixed.test.ts"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        // Only the one with task ID should match
        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_identifier).toContain("test with task id");
      });

      it("should return empty array when task ID not found", async () => {
        const content = `
it('[tdd-red-task-3] task 3 test', () => {});
it('[tdd-red-task-5] task 5 test', () => {});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "tests.test.ts"),
          content
        );

        const result = await scanForTddMarkers(99, tempDir);

        expect(result.tests).toHaveLength(0);
      });

      it("should handle JavaScript test files", async () => {
        const content = `
test('[tdd-red-task-3] javascript test', () => {});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "feature.test.js"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_file).toBe("test/feature.test.js");
      });
    });

    describe("Task ID extraction", () => {
      it("should extract single-digit task IDs", async () => {
        const content = `
it('[tdd-red-task-1] test', () => {});
`;
        await fs.writeFile(path.join(tempDir, "test", "test.test.ts"), content);

        const result = await scanForTddMarkers(1, tempDir);

        expect(result.tests).toHaveLength(1);
      });

      it("should extract multi-digit task IDs", async () => {
        const content = `
it('[tdd-red-task-123] test', () => {});
`;
        await fs.writeFile(path.join(tempDir, "test", "test.test.ts"), content);

        const result = await scanForTddMarkers(123, tempDir);

        expect(result.tests).toHaveLength(1);
      });

      it("should match exact task ID not substring", async () => {
        const content = `
it('[tdd-red-task-3] task 3', () => {});
it('[tdd-red-task-33] task 33', () => {});
`;
        await fs.writeFile(path.join(tempDir, "test", "test.test.ts"), content);

        const result = await scanForTddMarkers(3, tempDir);

        // Should only match task-3, not task-33
        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_identifier).toContain("task 3");
      });
    });

    describe("Path normalization", () => {
      it("should normalize Windows path separators to forward slashes", async () => {
        const content = `
it('[tdd-red-task-3] path test', () => {});
`;
        const nestedPath = path.join(tempDir, "test", "subdir");
        await fs.mkdir(nestedPath, { recursive: true });
        await fs.writeFile(path.join(nestedPath, "nested.test.ts"), content);

        const result = await scanForTddMarkers(3, tempDir);

        expect(result.tests).toHaveLength(1);
        // Verify path uses forward slashes, not backslashes
        expect(result.tests[0].test_file).toMatch(/\//);
        expect(result.tests[0].test_file).not.toMatch(/\\/);
        expect(result.tests[0].test_file).toBe("test/subdir/nested.test.ts");
      });
    });

    describe("Boundary conditions", () => {
      it("should handle empty test directory gracefully", async () => {
        const emptyTestDir = await fs.mkdtemp(path.join(os.tmpdir(), "empty-"));
        await fs.mkdir(path.join(emptyTestDir, "test"), { recursive: true });

        const result = await scanForTddMarkers(3, emptyTestDir);

        expect(result.tests).toHaveLength(0);

        // Cleanup
        await fs.rm(emptyTestDir, { recursive: true, force: true });
      });

      it("should handle task ID zero", async () => {
        const content = `
it('[tdd-red-task-0] task zero test', () => {});
`;
        await fs.writeFile(path.join(tempDir, "test", "zero.test.ts"), content);

        const result = await scanForTddMarkers(0, tempDir);

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].test_identifier).toContain("task zero test");
      });

      it("should handle very large task IDs", async () => {
        const content = `
it('[tdd-red-task-999999] large task id', () => {});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "large.test.ts"),
          content
        );

        const result = await scanForTddMarkers(999999, tempDir);

        expect(result.tests).toHaveLength(1);
      });

      it("should handle multiple markers in same file with mixed task IDs", async () => {
        const content = `
describe('Suite', () => {
  it('[tdd-red-task-3] test 1', () => {});
  it('normal test', () => {});
  it('[tdd-red-task-5] test 2', () => {});
  it('[tdd-red-task-3] test 3', () => {});
  it('[tdd-red-task-7] test 4', () => {});
  it('[tdd-red-task-3] test 5', () => {});
});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "multi.test.ts"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        expect(result.tests).toHaveLength(3);
        expect(result.tests[0].test_identifier).toContain("test 1");
        expect(result.tests[1].test_identifier).toContain("test 3");
        expect(result.tests[2].test_identifier).toContain("test 5");
      });
    });

    describe("Old format NOT detected", () => {
      it("should NOT detect old two-token format", async () => {
        const content = `
void main() {
  test('old format test', () {
  }, tags: ['tdd-red', 'task-3']);
}
`;
        await fs.writeFile(
          path.join(tempDir, "test", "old_format_test.dart"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        // Old format should NOT be detected
        expect(result.tests).toHaveLength(0);
      });

      it("should NOT detect @Tags without task ID", async () => {
        const content = `@Tags(['tdd-red'])
library;

void main() {
  test('test without task id', () {
    expect(true, isTrue);
  });
}
`;
        await fs.writeFile(
          path.join(tempDir, "test", "no_task_id_test.dart"),
          content
        );

        const result = await scanForTddMarkers(3, tempDir);

        // Should NOT match - no task ID in marker
        expect(result.tests).toHaveLength(0);
      });
    });
  });
});
