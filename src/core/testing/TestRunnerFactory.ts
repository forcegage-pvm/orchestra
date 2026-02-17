import * as fs from "node:fs/promises";
import * as path from "node:path";

import { DartRunner } from "./DartRunner.js";
import { VitestRunner } from "./VitestRunner.js";
import type { TestFramework, TestRunner } from "./TestRunner.js";
import { createToolError, ToolErrorCode } from "./errors.js";

function assertNever(value: never): never {
  throw new Error(`Unsupported test framework: ${String(value)}`);
}

/** Vitest config file extensions to check for detection. */
const VITEST_CONFIG_EXTENSIONS = [".ts", ".js", ".mts", ".mjs"];

/**
 * Factory for constructing test runners.
 */
export class TestRunnerFactory {
  static create(framework: TestFramework): TestRunner {
    switch (framework) {
      case "vitest":
        return new VitestRunner();
      case "dart":
        return new DartRunner("dart");
      case "flutter":
        return new DartRunner("flutter");
      default:
        return assertNever(framework);
    }
  }

  /**
   * Auto-detect framework from workspace files.
   *
   * Detection logic:
   * 1. Check for pubspec.yaml → reads content to distinguish dart vs flutter
   *    (Flutter SDK dependency: `flutter:` in dependencies with `sdk: flutter`)
   * 2. Check for vitest.config.{ts,js,mts,mjs}
   * 3. If both Dart/Flutter AND Vitest markers found → error (INVALID_INPUT)
   * 4. If malformed pubspec.yaml → clear error directing to .agent-test-config.json
   * 5. Returns detected TestFramework or undefined if no markers found
   *
   * @param workspaceRoot - Absolute path to workspace root
   * @returns Detected framework, or undefined if no markers found
   * @throws ToolError with INVALID_INPUT for conflicts or malformed manifests
   */
  static async detect(
    workspaceRoot: string,
  ): Promise<TestFramework | undefined> {
    let dartFramework: TestFramework | undefined;
    let vitestDetected = false;

    // --- Check for pubspec.yaml (Dart/Flutter marker) ---
    const pubspecPath = path.join(workspaceRoot, "pubspec.yaml");
    let pubspecExists = false;

    try {
      await fs.access(pubspecPath);
      pubspecExists = true;
    } catch {
      // pubspec.yaml does not exist
    }

    if (pubspecExists) {
      let content: string;
      try {
        content = await fs.readFile(pubspecPath, "utf8");
      } catch {
        throw createToolError(
          ToolErrorCode.INVALID_INPUT,
          "Unable to read pubspec.yaml. The file exists but could not be read.",
          "Create an explicit .agent-test-config.json to configure the test framework manually.",
          { path: pubspecPath },
        );
      }

      try {
        dartFramework = TestRunnerFactory.detectDartOrFlutter(content);
      } catch {
        throw createToolError(
          ToolErrorCode.INVALID_INPUT,
          "Malformed pubspec.yaml: unable to determine project type from file content.",
          "Create an explicit .agent-test-config.json to configure the test framework manually.",
          { path: pubspecPath },
        );
      }
    }

    // --- Check for vitest.config.* (Vitest marker) ---
    for (const ext of VITEST_CONFIG_EXTENSIONS) {
      const vitestConfigPath = path.join(
        workspaceRoot,
        `vitest.config${ext}`,
      );
      try {
        await fs.access(vitestConfigPath);
        vitestDetected = true;
        break;
      } catch {
        // File doesn't exist, continue checking
      }
    }

    // --- Conflict detection ---
    if (dartFramework !== undefined && vitestDetected) {
      throw createToolError(
        ToolErrorCode.INVALID_INPUT,
        "Multiple test frameworks detected: both pubspec.yaml (Dart/Flutter) and vitest.config.* (Vitest) are present.",
        "Create an explicit .agent-test-config.json to specify which framework to use.",
        { workspaceRoot, detectedFrameworks: [dartFramework, "vitest"] },
      );
    }

    // --- Return detected framework ---
    if (dartFramework !== undefined) {
      return dartFramework;
    }

    if (vitestDetected) {
      return "vitest";
    }

    return undefined;
  }

  /**
   * Distinguish between Dart and Flutter projects by examining pubspec.yaml content.
   *
   * A Flutter project has a dependency on the Flutter SDK:
   * ```yaml
   * dependencies:
   *   flutter:
   *     sdk: flutter
   * ```
   *
   * @param content - Raw content of pubspec.yaml
   * @returns "flutter" if Flutter SDK dependency found, "dart" otherwise
   * @throws Error if content appears malformed (e.g. empty or not string-like)
   */
  private static detectDartOrFlutter(content: string): TestFramework {
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Empty or invalid pubspec.yaml content");
    }

    // Look for Flutter SDK dependency pattern in the content.
    // The canonical YAML structure is:
    //   dependencies:
    //     flutter:
    //       sdk: flutter
    // We use a simple heuristic: check if "sdk: flutter" appears in the content,
    // which indicates a Flutter SDK dependency.
    const hasFlutterSdk = /sdk:\s*flutter/i.test(content);

    return hasFlutterSdk ? "flutter" : "dart";
  }
}
