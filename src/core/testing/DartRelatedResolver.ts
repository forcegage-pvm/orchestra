import { readdir } from "node:fs/promises";
import * as path from "node:path";
import { DartImportGraph } from "./DartImportGraph.js";

/**
 * Describes a test file related to a changed source file.
 */
export interface RelatedTestFile {
  /** Workspace-relative path to the test file */
  testFile: string;
  /** Workspace-relative path to the source file that triggered inclusion */
  triggeredBy: string;
  /** Strategy that found this test file */
  reason: "naming-convention" | "transitive-import" | "same-directory";
  /** Import chain depth (0 = direct match / naming convention) */
  depth: number;
}

/**
 * DartRelatedResolver - Maps changed Dart source files to related test files.
 *
 * Uses three strategies in priority order:
 * 1. Naming convention (highest confidence): lib/src/X.dart -> test/X_test.dart
 * 2. Import graph (medium confidence): DartImportGraph.resolveTransitiveDependents()
 * 3. Directory fallback (lowest confidence): All _test.dart files in corresponding test dir
 *
 * Results are deduplicated across strategies. Strategy 3 is only applied
 * when strategies 1 and 2 produce no results for a given source file.
 */
export class DartRelatedResolver {
  private workspaceRoot: string;
  private importGraph: DartImportGraph;

  constructor(workspaceRoot: string, importGraph?: DartImportGraph) {
    this.workspaceRoot = workspaceRoot;
    this.importGraph = importGraph ?? new DartImportGraph(workspaceRoot);
  }

  /**
   * Find test files related to the given changed source files.
   * Applies all three strategies, deduplicating results.
   */
  async resolve(changedFiles: string[]): Promise<RelatedTestFile[]> {
    const results: RelatedTestFile[] = [];
    const seen = new Set<string>();

    for (const sourceFile of changedFiles) {
      if (!sourceFile.endsWith(".dart")) continue;

      const normalized = this.normalizePath(sourceFile);

      // Strategy 1: Naming convention
      const conventionMatches = await this.resolveByConvention(normalized);
      for (const match of conventionMatches) {
        const key = this.normalizePath(match.testFile);
        if (!seen.has(key)) {
          seen.add(key);
          results.push(match);
        }
      }

      // Strategy 2: Import graph (transitive dependents via DartImportGraph)
      const importMatches = await this.resolveByImports(normalized);
      for (const match of importMatches) {
        const key = this.normalizePath(match.testFile);
        if (!seen.has(key)) {
          seen.add(key);
          results.push(match);
        }
      }

      // Strategy 3: Same directory fallback (only if no matches from 1 or 2)
      const hasMatchForSource = results.some(
        (r) => this.normalizePath(r.triggeredBy) === normalized,
      );
      if (!hasMatchForSource) {
        const dirMatches = await this.resolveByDirectory(normalized);
        for (const match of dirMatches) {
          const key = this.normalizePath(match.testFile);
          if (!seen.has(key)) {
            seen.add(key);
            results.push(match);
          }
        }
      }
    }

    return results;
  }

  /**
   * Strategy 1: Dart naming convention.
   * Maps source file paths to potential test file paths:
   *   lib/src/services/auth.dart -> test/.../auth_test.dart
   *   lib/models/user.dart       -> test/.../user_test.dart
   */
  private async resolveByConvention(
    sourceFile: string,
  ): Promise<RelatedTestFile[]> {
    const matches: RelatedTestFile[] = [];
    const baseName = path.basename(sourceFile, ".dart");
    const testFileName = `${baseName}_test.dart`;

    // Determine the relative directory within the project
    let relDir: string;
    if (sourceFile.startsWith("lib/src/")) {
      relDir = path.dirname(sourceFile.slice("lib/src/".length));
    } else if (sourceFile.startsWith("lib/")) {
      relDir = path.dirname(sourceFile.slice("lib/".length));
    } else {
      relDir = path.dirname(sourceFile);
    }

    relDir = this.normalizePath(relDir);
    if (relDir === ".") relDir = "";

    // Search for test files by walking the test/ directory
    const testDir = path.join(this.workspaceRoot, "test");
    const foundFiles = await this.findFilesRecursive(testDir, testFileName);

    for (const absolutePath of foundFiles) {
      const relativePath = this.normalizePath(
        path.relative(this.workspaceRoot, absolutePath),
      );

      const testRelDir = this.normalizePath(
        path.relative(
          path.join(this.workspaceRoot, "test"),
          path.dirname(absolutePath),
        ),
      );

      const isMatch =
        relDir === "" ||
        testRelDir === relDir ||
        testRelDir.endsWith(`/${relDir}`) ||
        testRelDir.endsWith(relDir);

      if (isMatch) {
        matches.push({
          testFile: relativePath,
          triggeredBy: sourceFile,
          reason: "naming-convention",
          depth: 0,
        });
      }
    }

    return matches;
  }

  /**
   * Strategy 2: Find test files that transitively import the changed source file.
   * Uses DartImportGraph.resolveTransitiveDependents() for depth-3 transitive analysis.
   */
  private async resolveByImports(
    sourceFile: string,
  ): Promise<RelatedTestFile[]> {
    const matches: RelatedTestFile[] = [];

    try {
      const affectedTestFiles =
        await this.importGraph.resolveTransitiveDependents([sourceFile], 3);

      for (const testFile of affectedTestFiles) {
        if (this.normalizePath(testFile) !== this.normalizePath(sourceFile)) {
          matches.push({
            testFile,
            triggeredBy: sourceFile,
            reason: "transitive-import",
            depth: 1,
          });
        }
      }
    } catch {
      // Import graph unavailable
    }

    return matches;
  }

  /**
   * Strategy 3: Same directory fallback.
   * If changed file is in lib/src/tools/, run all tests in test/.../tools/.
   */
  private async resolveByDirectory(
    sourceFile: string,
  ): Promise<RelatedTestFile[]> {
    const matches: RelatedTestFile[] = [];

    let dirSegment: string;
    if (sourceFile.startsWith("lib/src/")) {
      dirSegment = path.dirname(sourceFile.slice("lib/src/".length));
    } else if (sourceFile.startsWith("lib/")) {
      dirSegment = path.dirname(sourceFile.slice("lib/".length));
    } else {
      dirSegment = path.dirname(sourceFile);
    }

    dirSegment = this.normalizePath(dirSegment);
    if (dirSegment === ".") dirSegment = "";

    const testDirsToSearch = [
      path.join(this.workspaceRoot, "test", dirSegment),
      path.join(this.workspaceRoot, "test", "unit", dirSegment),
      path.join(this.workspaceRoot, "test", "integration", dirSegment),
    ];

    for (const testDir of testDirsToSearch) {
      try {
        const entries = await readdir(testDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith("_test.dart")) {
            const testPath = this.normalizePath(
              path.relative(
                this.workspaceRoot,
                path.join(testDir, entry.name),
              ),
            );
            matches.push({
              testFile: testPath,
              triggeredBy: sourceFile,
              reason: "same-directory",
              depth: 0,
            });
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    return matches;
  }

  /**
   * Recursively find files with a specific name in a directory.
   */
  private async findFilesRecursive(
    dir: string,
    targetFileName: string,
  ): Promise<string[]> {
    const results: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (
            entry.name === ".dart_tool" ||
            entry.name === "node_modules"
          ) {
            continue;
          }
          const subResults = await this.findFilesRecursive(
            fullPath,
            targetFileName,
          );
          results.push(...subResults);
        } else if (entry.name === targetFileName) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }

    return results;
  }

  /**
   * Normalize a file path for consistent comparison.   * Converts backslashes to forward slashes and removes leading ./ prefix.
   */
  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  }
}
