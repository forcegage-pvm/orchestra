/**
 * Smoke tests: tier directory structure integrity
 *
 * Validates that:
 * - No .test.ts files are orphaned outside tier directories
 * - Tier directory naming follows the convention
 * - Test file counts are non-zero for expected tiers
 */

import { glob } from "glob";
import * as path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

// Known tier directories (relative to root)
const TIER_DIRS = [
  "test/unit",
  "test/integration",
  "test/smoke",
  "extension/test/unit",
  "extension/test/integration",
  "extension/test/smoke",
];

// Directories where test files are allowed but not tier-managed
const ALLOWED_NON_TIER = [
  "testing/**", // Testing harness / experiments
  "test/setup/**", // Test infrastructure
  "extension/test/setup/**",
  "extension/test/__mocks__/**",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Smoke: no orphaned test files", () => {
  it("all .test.ts files should be inside a tier directory or allowed location", async () => {
    // Find every .test.ts file in the repo (excluding node_modules, dist)
    const allTests = await glob("**/*.test.ts", {
      cwd: ROOT,
      ignore: ["**/node_modules/**", "**/dist/**", "**/.vitest-cache/**"],
    });

    // Build set of allowed prefixes from tiers + allowed non-tier locations
    const allowedPrefixes = TIER_DIRS.map((d) => d.replace(/\\/g, "/"));

    const orphaned: string[] = [];
    for (const testFile of allTests) {
      const normalized = testFile.replace(/\\/g, "/");
      const inTier = allowedPrefixes.some((prefix) =>
        normalized.startsWith(prefix + "/"),
      );
      if (inTier) continue;

      // Check allowed non-tier locations (glob-match)
      const inAllowed = ALLOWED_NON_TIER.some((pattern) => {
        const prefix = pattern.replace("/**", "");
        return normalized.startsWith(prefix + "/");
      });
      if (inAllowed) continue;

      orphaned.push(testFile);
    }

    expect(
      orphaned,
      `Orphaned test files outside tier directories:\n${orphaned.join("\n")}\n\nMove these to the appropriate tier directory.`,
    ).toEqual([]);
  });
});

describe("Smoke: tier directory naming convention", () => {
  it("tier directories should follow {package}/test/{tier} pattern", async () => {
    const violations: string[] = [];

    for (const dir of TIER_DIRS) {
      // Expected pattern: (extension/)?test/(unit|integration|smoke)
      const valid =
        /^(extension\/)?test\/(unit|integration|smoke|e2e|red)$/.test(dir);
      if (!valid) {
        violations.push(
          `"${dir}" does not match {package}/test/{tier} convention`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("Smoke: populated tiers have test files", () => {
  it("unit tier should contain test files", async () => {
    const files = await glob("test/unit/**/*.test.ts", { cwd: ROOT });
    expect(
      files.length,
      "test/unit/ should contain at least one test file",
    ).toBeGreaterThan(0);
  });

  it("extension unit tier should contain test files", async () => {
    const files = await glob("extension/test/unit/**/*.test.ts", { cwd: ROOT });
    expect(
      files.length,
      "extension/test/unit/ should contain at least one test file",
    ).toBeGreaterThan(0);
  });

  it("smoke tier should contain test files", async () => {
    const files = await glob("test/smoke/**/*.test.ts", { cwd: ROOT });
    expect(
      files.length,
      "test/smoke/ should contain at least one test file (this file!)",
    ).toBeGreaterThan(0);
  });
});
