/**
 * Unit tests for TDD Exclusion Resolver
 */

import { describe, expect, it } from "vitest";
import {
  mapToRunnerFlags,
  resolveExclusions,
  type FileOperation,
  type TddRegistryEntry,
} from "../../../src/core/tdd-exclusion-resolver.js";

describe("TDD Exclusion Resolver", () => {
  describe("resolveExclusions", () => {
    it("should collect test files from tdd_red_registry entries", () => {
      const registryEntries: TddRegistryEntry[] = [
        {
          sprint_id: "sprint-007",
          red_task_id: 3,
          test_file: "test/core/feature-a.test.ts",
          test_count: 5,
        },
        {
          sprint_id: "sprint-007",
          red_task_id: 3,
          test_file: "test/core/feature-b.test.ts",
          test_count: 3,
        },
      ];

      const result = resolveExclusions("sprint-007", [], registryEntries);

      expect(result.files).toEqual([
        "test/core/feature-a.test.ts",
        "test/core/feature-b.test.ts",
      ]);
      expect(result.sources.registry).toEqual([
        "test/core/feature-a.test.ts",
        "test/core/feature-b.test.ts",
      ]);
      expect(result.sources.fileOperations).toEqual([]);
      expect(result.sources.fallback).toEqual([]);
    });

    it("should filter registry entries by sprint_id", () => {
      const registryEntries: TddRegistryEntry[] = [
        {
          sprint_id: "sprint-007",
          red_task_id: 3,
          test_file: "test/feature-a.test.ts",
          test_count: 5,
        },
        {
          sprint_id: "sprint-006",
          red_task_id: 2,
          test_file: "test/feature-old.test.ts",
          test_count: 2,
        },
      ];

      const result = resolveExclusions("sprint-007", [], registryEntries);

      expect(result.files).toEqual(["test/feature-a.test.ts"]);
      expect(result.sources.registry).toEqual(["test/feature-a.test.ts"]);
    });

    it("should collect CREATE test files from file_operations", () => {
      const fileOperations: FileOperation[] = [
        {
          operation: "CREATE",
          path: "test/new-feature.test.ts",
          description: "Test for new feature",
        },
        {
          operation: "CREATE",
          path: "test/another.spec.ts",
          description: "Another test",
        },
        {
          operation: "CREATE",
          path: "src/feature.ts",
          description: "Source file (not a test)",
        },
      ];

      const result = resolveExclusions("sprint-007", fileOperations, []);

      expect(result.files).toEqual([
        "test/new-feature.test.ts",
        "test/another.spec.ts",
      ]);
      expect(result.sources.fileOperations).toEqual([
        "test/new-feature.test.ts",
        "test/another.spec.ts",
      ]);
      expect(result.sources.registry).toEqual([]);
      expect(result.sources.fallback).toEqual([]);
    });

    it("should detect test files across multiple languages", () => {
      const fileOperations: FileOperation[] = [
        {
          operation: "CREATE",
          path: "test/feature.test.ts",
          description: "TypeScript test",
        },
        {
          operation: "CREATE",
          path: "test/feature.test.js",
          description: "JavaScript test",
        },
        {
          operation: "CREATE",
          path: "test/feature_test.dart",
          description: "Dart test",
        },
        {
          operation: "CREATE",
          path: "test/test_feature.py",
          description: "Python test",
        },
        {
          operation: "CREATE",
          path: "test/feature_test.rs",
          description: "Rust test",
        },
        {
          operation: "CREATE",
          path: "test/feature_test.go",
          description: "Go test",
        },
        {
          operation: "CREATE",
          path: "test/FeatureTest.java",
          description: "Java test",
        },
        {
          operation: "CREATE",
          path: "test/FeatureTest.cs",
          description: "C# test",
        },
        {
          operation: "CREATE",
          path: "test/feature_spec.rb",
          description: "Ruby test",
        },
        {
          operation: "CREATE",
          path: "test/FeatureTest.php",
          description: "PHP test",
        },
      ];

      const result = resolveExclusions("sprint-007", fileOperations, []);

      expect(result.files).toHaveLength(10);
      expect(result.files).toContain("test/feature.test.ts");
      expect(result.files).toContain("test/feature_test.dart");
      expect(result.files).toContain("test/test_feature.py");
    });

    it("should ignore UPDATE and DELETE operations in file_operations", () => {
      const fileOperations: FileOperation[] = [
        {
          operation: "UPDATE",
          path: "test/existing.test.ts",
          description: "Update existing test",
        },
        {
          operation: "DELETE",
          path: "test/old.test.ts",
          description: "Delete old test",
        },
      ];

      const result = resolveExclusions("sprint-007", fileOperations, []);

      // Should fall back to convention since no CREATE operations
      expect(result.files).toEqual(["test/red/**"]);
      expect(result.sources.fallback).toEqual(["test/red/**"]);
    });

    it("should combine registry and file_operations sources", () => {
      const registryEntries: TddRegistryEntry[] = [
        {
          sprint_id: "sprint-007",
          red_task_id: 3,
          test_file: "test/registry.test.ts",
          test_count: 2,
        },
      ];

      const fileOperations: FileOperation[] = [
        {
          operation: "CREATE",
          path: "test/new.test.ts",
          description: "New test",
        },
      ];

      const result = resolveExclusions(
        "sprint-007",
        fileOperations,
        registryEntries,
      );

      expect(result.files).toEqual([
        "test/registry.test.ts",
        "test/new.test.ts",
      ]);
      expect(result.sources.registry).toEqual(["test/registry.test.ts"]);
      expect(result.sources.fileOperations).toEqual(["test/new.test.ts"]);
      expect(result.sources.fallback).toEqual([]);
    });

    it("should deduplicate files from multiple sources", () => {
      const registryEntries: TddRegistryEntry[] = [
        {
          sprint_id: "sprint-007",
          red_task_id: 3,
          test_file: "test/duplicate.test.ts",
          test_count: 2,
        },
      ];

      const fileOperations: FileOperation[] = [
        {
          operation: "CREATE",
          path: "test/duplicate.test.ts",
          description: "Duplicate test file",
        },
      ];

      const result = resolveExclusions(
        "sprint-007",
        fileOperations,
        registryEntries,
      );

      expect(result.files).toEqual(["test/duplicate.test.ts"]);
    });

    it("should fall back to test/red/** when no inputs exist", () => {
      const result = resolveExclusions("sprint-007", [], []);

      expect(result.files).toEqual(["test/red/**"]);
      expect(result.sources.fallback).toEqual(["test/red/**"]);
      expect(result.sources.registry).toEqual([]);
      expect(result.sources.fileOperations).toEqual([]);
    });

    it("should not use fallback when registry or file_operations have data", () => {
      const registryEntries: TddRegistryEntry[] = [
        {
          sprint_id: "sprint-007",
          red_task_id: 3,
          test_file: "test/feature.test.ts",
          test_count: 1,
        },
      ];

      const result = resolveExclusions("sprint-007", [], registryEntries);

      expect(result.sources.fallback).toEqual([]);
      expect(result.files).not.toContain("test/red/**");
    });
  });

  describe("mapToRunnerFlags", () => {
    describe("vitest", () => {
      it("should generate multiple --exclude flags for vitest", () => {
        const exclusions = ["test/feature-a.test.ts", "test/feature-b.test.ts"];
        const command = "vitest run";

        const result = mapToRunnerFlags(exclusions, command);

        expect(result).toBe(
          "--exclude test/feature-a.test.ts --exclude test/feature-b.test.ts",
        );
      });

      it("should handle single exclusion for vitest", () => {
        const exclusions = ["test/feature.test.ts"];
        const command = "npx vitest";

        const result = mapToRunnerFlags(exclusions, command);

        expect(result).toBe("--exclude test/feature.test.ts");
      });

      it("should handle glob patterns for vitest", () => {
        const exclusions = ["test/red/**"];
        const command = "vitest";

        const result = mapToRunnerFlags(exclusions, command);

        expect(result).toBe("--exclude test/red/**");
      });
    });

    describe("jest", () => {
      it("should generate --testPathIgnorePatterns for jest", () => {
        const exclusions = ["test/feature-a.test.ts", "test/feature-b.test.ts"];
        const command = "jest --coverage";

        const result = mapToRunnerFlags(exclusions, command);

        expect(result).toBe(
          '--testPathIgnorePatterns "test/feature-a\\.test\\.ts|test/feature-b\\.test\\.ts"',
        );
      });

      it("should escape regex special characters for jest", () => {
        const exclusions = ["test/feature.test.ts", "test/dir/**/*.test.ts"];
        const command = "npx jest";

        const result = mapToRunnerFlags(exclusions, command);

        // Should escape dots, asterisks, and slashes
        expect(result).toContain("test/feature\\.test\\.ts");
        expect(result).toContain("test/dir/\\*\\*/\\*\\.test\\.ts");
      });

      it("should handle single exclusion for jest", () => {
        const exclusions = ["test/feature.test.ts"];
        const command = "jest";

        const result = mapToRunnerFlags(exclusions, command);

        expect(result).toBe(
          '--testPathIgnorePatterns "test/feature\\.test\\.ts"',
        );
      });
    });

    describe("flutter", () => {
      it("should return empty string for flutter (uses tag-based exclusion)", () => {
        const exclusions = ["test/feature_test.dart"];
        const command = "flutter test";

        const result = mapToRunnerFlags(exclusions, command);

        expect(result).toBe("");
      });
    });

    describe("pytest", () => {
      it("should return empty string for pytest (uses marker-based exclusion)", () => {
        const exclusions = ["test/test_feature.py"];
        const command = "pytest";

        const result = mapToRunnerFlags(exclusions, command);

        expect(result).toBe("");
      });

      it("should return empty string for python -m pytest", () => {
        const exclusions = ["test/test_feature.py"];
        const command = "python -m pytest";

        const result = mapToRunnerFlags(exclusions, command);

        expect(result).toBe("");
      });
    });

    describe("unknown runner", () => {
      it("should return empty string for unknown runners", () => {
        const exclusions = ["test/feature.test.ts"];
        const command = "unknown-test-runner";

        const result = mapToRunnerFlags(exclusions, command);

        expect(result).toBe("");
      });
    });

    describe("edge cases", () => {
      it("should return empty string when exclusions array is empty", () => {
        const result = mapToRunnerFlags([], "vitest");

        expect(result).toBe("");
      });

      it("should handle npm script commands with vitest", () => {
        const exclusions = ["test/feature.test.ts"];
        const command = "npm test";
        const workingDirectory = process.cwd();

        // This depends on actual package.json, but should detect vitest if present
        const result = mapToRunnerFlags(exclusions, command, workingDirectory);

        // Should return vitest-style flags if npm test runs vitest
        expect(result).toContain("--exclude");
      });
    });
  });

  describe("integration scenarios", () => {
    it("should handle full workflow: resolve + map for vitest", () => {
      const registryEntries: TddRegistryEntry[] = [
        {
          sprint_id: "sprint-007",
          red_task_id: 3,
          test_file: "test/feature-a.test.ts",
          test_count: 2,
        },
      ];

      const fileOperations: FileOperation[] = [
        {
          operation: "CREATE",
          path: "test/feature-b.test.ts",
          description: "New test",
        },
      ];

      const exclusions = resolveExclusions(
        "sprint-007",
        fileOperations,
        registryEntries,
      );
      const flags = mapToRunnerFlags(exclusions.files, "vitest");

      expect(flags).toBe(
        "--exclude test/feature-a.test.ts --exclude test/feature-b.test.ts",
      );
    });

    it("should handle full workflow: resolve + map for jest", () => {
      const registryEntries: TddRegistryEntry[] = [
        {
          sprint_id: "sprint-007",
          red_task_id: 3,
          test_file: "test/feature.test.ts",
          test_count: 1,
        },
      ];

      const exclusions = resolveExclusions("sprint-007", [], registryEntries);
      const flags = mapToRunnerFlags(exclusions.files, "jest --coverage");

      expect(flags).toBe('--testPathIgnorePatterns "test/feature\\.test\\.ts"');
    });

    it("should handle full workflow: fallback + map for vitest", () => {
      const exclusions = resolveExclusions("sprint-007", [], []);
      const flags = mapToRunnerFlags(exclusions.files, "vitest");

      expect(exclusions.files).toEqual(["test/red/**"]);
      expect(flags).toBe("--exclude test/red/**");
    });
  });
});
