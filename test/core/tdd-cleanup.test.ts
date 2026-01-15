/**
 * TDD Cleanup Utilities Tests
 *
 * Tests for TDD red-phase marker cleanup functions.
 * 
 * Single-token format: tdd-red:task-N
 * - TypeScript: [tdd-red:task-N] prefix in test/describe names
 * - Dart: @Tags(['tdd-red:task-N']) file-level annotation or inline tags: ['tdd-red:task-N']
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTddRedMarkers,
  detectProjectLanguage,
} from "../../src/core/tdd-cleanup.js";

/**
 * Test workspace setup helpers
 */
let testWorkspaceRoot: string;

beforeEach(() => {
  // Create temporary test workspace
  testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-test-"));
});

afterEach(() => {
  // Clean up test workspace
  if (fs.existsSync(testWorkspaceRoot)) {
    fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
  }
});

describe("detectProjectLanguage", () => {
  it("should detect TypeScript project from package.json", () => {
    // Create package.json
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "package.json"),
      JSON.stringify({ name: "test-project" })
    );

    const result = detectProjectLanguage(testWorkspaceRoot);
    expect(result).toBe("typescript");
  });

  it("should detect Dart project from pubspec.yaml", () => {
    // Create pubspec.yaml
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "pubspec.yaml"),
      "name: test_project\n"
    );

    const result = detectProjectLanguage(testWorkspaceRoot);
    expect(result).toBe("dart");
  });

  it("should prefer TypeScript when both package.json and pubspec.yaml exist", () => {
    // Create both files
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "package.json"),
      JSON.stringify({ name: "test-project" })
    );
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "pubspec.yaml"),
      "name: test_project\n"
    );

    const result = detectProjectLanguage(testWorkspaceRoot);
    expect(result).toBe("typescript");
  });

  it("should return unknown for unrecognized project", () => {
    // No package.json or pubspec.yaml
    const result = detectProjectLanguage(testWorkspaceRoot);
    expect(result).toBe("unknown");
  });
});

describe("cleanupTddRedMarkers - Dart", () => {
  beforeEach(() => {
    // Mark as Dart project
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "pubspec.yaml"),
      "name: test_project\n"
    );
  });

  it("should remove @Tags(['tdd-red:task-N']) from Dart test files", async () => {
    // Create test directory
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    // Create test file with single-token tdd-red tag
    const testFile = path.join(testDir, "feature_test.dart");
    const testContent = `import 'package:flutter_test/flutter_test.dart';

@Tags(['tdd-red:task-1'])
void main() {
  test('should fail', () {
    expect(true, false);
  });
}`;

    fs.writeFileSync(testFile, testContent);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/feature_test.dart"]);

    // Verify tag was removed
    const cleanedContent = fs.readFileSync(testFile, "utf-8");
    expect(cleanedContent).not.toContain("@Tags(['tdd-red:task-1'])");
    expect(cleanedContent).toContain("void main()");
  });

  it("should handle multiple files with tdd-red:task-N tags", async () => {
    // Create test directory
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    // Create multiple test files with single-token format
    const testFile1 = path.join(testDir, "test1.dart");
    const testFile2 = path.join(testDir, "test2.dart");

    fs.writeFileSync(
      testFile1,
      "@Tags(['tdd-red:task-1'])\nvoid main() { test('1', () {}); }"
    );
    fs.writeFileSync(
      testFile2,
      "@Tags(['tdd-red:task-2'])\nvoid main() { test('2', () {}); }"
    );

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(result.files).toContain("test/test1.dart");
    expect(result.files).toContain("test/test2.dart");
  });

  it("should skip files without tdd-red:task-N tags", async () => {
    // Create test directory
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    // Create test file without tag
    const testFile = path.join(testDir, "clean_test.dart");
    const originalContent = "void main() { test('clean', () {}); }";
    fs.writeFileSync(testFile, originalContent);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);

    // Verify file unchanged
    const content = fs.readFileSync(testFile, "utf-8");
    expect(content).toBe(originalContent);
  });

  it("should return false when no test files exist", async () => {
    // No test directory
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);
  });

  it("should handle nested test directories", async () => {
    // Create nested test directory
    const nestedDir = path.join(testWorkspaceRoot, "test", "unit", "features");
    fs.mkdirSync(nestedDir, { recursive: true });

    // Create test file in nested directory with single-token format
    const testFile = path.join(nestedDir, "nested_test.dart");
    fs.writeFileSync(testFile, "@Tags(['tdd-red:task-1'])\nvoid main() {}");

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toContain("test/unit/features/nested_test.dart");
  });

  it("should remove inline tags with single-token format", async () => {
    // Create test directory
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    // Create test file with inline tdd-red tag
    const testFile = path.join(testDir, "inline_test.dart");
    const testContent = `void main() {
  test('widget renders', () {
    expect(true, isTrue);
  }, tags: ['tdd-red:task-1']);
}`;

    fs.writeFileSync(testFile, testContent);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/inline_test.dart"]);

    // Verify inline tag was removed
    const cleanedContent = fs.readFileSync(testFile, "utf-8");
    expect(cleanedContent).not.toContain("tags: ['tdd-red:task-1']");
    expect(cleanedContent).toContain("widget renders");
  });
});

describe("cleanupTddRedMarkers - TypeScript", () => {
  beforeEach(() => {
    // Mark as TypeScript project
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "package.json"),
      JSON.stringify({ name: "test-project" })
    );
  });

  it("should remove [tdd-red:task-N] markers from test names", async () => {
    // Create test directory with test file containing markers
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    const testFile = path.join(testDir, "feature.test.ts");
    fs.writeFileSync(
      testFile,
      `describe('[tdd-red:task-1] Feature', () => {
  it('[tdd-red:task-1] should work', () => {});
});`
    );

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/feature.test.ts"]);

    // Verify markers were removed
    const cleanedContent = fs.readFileSync(testFile, "utf-8");
    expect(cleanedContent).not.toContain("[tdd-red:task-1]");
    expect(cleanedContent).toContain("Feature");
    expect(cleanedContent).toContain("should work");
  });

  it("should handle multiple test files with markers", async () => {
    // Create test directory with multiple test files
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    fs.writeFileSync(
      path.join(testDir, "test1.test.ts"),
      "test('[tdd-red:task-1] test 1', () => {});"
    );
    fs.writeFileSync(
      path.join(testDir, "test2.test.ts"),
      "test('[tdd-red:task-2] test 2', () => {});"
    );
    fs.writeFileSync(
      path.join(testDir, "test3.test.ts"),
      "test('[tdd-red:task-3] test 3', () => {});"
    );

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toHaveLength(3);
    expect(result.files).toContain("test/test1.test.ts");
    expect(result.files).toContain("test/test2.test.ts");
    expect(result.files).toContain("test/test3.test.ts");
  });

  it("should skip test files without markers", async () => {
    // Create test directory with clean test file
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    const testFile = path.join(testDir, "clean.test.ts");
    const originalContent = "test('clean test', () => {});";
    fs.writeFileSync(testFile, originalContent);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);

    // Verify file unchanged
    const content = fs.readFileSync(testFile, "utf-8");
    expect(content).toBe(originalContent);
  });

  it("should return false when no test files exist", async () => {
    // No test directory
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);
  });

  it("should handle nested test directories", async () => {
    // Create nested test directory
    const nestedDir = path.join(testWorkspaceRoot, "test", "unit", "features");
    fs.mkdirSync(nestedDir, { recursive: true });

    const testFile = path.join(nestedDir, "nested.test.ts");
    fs.writeFileSync(
      testFile,
      "describe('[tdd-red:task-1] nested', () => {});"
    );

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toContain("test/unit/features/nested.test.ts");
  });

  it("should clean up markers from multiple task IDs in same file", async () => {
    // Create test file with multiple task IDs
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    const testFile = path.join(testDir, "multi.test.ts");
    fs.writeFileSync(
      testFile,
      `describe('[tdd-red:task-1] feature 1', () => {
  it('test 1', () => {});
});

describe('[tdd-red:task-2] feature 2', () => {
  it('test 2', () => {});
});`
    );

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify all markers removed
    const cleanedContent = fs.readFileSync(testFile, "utf-8");
    expect(cleanedContent).not.toContain("[tdd-red:task-1]");
    expect(cleanedContent).not.toContain("[tdd-red:task-2]");
    expect(cleanedContent).toContain("feature 1");
    expect(cleanedContent).toContain("feature 2");
    expect(result.cleaned).toBe(true);
  });
});

describe("cleanupTddRedMarkers - Unknown language", () => {
  it("should return false for unknown project type", async () => {
    // No package.json or pubspec.yaml
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);
  });
});

describe("cleanupTddRedMarkers - Edge cases", () => {
  it("should handle Dart files with multiple @Tags(['tdd-red:task-N']) instances", async () => {
    // Mark as Dart project
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "pubspec.yaml"),
      "name: test_project\n"
    );

    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    // Create test file with file-level and inline tags
    const testFile = path.join(testDir, "multi_test.dart");
    const testContent = `import 'package:flutter_test/flutter_test.dart';

@Tags(['tdd-red:task-1'])
void main() {
  test('first', () {
    expect(true, false);
  }, tags: ['tdd-red:task-2']);
}`;

    fs.writeFileSync(testFile, testContent);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify all tags were removed
    const cleanedContent = fs.readFileSync(testFile, "utf-8");
    expect(cleanedContent).not.toContain("@Tags(['tdd-red:task-1'])");
    expect(cleanedContent).not.toContain("tags: ['tdd-red:task-2']");
    expect(result.cleaned).toBe(true);
  });

  it("should preserve file content integrity when removing Dart tags", async () => {
    // Mark as Dart project
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "pubspec.yaml"),
      "name: test_project\n"
    );

    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    const testFile = path.join(testDir, "preserve_test.dart");
    const testContent = `import 'package:flutter_test/flutter_test.dart';

@Tags(['tdd-red:task-1'])
void main() {
  test('should preserve this content', () {
    final value = 42;
    expect(value, equals(42));
  });
}`;

    fs.writeFileSync(testFile, testContent);

    // Run cleanup
    await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify content integrity
    const cleanedContent = fs.readFileSync(testFile, "utf-8");
    expect(cleanedContent).toContain("void main()");
    expect(cleanedContent).toContain("should preserve this content");
    expect(cleanedContent).toContain("final value = 42");
    expect(cleanedContent).not.toContain("@Tags(['tdd-red:task-1'])");
  });

  it("should preserve TypeScript file content integrity when removing markers", async () => {
    // Mark as TypeScript project
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "package.json"),
      JSON.stringify({ name: "test-project" })
    );

    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    const testFile = path.join(testDir, "preserve.test.ts");
    const testContent = `describe('[tdd-red:task-1] important feature', () => {
  it('should preserve this content', () => {
    const value = 42;
    expect(value).toBe(42);
  });
});`;

    fs.writeFileSync(testFile, testContent);

    // Run cleanup
    await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify content integrity
    const cleanedContent = fs.readFileSync(testFile, "utf-8");
    expect(cleanedContent).toContain("important feature");
    expect(cleanedContent).toContain("should preserve this content");
    expect(cleanedContent).toContain("const value = 42");
    expect(cleanedContent).not.toContain("[tdd-red:task-1]");
  });
});
