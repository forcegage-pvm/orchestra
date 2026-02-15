/**
 * TDD Cleanup Utilities Tests
 *
 * Tests for the directory-based TDD promotion workflow:
 * - TypeScript: moves files from test/red/{tier}/ to test/{tier}/
 * - Dart: moves files from test/red/{tier}/ to test/{tier}/ (directory-based)
 *
 * Also tests language detection and edge cases.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTddRedMarkers,
  detectProjectLanguage,
  removeOrchestraTaskComment,
} from "../../../src/core/tdd-cleanup.js";

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
      JSON.stringify({ name: "test-project" }),
    );

    const result = detectProjectLanguage(testWorkspaceRoot);
    expect(result).toBe("typescript");
  });

  it("should detect Dart project from pubspec.yaml", () => {
    // Create pubspec.yaml
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "pubspec.yaml"),
      "name: test_project\n",
    );

    const result = detectProjectLanguage(testWorkspaceRoot);
    expect(result).toBe("dart");
  });

  it("should prefer TypeScript when both package.json and pubspec.yaml exist", () => {
    // Create both files
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "pubspec.yaml"),
      "name: test_project\n",
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

describe("removeOrchestraTaskComment", () => {
  it("should remove // @orchestra-task: N comment line", () => {
    const content = `// @orchestra-task: 3\ndescribe('Feature', () => {\n  it('works', () => {});\n});\n`;
    const result = removeOrchestraTaskComment(content);
    expect(result).not.toContain("@orchestra-task");
    expect(result).toContain("describe('Feature'");
  });

  it("should remove # @orchestra-task: N comment line (Python style)", () => {
    const content = `# @orchestra-task: 7\ndef test_feature():\n    assert True\n`;
    const result = removeOrchestraTaskComment(content);
    expect(result).not.toContain("@orchestra-task");
    expect(result).toContain("def test_feature");
  });

  it("should handle leading whitespace before comment", () => {
    const content = `  // @orchestra-task: 5\ndescribe('test', () => {});\n`;
    const result = removeOrchestraTaskComment(content);
    expect(result).not.toContain("@orchestra-task");
    expect(result).toContain("describe('test'");
  });

  it("should handle Windows line endings (\\r\\n)", () => {
    const content = "// @orchestra-task: 3\r\ndescribe('Feature', () => {});\r\n";
    const result = removeOrchestraTaskComment(content);
    expect(result).not.toContain("@orchestra-task");
    expect(result).toContain("describe('Feature'");
  });

  it("should leave content unchanged when no task comment present", () => {
    const content = `describe('Feature', () => {\n  it('works', () => {});\n});\n`;
    const result = removeOrchestraTaskComment(content);
    expect(result).toBe(content);
  });

  it("should remove multiple @orchestra-task comments", () => {
    const content = `// @orchestra-task: 3\n// @orchestra-task: 5\ndescribe('test', () => {});\n`;
    const result = removeOrchestraTaskComment(content);
    expect(result).not.toContain("@orchestra-task");
    expect(result).toContain("describe('test'");
  });
});

describe("cleanupTddRedMarkers - TypeScript (file promotion)", () => {
  beforeEach(() => {
    // Mark as TypeScript project
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );
  });

  it("should move files from test/red/unit/ to test/unit/", async () => {
    // Create test file in test/red/unit/
    const redDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    fs.mkdirSync(redDir, { recursive: true });

    const srcFile = path.join(redDir, "feature.test.ts");
    const fileContent = `// @orchestra-task: 3\ndescribe('Feature', () => {\n  it('should work', () => {\n    expect(true).toBe(true);\n  });\n});\n`;
    fs.writeFileSync(srcFile, fileContent);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/unit/feature.test.ts"]);

    // Verify file was moved
    const destFile = path.join(testWorkspaceRoot, "test", "unit", "feature.test.ts");
    expect(fs.existsSync(destFile)).toBe(true);
    expect(fs.existsSync(srcFile)).toBe(false);

    // Verify @orchestra-task comment was removed
    const destContent = fs.readFileSync(destFile, "utf-8");
    expect(destContent).not.toContain("@orchestra-task");
    expect(destContent).toContain("describe('Feature'");
  });

  it("should preserve subdirectory structure during promotion", async () => {
    // Create nested file: test/red/unit/nested/deep/foo.test.ts
    const deepDir = path.join(testWorkspaceRoot, "test", "red", "unit", "nested", "deep");
    fs.mkdirSync(deepDir, { recursive: true });

    const srcFile = path.join(deepDir, "foo.test.ts");
    fs.writeFileSync(srcFile, `// @orchestra-task: 5\ndescribe('Nested', () => {\n  it('deep test', () => {});\n});\n`);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/unit/nested/deep/foo.test.ts"]);

    // Verify the file was moved to the correct nested destination
    const destFile = path.join(testWorkspaceRoot, "test", "unit", "nested", "deep", "foo.test.ts");
    expect(fs.existsSync(destFile)).toBe(true);
    expect(fs.existsSync(srcFile)).toBe(false);
  });

  it("should remove // @orchestra-task: N comment from promoted file content", async () => {
    const redDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    fs.mkdirSync(redDir, { recursive: true });

    const srcFile = path.join(redDir, "task-comment.test.ts");
    const content = `// @orchestra-task: 42\n\ndescribe('Test Suite', () => {\n  it('should validate', () => {\n    const value = 42;\n    expect(value).toBe(42);\n  });\n});\n`;
    fs.writeFileSync(srcFile, content);

    await cleanupTddRedMarkers(testWorkspaceRoot);

    const destFile = path.join(testWorkspaceRoot, "test", "unit", "task-comment.test.ts");
    const promotedContent = fs.readFileSync(destFile, "utf-8");
    expect(promotedContent).not.toContain("// @orchestra-task: 42");
    expect(promotedContent).not.toContain("@orchestra-task");
    expect(promotedContent).toContain("describe('Test Suite'");
    expect(promotedContent).toContain("const value = 42");
  });

  it("should also remove # @orchestra-task: N comment from promoted file content", async () => {
    const redDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    fs.mkdirSync(redDir, { recursive: true });

    const srcFile = path.join(redDir, "python-style.test.ts");
    const content = `# @orchestra-task: 7\ndescribe('Test', () => {\n  it('works', () => {});\n});\n`;
    fs.writeFileSync(srcFile, content);

    await cleanupTddRedMarkers(testWorkspaceRoot);

    const destFile = path.join(testWorkspaceRoot, "test", "unit", "python-style.test.ts");
    const promotedContent = fs.readFileSync(destFile, "utf-8");
    expect(promotedContent).not.toContain("@orchestra-task");
    expect(promotedContent).toContain("describe('Test'");
  });

  it("should fail with conflict error if destination file already exists", async () => {
    // Create source file in test/red/unit/
    const redDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    fs.mkdirSync(redDir, { recursive: true });
    fs.writeFileSync(
      path.join(redDir, "conflict.test.ts"),
      `// @orchestra-task: 1\ndescribe('conflict', () => {});\n`,
    );

    // Create conflicting destination file
    const destDir = path.join(testWorkspaceRoot, "test", "unit");
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(
      path.join(destDir, "conflict.test.ts"),
      `describe('existing', () => {});\n`,
    );

    // Cleanup should throw
    await expect(cleanupTddRedMarkers(testWorkspaceRoot)).rejects.toThrow(
      /Promotion conflict.*destination file already exists.*test\/unit\/conflict\.test\.ts/,
    );
  });

  it("should fail-fast on first conflict with partial promotion", async () => {
    // Create multiple source files: A, B, C
    const redDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    fs.mkdirSync(redDir, { recursive: true });

    // File A (should promote successfully)
    fs.writeFileSync(
      path.join(redDir, "a.test.ts"),
      `// @orchestra-task: 1\ndescribe('A', () => {});\n`,
    );
    // File B (will conflict)
    fs.writeFileSync(
      path.join(redDir, "b.test.ts"),
      `// @orchestra-task: 2\ndescribe('B', () => {});\n`,
    );
    // File C (should never be attempted)
    fs.writeFileSync(
      path.join(redDir, "c.test.ts"),
      `// @orchestra-task: 3\ndescribe('C', () => {});\n`,
    );

    // Create conflicting destination for B
    const destDir = path.join(testWorkspaceRoot, "test", "unit");
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(
      path.join(destDir, "b.test.ts"),
      `describe('existing B', () => {});\n`,
    );

    // Run cleanup - should throw on B
    await expect(cleanupTddRedMarkers(testWorkspaceRoot)).rejects.toThrow(
      /Promotion conflict/,
    );

    // Verify: A was promoted and stays promoted
    expect(
      fs.existsSync(path.join(testWorkspaceRoot, "test", "unit", "a.test.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testWorkspaceRoot, "test", "red", "unit", "a.test.ts")),
    ).toBe(false);

    // Verify: B source is still in red dir (not promoted since conflict)
    expect(
      fs.existsSync(path.join(testWorkspaceRoot, "test", "red", "unit", "b.test.ts")),
    ).toBe(true);

    // Verify: C source is still in red dir (never attempted)
    expect(
      fs.existsSync(path.join(testWorkspaceRoot, "test", "red", "unit", "c.test.ts")),
    ).toBe(true);
  });

  it("should create destination directories recursively if they don't exist", async () => {
    // Create deep nested file without pre-existing destination dir
    const deepRedDir = path.join(
      testWorkspaceRoot,
      "test",
      "red",
      "integration",
      "api",
      "v2",
    );
    fs.mkdirSync(deepRedDir, { recursive: true });

    fs.writeFileSync(
      path.join(deepRedDir, "users.test.ts"),
      `// @orchestra-task: 10\ndescribe('Users API v2', () => {\n  it('should list users', () => {});\n});\n`,
    );

    // The directory test/integration/api/v2/ does NOT exist yet
    const destDir = path.join(testWorkspaceRoot, "test", "integration", "api", "v2");
    expect(fs.existsSync(destDir)).toBe(false);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify destination directory was created
    expect(fs.existsSync(destDir)).toBe(true);
    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/integration/api/v2/users.test.ts"]);

    // Verify file exists at destination
    const destFile = path.join(destDir, "users.test.ts");
    expect(fs.existsSync(destFile)).toBe(true);
  });

  it("should return cleaned=false when test/red/ directory does not exist", async () => {
    // No test/red/ directory
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);
  });

  it("should return cleaned=false when test/red/ directory is empty", async () => {
    // Create empty test/red/ directory
    const redDir = path.join(testWorkspaceRoot, "test", "red");
    fs.mkdirSync(redDir, { recursive: true });

    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);
  });

  it("should handle multiple files across different tiers", async () => {
    // Create files in different tier directories
    const unitDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    const integrationDir = path.join(testWorkspaceRoot, "test", "red", "integration");
    const smokeDir = path.join(testWorkspaceRoot, "test", "red", "smoke");
    fs.mkdirSync(unitDir, { recursive: true });
    fs.mkdirSync(integrationDir, { recursive: true });
    fs.mkdirSync(smokeDir, { recursive: true });

    fs.writeFileSync(
      path.join(unitDir, "unit-feat.test.ts"),
      `// @orchestra-task: 1\ndescribe('unit', () => {});\n`,
    );
    fs.writeFileSync(
      path.join(integrationDir, "integration-feat.test.ts"),
      `// @orchestra-task: 2\ndescribe('integration', () => {});\n`,
    );
    fs.writeFileSync(
      path.join(smokeDir, "smoke-feat.test.ts"),
      `// @orchestra-task: 3\ndescribe('smoke', () => {});\n`,
    );

    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(true);
    expect(result.files).toHaveLength(3);
    expect(result.files).toContain("test/integration/integration-feat.test.ts");
    expect(result.files).toContain("test/smoke/smoke-feat.test.ts");
    expect(result.files).toContain("test/unit/unit-feat.test.ts");
  });

  it("should promote file even without @orchestra-task comment", async () => {
    // File without the task comment should still be moved
    const redDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    fs.mkdirSync(redDir, { recursive: true });

    const srcFile = path.join(redDir, "no-comment.test.ts");
    const content = `describe('No Comment', () => {\n  it('works', () => {});\n});\n`;
    fs.writeFileSync(srcFile, content);

    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/unit/no-comment.test.ts"]);

    const destFile = path.join(testWorkspaceRoot, "test", "unit", "no-comment.test.ts");
    expect(fs.existsSync(destFile)).toBe(true);
    const destContent = fs.readFileSync(destFile, "utf-8");
    expect(destContent).toBe(content);
  });
});

describe("cleanupTddRedMarkers - Dart (directory-based promotion)", () => {
  beforeEach(() => {
    // Mark as Dart project
    fs.writeFileSync(
      path.join(testWorkspaceRoot, "pubspec.yaml"),
      "name: test_project\n",
    );
  });

  it("should move .dart files from test/red/unit/ to test/unit/", async () => {
    // Create test file in test/red/unit/
    const redDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    fs.mkdirSync(redDir, { recursive: true });

    const srcFile = path.join(redDir, "feature_test.dart");
    const fileContent = `// @orchestra-task: 3\nimport 'package:flutter_test/flutter_test.dart';\n\nvoid main() {\n  test('should work', () {\n    expect(true, isTrue);\n  });\n}\n`;
    fs.writeFileSync(srcFile, fileContent);

    // Run cleanup
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    // Verify result
    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/unit/feature_test.dart"]);

    // Verify file was moved
    const destFile = path.join(testWorkspaceRoot, "test", "unit", "feature_test.dart");
    expect(fs.existsSync(destFile)).toBe(true);
    expect(fs.existsSync(srcFile)).toBe(false);

    // Verify @orchestra-task comment was removed
    const destContent = fs.readFileSync(destFile, "utf-8");
    expect(destContent).not.toContain("@orchestra-task");
    expect(destContent).toContain("void main()");
  });

  it("should handle multiple Dart files across different tiers", async () => {
    const unitDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    const integrationDir = path.join(testWorkspaceRoot, "test", "red", "integration");
    fs.mkdirSync(unitDir, { recursive: true });
    fs.mkdirSync(integrationDir, { recursive: true });

    fs.writeFileSync(
      path.join(unitDir, "unit_feat_test.dart"),
      `// @orchestra-task: 1\nvoid main() { test('unit', () {}); }\n`,
    );
    fs.writeFileSync(
      path.join(integrationDir, "integration_feat_test.dart"),
      `// @orchestra-task: 2\nvoid main() { test('integration', () {}); }\n`,
    );

    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(result.files).toContain("test/integration/integration_feat_test.dart");
    expect(result.files).toContain("test/unit/unit_feat_test.dart");
  });

  it("should return cleaned=false when test/red/ directory does not exist", async () => {
    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);
  });

  it("should return cleaned=false when test/red/ is empty (no _test.dart files)", async () => {
    const redDir = path.join(testWorkspaceRoot, "test", "red");
    fs.mkdirSync(redDir, { recursive: true });

    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(false);
    expect(result.files).toEqual([]);
  });

  it("should fail with conflict error if destination file already exists", async () => {
    const redDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    fs.mkdirSync(redDir, { recursive: true });
    fs.writeFileSync(
      path.join(redDir, "conflict_test.dart"),
      `// @orchestra-task: 1\nvoid main() {}\n`,
    );

    // Create conflicting destination file
    const destDir = path.join(testWorkspaceRoot, "test", "unit");
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(
      path.join(destDir, "conflict_test.dart"),
      `void main() { /* existing */ }\n`,
    );

    await expect(cleanupTddRedMarkers(testWorkspaceRoot)).rejects.toThrow(
      /Promotion conflict.*destination file already exists/,
    );
  });

  it("should create destination directories recursively", async () => {
    const deepDir = path.join(testWorkspaceRoot, "test", "red", "integration", "api");
    fs.mkdirSync(deepDir, { recursive: true });

    fs.writeFileSync(
      path.join(deepDir, "users_test.dart"),
      `// @orchestra-task: 5\nvoid main() { test('users', () {}); }\n`,
    );

    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/integration/api/users_test.dart"]);

    const destFile = path.join(testWorkspaceRoot, "test", "integration", "api", "users_test.dart");
    expect(fs.existsSync(destFile)).toBe(true);
  });

  it("should promote file even without @orchestra-task comment", async () => {
    const redDir = path.join(testWorkspaceRoot, "test", "red", "unit");
    fs.mkdirSync(redDir, { recursive: true });

    const content = `void main() {\n  test('no comment', () {});\n}\n`;
    fs.writeFileSync(path.join(redDir, "no_comment_test.dart"), content);

    const result = await cleanupTddRedMarkers(testWorkspaceRoot);

    expect(result.cleaned).toBe(true);
    expect(result.files).toEqual(["test/unit/no_comment_test.dart"]);

    const destFile = path.join(testWorkspaceRoot, "test", "unit", "no_comment_test.dart");
    const destContent = fs.readFileSync(destFile, "utf-8");
    expect(destContent).toBe(content);
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
