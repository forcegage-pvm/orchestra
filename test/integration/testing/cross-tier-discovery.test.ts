import { readFileSync } from "node:fs";
import * as path from "node:path";

import { glob } from "glob";
import { describe, expect, it } from "vitest";

interface TierConfig {
  name: string;
  path: string;
}

interface AgentTestConfig {
  tiers: TierConfig[];
}

const ROOT = path.resolve(__dirname, "../../..");
const CONFIG_PATH = path.join(ROOT, ".agent-test-config.json");

function loadConfig(): AgentTestConfig {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as AgentTestConfig;
}

function getTier(config: AgentTestConfig, tierName: string): TierConfig {
  const tier = config.tiers.find((entry) => entry.name === tierName);
  expect(tier, `Missing tier: ${tierName}`).toBeDefined();
  return tier as TierConfig;
}

async function discoverTierFiles(tier: TierConfig): Promise<string[]> {
  const files = await glob(tier.path, {
    cwd: ROOT,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.vitest-cache/**"],
  });

  return files.map((file) => file.replace(/\\/g, "/"));
}

describe("integration: cross-tier test discovery", () => {
  it("smoke tier discovers only smoke-targeted test files", async () => {
    const config = loadConfig();
    const smokeTier = getTier(config, "smoke");
    const smokeFiles = await discoverTierFiles(smokeTier);

    expect(smokeFiles).toContain("test/smoke/string-utils-exports.test.ts");
    expect(smokeFiles).not.toContain("test/unit/core/string-utils.test.ts");
    expect(smokeFiles).not.toContain(
      "extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts",
    );
  });

  it("unit tier discovers unit tests and excludes smoke tests", async () => {
    const config = loadConfig();
    const unitTier = getTier(config, "unit");
    const unitFiles = await discoverTierFiles(unitTier);

    expect(unitFiles).toContain("test/unit/core/string-utils.test.ts");
    expect(unitFiles).not.toContain("test/smoke/string-utils-exports.test.ts");
  });

  it("extension-unit tier discovers extension tests only", async () => {
    const config = loadConfig();
    const extensionUnitTier = getTier(config, "extension-unit");
    const extensionUnitFiles = await discoverTierFiles(extensionUnitTier);

    expect(extensionUnitFiles).toContain(
      "extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts",
    );
    expect(extensionUnitFiles).not.toContain("test/unit/core/string-utils.test.ts");
  });

  it("smoke and unit tier discovery results have zero overlap", async () => {
    const config = loadConfig();
    const smokeTier = getTier(config, "smoke");
    const unitTier = getTier(config, "unit");
    const smokeFiles = await discoverTierFiles(smokeTier);
    const unitFiles = await discoverTierFiles(unitTier);

    const overlap = smokeFiles.filter((file) => unitFiles.includes(file));
    expect(overlap).toHaveLength(0);
  });
});
