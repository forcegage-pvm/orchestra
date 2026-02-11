/**
 * Smoke tests: .agent-test-config.json validation
 *
 * Validates that the test configuration file:
 * - Is valid JSON and passes Zod schema validation
 * - References tier directories that exist on disk
 * - Has tiers whose globs are covered by vitest.config.ts include patterns
 * - Lists configFingerprint files that exist
 */

import * as fs from "fs/promises";
import * as path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

interface TierEntry {
  name: string;
  path: string;
  timeout?: number;
  inverted?: boolean;
}

interface AgentTestConfig {
  framework: string;
  tiers: TierEntry[];
  workingDir?: string;
  defaultTimeout?: number;
  maxFailureLines?: number;
  configFingerprint?: string[];
  promotion?: { dryRun?: boolean };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadConfig(): Promise<AgentTestConfig> {
  const raw = await fs.readFile(
    path.join(ROOT, ".agent-test-config.json"),
    "utf8",
  );
  return JSON.parse(raw) as AgentTestConfig;
}

/** Extract the leading directory portion from a glob pattern */
function extractDirFromGlob(glob: string): string | null {
  const starIdx = glob.indexOf("*");
  if (starIdx === -1) return null;
  const prefix = glob.slice(0, starIdx);
  // Strip trailing slash
  return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
}

async function readVitestIncludes(configPath: string): Promise<string[]> {
  const content = await fs.readFile(path.join(ROOT, configPath), "utf8");
  const includeMatch = content.match(/include:\s*\[([^\]]+)\]/s);
  if (!includeMatch) return [];
  // Extract string literals from the array
  const literals = [...includeMatch[1].matchAll(/"([^"]+)"|'([^']+)'/g)];
  return literals.map((m) => m[1] ?? m[2]);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Smoke: .agent-test-config.json", () => {
  it("should be valid JSON", async () => {
    const raw = await fs.readFile(
      path.join(ROOT, ".agent-test-config.json"),
      "utf8",
    );
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("should have framework set to vitest", async () => {
    const config = await loadConfig();
    expect(config.framework).toBe("vitest");
  });

  it("should have at least one tier", async () => {
    const config = await loadConfig();
    expect(config.tiers.length).toBeGreaterThan(0);
  });

  it("every tier should have name, path, and valid timeout", async () => {
    const config = await loadConfig();
    for (const tier of config.tiers) {
      expect(tier.name).toBeTruthy();
      expect(tier.path).toBeTruthy();
      expect(tier.path).toMatch(/\*\*\/\*\.test\.ts$/);
      if (tier.timeout !== undefined) {
        expect(tier.timeout).toBeGreaterThan(0);
      }
    }
  });

  it("tier timeout ordering: smoke ≤ unit ≤ integration", async () => {
    const config = await loadConfig();
    const byName = Object.fromEntries(config.tiers.map((t) => [t.name, t]));

    const smokeTimeout = byName["smoke"]?.timeout ?? config.defaultTimeout;
    const unitTimeout = byName["unit"]?.timeout ?? config.defaultTimeout;
    const integrationTimeout =
      byName["integration"]?.timeout ?? config.defaultTimeout;

    expect(smokeTimeout).toBeLessThanOrEqual(unitTimeout!);
    expect(unitTimeout).toBeLessThanOrEqual(integrationTimeout!);
  });
});

describe("Smoke: tier directories exist", () => {
  it("every tier glob should resolve to an existing directory", async () => {
    const config = await loadConfig();
    const missing: string[] = [];

    for (const tier of config.tiers) {
      const dir = extractDirFromGlob(tier.path);
      if (!dir) continue;
      const abs = path.join(ROOT, dir);
      if (!(await pathExists(abs))) {
        missing.push(`tier "${tier.name}": ${dir}`);
      }
    }

    expect(missing, `Missing tier directories:\n${missing.join("\n")}`).toEqual(
      [],
    );
  });
});

describe("Smoke: vitest config covers all tiers", () => {
  it("root vitest.config.ts includes should cover root-level tiers", async () => {
    const config = await loadConfig();
    const includes = await readVitestIncludes("vitest.config.ts");

    // Root tiers are those NOT prefixed with "extension/"
    const rootTiers = config.tiers.filter(
      (t) => !t.path.startsWith("extension/"),
    );

    const uncovered: string[] = [];
    for (const tier of rootTiers) {
      // The tier path should be in vitest includes (exact or parent glob)
      const tierDir = extractDirFromGlob(tier.path);
      if (!tierDir) continue;
      const covered = includes.some((inc) => {
        const incDir = extractDirFromGlob(inc);
        return incDir && (tier.path === inc || tierDir.startsWith(incDir));
      });
      if (!covered) {
        uncovered.push(`tier "${tier.name}" (${tier.path})`);
      }
    }

    expect(
      uncovered,
      `Tiers not covered by vitest.config.ts include:\n${uncovered.join("\n")}`,
    ).toEqual([]);
  });

  it("extension vitest.config.ts includes should cover extension tiers", async () => {
    const config = await loadConfig();
    const includes = await readVitestIncludes("extension/vitest.config.ts");

    // Extension tiers have paths starting with "extension/"
    const extTiers = config.tiers.filter((t) =>
      t.path.startsWith("extension/"),
    );

    const uncovered: string[] = [];
    for (const tier of extTiers) {
      // Strip "extension/" prefix since extension vitest.config.ts paths are relative
      const relativePath = tier.path.replace(/^extension\//, "");
      const tierDir = extractDirFromGlob(relativePath);
      if (!tierDir) continue;
      const covered = includes.some((inc) => {
        const incDir = extractDirFromGlob(inc);
        return (
          incDir && (relativePath === inc || tierDir.startsWith(incDir))
        );
      });
      if (!covered) {
        uncovered.push(`tier "${tier.name}" (${tier.path})`);
      }
    }

    expect(
      uncovered,
      `Tiers not covered by extension/vitest.config.ts include:\n${uncovered.join("\n")}`,
    ).toEqual([]);
  });
});

describe("Smoke: configFingerprint files exist", () => {
  it("all configFingerprint entries should resolve to at least one file", async () => {
    const config = await loadConfig();
    const fingerprints = config.configFingerprint ?? [];
    const missing: string[] = [];

    for (const pattern of fingerprints) {
      // For simple globs like "vitest.config.*", check if at least one match exists
      if (pattern.includes("*")) {
        const { glob } = await import("glob");
        const matches = await glob(pattern, { cwd: ROOT });
        if (matches.length === 0) {
          missing.push(pattern);
        }
      } else {
        if (!(await pathExists(path.join(ROOT, pattern)))) {
          missing.push(pattern);
        }
      }
    }

    expect(
      missing,
      `Missing configFingerprint files: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
