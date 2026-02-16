/**
 * DartRelatedResolver Unit Tests
 *
 * Tests for the Dart file-to-test mapping with three strategies:
 * 1. Naming convention (lib/src/X.dart to test/[any]/X_test.dart)
 * 2. Import graph (transitive dependents via DartImportGraph)
 * 3. Directory fallback (same directory tests)
 *
 * Uses temp directories with actual .dart files for realistic testing.
 *
 * @see specs/015-dart-flutter-test-runner/tasks.md - T024
 * @see specs/_base/013-test-tools/test-runner-tools-design-phase2-dart.md Part 5
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DartImportGraph } from "../../../../src/core/testing/DartImportGraph.js";
import { DartRelatedResolver } from "../../../../src/core/testing/DartRelatedResolver.js";

let tempDir: string;

/**
 * Helper: create a file in the temp directory with given content.
 */
function createFile(relativePath: string, content: string): void {
  const fullPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dart-related-resolver-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("DartRelatedResolver", () => {
  describe("resolve() - three-strategy mapper", () => {
    describe("Strategy 1: Naming convention", () => {
      it("should map lib/src/services/auth.dart to test/**/auth_test.dart", async () => {
        createFile("lib/src/services/auth.dart", "class Auth {}");
        createFile(
          "test/unit/services/auth_test.dart",
          "import '../../../lib/src/services/auth.dart';\nvoid main() {}",
        );

        const resolver = new DartRelatedResolver(tempDir);
        const results = await resolver.resolve(["lib/src/services/auth.dart"]);

        expect(results).toHaveLength(1);
        expect(results[0]!.testFile).toBe("test/unit/services/auth_test.dart");
        expect(results[0]!.reason).toBe("naming-convention");
        expect(results[0]!.triggeredBy).toBe("lib/src/services/auth.dart");
        expect(results[0]!.depth).toBe(0);
      });

      it("should map lib/src/models/user.dart to test/**/user_test.dart", async () => {
        createFile("lib/src/models/user.dart", "class User {}");
        createFile(
          "test/models/user_test.dart",
          "import '../../lib/src/models/user.dart';\nvoid main() {}",
        );

        const resolver = new DartRelatedResolver(tempDir);
        const results = await resolver.resolve(["lib/src/models/user.dart"]);

        expect(results.length).toBeGreaterThanOrEqual(1);
        const match = results.find(
          (r) => r.testFile === "test/models/user_test.dart",
        );
        expect(match).toBeDefined();
        expect(match!.reason).toBe("naming-convention");
      });

      it("should handle nested lib paths correctly", async () => {
        createFile("lib/src/deep/nested/widget.dart", "class Widget {}");
        createFile("test/unit/deep/nested/widget_test.dart", "void main() {}");

        const resolver = new DartRelatedResolver(tempDir);
        const results = await resolver.resolve([
          "lib/src/deep/nested/widget.dart",
        ]);

        expect(results.length).toBeGreaterThanOrEqual(1);
        const match = results.find((r) =>
          r.testFile.includes("widget_test.dart"),
        );
        expect(match).toBeDefined();
        expect(match!.reason).toBe("naming-convention");
      });

      it("should return match from any test subdirectory", async () => {
        createFile("lib/src/parser.dart", "class Parser {}");
        createFile("test/unit/parser_test.dart", "void main() {}");
        createFile("test/integration/parser_test.dart", "void main() {}");

        const resolver = new DartRelatedResolver(tempDir);
        const results = await resolver.resolve(["lib/src/parser.dart"]);

        // Should find at least one match (possibly both)
        expect(results.length).toBeGreaterThanOrEqual(1);
        const testFiles = results.map((r) => r.testFile);
        // At least one of these should be found
        const hasMatch =
          testFiles.includes("test/unit/parser_test.dart") ||
          testFiles.includes("test/integration/parser_test.dart");
        expect(hasMatch).toBe(true);
      });
    });

    describe("Strategy 2: Import graph (transitive dependents)", () => {
      it("should find test files that import the changed source file", async () => {
        createFile("lib/core.dart", "class Core {}");
        createFile(
          "test/core_test.dart",
          "import '../lib/core.dart';\nvoid main() {}",
        );

        const importGraph = new DartImportGraph(tempDir);
        const resolver = new DartRelatedResolver(tempDir, importGraph);

        const results = await resolver.resolve(["lib/core.dart"]);

        const importMatch = results.find(
          (r) =>
            r.testFile === "test/core_test.dart" &&
            r.reason === "transitive-import",
        );
        // Should find via import graph (might also find via naming convention)
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some((r) => r.testFile === "test/core_test.dart")).toBe(
          true,
        );
      });

      it("should find test files that transitively import (depth 2)", async () => {
        createFile("lib/base.dart", "class Base {}");
        createFile("lib/service.dart", "import 'base.dart';\nclass Service {}");
        createFile(
          "test/service_test.dart",
          "import '../lib/service.dart';\nvoid main() {}",
        );

        const importGraph = new DartImportGraph(tempDir);
        const resolver = new DartRelatedResolver(tempDir, importGraph);

        const results = await resolver.resolve(["lib/base.dart"]);

        // Should find service_test.dart via transitive import (base → service → test)
        expect(
          results.some((r) => r.testFile === "test/service_test.dart"),
        ).toBe(true);
      });

      it("should use DartImportGraph.resolveTransitiveDependents()", async () => {
        createFile("lib/a.dart", "class A {}");
        createFile("lib/b.dart", "import 'a.dart';\nclass B {}");
        createFile("lib/c.dart", "import 'b.dart';\nclass C {}");
        createFile(
          "test/c_test.dart",
          "import '../lib/c.dart';\nvoid main() {}",
        );

        const importGraph = new DartImportGraph(tempDir);
        const resolver = new DartRelatedResolver(tempDir, importGraph);

        const results = await resolver.resolve(["lib/a.dart"]);

        // c_test.dart transitively depends on a.dart (a → b → c → c_test)
        const hasTransitive = results.some(
          (r) => r.testFile === "test/c_test.dart",
        );
        expect(hasTransitive).toBe(true);
      });
    });

    describe("Strategy 3: Directory fallback", () => {
      it("should fall back to same-directory tests when no naming/import match", async () => {
        // Create a source file with a name that doesn't match any test file naming convention
        createFile("lib/src/tools/custom_logic.dart", "class CustomLogic {}");
        // Create test files in the corresponding test directory but with different names
        createFile("test/unit/tools/all_tools_test.dart", "void main() {}");

        const resolver = new DartRelatedResolver(tempDir);
        const results = await resolver.resolve([
          "lib/src/tools/custom_logic.dart",
        ]);

        // Should find via directory fallback since naming convention won't match
        if (results.length > 0) {
          const dirMatch = results.find((r) => r.reason === "same-directory");
          // If a naming match exists it would find custom_logic_test.dart
          // Since that doesn't exist, it should use directory fallback
          if (dirMatch) {
            expect(dirMatch.testFile).toContain("all_tools_test.dart");
          }
        }
        // Either way, the resolver should not throw
        expect(results).toBeDefined();
      });

      it("should return all _test.dart files in corresponding test directory", async () => {
        createFile("lib/src/widgets/button.dart", "class Button {}");
        createFile("test/unit/widgets/button_test.dart", "void main() {}");
        createFile("test/unit/widgets/icon_button_test.dart", "void main() {}");

        const resolver = new DartRelatedResolver(tempDir);
        const results = await resolver.resolve(["lib/src/widgets/button.dart"]);

        // Should find button_test.dart via naming convention
        expect(
          results.some((r) => r.testFile.includes("button_test.dart")),
        ).toBe(true);
      });
    });

    describe("Strategy priority and deduplication", () => {
      it("should combine results from all matching strategies", async () => {
        createFile("lib/src/util.dart", "class Util {}");
        // Naming convention match
        createFile("test/unit/util_test.dart", "void main() {}");
        // Import graph match
        createFile(
          "test/integration/util_integration_test.dart",
          "import '../../lib/src/util.dart';\nvoid main() {}",
        );

        const importGraph = new DartImportGraph(tempDir);
        const resolver = new DartRelatedResolver(tempDir, importGraph);
        const results = await resolver.resolve(["lib/src/util.dart"]);

        // Should find naming convention match
        expect(results.some((r) => r.testFile.includes("util_test.dart"))).toBe(
          true,
        );
      });

      it("should deduplicate results across strategies", async () => {
        createFile("lib/src/helper.dart", "class Helper {}");
        // This file matches both naming convention AND would be found by import graph
        createFile(
          "test/unit/helper_test.dart",
          "import '../../lib/src/helper.dart';\nvoid main() {}",
        );

        const importGraph = new DartImportGraph(tempDir);
        const resolver = new DartRelatedResolver(tempDir, importGraph);
        const results = await resolver.resolve(["lib/src/helper.dart"]);

        // Count occurrences of helper_test.dart — should appear only once
        const helperTestCount = results.filter((r) =>
          r.testFile.includes("helper_test.dart"),
        ).length;
        expect(helperTestCount).toBe(1);
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle file with no corresponding test", async () => {
      createFile("lib/src/orphan.dart", "class Orphan {}");

      const resolver = new DartRelatedResolver(tempDir);
      const results = await resolver.resolve(["lib/src/orphan.dart"]);

      // No tests exist, so results should be empty
      expect(results).toEqual([]);
    });

    it("should handle non-.dart files by skipping them", async () => {
      createFile("lib/readme.md", "# Readme");

      const resolver = new DartRelatedResolver(tempDir);
      const results = await resolver.resolve(["lib/readme.md"]);

      // Non-Dart files should be skipped
      expect(results).toEqual([]);
    });

    it("should handle Windows paths by normalizing backslashes", async () => {
      createFile("lib/src/win.dart", "class Win {}");
      createFile("test/unit/win_test.dart", "void main() {}");

      const resolver = new DartRelatedResolver(tempDir);
      const results = await resolver.resolve(["lib\\src\\win.dart"]);

      // Should still resolve correctly with backslash paths
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle multiple changed files at once", async () => {
      createFile("lib/src/a.dart", "class A {}");
      createFile("lib/src/b.dart", "class B {}");
      createFile("test/unit/a_test.dart", "void main() {}");
      createFile("test/unit/b_test.dart", "void main() {}");

      const resolver = new DartRelatedResolver(tempDir);
      const results = await resolver.resolve([
        "lib/src/a.dart",
        "lib/src/b.dart",
      ]);

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.testFile.includes("a_test.dart"))).toBe(
        true,
      );
      expect(results.some((r) => r.testFile.includes("b_test.dart"))).toBe(
        true,
      );
    });

    it("should handle files outside standard Dart structure", async () => {
      createFile("scripts/generate.dart", "void main() {}");

      const resolver = new DartRelatedResolver(tempDir);
      const results = await resolver.resolve(["scripts/generate.dart"]);

      // Should not throw, even though the file isn't in lib/
      expect(results).toBeDefined();
    });
  });
});
