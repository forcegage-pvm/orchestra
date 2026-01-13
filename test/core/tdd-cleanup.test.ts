/**
 * TDD Cleanup Utilities Tests
 *
 * Tests for TDD red-phase marker cleanup functions.
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

  it("should remove @Tags(['tdd-red']) from Dart test files", async () => {
    // Create test directory
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    // Create test file with tdd-red tag
    const testFile = path.join(testDir, "feature_test.dart");
    const testContent = `import 'package:flutter_test/flutter_test.dart';

@Tags(['tdd-red'])
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
    expect(cleanedContent).not.toContain("@Tags(['tdd-red'])");
    expect(cleanedContent).toContain("void main()");
  });

  it("should handle multiple files with tdd-red tags", async () => {
    // Create test directory
    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    // Create multiple test files
    const testFile1 = path.join(testDir, "test1.dart");
    const testFile2 = path.join(testDir, "test2.dart");

    fs.writeFileSync(
      testFile1,
      "@Tags(['tdd-red'])\nvoid main() { test('1', () {}); }"
    );
    fs.writeFileSync(
      testFile2,
      "@Tags(['tdd-red'])\nvoid main() { test('2', () {}); }"
    );

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(result.files).toContain("test/test1.dart");
    expect(result.files).toContain("test/test2.dart");
  });

  it("should skip files without tdd-red tags", async () => {
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

    // Create test file in nested directory
    const testFile = path.join(nestedDir, "nested_test.dart");
    fs.writeFileSync(testFile, "@Tags(['tdd-red'])\nvoid main() {}");

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toContain("test/unit/features/nested_test.dart");
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

  it("should move test files from test/tdd-red/ to test/unit/", async () => {
    // Create tdd-red directory with test file
    const tddRedDir = path.join(testWorkspaceRoot, "test", "tdd-red");
    fs.mkdirSync(tddRedDir, { recursive: true });

    const testFile = path.join(tddRedDir, "feature.test.ts");
    fs.writeFileSync(
      testFile,
      "describe('Feature', () => { it('fails', () => {}); });"
    );

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["feature.test.ts"]);

    // Verify file was moved
    const unitDir = path.join(testWorkspaceRoot, "test", "unit");
    const movedFile = path.join(unitDir, "feature.test.ts");
    expect(fs.existsSync(movedFile)).toBe(true);
    expect(fs.existsSync(testFile)).toBe(false);
  });

  it("should create test/unit/ directory if it doesn't exist", async () => {
    // Create tdd-red directory only
    const tddRedDir = path.join(testWorkspaceRoot, "test", "tdd-red");
    fs.mkdirSync(tddRedDir, { recursive: true });

    const testFile = path.join(tddRedDir, "feature.test.ts");
    fs.writeFileSync(testFile, "test content");

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify unit directory was created
    const unitDir = path.join(testWorkspaceRoot, "test", "unit");
    expect(fs.existsSync(unitDir)).toBe(true);
    expect(result.cleaned).toBe(true);
  });

  it("should handle multiple test files", async () => {
    // Create tdd-red directory with multiple test files
    const tddRedDir = path.join(testWorkspaceRoot, "test", "tdd-red");
    fs.mkdirSync(tddRedDir, { recursive: true });

    fs.writeFileSync(path.join(tddRedDir, "test1.test.ts"), "test 1");
    fs.writeFileSync(path.join(tddRedDir, "test2.test.ts"), "test 2");
    fs.writeFileSync(path.join(tddRedDir, "test3.test.ts"), "test 3");

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toHaveLength(3);
    expect(result.files).toContain("test1.test.ts");
    expect(result.files).toContain("test2.test.ts");
    expect(result.files).toContain("test3.test.ts");
  });

  it("should skip non-test files in tdd-red directory", async () => {
    // Create tdd-red directory with mixed files
    const tddRedDir = path.join(testWorkspaceRoot, "test", "tdd-red");
    fs.mkdirSync(tddRedDir, { recursive: true });

    fs.writeFileSync(path.join(tddRedDir, "feature.test.ts"), "test");
    fs.writeFileSync(path.join(tddRedDir, "README.md"), "readme");
    fs.writeFileSync(path.join(tddRedDir, "helper.ts"), "helper");

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify only test files were moved
    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["feature.test.ts"]);

    // Verify non-test files remain
    expect(fs.existsSync(path.join(tddRedDir, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(tddRedDir, "helper.ts"))).toBe(true);
  });

  it("should remove tdd-red directory if empty after cleanup", async () => {
    // Create tdd-red directory with only test files
    const tddRedDir = path.join(testWorkspaceRoot, "test", "tdd-red");
    fs.mkdirSync(tddRedDir, { recursive: true });

    fs.writeFileSync(path.join(tddRedDir, "feature.test.ts"), "test");

    // Run cleanup
    await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify tdd-red directory was removed
    expect(fs.existsSync(tddRedDir)).toBe(false);
  });

  it("should keep tdd-red directory if non-test files remain", async () => {
    // Create tdd-red directory with mixed files
    const tddRedDir = path.join(testWorkspaceRoot, "test", "tdd-red");
    fs.mkdirSync(tddRedDir, { recursive: true });

    fs.writeFileSync(path.join(tddRedDir, "feature.test.ts"), "test");
    fs.writeFileSync(path.join(tddRedDir, "README.md"), "readme");

    // Run cleanup
    await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify tdd-red directory still exists
    expect(fs.existsSync(tddRedDir)).toBe(true);
    expect(fs.existsSync(path.join(tddRedDir, "README.md"))).toBe(true);
  });

  it("should return false when tdd-red directory doesn't exist", async () => {
    // No tdd-red directory
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);
  });

  it("should return false when tdd-red directory is empty", async () => {
    // Create empty tdd-red directory
    const tddRedDir = path.join(testWorkspaceRoot, "test", "tdd-red");
    fs.mkdirSync(tddRedDir, { recursive: true });

    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);
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
  it("should handle Dart files with multiple @Tags(['tdd-red']) instances", async () => {
    // Mark as Dart project
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "pubspec.yaml"),
      "name: test_project\n"
    );

    const testDir = path.join(testWorkspaceRoot, "test");
    fs.mkdirSync(testDir, { recursive: true });

    // Create test file with multiple tags
    const testFile = path.join(testDir, "multi_test.dart");
    const testContent = `import 'package:flutter_test/flutter_test.dart';

@Tags(['tdd-red'])
void main() {
  @Tags(['tdd-red'])
  test('first', () {
    expect(true, false);
  });
}`;

    fs.writeFileSync(testFile, testContent);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify all tags were removed
    const cleanedContent = fs.readFileSync(testFile, "utf-8");
    expect(cleanedContent).not.toContain("@Tags(['tdd-red'])");
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

@Tags(['tdd-red'])
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
    expect(cleanedContent).not.toContain("@Tags(['tdd-red'])");
  });
});
