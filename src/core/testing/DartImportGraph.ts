/**
 * DartImportGraph - Reverse dependency graph builder for Dart projects.
 *
 * Builds and caches a reverse import graph (Map<imported_file, importing_files[]>)
 * by scanning Dart import statements. Supports transitive dependent resolution
 * up to a configurable depth (default 3) with cycle detection.
 *
 * Features:
 * - mtime-based cache invalidation (SHA-256 fingerprint of all .dart file paths + mtimes)
 * - Depth-limited walk (default 3) with visited set for cycle detection
 * - .dart_tool/, node_modules/, .git/ directory exclusion
 * - ripgrep acceleration with graceful Node.js fs-based fallback
 * - Windows-compatible path handling (no Unix-only commands)
 *
 * @see specs/_base/013-test-tools/test-runner-tools-design-phase2-dart.md Part 6
 */

import { createHash } from "node:crypto";
import { exec as execCb } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(execCb);

/** Directories to exclude from scanning and fingerprinting. */
const EXCLUDED_DIRS = new Set([".dart_tool", "node_modules", ".git", "build", ".pub-cache"]);

/**
 * Builds and caches a reverse dependency graph for Dart projects.
 *
 * Given that file A is imported by B, and B is imported by C:
 * Changing A → run tests for B and C (transitive dependents).
 */
export class DartImportGraph {
  private graph: Map<string, string[]> | null = null;
  private graphFingerprint: string | null = null;

  constructor(private workspaceRoot: string) {}

  /**
   * Get or rebuild the reverse import graph.
   * Cached by mtime fingerprint — rebuild only when source files change.
   *
   * @returns Reverse adjacency list: Map<imported_file, importing_files[]>
   */
  async getGraph(): Promise<Map<string, string[]>> {
    const currentFingerprint = await this.computeMtimeFingerprint();

    if (this.graph && this.graphFingerprint === currentFingerprint) {
      return this.graph;
    }

    this.graph = await this.buildReverseGraph();
    this.graphFingerprint = currentFingerprint;
    return this.graph;
  }

  /**
   * Find all files that transitively depend on the given changed files.
   * Walks the reverse import graph up to maxDepth with cycle detection.
   *
   * @param changedFiles Array of workspace-relative file paths that changed.
   * @param maxDepth Maximum depth of transitive walk (default: 3).
   * @returns Array of workspace-relative file paths that are affected (test files only).
   */
  async resolveTransitiveDependents(
    changedFiles: string[],
    maxDepth: number = 3,
  ): Promise<string[]> {
    const graph = await this.getGraph();
    const allAffected = new Set<string>();
    const visited = new Set<string>();

    const walk = (file: string, depth: number): void => {
      if (visited.has(file)) return;
      if (depth > maxDepth) return;
      visited.add(file);
      allAffected.add(file);

      const dependents = graph.get(this.normalizePath(file)) ?? [];
      for (const dep of dependents) {
        walk(dep, depth + 1);
      }
    };

    for (const changed of changedFiles) {
      const normalized = this.normalizePath(changed);
      walk(normalized, 0);
    }

    // Filter to test files only
    return [...allAffected].filter((f) => f.endsWith("_test.dart"));
  }

  /**
   * Build the reverse import graph by scanning all Dart files.
   * Tries ripgrep first for speed, falls back to Node.js fs-based parsing.
   *
   * Result: Map<imported_file, importing_files[]>
   */
  private async buildReverseGraph(): Promise<Map<string, string[]>> {
    try {
      return await this.buildGraphWithRipgrep();
    } catch {
      // ripgrep not available or failed — fall back to fs-based scanning
      return await this.buildGraphWithFs();
    }
  }

  /**
   * Build the reverse graph using ripgrep for speed.
   * Parses ripgrep output of `rg --no-heading --with-filename "^import |^export " --glob "*.dart"`.
   */
  private async buildGraphWithRipgrep(): Promise<Map<string, string[]>> {
    const graph = new Map<string, string[]>();

    // Build exclude args for ripgrep
    const excludeArgs = [...EXCLUDED_DIRS].map((d) => `--glob=!${d}/`).join(" ");

    const { stdout } = await execAsync(
      `rg --no-heading --with-filename "^import |^export |^part " --glob "*.dart" ${excludeArgs} .`,
      {
        cwd: this.workspaceRoot,
        maxBuffer: 10_000_000,
      },
    );

    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const rawImportingFile = trimmed.slice(0, colonIdx);
      const importStatement = trimmed.slice(colonIdx + 1);

      const importingFile = this.normalizePath(rawImportingFile);
      const importedFile = this.resolveImportPath(importStatement, importingFile);

      if (importedFile) {
        const normalizedImported = this.normalizePath(importedFile);
        const existing = graph.get(normalizedImported) ?? [];
        existing.push(importingFile);
        graph.set(normalizedImported, existing);
      }
    }

    return graph;
  }

  /**
   * Build the reverse graph using Node.js fs-based scanning (fallback).
   * Reads all .dart files and parses import/export/part statements.
   */
  private async buildGraphWithFs(): Promise<Map<string, string[]>> {
    const graph = new Map<string, string[]>();
    const dartFiles = await this.collectDartFiles(this.workspaceRoot);

    for (const absolutePath of dartFiles) {
      const relativePath = this.normalizePath(
        path.relative(this.workspaceRoot, absolutePath),
      );

      try {
        const content = await readFile(absolutePath, "utf-8");
        const imports = this.parseImports(content);

        for (const importPath of imports) {
          const resolved = this.resolveImportPath(
            `import '${importPath}';`,
            relativePath,
          );

          if (resolved) {
            const normalizedImported = this.normalizePath(resolved);
            const existing = graph.get(normalizedImported) ?? [];
            existing.push(relativePath);
            graph.set(normalizedImported, existing);
          }
        }
      } catch {
        // File can't be read — skip gracefully
      }
    }

    return graph;
  }

  /**
   * Parse import, export, and part statements from Dart source content.
   * Returns the resolved URI strings (excluding dart: SDK imports).
   */
  private parseImports(content: string): string[] {
    const results: string[] = [];
    // Match import/export/part statements, handling show/hide/as/deferred
    const importRegex = /^(?:import|export|part)\s+['"]([^'"]+)['"]/gm;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const importUri = match[1];
      if (importUri && !importUri.startsWith("dart:")) {
        results.push(importUri);
      }
    }

    return results;
  }

  /**
   * Collect all .dart file paths recursively, excluding .dart_tool/, etc.
   */
  private async collectDartFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.collectDartFiles(fullPath);
          results.push(...subFiles);
        } else if (entry.name.endsWith(".dart")) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }

    return results;
  }

  /**
   * Resolve a Dart import statement to a workspace-relative file path.
   *
   * Handles:
   * - package: imports → lib/ directory
   * - relative imports → resolved from importing file's directory
   * - dart: imports → ignored (SDK, returns null)
   */
  private resolveImportPath(
    importStatement: string,
    importingFile: string,
  ): string | null {
    // Extract path from: import 'package:myapp/core/parser.dart';
    // Also handles: import 'foo.dart' as bar; / show X / hide Y / deferred as Z
    const match = importStatement.match(/(?:import|export|part)\s+['"]([^'"]+)['"]/);
    if (!match?.[1]) return null;

    const importPath = match[1];

    // Ignore SDK imports
    if (importPath.startsWith("dart:")) return null;

    // Package import: package:myapp/foo.dart → lib/foo.dart
    if (importPath.startsWith("package:")) {
      const afterPackage = importPath.replace(/^package:[^/]+\//, "");
      return this.normalizePath(`lib/${afterPackage}`);
    }

    // Relative import
    const dir = path.dirname(importingFile);
    const resolved = path.normalize(path.join(dir, importPath));
    return this.normalizePath(resolved);
  }

  /**
   * Compute SHA-256 fingerprint of all .dart file paths and their modification times.
   * Uses Node.js fs/promises readdir + stat for cross-platform compatibility.
   */
  async computeMtimeFingerprint(): Promise<string> {
    const hash = createHash("sha256");

    const walk = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (EXCLUDED_DIRS.has(entry.name)) continue;

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.name.endsWith(".dart")) {
            const s = await stat(fullPath);
            hash.update(`${this.normalizePath(path.relative(this.workspaceRoot, fullPath))}:${s.mtimeMs}`);
          }
        }
      } catch {
        // Directory doesn't exist or not readable
      }
    };

    await walk(this.workspaceRoot);
    return hash.digest("hex");
  }

  /**
   * Normalize a file path for consistent comparison.
   * Converts backslashes to forward slashes and removes leading ./ prefix.
   */
  private normalizePath(filePath: string): string {
    return filePath
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
  }
}
