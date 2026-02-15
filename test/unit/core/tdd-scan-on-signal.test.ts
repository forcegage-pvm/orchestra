/**
 * Tests for TDD Scan-on-Signal
 *
 * Path-based detection: scans test/red/ directory using fs.readdir
 * instead of glob+content scanning.
 *
 * Task linking: // @orchestra-task: N - file-level comment
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanForTddMarkers } from "../../../src/core/tdd-scan-on-signal.js";

describe("TDD Scan-on-Signal", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tdd-scan-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("scanForTddMarkers", () => {
    it("should return empty results when test/red/ directory does not exist", async () => {
      const result = await scanForTddMarkers(tempDir);

      expect(result.testsByTask.size).toBe(0);
      expect(result.totalFiles).toBe(0);
      expect(result.totalTests).toBe(0);
      expect(result.filesWithoutTaskId).toHaveLength(0);
    });

    it("should return empty results when test/red/ is empty", async () => {
      await fs.mkdir(path.join(tempDir, "test", "red"), { recursive: true });

      const result = await scanForTddMarkers(tempDir);

      expect(result.testsByTask.size).toBe(0);
      expect(result.totalFiles).toBe(0);
      expect(result.totalTests).toBe(0);
    });

    it("should ignore test files NOT in test/red/", async () => {
      // Create test files outside test/red/
      const unitDir = path.join(tempDir, "test", "unit");
      await fs.mkdir(unitDir, { recursive: true });
      await fs.writeFile(
        path.join(unitDir, "feature.test.ts"),
        `// @orchestra-task: 3\nit('test', () => {});`,
      );

      // Also create test/red/ (empty)
      await fs.mkdir(path.join(tempDir, "test", "red"), { recursive: true });

      const result = await scanForTddMarkers(tempDir);

      expect(result.testsByTask.size).toBe(0);
      expect(result.totalFiles).toBe(0);
    });

    describe("Directory-based file discovery", () => {
      it("should discover test files in test/red/", async () => {
        const redDir = path.join(tempDir, "test", "red");
        await fs.mkdir(redDir, { recursive: true });

        const content = `// @orchestra-task: 3

describe('Widget', () => {
  it('should initialize with defaults', () => {
    expect(widget.value).toBe(0);
  });
});
`;
        await fs.writeFile(path.join(redDir, "widget.test.ts"), content);

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(3)).toBe(true);
        const task3Files = result.testsByTask.get(3)!;
        expect(task3Files).toHaveLength(1);
        expect(task3Files[0].test_file).toBe("test/red/widget.test.ts");
        expect(task3Files[0].test_count).toBe(1);
      });

      it("should group tests by task ID from multiple files", async () => {
        const redDir = path.join(tempDir, "test", "red");
        await fs.mkdir(redDir, { recursive: true });

        // File with task 3
        await fs.writeFile(
          path.join(redDir, "a.test.ts"),
          `// @orchestra-task: 3\nit('test a', () => {});`,
        );
        // File with task 5
        await fs.writeFile(
          path.join(redDir, "b.test.ts"),
          `// @orchestra-task: 5\nit('test b', () => {});`,
        );
        // Another file with task 3
        await fs.writeFile(
          path.join(redDir, "c.test.ts"),
          `// @orchestra-task: 3\nit('test c', () => {});`,
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

      it("should report files missing // @orchestra-task: N", async () => {
        const redDir = path.join(tempDir, "test", "red");
        await fs.mkdir(redDir, { recursive: true });

        const content = `
describe('Widget', () => {
  it('test without task ID', () => {});
});
`;
        await fs.writeFile(path.join(redDir, "missing.test.ts"), content);

        const result = await scanForTddMarkers(tempDir);

        expect(result.filesWithoutTaskId).toHaveLength(1);
        expect(result.filesWithoutTaskId[0]).toBe("test/red/missing.test.ts");
        expect(result.testsByTask.size).toBe(0);
      });

      it("should handle nested test directories under test/red/", async () => {
        const nestedDir = path.join(tempDir, "test", "red", "nested", "deep");
        await fs.mkdir(nestedDir, { recursive: true });

        await fs.writeFile(
          path.join(nestedDir, "feature.test.ts"),
          `// @orchestra-task: 3\nit('nested test', () => {});`,
        );

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(3)).toBe(true);
        const task3Files = result.testsByTask.get(3)!;
        expect(task3Files[0].test_file).toBe(
          "test/red/nested/deep/feature.test.ts",
        );
      });
    });

    describe("Multiple files", () => {
      it("should scan multiple test files", async () => {
        const redDir = path.join(tempDir, "test", "red");
        await fs.mkdir(redDir, { recursive: true });

        await fs.writeFile(
          path.join(redDir, "a.test.ts"),
          `// @orchestra-task: 3\nit('test a1', () => {});`,
        );
        await fs.writeFile(
          path.join(redDir, "b.test.ts"),
          `// @orchestra-task: 3\nit('test b', () => {});`,
        );

        const result = await scanForTddMarkers(tempDir);

        const task3Files = result.testsByTask.get(3)!;
        expect(task3Files).toHaveLength(2);
        expect(result.totalTests).toBe(2);
      });
    });

    describe("Edge cases", () => {
      it("should skip files that cannot be read", async () => {
        const redDir = path.join(tempDir, "test", "red");
        await fs.mkdir(redDir, { recursive: true });

        await fs.writeFile(
          path.join(redDir, "valid.test.ts"),
          `// @orchestra-task: 3\nit('test', () => {});`,
        );
        // Create a directory with .test.ts extension (will fail to read as file)
        await fs.mkdir(path.join(redDir, "dir.test.ts"));

        const result = await scanForTddMarkers(tempDir);

        expect(result.testsByTask.has(3)).toBe(true);
      });

      it("should separate files with and without task IDs", async () => {
        const redDir = path.join(tempDir, "test", "red");
        await fs.mkdir(redDir, { recursive: true });

        // File WITH task ID
        await fs.writeFile(
          path.join(redDir, "with_id.test.ts"),
          `// @orchestra-task: 3\nit('test', () => {});`,
        );
        // File WITHOUT task ID
        await fs.writeFile(
          path.join(redDir, "without_id.test.ts"),
          `it('test', () => {});`,
        );

        const result = await scanForTddMarkers(tempDir);

        // Only file with task ID should be in testsByTask
        expect(result.testsByTask.size).toBe(1);
        expect(result.testsByTask.has(3)).toBe(true);

        // File without task ID should be in filesWithoutTaskId
        expect(result.filesWithoutTaskId).toHaveLength(1);
        expect(result.filesWithoutTaskId[0]).toBe("test/red/without_id.test.ts");
      });

      it("should skip non-test files in test/red/", async () => {
        const redDir = path.join(tempDir, "test", "red");
        await fs.mkdir(redDir, { recursive: true });

        // This is a test file
        await fs.writeFile(
          path.join(redDir, "feature.test.ts"),
          `// @orchestra-task: 3\nit('test', () => {});`,
        );
        // This is NOT a test file
        await fs.writeFile(
          path.join(redDir, "helper.ts"),
          `export const helper = true;`,
        );
        // README
        await fs.writeFile(
          path.join(redDir, "README.md"),
          `# Red phase tests`,
        );

        const result = await scanForTddMarkers(tempDir);

        expect(result.totalFiles).toBe(1);
        expect(result.testsByTask.has(3)).toBe(true);
      });
    });
  });
});
