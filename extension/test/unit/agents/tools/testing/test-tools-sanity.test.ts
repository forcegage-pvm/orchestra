import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface TestTierConfig {
  name: string;
  path: string;
  timeout: number;
}

interface AgentTestConfig {
  framework: string;
  tiers: TestTierConfig[];
}

const EXPECTED_TIER_NAMES = [
  "smoke",
  "unit",
  "extension-unit",
  "extension-smoke",
  "integration",
  "extension-integration",
  "red",
] as const;

function loadTestConfig(): AgentTestConfig {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDirectory = path.dirname(currentFilePath);
  const workspaceRoot = path.resolve(currentDirectory, "../../../../../../");
  const configPath = path.join(workspaceRoot, ".agent-test-config.json");
  const configContent = readFileSync(configPath, "utf8");

  return JSON.parse(configContent) as AgentTestConfig;
}

describe("test tools sanity", () => {
  it("loads and validates the real .agent-test-config.json", () => {
    const config = loadTestConfig();

    expect(config.framework).toBe("vitest");

    const tierNames = new Set(config.tiers.map((tier) => tier.name));
    for (const expectedTierName of EXPECTED_TIER_NAMES) {
      expect(tierNames.has(expectedTierName)).toBe(true);
    }

    for (const tier of config.tiers) {
      expect(typeof tier.path).toBe("string");
      expect(tier.path.length).toBeGreaterThan(0);
      expect(typeof tier.timeout).toBe("number");
      expect(Number.isFinite(tier.timeout)).toBe(true);
    }
  });
});
