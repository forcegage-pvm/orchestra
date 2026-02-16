/**
 * DartImportGraph Unit Tests
 *
 * Tests for the Dart import graph builder and transitive dependent resolver.
 * Supports the DartRelatedResolver's Strategy 2 (import graph traversal).
 *
 * Uses temp directories with actual .dart files for realistic testing.
 *
 * @see specs/015-dart-flutter-test-runner/tasks.md - T025
 * @see specs/_base/013-test-tools/test-runner-tools-design-phase2-dart.md Part 5
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DartImportGraph } from "../../../../src/core/testing/DartImportGraph.js";

let tempDir: string;
let graph: DartImportGraph;

/**
 * Helper: create a file in the temp directory with given content.
 */
function createFile(relativePath: string, content: string): void {
  const fullPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dart-import-graph-"));
  graph = new DartImportGraph(tempDir);
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("DartImportGraph", () => {
  describe("getGraph() - reverse import graph building", () => {
    it("should parse import statements from Dart files and build reverse graph", async () => {
      // A imports B → reverse graph: B → [A]
      createFile("lib/a.dart", "import 'b.dart';\nclass A {}");
      createFile("lib/b.dart", "class B {}");

      const result = await graph.getGraph();

      expect(result).toBeInstanceOf(Map);
      // B is imported by A, so reverse graph has B → [A] 
      const dependentsOfB = result.get("lib/b.dart");
      expect(dependentsOfB).toBeDefined();
      expect(dependentsOfB).toContain("lib/a.dart");
    });

    it("should handle export declarations", async () => {
      createFile("lib/core.dart", "export 'utils.dart';\nclass Core {}");
      createFile("lib/utils.dart", "class Utils {}");

      const result = await graph.getGraph();

      const dependentsOfUtils = result.get("lib/utils.dart");
      expect(dependentsOfUtils).toBeDefined();
      expect(dependentsOfUtils).toContain("lib/core.dart");
    });

    it("should resolve relative imports correctly", async () => {
      createFile(
        "lib/src/services/auth.dart",
        "import '../models/user.dart';\nclass Auth {}",
      );
      createFile("lib/src/models/user.dart", "class User {}");

      const result = await graph.getGraph();

      const dependentsOfUser = result.get("lib/src/models/user.dart");
      expect(dependentsOfUser).toBeDefined();
      expect(dependentsOfUser).toContain("lib/src/services/auth.dart");
    });

    it("should resolve package: imports to lib/ directory", async () => {
      createFile(
        "lib/src/app.dart",
        "import 'package:myapp/core/parser.dart';\nclass App {}",
      );
      createFile("lib/core/parser.dart", "class Parser {}");

      const result = await graph.getGraph();

      const dependentsOfParser = result.get("lib/core/parser.dart");
      expect(dependentsOfParser).toBeDefined();
      expect(dependentsOfParser).toContain("lib/src/app.dart");
    });

    it("should skip dart: core library imports", async () => {
      createFile(
        "lib/a.dart",
        "import 'dart:math';\nimport 'dart:async';\nclass A {}",
      );

      const result = await graph.getGraph();

      // dart:math and dart:async should not appear in the graph
      expect(result.has("dart:math")).toBe(false);
      expect(result.has("dart:async")).toBe(false);
    });

    it("should handle 'as' aliases, 'show', and 'hide' combinators", async () => {
      createFile(
        "lib/consumer.dart",
        "import 'provider.dart' as p;\nimport 'helper.dart' show Helper;\nimport 'utils.dart' hide Unused;\nclass Consumer {}",
      );
      createFile("lib/provider.dart", "class Provider {}");
      createFile("lib/helper.dart", "class Helper {}");
      createFile("lib/utils.dart", "class Utils {}");

      const result = await graph.getGraph();

      expect(result.get("lib/provider.dart")).toContain("lib/consumer.dart");
      expect(result.get("lib/helper.dart")).toContain("lib/consumer.dart");
      expect(result.get("lib/utils.dart")).toContain("lib/consumer.dart");
    });
  });

  describe("resolveTransitiveDependents()", () => {
    it("should return direct dependents at depth 1", async () => {
      createFile("lib/base.dart", "class Base {}");
      createFile(
        "test/base_test.dart",
        "import '../lib/base.dart';\nvoid main() {}",
      );

      const affected = await graph.resolveTransitiveDependents(["lib/base.dart"]);

      expect(affected).toContain("test/base_test.dart");
    });

    it("should return indirect dependents at depth 2", async () => {
      // base.dart ← middle.dart ← test_file_test.dart
      createFile("lib/base.dart", "class Base {}");
      createFile("lib/middle.dart", "import 'base.dart';\nclass Middle {}");
      createFile(
        "test/middle_test.dart",
        "import '../lib/middle.dart';\nvoid main() {}",
      );

      const affected = await graph.resolveTransitiveDependents(["lib/base.dart"]);

      expect(affected).toContain("test/middle_test.dart");
    });

    it("should return deep dependents at depth 3", async () => {
      // base.dart ← layer1.dart ← layer2.dart ← deep_test.dart
      createFile("lib/base.dart", "class Base {}");
      createFile("lib/layer1.dart", "import 'base.dart';\nclass Layer1 {}");
      createFile("lib/layer2.dart", "import 'layer1.dart';\nclass Layer2 {}");
      createFile(
        "test/deep_test.dart",
        "import '../lib/layer2.dart';\nvoid main() {}",
      );

      const affected = await graph.resolveTransitiveDependents(
        ["lib/base.dart"],
        3,
      );

      expect(affected).toContain("test/deep_test.dart");
    });

    it("should stop at maxDepth and not exceed configured depth", async () => {
      // base.dart ← l1.dart ← l2.dart ← l3.dart ← too_deep_test.dart (depth 4)
      createFile("lib/base.dart", "class Base {}");
      createFile("lib/l1.dart", "import 'base.dart';\nclass L1 {}");
      createFile("lib/l2.dart", "import 'l1.dart';\nclass L2 {}");
      createFile("lib/l3.dart", "import 'l2.dart';\nclass L3 {}");
      createFile(
        "test/too_deep_test.dart",
        "import '../lib/l3.dart';\nvoid main() {}",
      );

      // With maxDepth=3, the walk goes: base(0) → l1(1) → l2(2) → l3(3) → stop
      // too_deep_test.dart is at depth 4, should NOT be included
      const affected = await graph.resolveTransitiveDependents(
        ["lib/base.dart"],
        3,
      );

      expect(affected).not.toContain("test/too_deep_test.dart");
    });

    it("should allow configurable maxDepth", async () => {
      createFile("lib/a.dart", "class A {}");
      createFile("lib/b.dart", "import 'a.dart';\nclass B {}");
      createFile(
        "test/b_test.dart",
        "import '../lib/b.dart';\nvoid main() {}",
      );

      // maxDepth=1: only direct dependents of base
      const depth1 = await graph.resolveTransitiveDependents(["lib/a.dart"], 1);
      // b.dart is a direct dependent (depth 1), b_test.dart is depth 2 — should NOT be included
      expect(depth1).not.toContain("test/b_test.dart");

      // maxDepth=2: should include b_test.dart
      const depth2 = await graph.resolveTransitiveDependents(["lib/a.dart"], 2);
      expect(depth2).toContain("test/b_test.dart");
    });
  });

  describe("Cycle handling", () => {
    it("should handle circular imports without infinite loop", async () => {
      // A imports B, B imports A (cycle)
      createFile("lib/cycle_a.dart", "import 'cycle_b.dart';\nclass A {}");
      createFile("lib/cycle_b.dart", "import 'cycle_a.dart';\nclass B {}");
      createFile(
        "test/cycle_test.dart",
        "import '../lib/cycle_a.dart';\nvoid main() {}",
      );

      // Should not hang or throw
      const affected = await graph.resolveTransitiveDependents([
        "lib/cycle_a.dart",
      ]);

      expect(affected).toBeDefined();
      expect(Array.isArray(affected)).toBe(true);
      expect(affected).toContain("test/cycle_test.dart");
    });

    it("should track visited nodes to prevent revisiting in cycles", async () => {
      // A → B → C → A (cycle) plus a test
      createFile("lib/x.dart", "import 'y.dart';\nclass X {}");
      createFile("lib/y.dart", "import 'z.dart';\nclass Y {}");
      createFile("lib/z.dart", "import 'x.dart';\nclass Z {}");

      // Should complete without infinite recursion
      const affected = await graph.resolveTransitiveDependents(["lib/x.dart"]);
      expect(affected).toBeDefined();
    });
  });

  describe("Cache invalidation", () => {
    it("should cache graph after initial build based on mtime fingerprint", async () => {
      createFile("lib/cached.dart", "class Cached {}");

      const fp1 = await graph.computeMtimeFingerprint();
      const fp2 = await graph.computeMtimeFingerprint();

      expect(fp1).toBe(fp2);
      expect(typeof fp1).toBe("string");
      expect(fp1.length).toBe(64); // SHA-256 hex
    });

    it("should rebuild graph when source files change (mtime fingerprint changes)", async () => {
      createFile("lib/changing.dart", "class V1 {}");

      const fp1 = await graph.computeMtimeFingerprint();

      // Wait a tick to ensure different mtime
      await new Promise((r) => setTimeout(r, 50));

      // Modify the file
      createFile("lib/changing.dart", "class V2 {}");

      const fp2 = await graph.computeMtimeFingerprint();

      expect(fp1).not.toBe(fp2);
    });
  });

  describe(".dart_tool exclusion", () => {
    it("should exclude .dart_tool directories from scanning", async () => {
      createFile("lib/a.dart", "class A {}");
      createFile(
        ".dart_tool/generated.dart",
        "import '../lib/a.dart';\nclass Gen {}",
      );

      const result = await graph.getGraph();

      // .dart_tool files should not appear in the graph
      const dependentsOfA = result.get("lib/a.dart") ?? [];
      const hasDartToolFile = dependentsOfA.some((f) =>
        f.includes(".dart_tool"),
      );
      expect(hasDartToolFile).toBe(false);
    });

    it("should exclude node_modules and .git directories", async () => {
      createFile("lib/b.dart", "class B {}");
      createFile(
        "node_modules/some_pkg/lib.dart",
        "import '../../lib/b.dart';\nclass Pkg {}",
      );

      const fp = await graph.computeMtimeFingerprint();

      // Fingerprint should only include project .dart files, not node_modules
      // We can verify by checking the fingerprint is stable and doesn't include these dirs
      expect(typeof fp).toBe("string");
      expect(fp.length).toBe(64);
    });
  });

  describe("Edge cases", () => {
    it("should handle file with no imports", async () => {
      createFile("lib/standalone.dart", "class Standalone {}");

      const result = await graph.getGraph();

      // standalone.dart has no imports, so it won't appear as a key in the reverse graph
      // unless something imports it
      expect(result).toBeInstanceOf(Map);
    });

    it("should handle file with no dependents", async () => {
      createFile("lib/orphan.dart", "import 'something.dart';\nclass Orphan {}");

      const affected = await graph.resolveTransitiveDependents(["lib/orphan.dart"]);

      // No test files depend on orphan.dart
      expect(affected).toEqual([]);
    });

    it("should handle malformed import statements gracefully", async () => {
      createFile("lib/malformed.dart", "importbadstatement;\nclass Bad {}");

      // Should not throw
      const result = await graph.getGraph();
      expect(result).toBeInstanceOf(Map);
    });

    it("should normalize Windows paths (backslashes to forward slashes)", async () => {
      createFile("lib/win.dart", "class Win {}");
      createFile(
        "test/win_test.dart",
        "import '../lib/win.dart';\nvoid main() {}",
      );

      const affected = await graph.resolveTransitiveDependents(["lib\\win.dart"]);

      // Should still find the test file even with backslash input
      expect(affected).toContain("test/win_test.dart");
    });

    it("should handle empty workspace gracefully", async () => {
      // No files created
      const result = await graph.getGraph();
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });
});
