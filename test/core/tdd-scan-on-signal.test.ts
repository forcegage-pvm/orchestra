// @orchestra-task: 1
/**
 * Tests for TDD Scan-on-Signal
 *
 * Per DESIGN.md - TWO SEPARATE CONCERNS:
 * 1. Test runner filtering: @Tags(['tdd-red']) or [tdd-red] - NO task ID in tag
 * 2. Task linking: // @orchestra-task: N - file-level comment
 *
 * API: scanForTddMarkers(workspaceRoot) returns all markers grouped by task ID
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
    await fs.mkdir(path.join(tempDir, "test"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("scanForTddMarkers", () => {
    it("should return empty results when no test files exist", async () => {
      const result = await scanForTddMarkers(tempDir);

      expect(result.testsByTask.size).toBe(0);
      expect(result.totalFiles).toBe(0);
      expect(result.totalTests).toBe(0);
      expect(result.filesWithoutTaskId).toHaveLength(0);
    });

    it("should return empty results when no markers exist", async () => {
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

      const result = await scanForTddMarkers(tempDir);

      expect(result.testsByTask.size).toBe(0);
      expect(result.totalTests).toBe(0);
    });

    describe("TypeScript markers - [tdd-red] format", () => {
      it("should detect [tdd-red] marker with // @orchestra-task: N", async () => {
        const content = `// @orchestra-task: 3

describe('Widget', () => {
  it('[tdd-red] should initialize with defaults', () => {
    expect(widget.value).toBe(0);
  });
});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "widget.test.ts"),
          content
        );

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(3)).toBe(true);
        const task3Files = result.testsByTask.get(3)!;
        expect(task3Files).toHaveLength(1);
        expect(task3Files[0].test_file).toBe("test/widget.test.ts");
        expect(task3Files[0].test_count).toBe(1);
      });

      it("should detect [tdd-red] marker in describe name", async () => {
        const content = `// @orchestra-task: 5

describe('[tdd-red] Widget initialization', () => {
  it('should have default values', () => {
    expect(widget.x).toBe(0);
  });
});
`;
        await fs.writeFile(path.join(tempDir, "test", "init.test.ts"), content);

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(5)).toBe(true);
        const task5Files = result.testsByTask.get(5)!;
        expect(task5Files).toHaveLength(1);
        expect(task5Files[0].test_file).toBe("test/init.test.ts");
      });

      it("should group tests by task ID from multiple files", async () => {
        // File with task 3 markers
        await fs.writeFile(
          path.join(tempDir, "test", "a.test.ts"),
          `// @orchestra-task: 3\nit('[tdd-red] test a', () => {});`
        );
        // File with task 5 markers
        await fs.writeFile(
          path.join(tempDir, "test", "b.test.ts"),
          `// @orchestra-task: 5\nit('[tdd-red] test b', () => {});`
        );
        // Another file with task 3 markers
        await fs.writeFile(
          path.join(tempDir, "test", "c.test.ts"),
          `// @orchestra-task: 3\nit('[tdd-red] test c', () => {});`
        );

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.size).toBe(2);
        expect(result.testsByTask.has(3)).toBe(true);
        expect(result.testsByTask.has(5)).toBe(true);

        const task3Files = result.testsByTask.get(3)!;
        expect(task3Files).toHaveLength(2);

        const task5Files = result.testsByTask.get(5)!;
        expect(task5Files).toHaveLength(1);
      });

      it("should detect [tdd-red] marker with .skip variant", async () => {
        const content = `// @orchestra-task: 7

it.skip('[tdd-red] skipped red test', () => {
  throw new Error('not implemented');
});
`;
        await fs.writeFile(path.join(tempDir, "test", "todo.test.ts"), content);

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(7)).toBe(true);
      });

      it("should report files missing // @orchestra-task: N", async () => {
        const content = `
describe('Widget', () => {
  it('[tdd-red] test without task ID', () => {});
});
`;
        await fs.writeFile(
          path.join(tempDir, "test", "missing.test.ts"),
          content
        );

        const result = await scanForTddMarkers(tempDir);

        expect(result.filesWithoutTaskId).toHaveLength(1);
        expect(result.filesWithoutTaskId[0]).toBe("test/missing.test.ts");
        expect(result.testsByTask.size).toBe(0); // Not grouped since no task ID
      });
    });

    describe("Dart markers - @Tags(['tdd-red']) format", () => {
      it("should detect tags: ['tdd-red'] inline parameter", async () => {
        const content = `// @orchestra-task: 3

void main() {
  test('should construct with defaults', () {
    expect(widget.value, equals(0));
  }, tags: ['tdd-red']);
}
`;
        await fs.writeFile(
          path.join(tempDir, "test", "widget_test.dart"),
          content
        );

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(3)).toBe(true);
        const task3Files = result.testsByTask.get(3)!;
        expect(task3Files).toHaveLength(1);
        expect(task3Files[0].test_file).toBe("test/widget_test.dart");
      });

      it("should detect file-level @Tags(['tdd-red'])", async () => {
        const content = `// @orchestra-task: 3
@Tags(['tdd-red'])
library;

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('test 1', () {
    expect(true, isTrue);
  });

  test('test 2', () {
    expect(true, isTrue);
  });
}
`;
        await fs.writeFile(
          path.join(tempDir, "test", "tagged_test.dart"),
          content
        );

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(3)).toBe(true);
        const task3Files = result.testsByTask.get(3)!;
        expect(task3Files).toHaveLength(1);
      });

      it("should group Dart tests by task ID", async () => {
        // File with task 3
        await fs.writeFile(
          path.join(tempDir, "test", "a_test.dart"),
          `// @orchestra-task: 3\nvoid main() { test('test', () {}, tags: ['tdd-red']); }`
        );
        // File with task 5
        await fs.writeFile(
          path.join(tempDir, "test", "b_test.dart"),
          `// @orchestra-task: 5\nvoid main() { test('test', () {}, tags: ['tdd-red']); }`
        );

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.size).toBe(2);
        expect(result.testsByTask.has(3)).toBe(true);
        expect(result.testsByTask.has(5)).toBe(true);
      });
    });

    describe("Multiple files", () => {
      it("should scan multiple test files", async () => {
        await fs.writeFile(
          path.join(tempDir, "test", "a.test.ts"),
          `// @orchestra-task: 3
it('[tdd-red] test a1', () => {});
it('[tdd-red] test a2', () => {});`
        );
        await fs.writeFile(
          path.join(tempDir, "test", "b.test.ts"),
          `// @orchestra-task: 3
it('[tdd-red] test b', () => {});`
        );

        const result = await scanForTddMarkers(tempDir);

        const task3Files = result.testsByTask.get(3)!;
        expect(task3Files).toHaveLength(2);
        expect(result.totalTests).toBe(3);
      });

      it("should handle nested test directories", async () => {
        await fs.mkdir(path.join(tempDir, "test", "nested", "deep"), {
          recursive: true,
        });
        await fs.writeFile(
          path.join(tempDir, "test", "nested", "deep", "feature.test.ts"),
          `// @orchestra-task: 3\nit('[tdd-red] nested test', () => {});`
        );

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(3)).toBe(true);
        const task3Files = result.testsByTask.get(3)!;
        expect(task3Files[0].test_file).toBe(
          "test/nested/deep/feature.test.ts"
        );
      });
    });

    describe("Edge cases", () => {
      it("should skip files that cannot be read", async () => {
        await fs.writeFile(
          path.join(tempDir, "test", "valid.test.ts"),
          `// @orchestra-task: 3\nit('[tdd-red] test', () => {});`
        );
        // Create a directory with .test.ts extension (will fail to read)
        await fs.mkdir(path.join(tempDir, "test", "dir.test.ts"));

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(3)).toBe(true);
      });

      it("should separate files with and without task IDs", async () => {
        // File WITH task ID
        await fs.writeFile(
          path.join(tempDir, "test", "with_id.test.ts"),
          `// @orchestra-task: 3\nit('[tdd-red] test', () => {});`
        );
        // File WITHOUT task ID
        await fs.writeFile(
          path.join(tempDir, "test", "without_id.test.ts"),
          `it('[tdd-red] test', () => {});`
        );

        const result = await scanForTddMarkers(tempDir);

        // Only file with task ID should be in testsByTask
        expect(result.testsByTask.size).toBe(1);
        expect(result.testsByTask.has(3)).toBe(true);

        // File without task ID should be in filesWithoutTaskId
        expect(result.filesWithoutTaskId).toHaveLength(1);
        expect(result.filesWithoutTaskId[0]).toBe("test/without_id.test.ts");
      });
    });
  });
});
